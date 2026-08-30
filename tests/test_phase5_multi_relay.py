"""
Phase 5 Tests: Multi-relay command and shadow service integration.

Tests for:
- CommandService relay validation
- ShadowService multi-relay reconciliation
- DeviceService multi-relay initialization
"""

import unittest
from unittest.mock import MagicMock, patch

from src.domain.command import Command, CommandStatus
from src.domain.device_shadow import DeviceShadow
from src.domain.relay_config import RelayConfig
from src.services.command_service import CommandService
from src.services.shadow_service import ShadowService
from src.services.device_service import DeviceService


class CommandServiceRelayValidationTests(unittest.TestCase):
    """Tests for CommandService relay validation."""

    def test_extract_relay_name_from_set_pump(self):
        """Test extraction of relay name from 'set_pump' command."""
        session = MagicMock()
        service = CommandService(session)
        
        relay_name = service._extract_relay_name("set_pump")
        assert relay_name == "pump"

    def test_extract_relay_name_from_set_light(self):
        """Test extraction of relay name from 'set_light' command."""
        session = MagicMock()
        service = CommandService(session)
        
        relay_name = service._extract_relay_name("set_light")
        assert relay_name == "light"

    def test_extract_relay_name_from_set_relay_heater(self):
        """Test extraction of relay name from 'set_relay_heater' command."""
        session = MagicMock()
        service = CommandService(session)
        
        relay_name = service._extract_relay_name("set_relay_heater")
        assert relay_name == "heater"

    def test_extract_relay_name_from_non_relay_command(self):
        """Test that non-relay commands return None."""
        session = MagicMock()
        service = CommandService(session)
        
        relay_name = service._extract_relay_name("reboot_device")
        assert relay_name is None

    @patch("src.services.relay_config_service.RelayConfigService")
    def test_validate_relay_command_success(self, relay_service_cls: MagicMock):
        """Test successful relay command validation."""
        session = MagicMock()
        service = CommandService(session)
        
        # Mock RelayConfigService
        relay_service = relay_service_cls.return_value
        relay_service.get_device_relay_config.return_value = {
            "pump": RelayConfig(relay_name="pump", gpio_pin=12, fail_safe_default="off"),
        }
        
        # Should not raise
        service._validate_relay_command(
            device_id="tank1",
            command="set_pump",
            value="on",
        )

    @patch("src.services.relay_config_service.RelayConfigService")
    def test_validate_relay_command_invalid_value(self, relay_service_cls: MagicMock):
        """Test validation fails for invalid relay value."""
        session = MagicMock()
        service = CommandService(session)
        
        relay_service = relay_service_cls.return_value
        relay_service.get_device_relay_config.return_value = {
            "pump": RelayConfig(relay_name="pump", gpio_pin=12, fail_safe_default="off"),
        }
        
        # Should raise ValueError for invalid value
        with self.assertRaises(ValueError) as ctx:
            service._validate_relay_command(
                device_id="tank1",
                command="set_pump",
                value="maybe",  # Invalid: must be "on" or "off"
            )
        
        assert "Invalid relay value" in str(ctx.exception)

    @patch("src.services.relay_config_service.RelayConfigService")
    def test_validate_relay_command_relay_not_found(self, relay_service_cls: MagicMock):
        """Test validation fails when relay doesn't exist."""
        session = MagicMock()
        service = CommandService(session)
        
        relay_service = relay_service_cls.return_value
        relay_service.get_device_relay_config.return_value = {}  # No relays
        
        # Should raise ValueError for missing relay
        with self.assertRaises(ValueError) as ctx:
            service._validate_relay_command(
                device_id="tank1",
                command="set_pump",
                value="on",
            )
        
        assert "Relay 'pump' not found" in str(ctx.exception)

    @patch("src.services.relay_config_service.RelayConfigService")
    def test_validate_relay_command_infra_failure_not_misclassified_as_valueerror(
        self, relay_service_cls: MagicMock
    ):
        """An infra failure (e.g. DB connectivity) while checking relay config
        must propagate as itself, not get wrapped into ValueError — routes
        treat ValueError as a 400 (bad input), but a DB outage is a 500/
        retryable condition, not an invalid command from the caller.
        """
        session = MagicMock()
        service = CommandService(session)

        relay_service = relay_service_cls.return_value
        relay_service.get_device_relay_config.side_effect = RuntimeError("connection refused")

        with self.assertRaises(RuntimeError):
            service._validate_relay_command(
                device_id="tank1",
                command="set_pump",
                value="on",
            )

    @patch("src.services.relay_config_service.RelayConfigService")
    @patch("src.services.command_service.mqtt_client")
    @patch("src.services.command_service.event_publisher")
    def test_send_pump_command_success(
        self,
        event_publisher: MagicMock,
        mqtt_client: MagicMock,
        relay_service_cls: MagicMock,
    ):
        """Test successful pump command sending."""
        session = MagicMock()
        service = CommandService(session)
        service.repo = MagicMock()
        service.repo.get_latest_for_device.return_value = []
        service.repo.create.return_value = None
        service.repo.update_status.return_value = Command(
            id=1,
            device_id="tank1",
            command="set_pump",
            value="on",
            version=1,
            status=CommandStatus.SENT,
        )
        
        # Mock RelayConfigService
        relay_service = relay_service_cls.return_value
        relay_service.get_device_relay_config.return_value = {
            "pump": RelayConfig(relay_name="pump", gpio_pin=12, fail_safe_default="off"),
        }
        
        # Send command
        cmd = service.send_command(
            device_id="tank1",
            command="set_pump",
            value="on",
        )
        
        # Verify command was created
        assert cmd.device_id == "tank1"
        assert cmd.command == "set_pump"
        assert cmd.value == "on"
        
        # Verify MQTT was called
        mqtt_client.publish.assert_called_once()


