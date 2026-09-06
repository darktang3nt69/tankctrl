"""
SQLAlchemy database models for TankCtl.

These models map to PostgreSQL and TimescaleDB tables.
"""

from datetime import datetime
import json

from sqlalchemy import (
    CheckConstraint,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    Time,
    Boolean,
    UniqueConstraint,
)
from sqlalchemy.orm import declarative_base

Base = declarative_base()


class DeviceModel(Base):
    """Device table model."""

    __tablename__ = "devices"

    device_id = Column(String(50), primary_key=True)
    device_secret = Column(String(100), nullable=False)
    status = Column(String(20), default="offline")
    firmware_version = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    last_seen = Column(DateTime, default=datetime.utcnow)
    uptime_ms = Column(Integer, nullable=True)
    rssi = Column(Integer, nullable=True)
    wifi_status = Column(String(50), nullable=True)
    temp_threshold_low = Column(Float, nullable=True)
    temp_threshold_high = Column(Float, nullable=True)
    device_name = Column(String(100), nullable=True)
    location = Column(String(100), nullable=True)
    icon_type = Column(String(50), default="fish_bowl")
    description = Column(Text, nullable=True)

    def __repr__(self):
        return f"<DeviceModel(device_id={self.device_id}, status={self.status})>"


class DeviceShadowModel(Base):
    """Device shadow state table model."""

    __tablename__ = "device_shadows"

    device_id = Column(String(50), primary_key=True)
    desired = Column(Text, default="{}")  # JSON string
    reported = Column(Text, default="{}")  # JSON string
    version = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow)

    def __repr__(self):
        return f"<DeviceShadowModel(device_id={self.device_id}, version={self.version})>"


class CommandModel(Base):
    """Command table model."""

    __tablename__ = "commands"

    id = Column(Integer, primary_key=True)
    device_id = Column(String(50), nullable=False)
    command = Column(String(100), nullable=False)
    value = Column(String(250), nullable=True)
    version = Column(Integer, nullable=False)
    status = Column(String(20), default="pending")
    created_at = Column(DateTime, default=datetime.utcnow)
    sent_at = Column(DateTime, nullable=True)
    executed_at = Column(DateTime, nullable=True)

    def __repr__(self):
        return f"<CommandModel(id={self.id}, device_id={self.device_id}, command={self.command})>"


class EventRecord(Base):
    """Event record table model for audit trail and observability."""

    __tablename__ = "events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    event = Column(String(100), nullable=False, index=True)
    device_id = Column(String(100), nullable=True, index=True)
    timestamp = Column(Float, nullable=False, index=True)
    event_metadata = Column("metadata", Text, nullable=True)  # JSON string - mapped to 'metadata' column
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    def __repr__(self):
        return f"<EventRecord(id={self.id}, event={self.event}, device_id={self.device_id})>"
    
    def to_domain(self):
        """Convert database record to domain event."""
        from src.domain.event import Event
        
        metadata = {}
        if self.event_metadata:
            try:
                metadata = json.loads(self.event_metadata)
            except json.JSONDecodeError:
                metadata = {}
        
        return Event(
            event=self.event,
            timestamp=self.timestamp,
            device_id=self.device_id,
            metadata=metadata,
        )


