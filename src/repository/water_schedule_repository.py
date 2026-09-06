"""
Repository layer for water change schedules.

Handles database access for water schedule CRUD operations.
"""

from datetime import time
from typing import Optional

from sqlalchemy.orm import Session

from src.infrastructure.db.models import WaterScheduleModel
from src.utils.logger import get_logger

logger = get_logger(__name__)


class WaterScheduleRepository:
    """Repository for water schedule operations."""

    def __init__(self, session: Session):
        """Initialize repository with database session."""
        self.session = session

    def create(self, device_id: str, schedule_data: dict) -> WaterScheduleModel:
        """
        Create a water change schedule for a device.

        Args:
            device_id: Device identifier
            schedule_data: Schedule fields (schedule_type, schedule_time, etc.)

        Returns:
            Created WaterScheduleModel
        """
        schedule_time = time.fromisoformat(schedule_data["schedule_time"])

        # Convert days_of_week list to comma-separated string
        days_of_week_str = None
        if schedule_data.get("days_of_week"):
            days_of_week_str = ",".join(str(d) for d in schedule_data["days_of_week"])

        # Each schedule type only uses its own cadence fields; clear the others.
        schedule_date = None
        interval_days = None
        if schedule_data["schedule_type"] == "custom":
            schedule_date = schedule_data.get("schedule_date")
            days_of_week_str = None
        elif schedule_data["schedule_type"] == "interval":
            interval_days = schedule_data.get("interval_days")
            days_of_week_str = None

        new_schedule = WaterScheduleModel(
            device_id=device_id,
            schedule_type=schedule_data["schedule_type"],
            days_of_week=days_of_week_str,
            schedule_date=schedule_date,
            interval_days=interval_days,
            schedule_time=schedule_time,
            notes=schedule_data.get("notes"),
            completed=schedule_data.get("completed", False),
            enabled=schedule_data.get("enabled", True),
            notify_24h=schedule_data.get("notify_24h", True),
            notify_1h=schedule_data.get("notify_1h", True),
            notify_on_time=schedule_data.get("notify_on_time", True),
            ph=schedule_data.get("ph"),
            ammonia=schedule_data.get("ammonia"),
            nitrite=schedule_data.get("nitrite"),
            nitrate=schedule_data.get("nitrate"),
            tds=schedule_data.get("tds"),
        )
        self.session.add(new_schedule)
        self.session.commit()
        logger.debug("water_schedule_created", device_id=device_id)
        return new_schedule

    def get_by_id(self, device_id: str, schedule_id: int) -> Optional[WaterScheduleModel]:
        """Get a single water schedule by id, scoped to device_id."""
        return self.session.query(WaterScheduleModel).filter_by(
            id=schedule_id,
            device_id=device_id,
        ).first()

    def get_all_for_device(self, device_id: str) -> list[WaterScheduleModel]:
        """Get all water schedules for a device."""
        return self.session.query(WaterScheduleModel).filter_by(device_id=device_id).all()

    def update(self, device_id: str, schedule_id: int, schedule_data: dict) -> Optional[WaterScheduleModel]:
        """
        Update a water change schedule. Supports partial updates.

        Args:
            device_id: Device identifier
            schedule_id: Schedule id to update
            schedule_data: Fields to update

        Returns:
            Updated WaterScheduleModel, or None if not found
        """
        schedule = self.get_by_id(device_id, schedule_id)
        if not schedule:
            return None

        if "schedule_time" in schedule_data and schedule_data["schedule_time"]:
            schedule.schedule_time = time.fromisoformat(schedule_data["schedule_time"])
        if "schedule_type" in schedule_data:
            schedule.schedule_type = schedule_data["schedule_type"]
        if "days_of_week" in schedule_data:
            # Convert days_of_week list to comma-separated string
            if schedule_data["days_of_week"]:
                schedule.days_of_week = ",".join(str(d) for d in schedule_data["days_of_week"])
            else:
                schedule.days_of_week = None
        if "schedule_date" in schedule_data:
            schedule.schedule_date = schedule_data["schedule_date"]
        if "interval_days" in schedule_data:
            schedule.interval_days = schedule_data["interval_days"]

        # Ensure type-specific fields are cleared
        if schedule.schedule_type == "weekly":
            schedule.schedule_date = None
            schedule.interval_days = None
        elif schedule.schedule_type == "custom":
            schedule.days_of_week = None
            schedule.interval_days = None
        elif schedule.schedule_type == "interval":
            schedule.schedule_date = None
            schedule.days_of_week = None

        if "notes" in schedule_data:
            schedule.notes = schedule_data["notes"]
        if "completed" in schedule_data:
            schedule.completed = schedule_data["completed"]
        if "enabled" in schedule_data:
            schedule.enabled = schedule_data["enabled"]

        # Update notification preferences
        if "notify_24h" in schedule_data:
            schedule.notify_24h = schedule_data["notify_24h"]
        if "notify_1h" in schedule_data:
            schedule.notify_1h = schedule_data["notify_1h"]
        if "notify_on_time" in schedule_data:
            schedule.notify_on_time = schedule_data["notify_on_time"]

        # Water-quality readings, recorded optionally when closing out a water change
        for field in ("ph", "ammonia", "nitrite", "nitrate", "tds"):
            if field in schedule_data:
                setattr(schedule, field, schedule_data[field])

        self.session.commit()
        logger.debug("water_schedule_updated", device_id=device_id, schedule_id=schedule_id)
        return schedule

    def delete(self, device_id: str, schedule_id: int) -> bool:
        """Delete a water change schedule. Returns True if deleted."""
        schedule = self.get_by_id(device_id, schedule_id)
        if not schedule:
            return False

        self.session.delete(schedule)
        self.session.commit()
        logger.debug("water_schedule_deleted", device_id=device_id, schedule_id=schedule_id)
        return True
