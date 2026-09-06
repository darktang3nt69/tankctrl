-- Migration: Replace the (never-implemented-in-hardware) humidity sensor
-- metric with TDS on the telemetry table.
-- Target: PostgreSQL / TimescaleDB
--
-- NOTE: On a fresh install, migrations/001_create_telemetry_table.sql already
-- creates the `telemetry` table with a `tds` column (source of truth is that
-- file + database.py's startup schema init, not a migration-tracking table).
-- Run this file manually only against an already-deployed database that still
-- has the old `humidity` column:
--   docker exec -i tankctl-postgres psql -U tankctl -d tankctl < migrations/014_telemetry_humidity_to_tds.sql
--
-- `humidity` is left in place rather than dropped, since dropping a column is
-- destructive and this repo's convention is additive-only migrations; any
-- historical humidity readings stay queryable directly if ever needed.

ALTER TABLE telemetry ADD COLUMN IF NOT EXISTS tds DOUBLE PRECISION;

CREATE INDEX IF NOT EXISTS idx_telemetry_tds
ON telemetry (device_id, tds) WHERE tds IS NOT NULL;

-- If a `telemetry_hourly` continuous aggregate was manually created for this
-- deployment (see src/repository/telemetry_repository.py's fallback comment
-- - it's not created by any tracked migration), it referenced humidity_avg/
-- humidity_max/humidity_min columns and will need to be dropped and recreated
-- with tds_avg/tds_max/tds_min to match the application code's query. That
-- step is intentionally not scripted here since the view's original
-- definition isn't tracked in this repo.