class LightScheduleModel(Base):
    """Light schedule table model for automated lighting control."""

    __tablename__ = "light_schedules"

    id = Column(Integer, primary_key=True)
    device_id = Column(String(50), nullable=False, unique=True)
    enabled = Column(Boolean, default=True, nullable=False)
    on_time = Column(Time, nullable=False)
    off_time = Column(Time, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def __repr__(self):
        return f"<LightScheduleModel(device_id={self.device_id}, on={self.on_time}, off={self.off_time}, enabled={self.enabled})>"


class WaterScheduleModel(Base):
    """Water change reminder schedule table model."""

    __tablename__ = "water_schedules"

    id = Column(Integer, primary_key=True)
    device_id = Column(String(50), nullable=False, index=True)
    schedule_type = Column(String(20), nullable=False)  # 'weekly', 'custom', or 'interval'
    days_of_week = Column(String(20), nullable=True)  # Comma-separated: "1,3,5" for Mon,Wed,Fri
    schedule_date = Column(String(10), nullable=True)  # YYYY-MM-DD for custom
    interval_days = Column(Integer, nullable=True)  # every-N-days cadence for 'interval' type
    schedule_time = Column(Time, nullable=False)
    notes = Column(Text, nullable=True)
    completed = Column(Boolean, default=False)
    enabled = Column(Boolean, default=True)
    # Water-quality readings, recorded optionally when closing out a water change
    ph = Column(Float, nullable=True)
    ammonia = Column(Float, nullable=True)
    nitrite = Column(Float, nullable=True)
    nitrate = Column(Float, nullable=True)
    tds = Column(Float, nullable=True)
    last_reminder_sent_at = Column(DateTime, nullable=True)
    # Notification preferences (Phase 1)
    notify_24h = Column(Boolean, default=True)  # 24-hour before reminder
    notify_1h = Column(Boolean, default=True)   # 1-hour before reminder
    notify_on_time = Column(Boolean, default=True)  # At-time reminder
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def __repr__(self):
        return f"<WaterScheduleModel(device_id={self.device_id}, type={self.schedule_type})>"


class WarningAcknowledgementModel(Base):
    """Stores acknowledged warning codes per device."""

    __tablename__ = "warning_acknowledgements"
    __table_args__ = (
        UniqueConstraint("device_id", "warning_code", name="uq_warning_ack_device_code"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    device_id = Column(String(100), nullable=False, index=True)
    warning_code = Column(String(100), nullable=False, index=True)
    acknowledged_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    def __repr__(self):
        return (
            "<WarningAcknowledgementModel("
            f"device_id={self.device_id}, warning_code={self.warning_code}"
            ")>"
        )


class DevicePushTokenModel(Base):
    """Device push token table model for FCM, etc."""
    __tablename__ = "device_push_tokens"

    id = Column(Integer, primary_key=True, autoincrement=True)
    device_id = Column(String, nullable=False, index=True)
    token = Column(String, nullable=False, unique=True)
    platform = Column(String, nullable=False)  # e.g., 'android', 'ios'
    last_seen = Column(DateTime, default=datetime.utcnow, nullable=False)

    def __repr__(self):
        return (
            f"<DevicePushToken(device_id={self.device_id}, platform={self.platform}, last_seen={self.last_seen})>"
        )


class RelayConfigModel(Base):
    """Relay configuration table model for GPIO pin mapping and state control."""

    __tablename__ = "device_relay_config"
    __table_args__ = (
        UniqueConstraint("device_id", "relay_name", name="uq_relay_name_per_device"),
        UniqueConstraint("device_id", "gpio_pin", name="uq_gpio_pin_per_device"),
        CheckConstraint("fail_safe_default IN ('on', 'off')", name="ck_relay_fail_safe_default"),
        CheckConstraint(
            "cutoff_ceiling_seconds IS NULL OR cutoff_ceiling_seconds > 0",
            name="ck_relay_cutoff_ceiling_seconds",
        ),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    device_id = Column(String(50), nullable=False, index=True)
    relay_name = Column(String(50), nullable=False)  # e.g., "light", "pump"
    gpio_pin = Column(Integer, nullable=False)  # ESP32 GPIO (0-39)
    active_level = Column(String(10), nullable=False, default="LOW")  # "LOW" or "HIGH"
    default_state = Column(String(10), nullable=False, default="off")  # "on" or "off"
    # Fail-safe contract: state the device forces this relay to when it can't
    # trust its network/time (e.g. `time_unknown`). No column default — a
    # relay must never ship on an implicit global default.
    fail_safe_default = Column(String(10), nullable=False)
    # Max continuous-on seconds before the device's independent hard-cutoff
    # watchdog forces the relay off. NULL = no ceiling (fails open).
    cutoff_ceiling_seconds = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, nullable=False, onupdate=datetime.utcnow)

    def __repr__(self):
        return f"<RelayConfigModel(device_id={self.device_id}, relay_name={self.relay_name}, gpio_pin={self.gpio_pin})>"


class FirmwareReleaseModel(Base):
    """Firmware release table model — uploaded firmware binaries available for deployment."""

    __tablename__ = "firmware_releases"

    id = Column(Integer, primary_key=True, autoincrement=True)
    version = Column(String(50), nullable=False, unique=True, index=True)
    filename = Column(String(255), nullable=False)
    file_size = Column(Integer, nullable=False)
    checksum = Column(String(64), nullable=True)
    platform = Column(String(50), nullable=False, default="esp32", index=True)
    release_notes = Column(Text, nullable=True)
    released_at = Column(DateTime, default=datetime.utcnow, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, nullable=True)

    def __repr__(self):
        return f"<FirmwareReleaseModel(version={self.version}, platform={self.platform})>"


class FirmwareDeploymentModel(Base):
    """Firmware deployment table model — per-device deployment history for a release."""

    __tablename__ = "firmware_deployments"

    id = Column(Integer, primary_key=True, autoincrement=True)
    release_id = Column(Integer, ForeignKey("firmware_releases.id"), nullable=False, index=True)
    device_id = Column(
        String(100), ForeignKey("devices.device_id", ondelete="CASCADE"), nullable=False, index=True
    )
    status = Column(String(50), default="pending", index=True)  # pending, updating, success, failed
    error_message = Column(Text, nullable=True)
    command_version = Column(Integer, nullable=True)
    attempted_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, nullable=True)

    def __repr__(self):
        return f"<FirmwareDeploymentModel(device_id={self.device_id}, release_id={self.release_id}, status={self.status})>"

