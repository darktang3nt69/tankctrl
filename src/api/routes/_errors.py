"""Shared 500-response helper for route handlers' generic exception tail."""
from typing import NoReturn

from fastapi import HTTPException


def raise_500(logger, event: str, detail: str = "Internal server error", **log_fields) -> NoReturn:
    """Log a structured error event and raise the standard 500 HTTPException.

    `logger` must be the caller's own module-level logger so the logged
    event still attributes to the right route module.
    """
    logger.error(event, **log_fields)
    raise HTTPException(status_code=500, detail=detail)
