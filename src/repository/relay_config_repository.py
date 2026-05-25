"""
Repository layer for relay configuration.

Handles database access for relay config data following the repository pattern.
"""

from datetime import datetime
from typing import List, Optional

from sqlalchemy.orm import Session

from src.domain.relay_config import RelayConfig
from src.infrastructure.db.models import RelayConfigModel
from src.utils.logger import get_logger

logger = get_logger(__name__)


class RelayConfigRepository:
    """Repository for relay configuration operations."""

    def __init__(self, session: Session):
        """Initialize repository with database session."""
        self.session = session

    def get_device_relays(self, device_id: str) -> List[RelayConfig]:
        """
        Get all relays for a device.

        Args:
            device_id: Device ID

        Returns:
            List of RelayConfig objects for the device
        """
        try:
            db_relays = self.session.query(RelayConfigModel).filter(
                RelayConfigModel.device_id == device_id
            ).all()

            relays = []
            for db_relay in db_relays:
                relays.append(self._db_model_to_domain(db_relay))

            logger.debug(
                "device_relays_retrieved",
                device_id=device_id,
                count=len(relays)
            )
            return relays

        except Exception as e:
            logger.error(
                "device_relays_retrieval_failed",
                device_id=device_id,
                error=str(e)
            )
            raise

    def get_relay(
        self,
        device_id: str,
        relay_name: str
    ) -> Optional[RelayConfig]:
        """
        Get a specific relay for a device.

        Args:
            device_id: Device ID
            relay_name: Relay name (e.g., 'light', 'pump')

        Returns:
            RelayConfig or None if not found
        """
        try:
            db_relay = self.session.query(RelayConfigModel).filter(
                RelayConfigModel.device_id == device_id,
                RelayConfigModel.relay_name == relay_name
            ).first()

            if not db_relay:
                logger.debug(
                    "relay_not_found",
                    device_id=device_id,
                    relay_name=relay_name
                )
                return None

            logger.debug(
                "relay_retrieved",
                device_id=device_id,
                relay_name=relay_name,
                gpio_pin=db_relay.gpio_pin
            )
            return self._db_model_to_domain(db_relay)

        except Exception as e:
            logger.error(
                "relay_retrieval_failed",
                device_id=device_id,
                relay_name=relay_name,
                error=str(e)
            )
            raise

    def create_relay(self, relay_config: RelayConfig) -> RelayConfig:
        """
        Create a new relay configuration.

        Args:
            relay_config: RelayConfig domain model

        Returns:
            Created RelayConfig with timestamps

        Raises:
            ValueError: If relay already exists or GPIO pin conflict
        """
        try:
            # Check if relay already exists
            existing = self.session.query(RelayConfigModel).filter(
                RelayConfigModel.device_id == relay_config.device_id,
                RelayConfigModel.relay_name == relay_config.relay_name
            ).first()

            if existing:
                logger.warning(
                    "relay_already_exists",
                    device_id=relay_config.device_id,
                    relay_name=relay_config.relay_name
                )
                raise ValueError(
                    f"Relay '{relay_config.relay_name}' already exists for device {relay_config.device_id}"
                )

            # Check for GPIO pin conflict on same device
            gpio_conflict = self.session.query(RelayConfigModel).filter(
                RelayConfigModel.device_id == relay_config.device_id,
                RelayConfigModel.gpio_pin == relay_config.gpio_pin
            ).first()

            if gpio_conflict:
                logger.warning(
                    "gpio_pin_conflict",
                    device_id=relay_config.device_id,
                    gpio_pin=relay_config.gpio_pin,
                    existing_relay=gpio_conflict.relay_name
                )
                raise ValueError(
                    f"GPIO pin {relay_config.gpio_pin} is already used by relay '{gpio_conflict.relay_name}'"
                )

            db_relay = RelayConfigModel(
                device_id=relay_config.device_id,
                relay_name=relay_config.relay_name,
                gpio_pin=relay_config.gpio_pin,
                active_level=relay_config.active_level,
                default_state=relay_config.default_state,
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow(),
            )

            self.session.add(db_relay)
            self.session.commit()

            logger.info(
                "relay_created",
                device_id=relay_config.device_id,
                relay_name=relay_config.relay_name,
                gpio_pin=relay_config.gpio_pin,
                active_level=relay_config.active_level
            )

            return self._db_model_to_domain(db_relay)

        except ValueError:
            self.session.rollback()
            raise
        except Exception as e:
            self.session.rollback()
            logger.error(
                "relay_creation_failed",
                device_id=relay_config.device_id,
                relay_name=relay_config.relay_name,
                error=str(e)
            )
            raise

    def update_relay(self, relay_config: RelayConfig) -> RelayConfig:
        """
        Update an existing relay configuration.

        Args:
            relay_config: RelayConfig with updated values

        Returns:
            Updated RelayConfig

        Raises:
            ValueError: If relay not found or GPIO pin conflict
        """
        try:
            db_relay = self.session.query(RelayConfigModel).filter(
                RelayConfigModel.device_id == relay_config.device_id,
                RelayConfigModel.relay_name == relay_config.relay_name
            ).first()

            if not db_relay:
                logger.warning(
                    "relay_not_found_for_update",
                    device_id=relay_config.device_id,
                    relay_name=relay_config.relay_name
                )
                raise ValueError(
                    f"Relay '{relay_config.relay_name}' not found for device {relay_config.device_id}"
                )

            # Check for GPIO pin conflict if GPIO pin is changing
            if db_relay.gpio_pin != relay_config.gpio_pin:
                gpio_conflict = self.session.query(RelayConfigModel).filter(
                    RelayConfigModel.device_id == relay_config.device_id,
                    RelayConfigModel.gpio_pin == relay_config.gpio_pin,
                    RelayConfigModel.relay_name != relay_config.relay_name
                ).first()

                if gpio_conflict:
                    logger.warning(
                        "gpio_pin_conflict_on_update",
                        device_id=relay_config.device_id,
                        gpio_pin=relay_config.gpio_pin,
                        existing_relay=gpio_conflict.relay_name
                    )
                    raise ValueError(
                        f"GPIO pin {relay_config.gpio_pin} is already used by relay '{gpio_conflict.relay_name}'"
                    )

            db_relay.gpio_pin = relay_config.gpio_pin
            db_relay.active_level = relay_config.active_level
            db_relay.default_state = relay_config.default_state
            db_relay.updated_at = datetime.utcnow()

            self.session.commit()

            logger.info(
                "relay_updated",
                device_id=relay_config.device_id,
                relay_name=relay_config.relay_name,
                gpio_pin=relay_config.gpio_pin,
                active_level=relay_config.active_level
            )

            return self._db_model_to_domain(db_relay)

        except ValueError:
            self.session.rollback()
            raise
        except Exception as e:
            self.session.rollback()
            logger.error(
                "relay_update_failed",
                device_id=relay_config.device_id,
                relay_name=relay_config.relay_name,
                error=str(e)
            )
            raise

    def delete_relay(
        self,
        device_id: str,
        relay_name: str
    ) -> bool:
        """
        Delete a relay configuration.

        Args:
            device_id: Device ID
            relay_name: Relay name

        Returns:
            True if deleted, False if not found
        """
        try:
            deleted = self.session.query(RelayConfigModel).filter(
                RelayConfigModel.device_id == device_id,
                RelayConfigModel.relay_name == relay_name
            ).delete()

            self.session.commit()

            if deleted > 0:
                logger.info(
                    "relay_deleted",
                    device_id=device_id,
                    relay_name=relay_name
                )
            else:
                logger.warning(
                    "relay_not_found_for_deletion",
                    device_id=device_id,
                    relay_name=relay_name
                )

            return deleted > 0

        except Exception as e:
            self.session.rollback()
            logger.error(
                "relay_deletion_failed",
                device_id=device_id,
                relay_name=relay_name,
                error=str(e)
            )
            raise

    def validate_relay_config(self, relay_config: RelayConfig) -> bool:
        """
        Validate relay configuration rules.

        Checks:
        - GPIO pin is in valid range (0-39 for ESP32)
        - active_level is 'LOW' or 'HIGH'
        - default_state is 'on' or 'off'
        - No GPIO conflicts on device

        Args:
            relay_config: RelayConfig to validate

        Returns:
            True if valid
        """
        try:
            # Domain model __post_init__ already validates GPIO, levels, states
            # So if we got here without exception, the basic validation passed

            # Check for GPIO conflicts on device (excluding the relay being updated)
            conflict = self.session.query(RelayConfigModel).filter(
                RelayConfigModel.device_id == relay_config.device_id,
                RelayConfigModel.gpio_pin == relay_config.gpio_pin,
                RelayConfigModel.relay_name != relay_config.relay_name
            ).first()

            if conflict:
                logger.warning(
                    "relay_validation_failed_gpio_conflict",
                    device_id=relay_config.device_id,
                    gpio_pin=relay_config.gpio_pin
                )
                return False

            logger.debug(
                "relay_validation_passed",
                device_id=relay_config.device_id,
                relay_name=relay_config.relay_name
            )
            return True

        except Exception as e:
            logger.error("relay_validation_error", error=str(e))
            return False

    def _db_model_to_domain(self, db_model: RelayConfigModel) -> RelayConfig:
        """
        Convert database model to domain model.

        Args:
            db_model: RelayConfigModel instance

        Returns:
            RelayConfig domain model
        """
        return RelayConfig(
            relay_name=db_model.relay_name,
            gpio_pin=db_model.gpio_pin,
            active_level=db_model.active_level,
            default_state=db_model.default_state,
            device_id=db_model.device_id,
            created_at=db_model.created_at,
            updated_at=db_model.updated_at,
        )
