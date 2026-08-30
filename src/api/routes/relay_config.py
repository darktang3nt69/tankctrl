"""
Relay Configuration Routes - GPIO pin and relay state configuration endpoints.

GET    /devices/{device_id}/relays              → List all relays
POST   /devices/{device_id}/relays              → Create relay
PATCH  /devices/{device_id}/relays/{relay_name} → Update relay
DELETE /devices/{device_id}/relays/{relay_name} → Delete relay
POST   /devices/{device_id}/relays/push-config  → Push config to device via MQTT
"""

from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session

from src.api.routes._errors import raise_500
from src.api.schemas import (
    RelayConfigRequest,
    RelayConfigResponse,
    DeviceRelayConfigResponse,
)
from src.infrastructure.db.database import get_db
from src.services.relay_config_service import RelayConfigService
from src.utils.logger import get_logger
from src.utils.datetime_utils import isoformat_in_app_timezone

logger = get_logger(__name__)

router = APIRouter(prefix="/devices", tags=["relay-config"])


def _serialize_relay(relay_config) -> RelayConfigResponse:
    return RelayConfigResponse(
        relay_name=relay_config.relay_name,
        gpio_pin=relay_config.gpio_pin,
        active_level=relay_config.active_level,
        default_state=relay_config.default_state,
        created_at=isoformat_in_app_timezone(relay_config.created_at),
        updated_at=isoformat_in_app_timezone(relay_config.updated_at),
    )


@router.get("/{device_id}/relays", response_model=DeviceRelayConfigResponse, status_code=200)
def list_relays(
    device_id: str,
    session: Session = Depends(get_db)
):
    """
    List all relay configurations for a device.

    Args:
        device_id: Target device ID

    Returns:
        DeviceRelayConfigResponse with all relays for the device
    """
    try:
        logger.debug("list_relays_request", device_id=device_id)

        relay_service = RelayConfigService(session)

        try:
            relay_configs = relay_service.get_device_relay_config(device_id)
        except ValueError:
            logger.warning("list_relays_device_not_found", device_id=device_id)
            raise HTTPException(
                status_code=404,
                detail=f"Device {device_id} not found"
            )

        # Convert to response format
        relays_response = {
            relay_name: _serialize_relay(relay_config)
            for relay_name, relay_config in relay_configs.items()
        }

        logger.info(
            "list_relays_success",
            device_id=device_id,
            relay_count=len(relays_response)
        )

        return DeviceRelayConfigResponse(
            device_id=device_id,
            relays=relays_response,
            count=len(relays_response),
        )

    except HTTPException:
        raise
    except Exception as e:
        raise_500(logger, "list_relays_error", device_id=device_id, error=str(e))


@router.post("/{device_id}/relays", response_model=RelayConfigResponse, status_code=201)
def create_relay(
    device_id: str,
    request: RelayConfigRequest,
    session: Session = Depends(get_db)
):
    """
    Create a new relay configuration for a device.

    Args:
        device_id: Target device ID
        request: Relay configuration request

    Returns:
        Created RelayConfigResponse
    """
    try:
        logger.info(
            "create_relay_request",
            device_id=device_id,
            relay_name=request.relay_name
        )

        relay_service = RelayConfigService(session)

        try:
            relay_config = relay_service.create_relay_config(
                device_id=device_id,
                relay_name=request.relay_name,
                gpio_pin=request.gpio_pin,
                active_level=request.active_level,
                default_state=request.default_state,
            )
        except ValueError as e:
            error_msg = str(e)
            logger.warning(
                "create_relay_validation_error",
                device_id=device_id,
                relay_name=request.relay_name,
                error=error_msg
            )

            # Return appropriate HTTP status based on error
            if "Device" in error_msg and "not found" in error_msg:
                raise HTTPException(status_code=404, detail=error_msg)
            elif "already exists" in error_msg:
                raise HTTPException(status_code=409, detail=error_msg)
            else:
                raise HTTPException(status_code=400, detail=error_msg)

        logger.info(
            "relay_created_success",
            device_id=device_id,
            relay_name=request.relay_name,
            gpio_pin=request.gpio_pin
        )

        return _serialize_relay(relay_config)

    except HTTPException:
        raise
    except Exception as e:
        raise_500(
            logger,
            "create_relay_error",
            detail="Failed to create relay",
            device_id=device_id,
            relay_name=request.relay_name,
            error=str(e),
        )


