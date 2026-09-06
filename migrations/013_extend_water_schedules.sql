-- Migration: Extend water_schedules with interval cadence + water-quality readings
-- Purpose: Support every-N-days recurring water changes (in addition to weekly/custom),
-- and record pH/ammonia/nitrite/nitrate/TDS readings when a water change is closed out.
-- Target: PostgreSQL
--
-- NOTE: This file is documentation only for a fresh install. `WaterScheduleModel` in
-- src/infrastructure/db/models/__init__.py is the source of truth — `database.py:init_db()`
-- creates a brand-new water_schedules table with these columns via `Base.metadata.create_all`.
-- create_all does NOT alter an already-existing table, so on any deployment that already has
-- a water_schedules table, run this file manually:
--   docker exec -i tankctl-postgres psql -U tankctl -d tankctl < migrations/013_extend_water_schedules.sql

ALTER TABLE water_schedules ADD COLUMN IF NOT EXISTS interval_days INTEGER;
ALTER TABLE water_schedules ADD COLUMN IF NOT EXISTS ph REAL;
ALTER TABLE water_schedules ADD COLUMN IF NOT EXISTS ammonia REAL;
ALTER TABLE water_schedules ADD COLUMN IF NOT EXISTS nitrite REAL;
ALTER TABLE water_schedules ADD COLUMN IF NOT EXISTS nitrate REAL;
ALTER TABLE water_schedules ADD COLUMN IF NOT EXISTS tds REAL;