class ShadowServiceMultiRelayTests(unittest.TestCase):
    """Tests for ShadowService multi-relay reconciliation."""

    @patch("src.services.shadow_service.event_publisher")
    @patch("src.services.shadow_service.CommandService")
    def test_reconcile_shadow_multi_relay_delta(
        self,
        command_service_cls: MagicMock,
        event_publisher: MagicMock,
    ):
        """Test shadow reconciliation with multiple relays."""
        session = MagicMock()
        service = ShadowService(session)
        service.shadow_repo = MagicMock()
        
        # Shadow with two relays: light ON, pump OFF (but wants both ON)
        service.shadow_repo.get_by_device_id.return_value = DeviceShadow(
            device_id="tank1",
            desired={"light": "on", "pump": "on"},
            reported={"light": "on", "pump": "off"},
            version=5,
        )
        
        command_service = command_service_cls.return_value
        command_service.get_command_history.return_value = []

        service.reconcile_shadow("tank1")

        # Should send one command for pump (only delta)
        command_service.send_command.assert_called_once()
        call_args = command_service.send_command.call_args
        assert call_args[1]["device_id"] == "tank1"
        assert call_args[1]["command"] == "set_pump"
        assert call_args[1]["value"] == "on"

    @patch("src.services.shadow_service.event_publisher")
    @patch("src.services.shadow_service.CommandService")
    def test_reconcile_shadow_does_not_pass_explicit_version_per_relay(
        self,
        command_service_cls: MagicMock,
        event_publisher: MagicMock,
    ):
        """Each relay's command must get its own version from CommandService's
        own auto-increment (based on command history) rather than a single
        version shared by every command sent in this reconciliation pass —
        the firmware rejects any command whose version isn't strictly greater
        than the last one it processed, so two commands sharing one version
        means only the first ever lands.
        """
        session = MagicMock()
        service = ShadowService(session)
        service.shadow_repo = MagicMock()

        # Two relays out of sync at once (e.g. after a reboot).
        service.shadow_repo.get_by_device_id.return_value = DeviceShadow(
            device_id="tank1",
            desired={"light": "on", "pump": "on"},
            reported={"light": "off", "pump": "off"},
            version=5,
        )

        command_service = command_service_cls.return_value
        command_service.get_command_history.return_value = []

        service.reconcile_shadow("tank1")

        assert command_service.send_command.call_count == 2
        for call in command_service.send_command.call_args_list:
            assert "version" not in call.kwargs

    @patch("src.services.shadow_service.event_publisher")
    def test_handle_reported_state_multi_relay_changes(
        self,
        event_publisher: MagicMock,
    ):
        """Test multi-relay state change event publishing."""
        session = MagicMock()
        service = ShadowService(session)
        service.shadow_repo = MagicMock()
        
        # Old shadow
        old_shadow = DeviceShadow(
            device_id="tank1",
            desired={"light": "on", "pump": "on"},
            reported={"light": "on", "pump": "off"},
            version=5,
        )
        service.shadow_repo.get_by_device_id.return_value = old_shadow
        
        # New shadow after update
        updated_shadow = DeviceShadow(
            device_id="tank1",
            desired={"light": "on", "pump": "on"},
            reported={"light": "on", "pump": "on"},
            version=5,
        )
        service.shadow_repo.update_reported.return_value = updated_shadow
        
        # Update reported state
        service.handle_reported_state(
            device_id="tank1",
            reported_state={"light": "on", "pump": "on"},
        )
        
        # Verify events were published
        assert event_publisher.publish.called
        
        # Should publish relay_state_changed event
        call_args_list = event_publisher.publish.call_args_list
        events = [call[0][0] for call in call_args_list]
        
        relay_state_changed_events = [e for e in events if e.event == "relay_state_changed"]
        assert len(relay_state_changed_events) > 0
        
        # Verify the change is in the event
        event = relay_state_changed_events[0]
        assert "pump" in event.metadata["changes"]
        assert event.metadata["changes"]["pump"] == "on"


