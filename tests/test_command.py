import unittest

from src.domain.command import Command, CommandStatus


class CommandMqttPayloadTests(unittest.TestCase):
    def test_metadata_cannot_override_idempotency_version(self):
        """A firmware-update command's metadata may itself carry a 'version'
        key (the firmware version string) — that must never overwrite the
        command's own numeric idempotency version, which firmware compares
        with a strict '<=' check to decide whether to accept the command.
        """
        cmd = Command(
            device_id="tank1",
            command="update_firmware",
            version=42,
            status=CommandStatus.PENDING,
        )
        cmd.metadata = {"url": "http://example.com/fw.bin", "version": "2.1.0", "checksum": "abc123"}

        payload = cmd.to_mqtt_payload()

        assert payload["version"] == 42
        assert payload["command"] == "update_firmware"
        assert payload["url"] == "http://example.com/fw.bin"
        assert payload["checksum"] == "abc123"


if __name__ == "__main__":
    unittest.main()
