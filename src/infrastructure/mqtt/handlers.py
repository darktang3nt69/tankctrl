"""
MQTT message handlers for TankCtl.

Handlers implement the MessageHandler interface and route incoming MQTT messages to services.
"""

from src.infrastructure.db.database import db
from src.infrastructure.mqtt.mqtt_client import MessageHandler
from src.domain.command import CommandStatus
from src.services.command_service import CommandService
from src.services.device_service import DeviceService
from src.services.shadow_service import ShadowService
from src.services.telemetry_service import TelemetryService
from src.utils.logger import get_logger

from src.infrastructure.events.event_publisher import event_publisher
from src.domain.event import Event

logger = get_logger(__name__)


class DeviceStatusHandler(MessageHandler):
    """Handle device status/warning messages (e.g. sensor unavailable)."""

    def handle(self, device_id: str, payload: dict) -> None:
        code = payload.get("code", "unknown")
        message = payload.get("message", "")
        logger.warning(
            "device_warning",
            device_id=device_id,
            code=code,
            message=message,
        )
        event_publisher.publish(
            Event(
                event="device_warning",
                device_id=device_id,
                metadata={"code": code, "message": message},
            )
        )


class HeartbeatHandler(MessageHandler):
    """Handle device heartbeat messages."""

    def handle(self, device_id: str, payload: dict) -> None:
        """
        Handle heartbeat from device.

        Marks device as online, updates last_seen, and reconciles shadow state.

        Args:
            device_id: Device ID
            payload: Heartbeat payload from device
        """
        session = db.get_session()
        try:
            service = DeviceService(session)

            device = service.get_device(device_id)
            if not device:
                logger.warning("heartbeat_rejected_unregistered", device_id=device_id)
                return

            service.handle_heartbeat(
                device_id,
                uptime_ms=payload.get("uptime_ms"),
                rssi=payload.get("rssi"),
                wifi_status=payload.get("wifi"),
                firmware_version=payload.get("firmware_version"),
                status=payload.get("status"),
            )

            logger.info("device_heartbeat_handled", device_id=device_id)

            # Reconcile shadow state to fix any drift from power loss or disconnections
            shadow_service = ShadowService(session)
            shadow = shadow_service.reconcile_shadow(device_id)
            if shadow and not shadow.is_synchronized():
                logger.info(
                    "shadow_reconciliation_triggered_by_heartbeat",
                    device_id=device_id,
                    delta=shadow.get_delta(),
                )

        except Exception as e:
            logger.error("heartbeat_handler_error", device_id=device_id, error=str(e))
        finally:
            session.close()


class ReportedStateHandler(MessageHandler):
    """Handle device reported state messages."""

    def handle(self, device_id: str, payload: dict) -> None:
        """
        Handle reported state from device.

        Updates shadow with device's current state.

        Args:
            device_id: Device ID
            payload: Reported state from device
        """
        session = db.get_session()
        try:
            device_service = DeviceService(session)

            device = device_service.get_device(device_id)
            if not device:
                logger.warning("reported_state_rejected_unregistered", device_id=device_id)
                return

            shadow_service = ShadowService(session)

            # Mark device as online
            device_service.handle_heartbeat(device_id)

            # Update shadow with reported state
            shadow_service.handle_reported_state(device_id, payload)

            # Reconcile immediately — don't wait for the next heartbeat or
            # the periodic scheduler tick to correct any remaining drift.
            shadow_service.reconcile_shadow(device_id)

            # Mark matching open commands as executed based on reported state
            command_service = CommandService(session)
            recent_commands = command_service.get_command_history(device_id, limit=20)

            for command in recent_commands:
                if command.id is None:
                    continue

                if command.status not in (CommandStatus.PENDING, CommandStatus.SENT):
                    continue

                # Commands are named `set_{relay_name}` (see ShadowService.reconcile_shadow) —
                # match any relay generically, not just the light/pump built-ins, so
                # custom relays' commands resolve to executed too.
                if command.command.startswith("set_"):
                    relay_name = command.command[len("set_"):]
                    if payload.get(relay_name) == command.value:
                        command_service.mark_command_executed(command.id)

            logger.info("reported_state_handled", device_id=device_id)

        except Exception as e:
            logger.error("reported_state_handler_error", device_id=device_id, error=str(e))
        finally:
            session.close()


class TelemetryHandler(MessageHandler):
    """Handle device telemetry messages."""

    def handle(self, device_id: str, payload: dict) -> None:
        """
        Handle telemetry from device.

        Stores telemetry data in TimescaleDB.

        Args:
            device_id: Device ID
            payload: Telemetry data from device
        """
        # Check device registration — short-lived session, always closed
        check_session = db.get_session()
        try:
            device = DeviceService(check_session).get_device(device_id)
        finally:
            check_session.close()

        if not device:
            logger.warning("telemetry_rejected_unregistered", device_id=device_id)
            return

        # Store telemetry in TimescaleDB
        ts_session = db.get_timescale_session()
        try:
            TelemetryService(ts_session).store_telemetry(device_id, payload)
        except Exception as e:
            logger.error("telemetry_store_error", device_id=device_id, error=str(e))
        finally:
            ts_session.close()

        # Update device heartbeat
        db_session = db.get_session()
        try:
            DeviceService(db_session).handle_heartbeat(device_id)
        except Exception as e:
            logger.error("telemetry_heartbeat_error", device_id=device_id, error=str(e))
        finally:
            db_session.close()

        logger.debug("telemetry_handled", device_id=device_id)
