import unittest
from datetime import datetime
from unittest.mock import MagicMock

from src.services.telemetry_service import TelemetryService


class TelemetryServiceRangeTests(unittest.TestCase):
    def test_get_device_telemetry_passes_start_end_to_repo(self) -> None:
        service = TelemetryService(session=MagicMock())
        service.repo = MagicMock()
        start = datetime(2026, 1, 1)
        end = datetime(2026, 1, 2)

        service.get_device_telemetry("tank1", start=start, end=end)

        service.repo.get_recent.assert_called_once_with(
            device_id="tank1", limit=100, hours=None, start=start, end=end,
        )

    def test_get_hourly_summary_passes_start_end_to_repo(self) -> None:
        service = TelemetryService(session=MagicMock())
        service.repo = MagicMock()
        start = datetime(2026, 1, 1)
        end = datetime(2026, 1, 2)

        service.get_hourly_summary("tank1", start=start, end=end)

        service.repo.get_hourly_rollup.assert_called_once_with(
            device_id="tank1", hours=24, start=start, end=end,
        )


class TelemetryServiceNormalizationTests(unittest.TestCase):
    def test_normalize_temperature_zero_as_unavailable(self) -> None:
        self.assertIsNone(TelemetryService._normalize_metric("temperature", 0))

    def test_normalize_temperature_positive_value(self) -> None:
        self.assertEqual(
            TelemetryService._normalize_metric("temperature", 24.5),
            24.5,
        )

    def test_normalize_non_temperature_zero_remains_numeric(self) -> None:
        self.assertEqual(TelemetryService._normalize_metric("tds", 0), 0.0)


if __name__ == '__main__':
    unittest.main()