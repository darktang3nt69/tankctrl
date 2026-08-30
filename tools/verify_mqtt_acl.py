#!/usr/bin/env python3
"""
MQTT ACL Verification Script

Registers two devices via the backend API (each gets its own MQTT
username/password), then connects to the broker as device A to confirm:

1. Device A can publish + subscribe on its own topics (tankctl/<A>/...).
2. Device A is DENIED when subscribing to device B's topics.
3. Device A is DENIED when publishing to device B's topics (device B,
   subscribed to its own topic, never receives A's message).

This is a manual/CI-adjacent check script, not a pytest test — it needs a
live broker and backend. Prints a clear PASS/FAIL line per check and exits
non-zero if anything fails.

Usage:
    python tools/verify_mqtt_acl.py
    python tools/verify_mqtt_acl.py --api-url http://localhost:8000 --broker localhost --port 1883
"""

import random
import string
import sys
import time
from argparse import ArgumentParser

import paho.mqtt.client as mqtt
import requests

RESULTS: list[tuple[str, bool, str]] = []


def check(name: str, passed: bool, detail: str = "") -> None:
    RESULTS.append((name, passed, detail))
    status = "PASS" if passed else "FAIL"
    suffix = f" — {detail}" if detail else ""
    print(f"[{status}] {name}{suffix}")


def register_device(api_url: str, device_id: str) -> str | None:
    """Register device_id via the API, returning its mqtt_password."""
    resp = requests.post(f"{api_url}/devices", json={"device_id": device_id}, timeout=5)
    if resp.status_code == 409:
        # Leftover from a previous interrupted run — clean up and retry.
        requests.delete(f"{api_url}/devices/{device_id}", timeout=5)
        resp = requests.post(f"{api_url}/devices", json={"device_id": device_id}, timeout=5)
    if resp.status_code != 201:
        print(f"  registration failed for {device_id}: {resp.status_code} {resp.text}")
        return None
    return resp.json()["mqtt_password"]


def make_client(broker: str, port: int, device_id: str, password: str) -> mqtt.Client:
    client = mqtt.Client(client_id=f"verify-{device_id}", protocol=mqtt.MQTTv311)
    client.username_pw_set(device_id, password)
    client.connect(broker, port, keepalive=30)
    client.loop_start()
    return client


def main() -> int:
    parser = ArgumentParser(description="Verify per-device MQTT ACL enforcement")
    parser.add_argument("--api-url", default="http://localhost:8000")
    parser.add_argument("--broker", default="localhost")
    parser.add_argument("--port", type=int, default=1883)
    args = parser.parse_args()

    suffix = "".join(random.choices(string.ascii_lowercase + string.digits, k=6))
    device_a = f"acltest-a-{suffix}"
    device_b = f"acltest-b-{suffix}"

    print("=" * 70)
    print("MQTT ACL Verification")
    print("=" * 70)
    print(f"API: {args.api_url}   Broker: {args.broker}:{args.port}")
    print(f"Device A: {device_a}   Device B: {device_b}")
    print("-" * 70)

    print("Registering devices...")
    password_a = register_device(args.api_url, device_a)
    password_b = register_device(args.api_url, device_b)
    if password_a is None or password_b is None:
        print("Could not register test devices — aborting.")
        return 1
    print(f"  OK: {device_a} registered")
    print(f"  OK: {device_b} registered")

    client_a = None
    client_b = None
    try:
        client_a = make_client(args.broker, args.port, device_a, password_a)
        client_b = make_client(args.broker, args.port, device_b, password_b)
        time.sleep(1)  # let CONNACKs land

        # ---- Check 1: A can publish + subscribe on its own topics -------
        own_messages: list[str] = []
        own_subscribe_result = {}

        def on_subscribe_own(client, userdata, mid, granted_qos):
            own_subscribe_result["granted_qos"] = granted_qos

        def on_message_own(client, userdata, msg):
            own_messages.append(msg.payload.decode())

        client_a.on_subscribe = on_subscribe_own
        client_a.on_message = on_message_own

        own_topic = f"tankctl/{device_a}/verify"
        client_a.subscribe(own_topic, qos=1)
        time.sleep(1)

        own_granted = own_subscribe_result.get("granted_qos", (128,))
        own_subscribe_granted = 128 not in own_granted
        check(
            "Device A can subscribe to its own topics",
            own_subscribe_granted,
            f"granted_qos={own_subscribe_result.get('granted_qos')}",
        )

        client_a.publish(own_topic, "hello-from-a", qos=1)
        time.sleep(1.5)

        check(
            "Device A can publish to its own topics",
            "hello-from-a" in own_messages,
            f"received={own_messages}",
        )

        # ---- Sanity: device B can talk to itself (proves the broker/ACL
        # setup isn't just broken for everyone) -----------------------------
        b_own_messages: list[str] = []

        def on_message_b(client, userdata, msg):
            b_own_messages.append(msg.payload.decode())

        client_b.on_message = on_message_b
        b_own_topic = f"tankctl/{device_b}/verify"
        client_b.subscribe(b_own_topic, qos=1)
        time.sleep(1)
        client_b.publish(b_own_topic, "canary-from-b", qos=1)
        time.sleep(1.5)

        check(
            "Device B can publish/subscribe to its own topics (sanity check)",
            "canary-from-b" in b_own_messages,
            f"received={b_own_messages}",
        )

        # ---- Check 2: A does not receive messages from B's topics --------
        # Mosquitto's acl_file plugin grants the SUBACK regardless (this is
        # documented broker behavior, not a bypass) but filters delivery per
        # ACL — so the real check is "does A's client ever get the message",
        # not the SUBACK code.
        b_topic = f"tankctl/{device_b}/verify"
        client_a.subscribe(b_topic, qos=1)
        time.sleep(1)

        own_messages.clear()
        client_b.publish(b_topic, "eavesdrop-canary-from-b", qos=1)
        time.sleep(1.5)

        check(
            "Device A does NOT receive messages published to device B's topics",
            "eavesdrop-canary-from-b" not in own_messages,
            f"device_a_received={own_messages}",
        )

        # ---- Check 3: A denied publishing to B's topics -------------------
        # Unsubscribe first so this check isn't polluted by A's own
        # (cosmetically granted, but delivery-filtered) subscription above.
        client_a.unsubscribe(b_topic)
        time.sleep(0.5)

        b_own_messages.clear()
        client_a.publish(b_topic, "attack-from-a", qos=1)
        time.sleep(1.5)

        check(
            "Device A is DENIED publishing to device B's topics",
            "attack-from-a" not in b_own_messages,
            f"device_b_received={b_own_messages}",
        )

    finally:
        for c in (client_a, client_b):
            if c is not None:
                c.loop_stop()
                c.disconnect()
        print("-" * 70)
        print("Cleaning up test devices...")
        for device_id in (device_a, device_b):
            try:
                requests.delete(f"{args.api_url}/devices/{device_id}", timeout=5)
            except Exception as e:
                print(f"  warning: failed to delete {device_id}: {e}")

    print("=" * 70)
    passed = sum(1 for _, ok, _ in RESULTS if ok)
    total = len(RESULTS)
    print(f"Results: {passed}/{total} checks passed")
    if passed == total:
        print("ALL CHECKS PASSED")
        return 0
    print("SOME CHECKS FAILED")
    return 1


if __name__ == "__main__":
    sys.exit(main())
