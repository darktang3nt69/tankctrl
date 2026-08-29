-- Phase 1: Add water schedule notification preferences
-- Adds notify_* boolean columns to water_schedules table
-- Defaults to TRUE for backward compatibility (all reminders enabled by default)

ALTER TABLE water_schedules
ADD COLUMN IF NOT EXISTS notify_24h BOOLEAN NOT NULL DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS notify_1h BOOLEAN NOT NULL DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS notify_on_time BOOLEAN NOT NULL DEFAULT TRUE;

-- Create index for querying enabled schedules with notification preferences
CREATE INDEX IF NOT EXISTS idx_water_schedules_notifications ON water_schedules(device_id, enabled, completed, notify_24h, notify_1h, notify_on_time);

-- Add trigger to update updated_at timestamp
ALTER TABLE water_schedules
ALTER COLUMN updated_at SET DEFAULT CURRENT_TIMESTAMP;
