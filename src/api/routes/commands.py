"""
Command Routes - Command receiving and management endpoints.

POST /devices/{device_id}/commands - Send command to device
GET /devices/{device_id}/commands - Get command history
POST /devices/{device_id}/light - Set light state (convenience endpoint)
POST /devices/{device_id}/pump - Set pump state (convenience endpoint)
POST /devices/{device_id}/reboot - Reboot device
POST /devices/{device_id}/request-status - Request immediate status update
"""

from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session

from src.api.routes._errors import raise_500
from src.api.schemas import (
    CommandRequest,
    CommandResponse,
    LightStateRequest,
    PumpStateRequest,
)
from src.infrastructure.db.database import get_db
from src.services.command_service import CommandService
from src.services.shadow_service import ShadowService
from src.utils.datetime_utils import isoformat_in_app_timezone
from src.utils.logger import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/devices", tags=["commands"])


def _serialize_command(command) -> CommandResponse:
    return CommandResponse(
        command_id=str(command.id) if command.id is not None else None,
        device_id=command.device_id,
        command=command.command,
        value=command.value,
        version=command.version,
        status=command.status,
        created_at=isoformat_in_app_timezone(command.created_at),
    )


@router.post("/{device_id}/commands", response_model=CommandResponse, status_code=202)
def send_command(
    device_id: str,
    request: CommandRequest,
    session: Session = Depends(get_db)
):
    """
    Send a command to a device.
    
    Args:
        device_id: Target device ID
        request: Command request with command name and optional value
    
    Returns:
        Command metadata (accepted for processing)
    """
    try:
        logger.info(
            "command_received",
            device_id=device_id,
            command=request.command
        )
        
        command_service = CommandService(session)
        command = command_service.send_command(
            device_id=device_id,
            command=request.command,
            value=request.value,
        )
        
        logger.info(
            "command_sent",
            device_id=device_id,
            command=request.command,
            version=command.version,
        )
        
        return _serialize_command(command)

    except Exception as e:
        raise_500(
            logger,
            "send_command_error",
            detail="Failed to send command",
            device_id=device_id,
            command=request.command,
            error=str(e),
        )


@router.get("/{device_id}/commands", response_model=dict)
def get_command_history(
    device_id: str,
    limit: int = 20,
    session: Session = Depends(get_db)
):
    """
    Get command history for device.
    
    Args:
        device_id: Device ID
        limit: Maximum number of commands (default 20)
    
    Returns:
        List of recent commands
    """
    try:
        logger.debug("getting_command_history", device_id=device_id, limit=limit)
        
        command_service = CommandService(session)
        commands = command_service.get_command_history(device_id, limit=limit)
        
        command_list = [_serialize_command(c) for c in commands]
        
        return {
            "count": len(command_list),
            "commands": command_list,
        }
        
    except Exception as e:
        raise_500(logger, "get_command_history_error", device_id=device_id, error=str(e))


@router.post("/{device_id}/light", response_model=CommandResponse, status_code=202)
def set_light(
    device_id: str,
    request: LightStateRequest,
    session: Session = Depends(get_db)
):
    """
    Set light state (convenience endpoint).
    
    Request body:
    {
        "state": "on"  or "off"
    }
    
    Args:
        device_id: Target device ID
        request: Light state request
    
    Returns:
        Command metadata
    """
    try:
        state = request.state
        
        logger.info("setting_light", device_id=device_id, state=state)
        
        # Update shadow desired state
        shadow_service = ShadowService(session)
        shadow = shadow_service.set_desired_state(device_id, {"light": state})
        
        if not shadow:
            raise HTTPException(status_code=404, detail=f"Device {device_id} not found")
        
        # Send command
        command_service = CommandService(session)
        command = command_service.send_command(
            device_id=device_id,
            command="set_light",
            value=state,
        )
        
        logger.info("light_command_sent", device_id=device_id, state=state)

        return _serialize_command(command)
        
    except HTTPException:
        raise
    except ValueError as e:
        logger.warning("set_light_validation_error", device_id=device_id, error=str(e))
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise_500(logger, "set_light_error", detail="Failed to set light", device_id=device_id, error=str(e))


@router.post("/{device_id}/pump", response_model=CommandResponse, status_code=202)
def set_pump(
    device_id: str,
    request: PumpStateRequest,
    session: Session = Depends(get_db)
):
    """
    Set pump state (convenience endpoint).
    
    Request body:
    {
        "state": "on"  or "off"
    }
    
    Args:
        device_id: Target device ID
        request: Pump state request
    
    Returns:
        Command metadata
    """
    try:
        state = request.state
        
        logger.info("setting_pump", device_id=device_id, state=state)
        
        # Update shadow desired state
        shadow_service = ShadowService(session)
        shadow = shadow_service.set_desired_state(device_id, {"pump": state})
        
        if not shadow:
            raise HTTPException(status_code=404, detail=f"Device {device_id} not found")
        
        # Send command
        command_service = CommandService(session)
        command = command_service.send_command(
            device_id=device_id,
            command="set_pump",
            value=state,
        )
        
        logger.info("pump_command_sent", device_id=device_id, state=state)

        return _serialize_command(command)
        
    except HTTPException:
        raise
    except ValueError as e:
        logger.warning("set_pump_validation_error", device_id=device_id, error=str(e))
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise_500(logger, "set_pump_error", detail="Failed to set pump", device_id=device_id, error=str(e))


@router.post("/{device_id}/reboot", response_model=CommandResponse, status_code=202)
def reboot_device(
    device_id: str,
    session: Session = Depends(get_db)
):
    """
    Reboot a device.
    
    Sends a reboot_device command to the target device.
    Device will publish reported state and then restart.
    
    Args:
        device_id: Target device ID
    
    Returns:
        Command metadata
    """
    try:
        logger.info("reboot_requested", device_id=device_id)
        
        command_service = CommandService(session)
        command = command_service.send_command(
            device_id=device_id,
            command="reboot_device",
            value=None,
        )
        
        logger.info("reboot_command_sent", device_id=device_id)

        return _serialize_command(command)
        
    except Exception as e:
        raise_500(logger, "reboot_device_error", detail="Failed to reboot device", device_id=device_id, error=str(e))


@router.post("/{device_id}/request-status", response_model=CommandResponse, status_code=202)
def request_status(
    device_id: str,
    session: Session = Depends(get_db)
):
    """
    Request immediate status update from device.
    
    Device will immediately publish its reported state and telemetry.
    
    Args:
        device_id: Target device ID
    
    Returns:
        Command metadata
    """
    try:
        logger.info("status_requested", device_id=device_id)
        
        command_service = CommandService(session)
        command = command_service.send_command(
            device_id=device_id,
            command="request_status",
            value=None,
        )
        
        logger.info("request_status_command_sent", device_id=device_id)

        return _serialize_command(command)
        
    except Exception as e:
        raise_500(logger, "request_status_error", detail="Failed to request status", device_id=device_id, error=str(e))
