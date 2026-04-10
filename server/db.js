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

async function localRead() {
  try {
    const txt = await fs.promises.readFile(LOCAL_FILE, 'utf8');
    return JSON.parse(txt);
  } catch { return { data: {}, settings: {} }; }
}

async function localWrite(patch) {
  const current = await localRead();
  await fs.promises.writeFile(LOCAL_FILE, JSON.stringify({ ...current, ...patch }, null, 2), 'utf8');
}

// ─── PostgreSQL ───────────────────────────────────────────────────────────────

let usePostgres = false;
let pgPool = null;
let dbReady = false;   // true once we've decided which backend to use

async function initDB() {
  if (!process.env.DATABASE_URL) { dbReady = true; return; }
  try {
    const { Pool } = require('pg');
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false },
      connectionTimeoutMillis: 3000,
    });
    await pool.query('SELECT 1');
    pgPool = pool;
    usePostgres = true;
  } catch {
    console.log('No PostgreSQL — using local JSON file storage (.local-data.json)');
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
  return await localRead();
}

async function saveData(data) {
  await dbReadyPromise;
  if (usePostgres) {
    await pgPool.query(
      `INSERT INTO app_data (id, data, updated_at)
       VALUES ('default', $1::jsonb, NOW())
       ON CONFLICT (id) DO UPDATE SET data = $1::jsonb, updated_at = NOW()`,
      [JSON.stringify(data)]
    );
  } else {
    await localWrite({ data });
  }
}

async function saveSettings(settings) {
  await dbReadyPromise;
  if (usePostgres) {
    await pgPool.query(
      `INSERT INTO app_data (id, settings, updated_at)
       VALUES ('default', $1::jsonb, NOW())
       ON CONFLICT (id) DO UPDATE SET settings = $1::jsonb, updated_at = NOW()`,
      [JSON.stringify(settings)]
    );
  } else {
    await localWrite({ settings });
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
