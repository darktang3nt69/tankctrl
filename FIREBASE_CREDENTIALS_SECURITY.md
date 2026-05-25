# Firebase Credentials Security Remediation

## ⚠️ EXPOSED CREDENTIALS

**File:** `src/api/routes/tankctl-firebase-adminsdk-fbsvc-2efd3c5518.json`  
**Status:** Exposed in commit `aabc1f9` on branch `feature/dashboard`  
**Action Required:** IMMEDIATE

---

## 🔒 Remediation Steps

### 1. **Revoke Exposed Credentials** (Priority: CRITICAL)
- [ ] Go to [Firebase Console](https://console.firebase.google.com/)
- [ ] Navigate to Project Settings → Service Accounts
- [ ] **Delete** the compromised key: `tankctl-firebase-adminsdk-fbsvc-2efd3c5518.json`
- [ ] Verify it's removed from all environments

### 2. **Generate New Firebase Admin SDK Key**
- [ ] Firebase Console → Project Settings → Service Accounts
- [ ] Click "Generate New Private Key"
- [ ] Save to a **secure location** (NOT in the repo)

### 3. **Environment Variable Setup**

Instead of storing the JSON file in the repository, use environment variables:

**Option A: Using individual credentials (Recommended)**
```bash
export FIREBASE_TYPE="service_account"
export FIREBASE_PROJECT_ID="your-project-id"
export FIREBASE_PRIVATE_KEY_ID="key-id"
export FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
export FIREBASE_CLIENT_EMAIL="firebase-adminsdk@your-project.iam.gserviceaccount.com"
export FIREBASE_CLIENT_ID="1234567890"
export FIREBASE_AUTH_URI="https://accounts.google.com/o/oauth2/auth"
export FIREBASE_TOKEN_URI="https://oauth2.googleapis.com/token"
```

**Option B: Using base64-encoded JSON (Simpler)**
```bash
# Encode the JSON file
cat tankctl-firebase-adminsdk-fbsvc-2efd3c5518.json | base64 > firebase_creds.b64

# Set as environment variable
export FIREBASE_CREDENTIALS_B64=$(cat firebase_creds.b64)
```

### 4. **Update Your Code**

**Before (INSECURE):**
```python
from firebase_admin import initialize_app, credentials

cred = credentials.Certificate('src/api/routes/tankctl-firebase-adminsdk-fbsvc-2efd3c5518.json')
initialize_app(cred)
```

**After (SECURE):**
```python
import json
import os
import base64
from firebase_admin import initialize_app, credentials

# Option A: From individual environment variables
cred_dict = {
    "type": os.getenv("FIREBASE_TYPE"),
    "project_id": os.getenv("FIREBASE_PROJECT_ID"),
    "private_key_id": os.getenv("FIREBASE_PRIVATE_KEY_ID"),
    "private_key": os.getenv("FIREBASE_PRIVATE_KEY"),
    "client_email": os.getenv("FIREBASE_CLIENT_EMAIL"),
    "client_id": os.getenv("FIREBASE_CLIENT_ID"),
    "auth_uri": os.getenv("FIREBASE_AUTH_URI"),
    "token_uri": os.getenv("FIREBASE_TOKEN_URI"),
}
cred = credentials.Certificate(cred_dict)

# Option B: From base64-encoded JSON
encoded_creds = os.getenv("FIREBASE_CREDENTIALS_B64")
decoded_creds = base64.b64decode(encoded_creds).decode("utf-8")
cred_dict = json.loads(decoded_creds)
cred = credentials.Certificate(cred_dict)

initialize_app(cred)
```

### 5. **Clean Git History**

Remove from all commits (requires git filter-branch or BFG Repo-Cleaner):

```bash
# Using git filter-branch
git filter-branch --tree-filter 'rm -f src/api/routes/tankctl-firebase-adminsdk-fbsvc-2efd3c5518.json' --prune-empty HEAD

# Or using BFG (more efficient)
bfg --delete-files tankctl-firebase-adminsdk-fbsvc-2efd3c5518.json
bfg --delete-files google-services.json

# Force push (only if you control the repo)
git push origin --force-with-lease --all
```

### 6. **Verify Changes**

- [ ] Check `.gitignore` has credential patterns
- [ ] Confirm file is not in working directory
- [ ] Verify git history is cleaned
- [ ] Update `.env.example` with placeholder variables

### 7. **Document for Team** 

Add to `.env.example`:
```bash
# Firebase credentials (get from 1Password or similar)
# DO NOT commit real credentials to the repository
FIREBASE_TYPE="service_account"
FIREBASE_PROJECT_ID="your-project-id"
FIREBASE_PRIVATE_KEY_ID="your-key-id"
FIREBASE_PRIVATE_KEY="your-private-key"
FIREBASE_CLIENT_EMAIL="firebase-adminsdk@your-project.iam.gserviceaccount.com"
FIREBASE_CLIENT_ID="your-client-id"
FIREBASE_AUTH_URI="https://accounts.google.com/o/oauth2/auth"
FIREBASE_TOKEN_URI="https://oauth2.googleapis.com/token"
```

---

## 📋 Deployment Configuration

### Docker / Docker Compose
```yaml
services:
  tankctl:
    environment:
      FIREBASE_TYPE: ${FIREBASE_TYPE}
      FIREBASE_PROJECT_ID: ${FIREBASE_PROJECT_ID}
      FIREBASE_PRIVATE_KEY: ${FIREBASE_PRIVATE_KEY}
      # ... other Firebase env vars
```

### GitHub Actions / CI/CD
Add secrets in repository settings, then use:
```yaml
env:
  FIREBASE_TYPE: ${{ secrets.FIREBASE_TYPE }}
  FIREBASE_PROJECT_ID: ${{ secrets.FIREBASE_PROJECT_ID }}
  FIREBASE_PRIVATE_KEY: ${{ secrets.FIREBASE_PRIVATE_KEY }}
```

---

## 🛡️ Prevention for Future

### Pre-commit Hook
```bash
pip install detect-secrets pre-commit

# Create .pre-commit-config.yaml
cat > .pre-commit-config.yaml << 'EOF'
repos:
  - repo: https://github.com/Yelp/detect-secrets
    rev: v1.4.0
    hooks:
      - id: detect-secrets
        args: ['--allow-verified-spec', '--baseline', '.secrets.baseline']
EOF

pre-commit install
```

### GitHub Branch Protection
- [ ] Enable "Require status checks to pass before merging"
- [ ] Add GitGuardian to required checks
- [ ] Require code review before merge

---

## ✅ Completion Checklist

- [ ] Firebase key revoked
- [ ] New key generated and stored securely
- [ ] Code updated to use environment variables
- [ ] `.gitignore` updated with credential patterns
- [ ] Git history cleaned
- [ ] `.env.example` documented
- [ ] Deployment configs updated
- [ ] Pre-commit hooks installed
- [ ] Team notified
- [ ] PR updated and re-submitted

---

**References:**
- [Firebase Admin SDK Security Best Practices](https://firebase.google.com/docs/admin/setup#python)
- [OWASP: Secrets Management](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)
- [GitGuardian: Remediate Secrets](https://docs.gitguardian.com/incidents-web-ui/incidents/remediate-a-secret)