class DeviceServiceMultiRelayInitializationTests(unittest.TestCase):
    """Tests for DeviceService multi-relay initialization."""

    @patch("src.services.relay_config_service.RelayConfigService")
    @patch("src.services.device_service.event_publisher")
    @patch("src.services.scheduling_service.SchedulingService")
    def test_register_device_initializes_multi_relay_shadow(
        self,
        scheduling_service_cls: MagicMock,
        event_publisher: MagicMock,
        relay_service_cls: MagicMock,
    ):
        """Test that device registration initializes shadow with relay defaults."""
        session = MagicMock()
        service = DeviceService(session)
        service.device_repo = MagicMock()
        service.device_repo.get_by_id.return_value = None
        service.device_repo.create.return_value = MagicMock(device_id="tank1")
        
        service.shadow_repo = MagicMock()
        
        # Mock RelayConfigService
        relay_service = relay_service_cls.return_value
        relay_service.register_default_relays.return_value = [
            RelayConfig(
                relay_name="light",
                gpio_pin=4,
                fail_safe_default="off",
                active_level="LOW",
                default_state="off",
            ),
            RelayConfig(
                relay_name="pump",
                gpio_pin=12,
                fail_safe_default="on",
                active_level="LOW",
                default_state="off",
            ),
        ]
        
        # Mock SchedulingService
        scheduling_service_cls.return_value.create_schedule.return_value = None
        
        # Register device
        device = service.register_device("tank1")
        
        # Verify shadow was updated with relay defaults
        service.shadow_repo.update.assert_called_once()
        updated_shadow = service.shadow_repo.update.call_args[0][0]
        
        # Verify shadow has both relays in desired state
        assert "light" in updated_shadow.desired
        assert "pump" in updated_shadow.desired
        assert updated_shadow.desired["light"] == "off"
        assert updated_shadow.desired["pump"] == "off"


if __name__ == "__main__":
    unittest.main()
