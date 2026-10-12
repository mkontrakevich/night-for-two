-- Private D1 metadata for Cloudflare-native casting and staged PostgreSQL transfer.
-- Never store original photographs, image base64 or raw chat records in D1.
CREATE TABLE IF NOT EXISTS actor_identity (
 guest_key TEXT PRIMARY KEY,
 role TEXT NOT NULL CHECK (role IN ('A','B')),
 version INTEGER NOT NULL DEFAULT 1,
 status TEXT NOT NULL DEFAULT 'empty' CHECK (status IN ('empty','photos_ready','working','ready','failed')),
 approved INTEGER NOT NULL DEFAULT 0 CHECK (approved IN (0,1)),
 reference_keys TEXT NOT NULL DEFAULT '[]',
 card_json TEXT NOT NULL DEFAULT '{}',
 identity_lock TEXT NOT NULL DEFAULT '',
 image_key TEXT NOT NULL DEFAULT '',
 job_id TEXT NOT NULL DEFAULT '',
 prompt TEXT NOT NULL DEFAULT '',
 model TEXT NOT NULL DEFAULT '',
 error_code TEXT NOT NULL DEFAULT '',
 updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS actor_identity_role_status ON actor_identity(role,status);

CREATE TABLE IF NOT EXISTS migration_entries (
 table_name TEXT NOT NULL,
 legacy_key TEXT NOT NULL,
 r2_key TEXT NOT NULL,
 sha256 TEXT NOT NULL,
 imported_at TEXT NOT NULL DEFAULT (datetime('now')),
 PRIMARY KEY (table_name,legacy_key)
);
CREATE TABLE IF NOT EXISTS migration_runs (
 id TEXT PRIMARY KEY,
 state TEXT NOT NULL DEFAULT 'working',
 table_index INTEGER NOT NULL DEFAULT 0,
 row_offset INTEGER NOT NULL DEFAULT 0,
 records INTEGER NOT NULL DEFAULT 0,
 error_code TEXT NOT NULL DEFAULT '',
 updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
