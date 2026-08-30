"""
Tests for the fail-safe relay contract (Track 1 of the fail-safe relay
stack): RelayConfig validation of fail_safe_default/cutoff_ceiling_seconds,
RelayConfigService threading those fields through create/update, and the
SchedulingService light-ceiling recompute (including overnight wraparound).

See docs/superpowers/specs/2026-08-30-fail-safe-relay-stack-design.md (A)
and docs/superpowers/plans/2026-08-30-fail-safe-relay-stack-plan.md (Track 1).
"""

import unittest
from datetime import time
from unittest.mock import MagicMock, patch

from src.domain.relay_config import RelayConfig
from src.services.relay_config_service import RelayConfigService
from src.services.scheduling_service import SchedulingService, LIGHT_CEILING_GRACE_SECONDS
from src.domain.light_schedule import LightSchedule


class RelayConfigDomainValidationTests(unittest.TestCase):
    """RelayConfig.__post_init__ validation of the new fail-safe fields."""

    def test_missing_fail_safe_default_rejected(self):
        """fail_safe_default has no domain/DB default — omitting it must fail."""
        with self.assertRaises(TypeError):
            RelayConfig(relay_name="light", gpio_pin=4)  # missing required kwarg

    def test_invalid_fail_safe_default_rejected(self):
        with self.assertRaises(ValueError) as ctx:
            RelayConfig(relay_name="light", gpio_pin=4, fail_safe_default="maybe")
        self.assertIn("fail_safe_default", str(ctx.exception))

    def test_valid_fail_safe_default_accepted(self):
        relay = RelayConfig(relay_name="light", gpio_pin=4, fail_safe_default="off")
        self.assertEqual(relay.fail_safe_default, "off")

    def test_null_cutoff_ceiling_seconds_accepted(self):
        """cutoff_ceiling_seconds is nullable — None means 'no ceiling' (fails open)."""
        relay = RelayConfig(
            relay_name="pump",
            gpio_pin=12,
            fail_safe_default="on",
            cutoff_ceiling_seconds=None,
        )
        self.assertIsNone(relay.cutoff_ceiling_seconds)

    def test_non_positive_cutoff_ceiling_seconds_rejected(self):
        with self.assertRaises(ValueError):
            RelayConfig(
                relay_name="light",
                gpio_pin=4,
                fail_safe_default="off",
                cutoff_ceiling_seconds=0,
            )
        with self.assertRaises(ValueError):
            RelayConfig(
                relay_name="light",
                gpio_pin=4,
                fail_safe_default="off",
                cutoff_ceiling_seconds=-10,
            )

    def test_positive_cutoff_ceiling_seconds_accepted(self):
        relay = RelayConfig(
            relay_name="light",
            gpio_pin=4,
            fail_safe_default="off",
            cutoff_ceiling_seconds=3600,
        )
        self.assertEqual(relay.cutoff_ceiling_seconds, 3600)


class RelayConfigServiceCreateValidationTests(unittest.TestCase):
    """RelayConfigService.create_relay_config rejects invalid fail-safe fields."""

    def _service_with_device(self):
        session = MagicMock()
        service = RelayConfigService(session)
        service.device_repo = MagicMock()
        service.device_repo.get_by_id.return_value = MagicMock(device_id="tank1")
        service.relay_repo = MagicMock()
        service.relay_repo.validate_relay_config.return_value = True
        return service

    def test_create_relay_config_missing_fail_safe_default_rejected(self):
        service = self._service_with_device()
        with self.assertRaises(TypeError):
            service.create_relay_config(
                device_id="tank1",
                relay_name="light",
                gpio_pin=4,
                cutoff_ceiling_seconds=None,
            )

    def test_create_relay_config_invalid_fail_safe_default_rejected(self):
        service = self._service_with_device()
        with self.assertRaises(ValueError) as ctx:
            service.create_relay_config(
                device_id="tank1",
                relay_name="light",
                gpio_pin=4,
                fail_safe_default="sideways",
                cutoff_ceiling_seconds=None,
            )
        self.assertIn("fail_safe_default", str(ctx.exception))

    def test_create_relay_config_accepts_null_cutoff_ceiling_seconds(self):
        service = self._service_with_device()
        service.relay_repo.create_relay.side_effect = lambda rc: rc

        created = service.create_relay_config(
            device_id="tank1",
            relay_name="pump",
            gpio_pin=12,
            fail_safe_default="on",
            cutoff_ceiling_seconds=None,
        )

        self.assertIsNone(created.cutoff_ceiling_seconds)
        self.assertEqual(created.fail_safe_default, "on")

    def test_create_relay_config_rejects_non_positive_cutoff_ceiling_seconds(self):
        service = self._service_with_device()
        with self.assertRaises(ValueError):
            service.create_relay_config(
                device_id="tank1",
                relay_name="light",
                gpio_pin=4,
                fail_safe_default="off",
                cutoff_ceiling_seconds=0,
            )


