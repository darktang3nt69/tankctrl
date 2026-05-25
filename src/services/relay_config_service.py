"""
Relay configuration service layer.

Handles business logic for relay configuration management: registration,
configuration updates, device synchronization, and validation.
"""

from typing import Dict, List, Optional, Tuple

from sqlalchemy.orm import Session

from src.domain.relay_config import RelayConfig
from src.infrastructure.db.database import db
from src.infrastructure.mqtt.mqtt_client import mqtt_client
from src.infrastructure.mqtt.mqtt_topics import MQTTTopics
from src.repository.relay_config_repository import RelayConfigRepository
from src.repository.device_repository import DeviceRepository
from src.services.command_service import CommandService
from src.utils.logger import get_logger
import json

logger = get_logger(__name__)


class RelayConfigService:
    """Service for relay configuration business logic."""

    def __init__(self, session: Optional[Session] = None):
        """Initialize service with optional session."""
        self.session = session or db.get_session()
        self.relay_repo = RelayConfigRepository(self.session)
        self.device_repo = DeviceRepository(self.session)
        self.command_service = CommandService(self.session)

    def register_default_relays(self, device_id: str) -> List[RelayConfig]:
        """
        Auto-create default relays on device registration.

        Creates standard relays for a new device:
        - light: GPIO D4, active-low, default off
        - pump: GPIO D12, active-low, default off

        Args:
            device_id: Device ID to register relays for

        Returns:
            List of created RelayConfig objects

        Raises:
            ValueError: If device not found or relays already exist
        """
        try:
            # Verify device exists
            device = self.device_repo.get_by_id(device_id)
            if not device:
                logger.warning(
                    "register_default_relays_device_not_found",
                    device_id=device_id
                )
                raise ValueError(f"Device {device_id} not found")

            # Define default relays
            default_relays = [
                RelayConfig(
                    relay_name="light",
                    gpio_pin=4,  # D4 on ESP32
                    active_level="LOW",
                    default_state="off",
                    device_id=device_id,
                ),
                RelayConfig(
                    relay_name="pump",
                    gpio_pin=12,  # D12 on ESP32
                    active_level="LOW",
                    default_state="off",
                    device_id=device_id,
                ),
            ]

            created_relays = []
            for relay in default_relays:
                try:
                    created = self.relay_repo.create_relay(relay)
                    created_relays.append(created)
                except ValueError as e:
                    logger.debug(
                        "default_relay_already_exists",
                        device_id=device_id,
                        relay_name=relay.relay_name,
                        error=str(e)
                    )
                    # Relay already exists, continue

            logger.info(
                "default_relays_registered",
                device_id=device_id,
                count=len(created_relays)
            )
            return created_relays

        except Exception as e:
            logger.error(
                "register_default_relays_failed",
                device_id=device_id,
                error=str(e)
            )
            raise

    def get_device_relay_config(
        self,
        device_id: str
    ) -> Dict[str, RelayConfig]:
        """
        Get all relay configs for a device as a dictionary.

        Returns relays keyed by relay_name for easy lookup.

        Args:
            device_id: Device ID

        Returns:
            Dictionary mapping relay_name -> RelayConfig

        Raises:
            ValueError: If device not found
        """
        try:
            # Verify device exists
            device = self.device_repo.get_by_id(device_id)
            if not device:
                logger.warning(
                    "get_device_relay_config_device_not_found",
                    device_id=device_id
                )
                raise ValueError(f"Device {device_id} not found")

            relays = self.relay_repo.get_device_relays(device_id)

            config_dict = {relay.relay_name: relay for relay in relays}

            logger.debug(
                "device_relay_config_retrieved",
                device_id=device_id,
                relay_count=len(config_dict)
            )
            return config_dict

        except Exception as e:
            logger.error(
                "get_device_relay_config_failed",
                device_id=device_id,
                error=str(e)
            )
            raise

    def push_config_to_device(self, device_id: str) -> bool:
        """
        Publish relay configuration to device via MQTT.

        Sends all relay configs to:
        `tankctl/{device_id}/config`

        Message format:
        {
            "light": {"gpio": 4, "active_level": "LOW", "default_state": "off"},
            "pump": {"gpio": 12, "active_level": "LOW", "default_state": "off"}
        }

        Args:
            device_id: Device ID

        Returns:
            True if published successfully

        Raises:
            ValueError: If device not found
        """
        try:
            # Get all relay configs
            config_dict = self.get_device_relay_config(device_id)

            if not config_dict:
                logger.warning(
                    "push_config_to_device_no_relays",
                    device_id=device_id
                )
                return False

            # Build MQTT payload
            mqtt_payload = {}
            for relay_name, relay_config in config_dict.items():
                mqtt_payload[relay_name] = relay_config.to_dict()

            # Publish to MQTT
            topic = MQTTTopics.config_topic(device_id)
            mqtt_client.publish(
                topic,
                json.dumps(mqtt_payload),
                qos=1,
                retain=True
            )

            logger.info(
                "relay_config_pushed_to_device",
                device_id=device_id,
                topic=topic,
                relay_count=len(config_dict)
            )
            return True

        except Exception as e:
            logger.error(
                "push_config_to_device_failed",
                device_id=device_id,
                error=str(e)
            )
            raise

    def validate_relay_config(
        self,
        relay_config: RelayConfig
    ) -> Tuple[bool, str]:
        """
        Validate relay configuration before creation/update.

        Checks:
        - GPIO pin is valid (0-39 for ESP32)
        - active_level is valid ('LOW' or 'HIGH')
        - default_state is valid ('on' or 'off')
        - No GPIO conflicts on the device
        - Relay name is non-empty

        Args:
            relay_config: RelayConfig to validate

        Returns:
            Tuple of (is_valid: bool, message: str)
        """
        try:
            # Check relay_name
            if not relay_config.relay_name or not relay_config.relay_name.strip():
                return False, "relay_name cannot be empty"

            if not relay_config.relay_name.replace("_", "").isalnum():
                return False, "relay_name must be alphanumeric (underscores allowed)"

            # Check GPIO pin (these checks happen in domain __post_init__)
            if not (0 <= relay_config.gpio_pin <= 39):
                return False, f"GPIO pin {relay_config.gpio_pin} is invalid for ESP32 (0-39)"

            # Check active_level
            if relay_config.active_level not in ("LOW", "HIGH"):
                return False, f"active_level must be 'LOW' or 'HIGH', got {relay_config.active_level}"

            # Check default_state
            if relay_config.default_state not in ("on", "off"):
                return False, f"default_state must be 'on' or 'off', got {relay_config.default_state}"

            # Check GPIO conflict
            if not self.relay_repo.validate_relay_config(relay_config):
                return False, f"GPIO pin {relay_config.gpio_pin} is already in use on device {relay_config.device_id}"

            logger.debug(
                "relay_config_validation_passed",
                device_id=relay_config.device_id,
                relay_name=relay_config.relay_name
            )
            return True, "relay configuration is valid"

        except ValueError as e:
            return False, str(e)
        except Exception as e:
            logger.error(
                "relay_config_validation_error",
                relay_name=relay_config.relay_name,
                error=str(e)
            )
            return False, f"validation error: {str(e)}"

    def create_relay_config(
        self,
        device_id: str,
        relay_name: str,
        gpio_pin: int,
        active_level: str = "LOW",
        default_state: str = "off",
    ) -> RelayConfig:
        """
        Create a new relay configuration.

        Args:
            device_id: Device ID
            relay_name: Logical relay name (e.g., 'light', 'pump')
            gpio_pin: GPIO pin number (0-39 for ESP32)
            active_level: 'LOW' or 'HIGH' (default 'LOW')
            default_state: 'on' or 'off' (default 'off')

        Returns:
            Created RelayConfig

        Raises:
            ValueError: If device not found, validation fails, or relay exists
        """
        try:
            # Verify device exists
            device = self.device_repo.get_by_id(device_id)
            if not device:
                logger.warning(
                    "create_relay_config_device_not_found",
                    device_id=device_id
                )
                raise ValueError(f"Device {device_id} not found")

            # Create domain model (this validates GPIO, levels, states)
            relay_config = RelayConfig(
                relay_name=relay_name,
                gpio_pin=gpio_pin,
                active_level=active_level,
                default_state=default_state,
                device_id=device_id,
            )

            # Validate
            is_valid, message = self.validate_relay_config(relay_config)
            if not is_valid:
                logger.warning(
                    "create_relay_config_validation_failed",
                    device_id=device_id,
                    relay_name=relay_name,
                    message=message
                )
                raise ValueError(f"Invalid relay configuration: {message}")

            # Create in database
            created = self.relay_repo.create_relay(relay_config)

            logger.info(
                "relay_config_created",
                device_id=device_id,
                relay_name=relay_name,
                gpio_pin=gpio_pin
            )
            return created

        except Exception as e:
            logger.error(
                "create_relay_config_failed",
                device_id=device_id,
                relay_name=relay_name,
                error=str(e)
            )
            raise

    def update_relay_config(
        self,
        device_id: str,
        relay_name: str,
        gpio_pin: Optional[int] = None,
        active_level: Optional[str] = None,
        default_state: Optional[str] = None,
    ) -> RelayConfig:
        """
        Update an existing relay configuration.

        Args:
            device_id: Device ID
            relay_name: Relay name to update
            gpio_pin: New GPIO pin (optional)
            active_level: New active level (optional)
            default_state: New default state (optional)

        Returns:
            Updated RelayConfig

        Raises:
            ValueError: If relay not found or validation fails
        """
        try:
            # Get existing relay
            existing = self.relay_repo.get_relay(device_id, relay_name)
            if not existing:
                logger.warning(
                    "update_relay_config_not_found",
                    device_id=device_id,
                    relay_name=relay_name
                )
                raise ValueError(
                    f"Relay '{relay_name}' not found for device {device_id}"
                )

            # Build updated config
            updated_config = RelayConfig(
                relay_name=relay_name,
                gpio_pin=gpio_pin if gpio_pin is not None else existing.gpio_pin,
                active_level=active_level if active_level is not None else existing.active_level,
                default_state=default_state if default_state is not None else existing.default_state,
                device_id=device_id,
            )

            # Validate
            is_valid, message = self.validate_relay_config(updated_config)
            if not is_valid:
                logger.warning(
                    "update_relay_config_validation_failed",
                    device_id=device_id,
                    relay_name=relay_name,
                    message=message
                )
                raise ValueError(f"Invalid relay configuration: {message}")

            # Update in database
            updated = self.relay_repo.update_relay(updated_config)

            logger.info(
                "relay_config_updated",
                device_id=device_id,
                relay_name=relay_name,
                gpio_pin=updated.gpio_pin
            )
            return updated

        except Exception as e:
            logger.error(
                "update_relay_config_failed",
                device_id=device_id,
                relay_name=relay_name,
                error=str(e)
            )
            raise

    def delete_relay_config(
        self,
        device_id: str,
        relay_name: str,
    ) -> bool:
        """
        Delete a relay configuration.

        Args:
            device_id: Device ID
            relay_name: Relay name to delete

        Returns:
            True if deleted, False if not found

        Raises:
            ValueError: If device not found
        """
        try:
            # Verify device exists
            device = self.device_repo.get_by_id(device_id)
            if not device:
                logger.warning(
                    "delete_relay_config_device_not_found",
                    device_id=device_id
                )
                raise ValueError(f"Device {device_id} not found")

            deleted = self.relay_repo.delete_relay(device_id, relay_name)

            if deleted:
                logger.info(
                    "relay_config_deleted",
                    device_id=device_id,
                    relay_name=relay_name
                )
            else:
                logger.warning(
                    "relay_config_not_found_for_deletion",
                    device_id=device_id,
                    relay_name=relay_name
                )

            return deleted

        except Exception as e:
            logger.error(
                "delete_relay_config_failed",
                device_id=device_id,
                relay_name=relay_name,
                error=str(e)
            )
            raise
