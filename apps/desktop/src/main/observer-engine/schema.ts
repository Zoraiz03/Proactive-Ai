// Ordered migrations; applied atomically through PRAGMA user_version.
export const MIGRATIONS = [`CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT NOT NULL);
-- keys: schema_version, workspace_id, created_at, kind ('new'|'existing'), memory_paused ('0'|'1')

CREATE TABLE files(
  path           TEXT PRIMARY KEY,            -- workspace-relative, forward slashes
  language       TEXT NOT NULL DEFAULT 'plaintext',
  size_bytes     INTEGER NOT NULL DEFAULT 0,
  content_hash   TEXT,                        -- sha256 of current content (null if excluded)
  mtime_ms       INTEGER,
  baseline_ver   INTEGER NOT NULL DEFAULT 0,  -- current baseline version
  secret_flagged INTEGER NOT NULL DEFAULT 0,
  excluded       INTEGER NOT NULL DEFAULT 0,  -- 1 = metadata only
  exclusion      TEXT,                        -- 'secret_file'|'user_rule'|'binary'|'too_large'|'generated'|'secret_flagged'
  deleted        INTEGER NOT NULL DEFAULT 0,
  first_seen_at  INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);

CREATE TABLE baselines(                       -- full text snapshot, deflate-compressed
  path TEXT NOT NULL, version INTEGER NOT NULL,
  content BLOB NOT NULL, content_hash TEXT NOT NULL, created_at INTEGER NOT NULL,
  PRIMARY KEY(path, version)
);

CREATE TABLE edit_journal(                    -- append-only deltas = "newly typed text only"
  seq          INTEGER PRIMARY KEY AUTOINCREMENT,
  path         TEXT NOT NULL,
  ts           INTEGER NOT NULL,              -- ms, but only second precision is used by readers
  base_ver     INTEGER NOT NULL,
  offset       INTEGER NOT NULL,              -- UTF-16 offset in document BEFORE this change
  removed_len  INTEGER NOT NULL,
  removed_text TEXT,                          -- capped 2000 chars, for context/undo only
  inserted     TEXT NOT NULL,                 -- capped 20000 chars per row (split larger pastes)
  origin       TEXT NOT NULL CHECK(origin IN ('typing','paste','ai_apply','undo_redo','external')),
  batch_id     INTEGER NOT NULL,              -- flush batch (see 5.2)
  post_hash    TEXT                           -- sha256 of full file after the LAST row of a batch; null on other rows
);
CREATE INDEX edit_journal_path_seq ON edit_journal(path, seq);
CREATE INDEX edit_journal_ts ON edit_journal(ts);

CREATE TABLE symbols(
  path TEXT NOT NULL, name TEXT NOT NULL, kind TEXT NOT NULL,   -- function|class|const|def|interface|type
  line_start INTEGER NOT NULL, line_end INTEGER NOT NULL,
  PRIMARY KEY(path, name, line_start)
);

CREATE TABLE chunks(                          -- retrieval units (≈40 lines, 5-line overlap)
  id INTEGER PRIMARY KEY, path TEXT NOT NULL, chunk_idx INTEGER NOT NULL,
  line_start INTEGER NOT NULL, line_end INTEGER NOT NULL, text TEXT NOT NULL, hash TEXT NOT NULL
);

CREATE TABLE web_captures(
  id TEXT PRIMARY KEY,                        -- uuid
  captured_at INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL,
  source      TEXT NOT NULL CHECK(source IN ('selection','page')),
  url         TEXT NOT NULL,                  -- query + fragment stripped
  hostname    TEXT NOT NULL,
  title       TEXT NOT NULL,
  text        TEXT NOT NULL,                  -- redacted, ≤ 4000 chars (page) / 10000 (selection)
  content_hash TEXT NOT NULL UNIQUE,
  pinned      INTEGER NOT NULL DEFAULT 0,
  use_count   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE suggestions(
  id TEXT PRIMARY KEY, ts INTEGER NOT NULL, path TEXT, kind TEXT NOT NULL,   -- continuation|correction|next_step|create_file|doc_sync
  trigger_reason TEXT NOT NULL,               -- 'pause'|'manual'
  provider TEXT, model TEXT,
  chars_sent INTEGER, tokens_in INTEGER, tokens_out INTEGER, latency_ms INTEGER,
  manifest_json TEXT NOT NULL,                -- what blocks were sent (types, paths, line ranges, hashes) — NOT the text
  result_json TEXT,                           -- suggestion explanation + edit
  outcome TEXT CHECK(outcome IN ('shown','accepted','dismissed','ignored','failed')),
  outcome_ts INTEGER
);

CREATE TABLE governance_events(
  id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL,
  layer TEXT NOT NULL CHECK(layer IN ('kill_switch','visibility_guard','delta_filter','rate_limit','privacy_block','dedupe')),
  path TEXT, detail TEXT
);

CREATE TABLE project_brief(                   -- mirror of .proactive/project.json for fast access
  id INTEGER PRIMARY KEY CHECK(id=1), json TEXT NOT NULL, updated_at INTEGER NOT NULL
);
`] as const;
