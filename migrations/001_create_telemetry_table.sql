-- TankCtl Telemetry Table Migration
-- Creates basic telemetry table for storing device telemetry data
-- TimescaleDB extensions are optional and applied separately

-- Create telemetry table with proper timestamps
CREATE TABLE IF NOT EXISTS telemetry (
    time TIMESTAMPTZ NOT NULL,
    device_id TEXT NOT NULL,
    temperature DOUBLE PRECISION,
    tds DOUBLE PRECISION,
    pressure DOUBLE PRECISION,
    metadata JSONB
);

-- Create composite index for efficient device + time queries
CREATE INDEX IF NOT EXISTS idx_telemetry_device_time
ON telemetry (device_id, time DESC);

-- Create index on temperature for analytics queries
CREATE INDEX IF NOT EXISTS idx_telemetry_temperature
ON telemetry (device_id, temperature) WHERE temperature IS NOT NULL;

-- Create index on tds for analytics queries
CREATE INDEX IF NOT EXISTS idx_telemetry_tds
ON telemetry (device_id, tds) WHERE tds IS NOT NULL;
