import unittest
from unittest.mock import MagicMock, patch

from src.domain.command import Command, CommandStatus
from src.domain.device_shadow import DeviceShadow
from src.infrastructure.mqtt.handlers import ReportedStateHandler
from src.services.shadow_service import ShadowService


class ShadowServiceReconciliationTests(unittest.TestCase):
    @patch("src.services.shadow_service.event_publisher")
    @patch("src.services.shadow_service.CommandService")
    def test_reconcile_shadow_skips_duplicate_inflight_command(
        self,
        command_service_cls: MagicMock,
        _event_publisher: MagicMock,
    ) -> None:
        session = MagicMock()
        service = ShadowService(session)

        service.shadow_repo = MagicMock()
        service.shadow_repo.get_by_device_id.return_value = DeviceShadow(
            device_id="tank1",
            desired={"light": "on"},
            reported={"light": "off"},
            version=7,
        )

        command_service = command_service_cls.return_value
        command_service.get_command_history.return_value = [
            Command(
                id=123,
                device_id="tank1",
                command="set_light",
                value="on",
                version=7,
                status=CommandStatus.SENT,
            )
        ]

        service.reconcile_shadow("tank1")

        command_service.send_command.assert_not_called()

    @patch("src.services.shadow_service.event_publisher")
    @patch("src.services.shadow_service.CommandService")
    def test_reconcile_shadow_sends_command_when_no_inflight_match(
        self,
        command_service_cls: MagicMock,
        _event_publisher: MagicMock,
    ) -> None:
        session = MagicMock()
        service = ShadowService(session)

        service.shadow_repo = MagicMock()
        service.shadow_repo.get_by_device_id.return_value = DeviceShadow(
            device_id="tank1",
            desired={"light": "on"},
            reported={"light": "off"},
            version=11,
        )

        command_service = command_service_cls.return_value
        command_service.get_command_history.return_value = []

        service.reconcile_shadow("tank1")

        # No explicit version: CommandService.send_command assigns its own
        # auto-incrementing version from command history, same as route-driven
        # commands (set_light/set_pump). Passing a version here is what caused
        # every relay's command in a single reconciliation pass to share one
        # non-advancing number.
        command_service.send_command.assert_called_once_with(
            device_id="tank1",
            command="set_light",
            value="on",
        )


class ReportedStateHandlerTests(unittest.TestCase):
    @patch("src.infrastructure.mqtt.handlers.CommandService")
    @patch("src.infrastructure.mqtt.handlers.ShadowService")
    @patch("src.infrastructure.mqtt.handlers.DeviceService")
    @patch("src.infrastructure.mqtt.handlers.db")
    def test_reported_state_triggers_immediate_reconciliation(
        self,
        db_mock: MagicMock,
        device_service_cls: MagicMock,
        shadow_service_cls: MagicMock,
        command_service_cls: MagicMock,
    ) -> None:
        session = MagicMock()
        db_mock.get_session.return_value = session

        device_service = device_service_cls.return_value
        device_service.get_device.return_value = object()

        shadow_service = shadow_service_cls.return_value
        shadow_service.handle_reported_state.return_value = DeviceShadow(
            device_id="tank1",
            desired={"light": "on"},
            reported={"light": "off"},
            version=3,
        )
        shadow_service.reconcile_shadow.return_value = DeviceShadow(
            device_id="tank1",
            desired={"light": "on"},
            reported={"light": "off"},
            version=3,
        )

        command_service = command_service_cls.return_value
        command_service.get_command_history.return_value = []

        handler = ReportedStateHandler()
        handler.handle("tank1", {"light": "off"})

        shadow_service.handle_reported_state.assert_called_once_with("tank1", {"light": "off"})
        shadow_service.reconcile_shadow.assert_called_once_with("tank1")
        session.close.assert_called_once()


if __name__ == "__main__":
    unittest.main()
