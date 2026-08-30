"""
API route for registering device push tokens (FCM, etc).
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from src.infrastructure.db.database import get_db

from src.repository.device_push_token_repository import DevicePushTokenRepository
from src.services.push_notification_service import PushNotificationService
from src.config.settings import settings
from src.infrastructure.db.models import DevicePushTokenModel

router = APIRouter()


# RegisterTokenRequest must be defined before use
class RegisterTokenRequest(BaseModel):
    device_id: str
    token: str
    platform: str

class DevicePushTokenResponse(BaseModel):
    device_id: str
    token: str
    platform: str
    last_seen: str

@router.post("/mobile/push-token")
def register_push_token(
    request: RegisterTokenRequest,
    session: Session = Depends(get_db),
):
    repo = DevicePushTokenRepository(session)
    service = PushNotificationService(
        repo,
        settings.fcm_service_account_json,
        settings.fcm_project_id,
    )
    service.upsert_device_token(request.device_id, request.token, request.platform)
    return {"status": "ok"}


# Route to list all registered device push tokens
@router.get("/mobile/push-token", response_model=list[DevicePushTokenResponse])
def list_push_tokens(session: Session = Depends(get_db)):
    rows = session.query(DevicePushTokenModel).all()
    return [
        DevicePushTokenResponse(
            device_id=row.device_id,
            token=row.token,
            platform=row.platform,
            last_seen=row.last_seen.isoformat() if row.last_seen else None,
        )
        for row in rows
    ]


# Route to delete a push token by value or all tokens for a device_id
@router.delete("/mobile/push-token")
def delete_push_token(
    token: str = Query(None, description="FCM token to delete"),
    device_id: str = Query(None, description="Device ID to delete all tokens for"),
    session: Session = Depends(get_db),
):
    repo = DevicePushTokenRepository(session)
    if token:
        repo.remove_token(token)
        return {"status": "deleted", "token": token}
    elif device_id:
        # Remove all tokens for this device_id
        rows = session.query(DevicePushTokenModel).filter_by(device_id=device_id).all()
        count = 0
        for row in rows:
            session.delete(row)
            count += 1
        session.commit()
        return {"status": "deleted", "device_id": device_id, "count": count}
    else:
        raise HTTPException(status_code=400, detail="Must provide token or device_id")
