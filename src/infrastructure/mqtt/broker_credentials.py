"""
Mosquitto password/ACL file provisioning + broker reload.

Backend and mosquitto run in separate containers but share the passwd/acl
files via a bind mount (see docker-compose.yml). This module writes to those
files directly — using the real `mosquitto_passwd` CLI so we never
reimplement Mosquitto's password hashing — and then signals the mosquitto
container to SIGHUP so it picks up the change without a restart.
"""

import os
import shutil
import subprocess
import tempfile

from src.config.settings import settings
from src.utils.logger import get_logger

logger = get_logger(__name__)


def _run_mosquitto_passwd(username: str, password: str) -> None:
    """
    Create or update a passwd_file entry via the mosquitto_passwd CLI.

    mosquitto_passwd always rewrites its target file via a temp-file-then-
    rename, forcing mode 0600 on the new inode — fine on a normal Linux
    host (mosquitto and the backend can be given matching uid/gid), but
    passwd_file here is a Docker Desktop host bind mount shared with a
    *different* container's *different* non-root user, and chmod on such a
    bind-mounted file is root-only regardless of who "owns" it. So we run
    mosquitto_passwd against a scratch copy on the container's own local
    filesystem (chmod-able, ordinary Linux semantics), then copy the
    resulting bytes into the bind-mounted file in place — an ordinary
    write, not a rename, so it keeps the file's existing (permissive) mode
    instead of needing to change it.
    """
    passwd_file = settings.mqtt.passwd_file
    os.makedirs(os.path.dirname(passwd_file), exist_ok=True)

    with tempfile.TemporaryDirectory() as tmp_dir:
        scratch = os.path.join(tmp_dir, "passwd")
        create_flag = ["-c"]
        if os.path.exists(passwd_file):
            shutil.copyfile(passwd_file, scratch)
            create_flag = []

        cmd = ["mosquitto_passwd", "-b", *create_flag, scratch, username, password]
        subprocess.run(cmd, check=True, capture_output=True, text=True, timeout=10)

        with open(scratch, "rb") as f:
            data = f.read()
        with open(passwd_file, "wb") as f:
            f.write(data)


def _acl_has_user(username: str) -> bool:
    acl_file = settings.mqtt.acl_file
    if not os.path.exists(acl_file):
        return False
    with open(acl_file, "r") as f:
        return f"user {username}\n" in f.read()


def _append_acl_stanza(username: str, topic_pattern: str, access: str = "readwrite") -> None:
    acl_file = settings.mqtt.acl_file
    os.makedirs(os.path.dirname(acl_file), exist_ok=True)
    with open(acl_file, "a") as f:
        f.write(f"\nuser {username}\ntopic {access} {topic_pattern}\n")


def reload_broker() -> None:
    """Signal the mosquitto container (SIGHUP) to reload passwd/acl files."""
    import docker

    client = docker.from_env()
    client.containers.get(settings.mqtt.broker_container_name).kill(signal="SIGHUP")


def provision_device_credentials(device_id: str, password: str) -> None:
    """
    Write a passwd entry + readwrite ACL stanza scoped to this device's own
    topics (tankctl/<device_id>/#), then reload the broker so it takes
    effect immediately.
    """
    _run_mosquitto_passwd(device_id, password)
    _append_acl_stanza(device_id, f"tankctl/{device_id}/#")
    reload_broker()
    logger.info("mqtt_device_credentials_provisioned", device_id=device_id)


def ensure_backend_credential() -> None:
    """
    Idempotently ensure the backend's own shared MQTT credential (from
    settings.mqtt.username/password) exists in the passwd file with full
    broker access, and that the broker has the current copy loaded.

    Safe to call on every startup: re-hashing the password is cheap and
    keeps the passwd file in sync if MQTT_PASSWORD changes in .env; the ACL
    stanza is only appended once.
    """
    username = settings.mqtt.username
    password = settings.mqtt.password
    if not username or not password:
        logger.warning("mqtt_backend_credential_not_configured")
        return

    try:
        _run_mosquitto_passwd(username, password)
        if not _acl_has_user(username):
            _append_acl_stanza(username, "#")
        reload_broker()
        logger.info("mqtt_backend_credential_ensured", username=username)
    except Exception as e:
        logger.warning("mqtt_backend_credential_provisioning_failed", error=str(e))
