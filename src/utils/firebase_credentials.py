"""
Firebase credentials loader from environment variables.

This module provides secure credential loading from environment variables
instead of storing credentials in version control.

Usage:
    from src.utils.firebase_credentials import load_firebase_credentials, get_credentials_dict
    
    cred_dict = get_credentials_dict()  # Get credentials as dict
    cred = load_firebase_credentials()   # Get Firebase credentials object
"""

import json
import os
import base64
from typing import Dict, Any, Optional

def get_credentials_dict() -> Dict[str, Any]:
    """
    Load Firebase credentials from environment variables.
    
    Supports two methods:
    1. Individual environment variables (FIREBASE_TYPE, FIREBASE_PROJECT_ID, etc.)
    2. Base64-encoded JSON (FIREBASE_CREDENTIALS_B64)
    
    Returns:
        Dictionary with Firebase service account credentials
        
    Raises:
        ValueError: If credentials are not properly configured
    """
    
    # Method 1: Base64-encoded JSON
    if os.getenv("FIREBASE_CREDENTIALS_B64"):
        try:
            encoded = os.getenv("FIREBASE_CREDENTIALS_B64")
            decoded = base64.b64decode(encoded).decode("utf-8")
            return json.loads(decoded)
        except Exception as e:
            raise ValueError(f"Failed to decode FIREBASE_CREDENTIALS_B64: {e}")
    
    # Method 2: Individual environment variables
    required_fields = [
        "FIREBASE_TYPE",
        "FIREBASE_PROJECT_ID",
        "FIREBASE_PRIVATE_KEY_ID",
        "FIREBASE_PRIVATE_KEY",
        "FIREBASE_CLIENT_EMAIL",
        "FIREBASE_CLIENT_ID",
        "FIREBASE_AUTH_URI",
        "FIREBASE_TOKEN_URI",
    ]
    
    missing = [f for f in required_fields if not os.getenv(f)]
    if missing:
        raise ValueError(
            f"Missing Firebase environment variables: {', '.join(missing)}. "
            "See FIREBASE_CREDENTIALS_SECURITY.md for setup instructions."
        )
    
    return {
        "type": os.getenv("FIREBASE_TYPE"),
        "project_id": os.getenv("FIREBASE_PROJECT_ID"),
        "private_key_id": os.getenv("FIREBASE_PRIVATE_KEY_ID"),
        "private_key": os.getenv("FIREBASE_PRIVATE_KEY"),
        "client_email": os.getenv("FIREBASE_CLIENT_EMAIL"),
        "client_id": os.getenv("FIREBASE_CLIENT_ID"),
        "auth_uri": os.getenv("FIREBASE_AUTH_URI"),
        "token_uri": os.getenv("FIREBASE_TOKEN_URI"),
    }


def load_firebase_credentials(allow_empty: bool = False):
    """
    Load Firebase credentials object from environment.
    
    Args:
        allow_empty: If True, returns None if credentials not configured.
                    If False, raises ValueError if missing.
    
    Returns:
        google.oauth2.service_account.Credentials object or None
        
    Raises:
        ImportError: If firebase_admin not installed
        ValueError: If credentials not configured and allow_empty=False
    """
    try:
        from google.oauth2 import service_account
    except ImportError:
        raise ImportError(
            "firebase_admin not installed. "
            "Install with: pip install firebase-admin"
        )
    
    try:
        cred_dict = get_credentials_dict()
        creds = service_account.Credentials.from_service_account_dict(
            cred_dict,
            scopes=[
                "https://www.googleapis.com/auth/firebase.messaging",
                "https://www.googleapis.com/auth/firebase.database",
            ]
        )
        return creds
    except ValueError as e:
        if allow_empty:
            return None
        raise


def validate_firebase_setup() -> bool:
    """
    Validate that Firebase credentials are properly configured.
    
    Returns:
        True if credentials are valid and accessible
        
    Raises:
        ValueError or ImportError with diagnostic information
    """
    try:
        cred_dict = get_credentials_dict()
        creds = load_firebase_credentials()
        
        print("✅ Firebase credentials loaded successfully")
        print(f"   Project ID: {creds.project_id}")
        print(f"   Service Account: {creds.service_account_email}")
        return True
    except ValueError as e:
        print(f"❌ Firebase configuration error: {e}")
        raise
    except ImportError as e:
        print(f"❌ Firebase library error: {e}")
        raise


if __name__ == "__main__":
    # Test script
    try:
        validate_firebase_setup()
    except Exception as e:
        print(f"Error: {e}")
        exit(1)
