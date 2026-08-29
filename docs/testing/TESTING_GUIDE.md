# TESTING_GUIDE.md

## Running the test suite

```bash
pip install pytest   # not in requirements.txt — install separately
pytest tests/
```

Run from the repo root (tests import as `from src...`). Test files mix `unittest.TestCase` classes and plain pytest functions; `pytest` runs both.

## Other testing references

- [README.md](../../README.md) — "Testing the System" section has curl/mosquitto_pub examples for exercising a running backend end-to-end (device registration, heartbeat, telemetry, commands).
- [docs/backend/api/API_TESTING.md](../backend/api/API_TESTING.md) — API-layer testing notes.
