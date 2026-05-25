# Phase 5 Git Commit Guide

## Branch
```bash
git checkout feature/pump-control-gpio-config
```

## Commit Sequence

### Commit 1: CommandService Multi-Relay Support

```bash
git add src/services/command_service.py
git commit -m "refactor(service): extend command service for multi-relay support

- Add _extract_relay_name() to parse relay names from command
- Add _validate_relay_command() to validate relay-based commands
  - Validates value is 'on' or 'off'
  - Verifies relay exists via RelayConfigService
  - Raises ValueError with descriptive messages
- Update send_command() to validate relay commands before sending
- Enhance logging with relay_name for debugging
- Separate ValueError from other exceptions for better error handling

This enables CommandService to handle multiple relays (pump, light, etc.)
while maintaining backward compatibility with single-relay devices."
```

### Commit 2: ShadowService Multi-Relay Reconciliation

```bash
git add src/services/shadow_service.py
git commit -m "refactor(service): extend shadow reconciliation for multi-relay

- Enhance reconcile_shadow() for multi-relay delta calculation
  - Log version and delta_keys for debugging
  - Send one command per relay mismatch
  - Pass explicit version to commands (shadow.version + 1)
  - Continue reconciliation on individual command failures
- Enhance handle_reported_state() for generic relay state tracking
  - Track ALL relay state changes (not just light)
  - Publish relay_state_changed event for all relays
  - Maintain backward compatibility: light_state_changed still published
  - Publish shadow_synchronized when all relays match desired
- Improve logging with relay_name in all events

This enables shadow service to manage any number of relays
while maintaining eventual consistency between backend and device."
```

### Commit 3: DeviceService Multi-Relay Initialization

```bash
git add src/services/device_service.py
git commit -m "refactor(service): initialize multi-relay shadow on device registration

- Initialize shadow with multi-relay state after relay registration
- Build initial_desired_state from relay default_state values
- Set all relays to safe default (typically 'off')
- Update shadow in DB with initialized desired state and version
- Enhance logging with relay count and initialization details

This ensures new devices start with shadow state synchronized
with their relay configuration, enabling immediate reconciliation."
```

### Commit 4: API Error Handling Improvements

```bash
git add src/api/routes/commands.py
git commit -m "refactor(api): improve pump/light endpoint error handling

- Catch ValueError from CommandService validation
- Return 400 Bad Request for validation errors (e.g., invalid relay)
- Return 404 Not Found for non-existent devices
- Return 500 Internal Server Error for infrastructure failures
- Log validation errors as warnings, infrastructure as errors

This provides better HTTP semantics for API clients."
```

### Commit 5: Add Comprehensive Test Suite

```bash
git add tests/test_phase5_multi_relay.py
git commit -m "test(phase5): add comprehensive multi-relay test suite

- Test relay name extraction (pump, light, relay_*)
- Test relay command validation (value, relay existence)
- Test multi-relay command sending
- Test multi-relay shadow reconciliation
- Test multi-relay state change events
- Test device registration with multi-relay initialization
- Verify backward compatibility with light-only devices

Covers all Phase 5 CommandService, ShadowService, and DeviceService changes."
```

### Commit 6: Add Phase 5 Documentation

```bash
git add PHASE5_IMPLEMENTATION_COMPLETE.md
git commit -m "docs: add Phase 5 implementation documentation

- Document all changes to CommandService, ShadowService, DeviceService
- Include architecture diagrams and data flow examples
- Document validation rules and error handling
- Provide monitoring and debugging guidance
- Add MQTT command flow and database schema notes
- List deployment checklist and next steps"
```

## Verification Steps

Before merging, verify:

```bash
# 1. Run linter
python -m pylint src/services/command_service.py
python -m pylint src/services/shadow_service.py
python -m pylint src/services/device_service.py
python -m pylint src/api/routes/commands.py

# 2. Run Phase 5 tests
python -m pytest tests/test_phase5_multi_relay.py -v

# 3. Run all tests
python -m pytest tests/ -v

# 4. Check for errors
python -m py_compile src/services/command_service.py
python -m py_compile src/services/shadow_service.py
python -m py_compile src/services/device_service.py

# 5. Verify no regressions in existing tests
python -m pytest tests/test_shadow_reconciliation.py -v
```

## Merge Strategy

```bash
# Ensure feature branch is up to date
git fetch origin
git rebase origin/main

# If conflicts exist, resolve them
# Then verify tests again

# Merge to main
git checkout main
git pull origin main
git merge feature/pump-control-gpio-config
git push origin main
```

## Post-Merge Tasks

1. Deploy to staging environment
2. Run integration tests against staging
3. Verify MQTT commands flow correctly
4. Monitor logs for any validation errors
5. Test with real device (Arduino/ESP32)
6. Create PR for main branch
7. Request code review from team

## Rollback Plan

If issues found:

```bash
# Revert the commits (if already pushed)
git revert HEAD~5..HEAD

# Or reset to previous state (if not yet pushed)
git reset --hard HEAD~6
```

## Key Metrics to Monitor

After deployment:

1. **Command Success Rate**: % of commands reaching SENT state
2. **Validation Errors**: Count of 400 Bad Request responses
3. **Shadow Reconciliation Time**: Time from desired to reported state
4. **Relay Coverage**: % of relays properly initialized
5. **Device Registration**: Time and success of new device registration

Watch for:
- Spike in validation errors (suggests firmware incompatibility)
- Increased reconciliation time (suggests MQTT delays)
- Failed device registrations (suggests relay config issues)

---

## Notes

- Phase 5 is fully backward compatible
- No database migrations needed
- No configuration changes required
- Existing light-only devices work unchanged
- New features available immediately after deployment
