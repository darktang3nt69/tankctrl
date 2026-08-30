"""Shared log+raise context manager for service methods.

Unlike the repository-layer variant (src/repository/_errors.py), this does
NOT roll back the session — by the time an exception reaches the service
layer, the repository call that failed has already rolled back its own
session.
"""
from contextlib import contextmanager


@contextmanager
def log_on_error(logger, event: str, **fields):
    """Log a structured error event and re-raise.

    `logger` must be the caller's own module-level logger so the logged
    event still attributes to the right service module.
    """
    try:
        yield
    except Exception as e:
        logger.error(event, error=str(e), **fields)
        raise
