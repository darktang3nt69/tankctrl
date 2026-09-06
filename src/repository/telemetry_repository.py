"""
Repository layer for telemetry data.

Handles database access for telemetry stored in TimescaleDB.
"""

from datetime import datetime
from typing import Optional
import json

from sqlalchemy import text, desc
from sqlalchemy.orm import Session

from src.repository._errors import log_on_error
from src.domain.command import Command, CommandStatus
from src.infrastructure.db.models import CommandModel
from src.utils.datetime_utils import isoformat_in_app_timezone
from src.utils.logger import get_logger

logger = get_logger(__name__)


class CommandRepository:
    """Repository for command operations."""

    def __init__(self, session: Session):
        """Initialize repository with database session."""
        self.session = session

    def create(self, command: Command) -> Command:
        """
        Create a new command.

        Args:
            command: Command domain model

        Returns:
            Created command

        Raises:
            Exception: If creation fails
        """
        with log_on_error(self.session, logger, "command_creation_failed"):
            db_command = CommandModel(
                device_id=command.device_id,
                command=command.command,
                value=command.value,
                version=command.version,
                status=command.status,
                created_at=command.created_at,
                sent_at=command.sent_at,
                executed_at=command.executed_at,
            )
            self.session.add(db_command)
            self.session.commit()
            command.id = db_command.id
            logger.debug(
                "command_created",
                device_id=command.device_id,
                command=command.command,
            )
            return command

    def get_by_id(self, command_id: int) -> Optional[Command]:
        """
        Get command by ID.

        Args:
            command_id: Command ID

        Returns:
            Command or None if not found
        """
        try:
            db_command = self.session.query(CommandModel).filter(
                CommandModel.id == command_id
            ).first()

            if not db_command:
                return None

            return self._model_to_domain(db_command)
        except Exception as e:
            logger.error("command_get_failed", command_id=command_id, error=str(e))
            raise

    def get_pending_for_device(self, device_id: str) -> list[Command]:
        """
        Get all pending commands for a device.

        Args:
            device_id: Device ID

        Returns:
            List of pending commands
        """
        try:
            db_commands = self.session.query(CommandModel).filter(
                CommandModel.device_id == device_id,
                CommandModel.status == CommandStatus.PENDING,
            ).all()

            return [self._model_to_domain(cmd) for cmd in db_commands]
        except Exception as e:
            logger.error("commands_get_pending_failed", device_id=device_id, error=str(e))
            raise

    def get_latest_for_device(self, device_id: str, limit: int = 10) -> list[Command]:
        """
        Get latest commands for a device.

        Args:
            device_id: Device ID
            limit: Maximum number of commands to return

        Returns:
            List of commands ordered by creation date
        """
        try:
            db_commands = (
                self.session.query(CommandModel)
                .filter(CommandModel.device_id == device_id)
                .order_by(desc(CommandModel.created_at))
                .limit(limit)
                .all()
            )

            return [self._model_to_domain(cmd) for cmd in db_commands]
        except Exception as e:
            logger.error("commands_get_latest_failed", device_id=device_id, error=str(e))
            raise

    def update_status(self, command_id: int, status: str) -> Optional[Command]:
        """
        Update command status.

        Args:
            command_id: Command ID
            status: New status

        Returns:
            Updated command or None if not found
        """
        with log_on_error(self.session, logger, "command_status_update_failed", command_id=command_id):
            db_command = self.session.query(CommandModel).filter(
                CommandModel.id == command_id
            ).first()

            if not db_command:
                return None

            db_command.status = status

            if status == CommandStatus.SENT:
                db_command.sent_at = datetime.utcnow()
            elif status == CommandStatus.EXECUTED:
                db_command.executed_at = datetime.utcnow()

            self.session.commit()
            logger.debug(
                "command_status_updated",
                command_id=command_id,
                status=status,
            )
            return self._model_to_domain(db_command)

    def delete_for_device(self, device_id: str) -> int:
        """
        Delete all commands for a device.

        Args:
            device_id: Device ID

        Returns:
            Number of deleted commands
        """
        with log_on_error(self.session, logger, "commands_delete_failed", device_id=device_id):
            deleted = self.session.query(CommandModel).filter(
                CommandModel.device_id == device_id
            ).delete()
            self.session.commit()
            logger.info("commands_deleted", device_id=device_id, count=deleted)
            return deleted

    def _model_to_domain(self, db_command: CommandModel) -> Command:
        """Convert database model to domain model."""
        return Command(
            id=db_command.id,
            device_id=db_command.device_id,
            command=db_command.command,
            value=db_command.value,
            version=db_command.version,
            status=db_command.status,
            created_at=db_command.created_at,
            sent_at=db_command.sent_at,
            executed_at=db_command.executed_at,
        )


