-- ─── 3D Print Tracker — Supabase setup ────────────────────────────────────────
-- Run this once in the Supabase SQL editor (Dashboard → SQL editor → New query)
-- after creating your project.  Nothing else needs to be done in Supabase.

-- Single table: one row holds the entire app state as two JSONB columns.
-- This mirrors the local .local-data.json file format so the same server code
-- works with both backends without any schema migration complexity.

CREATE TABLE IF NOT EXISTS app_data (
  id          TEXT        PRIMARY KEY DEFAULT 'default',
  data        JSONB       NOT NULL DEFAULT '{}',
  settings    JSONB       NOT NULL DEFAULT '{}',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed the single row.  ON CONFLICT means re-running this is safe.
INSERT INTO app_data (id, data, settings)
VALUES ('default', '{}', '{}')
ON CONFLICT (id) DO NOTHING;
