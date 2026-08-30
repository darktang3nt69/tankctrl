"""
Domain model for relay configuration.

Represents the GPIO pin mapping and configuration for a single relay on a device.
This enables flexible, per-device relay configuration without hardcoding.
"""

from dataclasses import dataclass, field
from datetime import datetime


@dataclass
class RelayConfig:
    """
    Relay configuration for a device.
    
    Maps a logical relay name (e.g., "light", "pump") to a physical GPIO pin
    on the device, with active level and boot state configuration.
    """

    relay_name: str
    """Logical relay identifier: 'light', 'pump', 'heater', etc."""

    gpio_pin: int
    """Physical GPIO pin number on ESP32 (0-39)"""

    fail_safe_default: str
    """State to force this relay to when the device can't trust its network/time
    (e.g. `time_unknown`): 'on' or 'off'. No default — every relay must set this
    explicitly, matching the DB's NOT NULL column with no column default."""

    active_level: str = "LOW"
    """Logic level for relay activation: 'LOW' (active-low/sinking) or 'HIGH' (active-high/sourcing)"""

    default_state: str = "off"
    """Safe default state on boot: 'on' or 'off'"""

    cutoff_ceiling_seconds: int | None = None
    """Max continuous-on seconds before the device's independent hard-cutoff
    watchdog forces the relay off. None = no ceiling (fails open, e.g. filter/pump)."""

    device_id: str | None = None
    """Device ID this relay belongs to"""

    created_at: datetime = field(default_factory=datetime.utcnow)
    """Timestamp when relay config was created"""

    updated_at: datetime = field(default_factory=datetime.utcnow)
    """Timestamp when relay config was last updated"""

    def __post_init__(self):
        """Validate relay configuration on creation."""
        if not (0 <= self.gpio_pin <= 39):
            raise ValueError(f"Invalid GPIO pin {self.gpio_pin}. ESP32 supports 0-39.")
        if self.active_level not in ("LOW", "HIGH"):
            raise ValueError(f"active_level must be 'LOW' or 'HIGH', got {self.active_level}")
        if self.default_state not in ("on", "off"):
            raise ValueError(f"default_state must be 'on' or 'off', got {self.default_state}")
        if self.fail_safe_default not in ("on", "off"):
            raise ValueError(f"fail_safe_default must be 'on' or 'off', got {self.fail_safe_default}")
        if self.cutoff_ceiling_seconds is not None and self.cutoff_ceiling_seconds <= 0:
            raise ValueError(
                f"cutoff_ceiling_seconds must be a positive integer or None, got {self.cutoff_ceiling_seconds}"
            )

    def to_dict(self) -> dict:
        """Convert to dictionary for JSON serialization (for MQTT config messages)."""
        return {
            "relay_name": self.relay_name,
            "gpio_pin": self.gpio_pin,
            "active_level": self.active_level,
            "default_state": self.default_state,
            "fail_safe_default": self.fail_safe_default,
            "cutoff_ceiling_seconds": self.cutoff_ceiling_seconds,
        }

    @staticmethod
    def from_dict(data: dict, device_id: str | None = None) -> "RelayConfig":
        """Create RelayConfig from dictionary."""
        return RelayConfig(
            relay_name=data["relay_name"],
            gpio_pin=data["gpio_pin"],
            fail_safe_default=data["fail_safe_default"],
            active_level=data.get("active_level", "LOW"),
            default_state=data.get("default_state", "off"),
            cutoff_ceiling_seconds=data.get("cutoff_ceiling_seconds"),
            device_id=device_id,
        )
