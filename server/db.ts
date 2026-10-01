import Database from 'better-sqlite3';
import path from 'node:path';
import { config, SERVER_DIR } from './config';

const dbPath = config.dbFile === ':memory:' || path.isAbsolute(config.dbFile) ? config.dbFile : path.join(SERVER_DIR, config.dbFile);
if (dbPath !== ':memory:') console.log(`📂 Database: ${dbPath}`);

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS app_users (
    id INTEGER PRIMARY KEY,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('Admin', 'Member')),
    status TEXT NOT NULL CHECK(status IN ('Pending', 'Active', 'Denied')),
    avatarUrl TEXT DEFAULT '',
    session_id TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS password_reset_tokens (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    used_at INTEGER,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_username TEXT,
    action TEXT NOT NULL,
    entity_type TEXT,
    entity_id TEXT,
    details TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  -- Workspace data is stored as JSON documents keyed by id; the worker keeps it all in memory.
  CREATE TABLE IF NOT EXISTS user_settings (
    user_id INTEGER PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
    data TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS api_keys (
    user_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    secret TEXT NOT NULL,
    hint TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, provider)
  );

  CREATE TABLE IF NOT EXISTS models (
    id TEXT NOT NULL,
    user_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    sort INTEGER NOT NULL DEFAULT 0,
    data TEXT NOT NULL,
    PRIMARY KEY (user_id, id)
  );

  CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    data TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    owner_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    data TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    created_by INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    data TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS feed (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    at INTEGER NOT NULL,
    data TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS feed_user_at ON feed(user_id, at);

  -- Real AI spending per person, month and model (drives the budget cap and the usage view).
  CREATE TABLE IF NOT EXISTS usage (
    user_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    month TEXT NOT NULL,
    model_id TEXT NOT NULL,
    model_name TEXT NOT NULL,
    provider TEXT NOT NULL,
    tokens_in INTEGER NOT NULL DEFAULT 0,
    tokens_out INTEGER NOT NULL DEFAULT 0,
    cost_usd REAL NOT NULL DEFAULT 0,
    calls INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, month, model_id)
  );

  -- The same spending per day and agent, for the stats page ('' = Model Arena runs).
  CREATE TABLE IF NOT EXISTS usage_daily (
    user_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    day TEXT NOT NULL,
    model_id TEXT NOT NULL,
    agent_id TEXT NOT NULL DEFAULT '',
    model_name TEXT NOT NULL,
    tokens_in INTEGER NOT NULL DEFAULT 0,
    tokens_out INTEGER NOT NULL DEFAULT 0,
    cost_usd REAL NOT NULL DEFAULT 0,
    calls INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, day, model_id, agent_id)
  );

  -- Model Arena picks: every model in an arena plays one game; the picked one wins it.
  CREATE TABLE IF NOT EXISTS arena_votes (
    user_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    model_key TEXT NOT NULL,
    model_name TEXT NOT NULL,
    wins INTEGER NOT NULL DEFAULT 0,
    games INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, model_key)
  );

  -- Newsroom: watchlists and the reports their runs produce (the newest ~30 per watchlist are kept).
  CREATE TABLE IF NOT EXISTS watchlists (
    id TEXT PRIMARY KEY,
    owner_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    data TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS reports (
    id TEXT PRIMARY KEY,
    watchlist_id TEXT NOT NULL REFERENCES watchlists(id) ON DELETE CASCADE,
    at INTEGER NOT NULL,
    score REAL NOT NULL DEFAULT 0,
    label TEXT NOT NULL DEFAULT '',
    data TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS reports_watch_at ON reports(watchlist_id, at);
`);

/** Columns added after a table first shipped — CREATE TABLE IF NOT EXISTS never adds them to an existing table. */
function addColumn(table: string, column: string, definition: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!cols.some((c) => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}
addColumn('reports', 'score', 'REAL NOT NULL DEFAULT 0');
addColumn('reports', 'label', "TEXT NOT NULL DEFAULT ''");

export const logAudit =(actor: string | null | undefined, action: string, entityType?: string, entityId?: string | number, details: object = {}) => {
  db.prepare(`INSERT INTO audit_logs (actor_username, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)`).run(
    actor || null,
    action,
    entityType || null,
    entityId == null ? null : String(entityId),
    JSON.stringify(details),
  );
};

export default db;
