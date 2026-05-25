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

    active_level: str = "LOW"
    """Logic level for relay activation: 'LOW' (active-low/sinking) or 'HIGH' (active-high/sourcing)"""

    default_state: str = "off"
    """Safe default state on boot: 'on' or 'off'"""

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

    def to_dict(self) -> dict:
        """Convert to dictionary for JSON serialization (for MQTT config messages)."""
        return {
            "relay_name": self.relay_name,
            "gpio_pin": self.gpio_pin,
            "active_level": self.active_level,
            "default_state": self.default_state,
        }

    @staticmethod
    def from_dict(data: dict, device_id: str | None = None) -> "RelayConfig":
        """Create RelayConfig from dictionary."""
        return RelayConfig(
            relay_name=data["relay_name"],
            gpio_pin=data["gpio_pin"],
            active_level=data.get("active_level", "LOW"),
            default_state=data.get("default_state", "off"),
            device_id=device_id,
        )