class TelemetryRepository:
    """Repository for telemetry operations in TimescaleDB."""

    def __init__(self, session: Session):
        """Initialize repository with TimescaleDB session."""
        self.session = session

    def insert(
        self,
        device_id: str,
        temperature: Optional[float] = None,
        tds: Optional[float] = None,
        pressure: Optional[float] = None,
        metadata: Optional[dict] = None,
    ) -> None:
        """
        Insert telemetry data point into TimescaleDB.

        Args:
            device_id: Device identifier
            temperature: Temperature reading (optional)
            tds: TDS reading in ppm (optional)
            pressure: Pressure reading (optional)
            metadata: Additional metadata as dict (optional)

        Raises:
            Exception: If insertion fails
        """
        with log_on_error(self.session, logger, "telemetry_insertion_failed", device_id=device_id):
            # Serialize metadata to JSON if present
            metadata_json = None
            if metadata:
                metadata_json = json.dumps(metadata)
            
            # Use raw SQL for direct TimescaleDB insertion
            query = text("""
                INSERT INTO telemetry (time, device_id, temperature, tds, pressure, metadata)
                VALUES (
                    NOW() AT TIME ZONE 'UTC',
                    :device_id,
                    :temperature,
                    :tds,
                    :pressure,
                    CAST(:metadata AS JSONB)
                )
            """)
            
            self.session.execute(
                query,
                {
                    "device_id": device_id,
                    "temperature": temperature,
                    "tds": tds,
                    "pressure": pressure,
                    "metadata": metadata_json,
                },
            )
            self.session.commit()

            logger.debug(
                "telemetry_inserted",
                device_id=device_id,
                temperature=temperature,
                tds=tds,
                pressure=pressure,
            )

    def get_recent(
        self,
        device_id: str,
        limit: int = 100,
        hours: Optional[int] = None,
        start: Optional[datetime] = None,
        end: Optional[datetime] = None,
    ) -> list[dict]:
        """
        Get recent telemetry for a device.

        Args:
            device_id: Device identifier
            limit: Maximum number of records (default 100)
            hours: Optional rolling time window in hours (default: all time)
            start: Optional arbitrary range start (takes precedence over hours)
            end: Optional arbitrary range end (defaults to now when start is set)

        Returns:
            List of telemetry records with time, temperature, tds, pressure
        """
        try:
            where_clause = "WHERE device_id = :device_id"
            params = {"device_id": device_id, "limit": limit}

            if start is not None:
                where_clause += " AND time >= :start"
                params["start"] = start
                if end is not None:
                    where_clause += " AND time <= :end"
                    params["end"] = end
            elif hours:
                where_clause += " AND time > NOW() - (:hours * INTERVAL '1 hour')"
                params["hours"] = hours
            
            query = text(f"""
                SELECT
                    time,
                    device_id,
                    temperature,
                    tds,
                    pressure,
                    metadata
                FROM telemetry
                {where_clause}
                ORDER BY time DESC
                LIMIT :limit
            """)
            
            results = self.session.execute(query, params).fetchall()
            
            # Convert to list of dicts
            telemetry_list = []
            for row in results:
                telemetry_list.append({
                    "time": isoformat_in_app_timezone(row[0]),
                    "device_id": row[1],
                    "temperature": row[2],
                    "tds": row[3],
                    "pressure": row[4],
                    "metadata": row[5],
                })
            
            logger.debug(
                "telemetry_retrieved",
                device_id=device_id,
                count=len(telemetry_list),
            )
            
            return telemetry_list
        except Exception as e:
            logger.error("telemetry_retrieval_failed", device_id=device_id, error=str(e))
            raise

    def get_by_metric(
        self,
        device_id: str,
        metric: str,
        limit: int = 100,
    ) -> list[dict]:
        """
        Get specific metric for device.

        Args:
            device_id: Device identifier
            metric: Metric name ('temperature', 'tds', or 'pressure')
            limit: Maximum number of records

        Returns:
            List of records with time and metric value
        """
        if metric not in ("temperature", "tds", "pressure"):
            raise ValueError(f"Invalid metric: {metric}")
        
        try:
            query = text(f"""
                SELECT
                    time,
                    device_id,
                    {metric}
                FROM telemetry
                WHERE device_id = :device_id AND {metric} IS NOT NULL
                ORDER BY time DESC
                LIMIT :limit
            """)
            
            results = self.session.execute(
                query,
                {"device_id": device_id, "limit": limit},
            ).fetchall()
            
            # Convert to list of dicts
            metric_list = []
            for row in results:
                metric_list.append({
                    "time": isoformat_in_app_timezone(row[0]),
                    "device_id": row[1],
                    "value": row[2],
                })
            
            logger.debug(
                "metric_retrieved",
                device_id=device_id,
                metric=metric,
                count=len(metric_list),
            )
            
            return metric_list
        except Exception as e:
            logger.error(
                "metric_retrieval_failed",
                device_id=device_id,
                metric=metric,
                error=str(e),
            )
            raise

    def _rollup_row(self, row, coerce_float: bool = False) -> dict:
        def val(x):
            return (float(x) if x else None) if coerce_float else x

        return {
            "hour": isoformat_in_app_timezone(row[0]),
            "device_id": row[1],
            "temperature": {
                "avg": val(row[2]),
                "max": val(row[3]),
                "min": val(row[4]),
            },
            "tds": {
                "avg": val(row[5]),
                "max": val(row[6]),
                "min": val(row[7]),
            },
            "sample_count": row[8],
        }

    def get_hourly_rollup(
        self,
        device_id: str,
        hours: int = 24,
        start: Optional[datetime] = None,
        end: Optional[datetime] = None,
    ) -> list[dict]:
        """
        Get hourly aggregated telemetry for device.

        Tries to use the pre-aggregated continuous aggregate view if available,
        otherwise computes hourly aggregates on-the-fly from raw telemetry.

        Args:
            device_id: Device identifier
            hours: Number of hours to retrieve (default 24), used when start/end
                are not given
            start: Optional arbitrary range start (takes precedence over hours)
            end: Optional arbitrary range end (defaults to now when start is set)

        Returns:
            List of hourly aggregated records
        """
        if start is not None:
            view_range_clause = "hour >= :start" + (" AND hour <= :end" if end is not None else "")
            raw_range_clause = "time >= :start" + (" AND time <= :end" if end is not None else "")
            range_params = {"start": start, **({"end": end} if end is not None else {})}
        else:
            view_range_clause = "hour > NOW() - (:hours * INTERVAL '1 hour')"
            raw_range_clause = "time > NOW() - (:hours * INTERVAL '1 hour')"
            range_params = {"hours": hours}

        try:
            # First, try using the materialized view (if it exists)
            query = text(f"""
                SELECT
                    hour,
                    device_id,
                    temp_avg,
                    temp_max,
                    temp_min,
                    tds_avg,
                    tds_max,
                    tds_min,
                    sample_count
                FROM telemetry_hourly
                WHERE device_id = :device_id AND {view_range_clause}
                ORDER BY hour DESC
            """)

            results = self.session.execute(
                query,
                {"device_id": device_id, **range_params},
            ).fetchall()
            
            # Convert to list of dicts
            rollup_list = [self._rollup_row(row) for row in results]

            logger.debug(
                "hourly_rollup_retrieved",
                device_id=device_id,
                count=len(rollup_list),
                source="materialized_view",
            )
            
            return rollup_list
            
        except Exception as view_error:
            # Fallback: compute hourly aggregates directly from raw telemetry
            try:
                # Rollback the failed transaction before the fallback query
                self.session.rollback()
                
                logger.debug(
                    "hourly_view_unavailable_fallback",
                    device_id=device_id,
                    reason=str(view_error)[:100],
                )
                
                fallback_query = text(f"""
                    SELECT
                        time_bucket('1 hour', time) as hour,
                        device_id,
                        AVG(temperature) as temp_avg,
                        MAX(temperature) as temp_max,
                        MIN(temperature) as temp_min,
                        AVG(tds) as tds_avg,
                        MAX(tds) as tds_max,
                        MIN(tds) as tds_min,
                        COUNT(*) as sample_count
                    FROM telemetry
                    WHERE device_id = :device_id AND {raw_range_clause}
                    GROUP BY hour, device_id
                    ORDER BY hour DESC
                """)

                results = self.session.execute(
                    fallback_query,
                    {"device_id": device_id, **range_params},
                ).fetchall()
                
                # Convert to list of dicts
                rollup_list = [self._rollup_row(row, coerce_float=True) for row in results]

                logger.debug(
                    "hourly_rollup_retrieved",
                    device_id=device_id,
                    count=len(rollup_list),
                    source="computed_from_raw",
                )
                
                return rollup_list
                
            except Exception as fallback_error:
                logger.error(
                    "hourly_rollup_failed",
                    device_id=device_id,
                    view_error=str(view_error)[:100],
                    fallback_error=str(fallback_error)[:100],
                )
                raise

    def delete_for_device(self, device_id: str) -> int:
        """
        Delete all telemetry rows for a device.

        Args:
            device_id: Device ID

        Returns:
            Number of deleted telemetry rows
        """
        with log_on_error(self.session, logger, "telemetry_delete_failed", device_id=device_id):
            result = self.session.execute(
                text("DELETE FROM telemetry WHERE device_id = :device_id"),
                {"device_id": device_id},
            )
            self.session.commit()
            deleted = result.rowcount or 0
            logger.info("telemetry_deleted", device_id=device_id, count=deleted)
            return deleted

