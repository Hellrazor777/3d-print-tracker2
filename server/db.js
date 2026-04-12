/**
 * Database abstraction layer.
 *
 * When DATABASE_URL is set and PostgreSQL is reachable → uses PostgreSQL (Replit cloud).
 * Otherwise → silently falls back to a local JSON file (.local-data.json in the project
 * root). Zero setup required for local / Electron development.
 */

const fs   = require('fs');
const path = require('path');

// ─── Local JSON file fallback ─────────────────────────────────────────────────

const LOCAL_FILE = path.join(__dirname, '..', '.local-data.json');

function localRead() {
  try {
    if (fs.existsSync(LOCAL_FILE)) return JSON.parse(fs.readFileSync(LOCAL_FILE, 'utf8'));
  } catch {}
  return { data: {}, settings: {} };
}

function localWrite(patch) {
  const current = localRead();
  fs.writeFileSync(LOCAL_FILE, JSON.stringify({ ...current, ...patch }, null, 2), 'utf8');
}

const localDB = {
  async getData()           { return localRead(); },
  async saveData(data)      { localWrite({ data }); },
  async saveSettings(s)     { localWrite({ settings: s }); },
  async updateInventoryItem(item) {
    const current = localRead();
    const data = current.data || {};
    if (!Array.isArray(data.inventory)) data.inventory = [];
    const idx = data.inventory.findIndex(i => i && i.id === item.id);
    if (idx > -1) data.inventory[idx] = { ...data.inventory[idx], ...item };
    else data.inventory.push(item);
    localWrite({ data });
    return data;
  },
};

// ─── PostgreSQL ───────────────────────────────────────────────────────────────

let usePostgres = false;
let pgPool = null;
let dbReady = false;   // true once we've decided which backend to use

async function initDB() {
  if (!process.env.DATABASE_URL) {
    console.log('[db] DATABASE_URL not set — using local JSON file storage (.local-data.json)');
    dbReady = true;
    return;
  }
  try {
    const { Pool } = require('pg');
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false },
      connectionTimeoutMillis: 5000,
    });
    await pool.query('SELECT 1');
    // Create table if it doesn't exist — so users never need to run SQL manually
    await pool.query(`
      CREATE TABLE IF NOT EXISTS app_data (
        id          TEXT        PRIMARY KEY DEFAULT 'default',
        data        JSONB       NOT NULL DEFAULT '{}',
        settings    JSONB       NOT NULL DEFAULT '{}',
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`
      INSERT INTO app_data (id, data, settings)
      VALUES ('default', '{}', '{}')
      ON CONFLICT (id) DO NOTHING
    `);
    pgPool = pool;
    usePostgres = true;
    console.log('[db] Connected to PostgreSQL (Supabase)');
  } catch (e) {
    console.error('[db] PostgreSQL connection failed — falling back to local JSON file storage:', e.message);
  }
  dbReady = true;
}

// Start the DB probe immediately; callers await dbReadyPromise before first use
const dbReadyPromise = initDB();

// ─── Shared operations ────────────────────────────────────────────────────────

async function getData() {
  await dbReadyPromise;
  if (usePostgres) {
    const res = await pgPool.query("SELECT data, settings FROM app_data WHERE id = 'default'");
    if (res.rows.length === 0) return { data: {}, settings: {} };
    return { data: res.rows[0].data || {}, settings: res.rows[0].settings || {} };
  }
  return localRead();
}

async function saveData(data) {
  await dbReadyPromise;
  if (usePostgres) {
    await pgPool.query(
      `INSERT INTO app_data (id, data, updated_at)
       VALUES ('default', $1::jsonb, NOW())
       ON CONFLICT (id) DO UPDATE
         SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at`,
      [JSON.stringify(data)]
    );
  } else {
    localWrite({ data });
  }
}

async function saveSettings(settings) {
  await dbReadyPromise;
  if (usePostgres) {
    await pgPool.query(
      `INSERT INTO app_data (id, settings, updated_at)
       VALUES ('default', $1::jsonb, NOW())
       ON CONFLICT (id) DO UPDATE
         SET settings = EXCLUDED.settings, updated_at = EXCLUDED.updated_at`,
      [JSON.stringify(settings)]
    );
  } else {
    localWrite({ settings });
  }
}

async function updateInventoryItem(item) {
  await dbReadyPromise;
  const current = await getData();
  const data = current.data || {};
  if (!Array.isArray(data.inventory)) data.inventory = [];
  const idx = data.inventory.findIndex(i => i && i.id === item.id);
  if (idx > -1) data.inventory[idx] = { ...data.inventory[idx], ...item };
  else data.inventory.push(item);
  await saveData(data);
  return data;
}

module.exports = { getData, saveData, saveSettings, updateInventoryItem, dbReadyPromise };