class SchedulingServiceLightCeilingRecomputeTests(unittest.TestCase):
    """SchedulingService._recompute_light_ceiling math and wiring."""

    def _service(self):
        session = MagicMock()
        service = SchedulingService(session)
        service.schedule_repo = MagicMock()
        return service

    @patch("src.services.relay_config_service.RelayConfigService")
    def test_recompute_skips_silently_without_light_relay(self, relay_service_cls):
        service = self._service()
        relay_service = relay_service_cls.return_value
        relay_service.relay_repo.get_relay.return_value = None

        schedule = LightSchedule(device_id="tank1", on_time=time(18, 0), off_time=time(6, 0))

        # Should not raise even though there's no light relay.
        service._recompute_light_ceiling(schedule)

        relay_service.update_relay_config.assert_not_called()
        relay_service.push_config_to_device.assert_not_called()

    @patch("src.services.relay_config_service.RelayConfigService")
    def test_recompute_normal_same_day_schedule(self, relay_service_cls):
        """06:00 -> 18:00 is a 12h (43200s) span; ceiling adds the 1800s grace."""
        service = self._service()
        relay_service = relay_service_cls.return_value
        relay_service.relay_repo.get_relay.return_value = RelayConfig(
            relay_name="light", gpio_pin=4, fail_safe_default="off"
        )

        schedule = LightSchedule(device_id="tank1", on_time=time(6, 0), off_time=time(18, 0))
        service._recompute_light_ceiling(schedule)

        expected_ceiling = 12 * 3600 + LIGHT_CEILING_GRACE_SECONDS
        relay_service.update_relay_config.assert_called_once_with(
            device_id="tank1",
            relay_name="light",
            cutoff_ceiling_seconds=expected_ceiling,
        )
        relay_service.push_config_to_device.assert_called_once_with("tank1")

    @patch("src.services.relay_config_service.RelayConfigService")
    def test_recompute_overnight_wraparound_schedule(self, relay_service_cls):
        """20:00 -> 06:00 spans midnight: must compute a positive 10h span,
        not a negative duration."""
        service = self._service()
        relay_service = relay_service_cls.return_value
        relay_service.relay_repo.get_relay.return_value = RelayConfig(
            relay_name="light", gpio_pin=4, fail_safe_default="off"
        )

        schedule = LightSchedule(device_id="tank1", on_time=time(20, 0), off_time=time(6, 0))
        service._recompute_light_ceiling(schedule)

        expected_duration = 10 * 3600  # 20:00 -> 06:00 next day
        expected_ceiling = expected_duration + LIGHT_CEILING_GRACE_SECONDS
        self.assertGreater(expected_ceiling, 0)

        relay_service.update_relay_config.assert_called_once_with(
            device_id="tank1",
            relay_name="light",
            cutoff_ceiling_seconds=expected_ceiling,
        )

    @patch("src.services.relay_config_service.RelayConfigService")
    def test_recompute_failure_does_not_raise(self, relay_service_cls):
        """The schedule write already committed by the time this runs — a
        failure here must be swallowed (logged), not propagated."""
        service = self._service()
        relay_service = relay_service_cls.return_value
        relay_service.relay_repo.get_relay.side_effect = RuntimeError("db down")

        schedule = LightSchedule(device_id="tank1", on_time=time(6, 0), off_time=time(18, 0))

        # Should not raise.
        service._recompute_light_ceiling(schedule)


if __name__ == "__main__":
    unittest.main()
