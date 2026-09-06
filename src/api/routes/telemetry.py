"""
Telemetry Routes - Telemetry data retrieval endpoints.

GET /devices/{device_id}/telemetry - Get latest telemetry data
GET /devices/{device_id}/telemetry/{metric} - Get specific metric
GET /devices/{device_id}/telemetry/hourly - Get hourly summary
"""

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session

from src.api.routes._errors import raise_500
from src.infrastructure.db.database import db
from src.services.telemetry_service import TelemetryService
from src.utils.logger import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/devices", tags=["telemetry"])


def get_db_telemetry():
    """Dependency: Get TimescaleDB session for telemetry."""
    session = db.get_timescale_session()
    try:
        yield session
    finally:
        session.close()


def _validate_limit(limit: int) -> None:
    if limit < 1 or limit > 10000:
        raise HTTPException(status_code=400, detail="Limit must be between 1 and 10000")


@router.get("/{device_id}/telemetry", response_model=dict)
def get_telemetry(
    device_id: str,
    limit: int = 100,
    hours: int = None,
    start: Optional[datetime] = None,
    end: Optional[datetime] = None,
    session: Session = Depends(get_db_telemetry)
):
    """
    Get latest telemetry data for device.

    Args:
        device_id: Device ID
        limit: Maximum number of data points (default 100)
        hours: Optional rolling time window in hours, ignored when start is given
        start: Optional arbitrary range start (ISO 8601) - takes precedence over hours
        end: Optional arbitrary range end (ISO 8601), defaults to now when start is set

    Returns:
        List of telemetry data points with timestamp and metrics
        
    Example response:
        {
            "device_id": "tank1",
            "count": 10,
            "data": [
                {
                    "time": "2025-01-15T10:30:00+00:00",
                    "device_id": "tank1",
                    "temperature": 24.5,
                    "tds": 65.2,
                    "pressure": null,
                    "metadata": null
                }
            ]
        }
    """
    try:
        # Validate inputs
        _validate_limit(limit)
        
        if hours is not None and hours < 1:
            raise HTTPException(status_code=400, detail="Hours must be >= 1")

        if end is not None and start is None:
            raise HTTPException(status_code=400, detail="end requires start")
        if start is not None and end is not None and end < start:
            raise HTTPException(status_code=400, detail="end must be after start")

        logger.debug("getting_telemetry", device_id=device_id, limit=limit, hours=hours, start=start, end=end)

        telemetry_service = TelemetryService(session)
        data = telemetry_service.get_device_telemetry(
            device_id=device_id,
            limit=limit,
            hours=hours,
            start=start,
            end=end,
        )
        
        logger.info("telemetry_retrieved", device_id=device_id, count=len(data))
        
        return {
            "device_id": device_id,
            "count": len(data),
            "data": data,
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise_500(logger, "get_telemetry_error", device_id=device_id, error=str(e))


@router.get("/{device_id}/telemetry/{metric}", response_model=dict)
def get_metric(
    device_id: str,
    metric: str,
    limit: int = 100,
    session: Session = Depends(get_db_telemetry)
):
    """
    Get specific metric data for device.

    Args:
        device_id: Device ID
        metric: Metric name ('temperature', 'tds', or 'pressure')
        limit: Maximum number of data points (default 100)

    Returns:
        List of metric data points
        
    Example response:
        {
            "device_id": "tank1",
            "metric": "temperature",
            "count": 10,
            "data": [
                {
                    "time": "2025-01-15T10:30:00+00:00",
                    "device_id": "tank1",
                    "value": 24.5
                }
            ]
        }
    """
    try:
        # Validate metric name
        if metric not in ("temperature", "tds", "pressure"):
            raise HTTPException(
                status_code=400,
                detail="Metric must be 'temperature', 'tds', or 'pressure'"
            )

        _validate_limit(limit)
        
        logger.debug(
            "getting_metric",
            device_id=device_id,
            metric=metric,
            limit=limit
        )
        
        telemetry_service = TelemetryService(session)
        data = telemetry_service.get_device_telemetry(
            device_id=device_id,
            metric_name=metric,
            limit=limit,
        )
        
        logger.info(
            "metric_retrieved",
            device_id=device_id,
            metric=metric,
            count=len(data)
        )
        
        return {
            "device_id": device_id,
            "metric": metric,
            "count": len(data),
            "data": data,
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise_500(logger, "get_metric_error", device_id=device_id, metric=metric, error=str(e))


@router.get("/{device_id}/telemetry/hourly/summary", response_model=dict)
def get_hourly_summary(
    device_id: str,
    hours: int = 24,
    start: Optional[datetime] = None,
    end: Optional[datetime] = None,
    session: Session = Depends(get_db_telemetry)
):
    """
    Get hourly aggregated telemetry summary.

    Uses pre-aggregated continuous aggregate for fast dashboard queries.

    Args:
        device_id: Device ID
        hours: Number of hours to retrieve (default 24)

    Returns:
        List of hourly aggregated records with min/max/avg statistics
        
    Example response:
        {
            "device_id": "tank1",
            "count": 24,
            "data": [
                {
                    "hour": "2025-01-14T10:00:00+00:00",
                    "device_id": "tank1",
                    "temperature": {
                        "avg": 24.2,
                        "max": 25.1,
                        "min": 23.5
                    },
                    "tds": {
                        "avg": 63.5,
                        "max": 68.2,
                        "min": 60.1
                    },
                    "sample_count": 120
                }
            ]
        }
    """
    try:
        if hours < 1 or hours > 8760:  # Max 1 year
            raise HTTPException(status_code=400, detail="Hours must be between 1 and 8760")

        if end is not None and start is None:
            raise HTTPException(status_code=400, detail="end requires start")
        if start is not None and end is not None and end < start:
            raise HTTPException(status_code=400, detail="end must be after start")

        logger.debug("getting_hourly_summary", device_id=device_id, hours=hours, start=start, end=end)

        telemetry_service = TelemetryService(session)
        data = telemetry_service.get_hourly_summary(
            device_id=device_id,
            hours=hours,
            start=start,
            end=end,
        )
        
        logger.info("hourly_summary_retrieved", device_id=device_id, count=len(data))
        
        return {
            "device_id": device_id,
            "count": len(data),
            "data": data,
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise_500(logger, "get_hourly_summary_error", device_id=device_id, error=str(e))

