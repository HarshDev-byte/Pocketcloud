-- Network configuration table
CREATE TABLE IF NOT EXISTS network_config (
  id               INTEGER PRIMARY KEY CHECK (id = 1),
  mode             TEXT NOT NULL DEFAULT 'hotspot',
  hotspot_ssid     TEXT NOT NULL DEFAULT 'PocketCloud',
  hotspot_password TEXT NOT NULL DEFAULT 'pocketcloud123',
  hotspot_channel  INTEGER NOT NULL DEFAULT 6,
  client_ssid      TEXT,
  client_ip        TEXT,
  ethernet_ip      TEXT,
  keep_hotspot     INTEGER NOT NULL DEFAULT 1,
  updated_at       INTEGER NOT NULL
);

-- Insert default config
INSERT OR IGNORE INTO network_config (id, updated_at) 
VALUES (1, unixepoch() * 1000);