@router.patch("/{device_id}/relays/{relay_name}", response_model=RelayConfigResponse, status_code=200)
def update_relay(
    device_id: str,
    relay_name: str,
    request: RelayConfigRequest,
    session: Session = Depends(get_db)
):
    """
    Update an existing relay configuration.

    Args:
        device_id: Target device ID
        relay_name: Name of relay to update
        request: Updated relay configuration

    Returns:
        Updated RelayConfigResponse
    """
    try:
        logger.info(
            "update_relay_request",
            device_id=device_id,
            relay_name=relay_name
        )

        relay_service = RelayConfigService(session)

        try:
            relay_config = relay_service.update_relay_config(
                device_id=device_id,
                relay_name=relay_name,
                gpio_pin=request.gpio_pin,
                active_level=request.active_level,
                default_state=request.default_state,
            )
        except ValueError as e:
            error_msg = str(e)
            logger.warning(
                "update_relay_validation_error",
                device_id=device_id,
                relay_name=relay_name,
                error=error_msg
            )

            if "not found" in error_msg:
                raise HTTPException(status_code=404, detail=error_msg)
            else:
                raise HTTPException(status_code=400, detail=error_msg)

        logger.info(
            "relay_updated_success",
            device_id=device_id,
            relay_name=relay_name
        )

        return _serialize_relay(relay_config)

    except HTTPException:
        raise
    except Exception as e:
        raise_500(
            logger,
            "update_relay_error",
            detail="Failed to update relay",
            device_id=device_id,
            relay_name=relay_name,
            error=str(e),
        )


@router.delete("/{device_id}/relays/{relay_name}", status_code=204)
def delete_relay(
    device_id: str,
    relay_name: str,
    session: Session = Depends(get_db)
):
    """
    Delete a relay configuration.

    Args:
        device_id: Target device ID
        relay_name: Name of relay to delete

    Returns:
        204 No Content on success
    """
    try:
        logger.info(
            "delete_relay_request",
            device_id=device_id,
            relay_name=relay_name
        )

        relay_service = RelayConfigService(session)

        try:
            deleted = relay_service.delete_relay_config(device_id, relay_name)
        except ValueError as e:
            logger.warning(
                "delete_relay_device_not_found",
                device_id=device_id,
                error=str(e)
            )
            raise HTTPException(status_code=404, detail=str(e))

        if not deleted:
            logger.warning(
                "delete_relay_not_found",
                device_id=device_id,
                relay_name=relay_name
            )
            raise HTTPException(
                status_code=404,
                detail=f"Relay '{relay_name}' not found for device {device_id}"
            )

        logger.info(
            "relay_deleted_success",
            device_id=device_id,
            relay_name=relay_name
        )

    except HTTPException:
        raise
    except Exception as e:
        raise_500(
            logger,
            "delete_relay_error",
            detail="Failed to delete relay",
            device_id=device_id,
            relay_name=relay_name,
            error=str(e),
        )


@router.post("/{device_id}/relays/push-config", status_code=202)
def push_config(
    device_id: str,
    session: Session = Depends(get_db)
):
    """
    Push relay configuration to device via MQTT.

    Publishes all relay configs to: `tankctl/{device_id}/config`

    The device will receive and apply the configuration.

    Args:
        device_id: Target device ID

    Returns:
        Accepted (202) - config push initiated
    """
    try:
        logger.info("push_relay_config_request", device_id=device_id)

        relay_service = RelayConfigService(session)

        try:
            pushed = relay_service.push_config_to_device(device_id)
        except ValueError as e:
            logger.warning(
                "push_config_device_not_found",
                device_id=device_id,
                error=str(e)
            )
            raise HTTPException(status_code=404, detail=str(e))

        if not pushed:
            logger.warning(
                "push_config_no_relays",
                device_id=device_id
            )
            raise HTTPException(
                status_code=400,
                detail=f"No relay configuration found for device {device_id}"
            )

        logger.info("relay_config_pushed_success", device_id=device_id)

        return {
            "status": "accepted",
            "message": f"Relay configuration pushed to device {device_id}",
            "device_id": device_id,
        }

    except HTTPException:
        raise
    except Exception as e:
        raise_500(
            logger,
            "push_config_error",
            detail="Failed to push relay configuration",
            device_id=device_id,
            error=str(e),
        )
