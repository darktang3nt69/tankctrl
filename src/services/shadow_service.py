"""
Shadow reconciliation service.

Handles shadow state reconciliation between desired and reported state.
"""

from typing import Optional

from sqlalchemy.orm import Session

from src.domain.command import CommandStatus
from src.domain.device_shadow import DeviceShadow
from src.infrastructure.db.database import db
from src.infrastructure.events.event_publisher import event_publisher
from src.domain.event import shadow_drifted_event, shadow_synchronized_event, Event
from src.services.command_service import CommandService
from src.repository.device_repository import DeviceShadowRepository
from src.services._errors import log_on_error
from src.utils.logger import get_logger

logger = get_logger(__name__)


class ShadowService:
    """Service for device shadow reconciliation."""

    def __init__(self, session: Optional[Session] = None):
        """Initialize service with optional session."""
        self.session = session or db.get_session()
        self.shadow_repo = DeviceShadowRepository(self.session)

    def reconcile_shadow(self, device_id: str) -> Optional[DeviceShadow]:
        """
        Reconcile device shadow.

        If desired != reported, sends a command to bring device into desired state.
        
        Handles multi-relay reconciliation: for each key in desired state,
        if it differs from reported state, sends a command.

        Args:
            device_id: Device ID to reconcile

        Returns:
            Updated shadow or None if not found
        """
        logger.debug("shadow_reconciliation_started", device_id=device_id)

        try:
            shadow = self.shadow_repo.get_by_device_id(device_id)
            if not shadow:
                logger.warning("shadow_not_found", device_id=device_id)
                return None

            # Check if already synchronized
            if shadow.is_synchronized():
                logger.debug("shadow_already_synchronized", device_id=device_id, version=shadow.version)
                return shadow

            # Get delta between desired and reported
            delta = shadow.get_delta()
            if not delta:
                logger.debug("shadow_delta_empty", device_id=device_id)
                return shadow

            logger.info(
                "shadow_reconciliation_needed",
                device_id=device_id,
                version=shadow.version,
                delta_keys=list(delta.keys()),
                delta=delta,
            )
            
            # Publish shadow_drifted event
            event = shadow_drifted_event(
                device_id=device_id,
                version=shadow.version,
                delta=delta,
            )
            event_publisher.publish(event)

            command_service = CommandService(self.session)

            # Commands already in flight for this device — skip re-sending
            # the same (command, value) pair while one is still pending or
            # sent, rather than spamming a duplicate every reconciliation tick.
            recent_commands = command_service.get_command_history(device_id, limit=20)
            inflight = {
                (c.command, c.value)
                for c in recent_commands
                if c.status in (CommandStatus.PENDING, CommandStatus.SENT)
            }

            # Send command for each mismatched relay
            for relay_name, desired_value in delta.items():
                command_name = f"set_{relay_name}"
                command_value = str(desired_value)

                if (command_name, command_value) in inflight:
                    logger.debug(
                        "shadow_delta_command_already_inflight",
                        device_id=device_id,
                        relay_name=relay_name,
                        command=command_name,
                        value=command_value,
                    )
                    continue

                try:
                    # No explicit version: let CommandService assign its own
                    # auto-incrementing version (from command history), same
                    # as route-driven commands. A shared version across the
                    # relays in this loop would mean the device — which
                    # rejects any command whose version isn't strictly
                    # greater than the last one it processed — only ever
                    # accepts the first of them.
                    sent = command_service.send_command(
                        device_id=device_id,
                        command=command_name,
                        value=command_value,
                    )

                    logger.info(
                        "shadow_delta_command_sent",
                        device_id=device_id,
                        relay_name=relay_name,
                        desired=desired_value,
                        reported=shadow.reported.get(relay_name),
                        command=command_name,
                        version=sent.version,
                    )
                except Exception as e:
                    logger.error(
                        "shadow_delta_command_failed",
                        device_id=device_id,
                        relay_name=relay_name,
                        command=command_name,
                        error=str(e),
                    )
                    # Continue with other relays even if one fails
                    continue

            return shadow

        except Exception as e:
            logger.error("shadow_reconciliation_failed", device_id=device_id, error=str(e))
            return None

    def handle_reported_state(
        self,
        device_id: str,
        reported_state: dict,
    ) -> Optional[DeviceShadow]:
        """
        Handle reported state update from device.

        Updates the reported state in shadow and checks for reconciliation.
        
        For multi-relay devices, tracks state changes for all relays.

        Args:
            device_id: Device ID
            reported_state: Reported state from device (e.g., {"light": "on", "pump": "off"})

        Returns:
            Updated shadow or None if not found
        """
        logger.debug("handling_reported_state", device_id=device_id, reported_state=reported_state)

        with log_on_error(logger, "handle_reported_state_failed", device_id=device_id):
            # Get old state before updating
            old_shadow = self.shadow_repo.get_by_device_id(device_id)
            old_reported = old_shadow.reported if old_shadow else {}
            
            # Update reported state
            shadow = self.shadow_repo.update_reported(device_id, reported_state)
            if shadow:
                logger.debug(
                    "shadow_reported_state_updated",
                    device_id=device_id,
                    synchronized=shadow.is_synchronized(),
                    version=shadow.version,
                )
                
                # Check for state changes in any relay
                state_changes = {}
                for relay_name, new_state in reported_state.items():
                    old_state = old_reported.get(relay_name)
                    if new_state != old_state:
                        state_changes[relay_name] = {
                            "from": old_state,
                            "to": new_state,
                        }
                        
                        logger.info(
                            "relay_state_changed",
                            device_id=device_id,
                            relay_name=relay_name,
                            from_state=old_state,
                            to_state=new_state,
                        )
                
                # Publish relay_state_changed event for each changed relay
                if state_changes:
                    # Maintain backward compatibility with light_state_changed
                    if "light" in state_changes:
                        event = Event(
                            event="light_state_changed",
                            device_id=device_id,
                            metadata={
                                "light": state_changes["light"]["to"],
                                "_from_reconciliation": False,
                            }
                        )
                        event_publisher.publish(event)
                        logger.info(
                            "light_state_changed_event_published",
                            device_id=device_id,
                            light=state_changes["light"]["to"]
                        )
                    
                    # Publish generic relay_state_changed events for all relays
                    event = Event(
                        event="relay_state_changed",
                        device_id=device_id,
                        metadata={
                            "changes": {
                                relay: change["to"] 
                                for relay, change in state_changes.items()
                            }
                        }
                    )
                    event_publisher.publish(event)
                
                # Check if shadow just became synchronized
                if shadow.is_synchronized():
                    event = shadow_synchronized_event(
                        device_id=device_id,
                        version=shadow.version,
                    )
                    event_publisher.publish(event)
                    logger.info(
                        "shadow_synchronized_event_published",
                        device_id=device_id,
                        version=shadow.version,
                    )
                    
            return shadow

    def set_desired_state(self, device_id: str, desired_state: dict) -> Optional[DeviceShadow]:
        """
        Set the desired state for a device.

        Args:
            device_id: Device ID
            desired_state: New desired state

        Returns:
            Updated shadow or None if not found
        """
        logger.info("setting_desired_state", device_id=device_id)

        with log_on_error(logger, "set_desired_state_failed", device_id=device_id):
            shadow = self.shadow_repo.get_by_device_id(device_id)
            if not shadow:
                logger.warning("shadow_not_found", device_id=device_id)
                return None

            shadow.update_desired(desired_state)
            updated = self.shadow_repo.update(shadow)

            logger.info(
                "desired_state_updated",
                device_id=device_id,
                version=updated.version,
            )

            return updated

    def close(self) -> None:
        """Close the session."""
        self.session.close()


# Alias for backwards compatibility
ShadowRepository = DeviceShadowRepository
