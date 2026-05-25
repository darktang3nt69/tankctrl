-- Migration: Create device_relay_config table for flexible relay GPIO mapping
-- Purpose: Support multiple relays per device with configurable GPIO pins and active levels
-- Target: PostgreSQL

-- Table: device_relay_config
-- Stores relay (relay_name, gpio_pin, active_level, default_state) per device
CREATE TABLE IF NOT EXISTS device_relay_config (
    id SERIAL PRIMARY KEY,
    device_id VARCHAR(50) NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
    relay_name VARCHAR(50) NOT NULL,  -- e.g., "light", "pump", "heater"
    gpio_pin INTEGER NOT NULL,        -- ESP32 GPIO number (0-39)
    active_level VARCHAR(10) NOT NULL DEFAULT 'LOW',  -- "LOW" or "HIGH" for active level
    default_state VARCHAR(10) NOT NULL DEFAULT 'off',  -- "on" or "off" for boot state
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    UNIQUE(device_id, relay_name),     -- One relay name per device
    UNIQUE(device_id, gpio_pin),       -- Pins don't conflict on same device
    CONSTRAINT valid_gpio_pin CHECK (gpio_pin >= 0 AND gpio_pin <= 39),
    CONSTRAINT valid_active_level CHECK (active_level IN ('LOW', 'HIGH')),
    CONSTRAINT valid_default_state CHECK (default_state IN ('on', 'off'))
);

-- Index: For querying relays by device
CREATE INDEX IF NOT EXISTS idx_relay_config_device_id ON device_relay_config(device_id);
