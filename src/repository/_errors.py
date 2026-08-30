"""Shared rollback+log+raise context manager for repository write methods."""
from contextlib import contextmanager


@contextmanager
def log_on_error(session, logger, event: str, **fields):
    """Roll back the session, log a structured error event, and re-raise.

    `logger` must be the caller's own module-level logger so the logged
    event still attributes to the right repository module.
    """
    try:
        yield
    except Exception as e:
        session.rollback()
        logger.error(event, error=str(e), **fields)
        raise
