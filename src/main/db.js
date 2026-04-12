/**
 * Database abstraction layer for Electron desktop app.
 *
 * Priority for cloud URL:
 *   1. process.env.DATABASE_URL (system env var — legacy / power users)
 *   2. settings.json → databaseUrl (set via in-app Settings field — recommended)
 *
 * On startup main.js injects databaseUrl from settings into process.env before
 * this module loads, so both paths end up using the same initiation code below.
 *
 * Callers that want to reconnect at runtime (e.g. after the user pastes a new URL
 * in Settings) should call connectToCloud(url) directly.
 */

// ─── PostgreSQL (Supabase) ────────────────────────────────────────────────────

let usePostgres = false;
let pgPool = null;

async function connectToCloud(url) {
  if (!url) return { ok: false, error: 'No URL provided' };
  try {
    const { Pool } = require('pg');
    const pool = new Pool({
      connectionString: url,
      ssl: url.includes('localhost') ? false : { rejectUnauthorized: false },
      connectionTimeoutMillis: 5000,
    });
    await pool.query('SELECT 1');
    // Auto-create table so users never need to run SQL manually
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
    // Swap in new pool, close old one
    if (pgPool) await pgPool.end().catch(() => {});
    pgPool = pool;
    usePostgres = true;
    console.log('[db] Connected to Supabase — data will sync with cloud.');
    return { ok: true };
  } catch (err) {
    console.warn('[db] Supabase connection failed:', err.message);
    return { ok: false, error: err.message };
  }
}

// Connect at startup if URL is available (injected by main.js from env or settings)
const dbReadyPromise = process.env.DATABASE_URL
  ? connectToCloud(process.env.DATABASE_URL)
  : Promise.resolve({ ok: false });

// ─── Local file helpers ───────────────────────────────────────────────────────

function atomicWrite(filePath, json, fs) {
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, json, 'utf8');
  fs.renameSync(tmp, filePath);
}

function writeLocalData(data, localPath, fs) {
  try {
    atomicWrite(localPath, JSON.stringify(data), fs);
  } catch (err) {
    console.warn('[db] Local data write failed:', err.message);
  }
}

function writeLocalSettings(settings, settingsPath, fs) {
  try {
    atomicWrite(settingsPath, JSON.stringify(settings), fs);
  } catch (err) {
    console.warn('[db] Local settings write failed:', err.message);
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
        `INSERT INTO app_data (id, data, updated_at)
         VALUES ('default', $1::jsonb, NOW())
         ON CONFLICT (id) DO UPDATE
           SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at`,
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
        `INSERT INTO app_data (id, settings, updated_at)
         VALUES ('default', $1::jsonb, NOW())
         ON CONFLICT (id) DO UPDATE
           SET settings = EXCLUDED.settings, updated_at = EXCLUDED.updated_at`,
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

// Like saveData but throws if the Supabase write fails — used by push-local-to-cloud
// so the IPC handler can return a meaningful error to the UI instead of silent failure.
async function pushDataToCloud(data, localPath, fs) {
  await dbReadyPromise;
  if (!usePostgres) throw new Error('Not connected to Supabase');
  writeLocalData(data, localPath, fs);
  await pgPool.query(
    `INSERT INTO app_data (id, data, updated_at)
     VALUES ('default', $1::jsonb, NOW())
     ON CONFLICT (id) DO UPDATE
       SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at`,
    [JSON.stringify(data)]
  );
}

module.exports = { loadData, saveData, loadSettings, saveSettings, dbReadyPromise, isUsingCloud, pushDataToCloud, connectToCloud };
