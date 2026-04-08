/**
 * Database abstraction layer for Electron desktop app.
 *
 * When DATABASE_URL is set as a Windows environment variable → saves to Supabase
 * (same database as the cloud/Render deployment — data stays in sync).
 * Also always keeps a local file backup so data is safe if the cloud goes down.
 * Otherwise → silently falls back to local JSON files in userData (original behaviour).
 */

// ─── PostgreSQL (Supabase) ────────────────────────────────────────────────────

let usePostgres = false;
let pgPool = null;

const dbReadyPromise = (async () => {
  if (!process.env.DATABASE_URL) return;
  try {
    const { Pool } = require('pg');
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 5000,
    });
    await pool.query('SELECT 1');
    pgPool = pool;
    usePostgres = true;
    console.log('[db] Connected to Supabase — data will sync with cloud.');
  } catch (err) {
    console.log('[db] Supabase not reachable — using local files.', err.message);
  }
})();

// ─── Local file helpers ───────────────────────────────────────────────────────

function writeLocalData(data, localPath, fs) {
  try {
    const bakPath = localPath + '.bak';
    if (fs.existsSync(localPath)) fs.copyFileSync(localPath, bakPath);
    fs.writeFileSync(localPath, JSON.stringify(data), 'utf8');
  } catch (err) {
    console.warn('[db] Local backup write failed:', err.message);
  }
}

function writeLocalSettings(settings, settingsPath, fs) {
  try {
    fs.writeFileSync(settingsPath, JSON.stringify(settings), 'utf8');
  } catch (err) {
    console.warn('[db] Local settings backup write failed:', err.message);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

async function loadData(localPath, fs) {
  await dbReadyPromise;
  if (usePostgres) {
    try {
      const res = await pgPool.query("SELECT data FROM app_data WHERE id = 'default'");
      if (res.rows.length) return res.rows[0].data;
    } catch (err) {
      console.warn('[db] Supabase load failed — falling back to local file.', err.message);
    }
  }
  try {
    if (fs.existsSync(localPath)) return JSON.parse(fs.readFileSync(localPath, 'utf8'));
  } catch {}
  return null;
}

async function saveData(data, localPath, fs) {
  await dbReadyPromise;
  // Always keep local file up to date as a backup
  writeLocalData(data, localPath, fs);
  if (usePostgres) {
    try {
      await pgPool.query(
        "UPDATE app_data SET data = $1::jsonb, updated_at = NOW() WHERE id = 'default'",
        [JSON.stringify(data)]
      );
    } catch (err) {
      console.warn('[db] Supabase save failed — data saved locally only.', err.message);
    }
  }
  return true;
}

async function loadSettings(settingsPath, fs) {
  await dbReadyPromise;
  if (usePostgres) {
    try {
      const res = await pgPool.query("SELECT settings FROM app_data WHERE id = 'default'");
      if (res.rows.length) return res.rows[0].settings || {};
    } catch (err) {
      console.warn('[db] Supabase settings load failed — falling back to local file.', err.message);
    }
  }
  try {
    if (fs.existsSync(settingsPath)) return JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  } catch {}
  return {};
}

async function saveSettings(settings, settingsPath, fs) {
  await dbReadyPromise;
  // Always keep local file up to date as a backup
  writeLocalSettings(settings, settingsPath, fs);
  if (usePostgres) {
    try {
      await pgPool.query(
        "UPDATE app_data SET settings = $1::jsonb, updated_at = NOW() WHERE id = 'default'",
        [JSON.stringify(settings)]
      );
    } catch (err) {
      console.warn('[db] Supabase settings save failed — settings saved locally only.', err.message);
    }
  }
  return true;
}

async function isUsingCloud() {
  await dbReadyPromise;
  return usePostgres;
}

module.exports = { loadData, saveData, loadSettings, saveSettings, dbReadyPromise, isUsingCloud };
