import Database from 'better-sqlite3';
import { MIGRATIONS } from './schema.ts';

export interface MemoryDatabase {
  db: Database.Database;
  searchMode: 'fts5' | 'fallback';
}

export function openMemoryDatabase(file: string, warn: (category: string) => void = () => {},
  options: { disableFts?: boolean } = {}): MemoryDatabase {
  const db = new Database(file);
  try {
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.pragma('foreign_keys = ON');
    // Secure deletion also protects content removed by secret checks and purge.
    db.pragma('secure_delete = ON');
    const version = Number(db.pragma('user_version', { simple: true }));
    if (version > MIGRATIONS.length) throw new Error('unsupported_memory_schema');
    db.transaction(() => {
      for (let index = version; index < MIGRATIONS.length; index++) {
        db.exec(MIGRATIONS[index]);
        db.pragma(`user_version = ${index + 1}`);
      }
    })();
    let searchMode: MemoryDatabase['searchMode'] = 'fallback';
    try {
      if (options.disableFts) throw new Error('fts_disabled');
      db.exec("CREATE VIRTUAL TABLE temp.memory_fts_probe USING fts5(text); DROP TABLE temp.memory_fts_probe;");
      db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(text, path UNINDEXED, content='chunks', content_rowid='id', tokenize='unicode61 remove_diacritics 2');
        CREATE VIRTUAL TABLE IF NOT EXISTS web_fts USING fts5(title, text, content='web_captures', content_rowid='rowid', tokenize='unicode61 remove_diacritics 2');
        CREATE TRIGGER IF NOT EXISTS chunks_insert AFTER INSERT ON chunks BEGIN
          INSERT INTO chunks_fts(rowid,text,path) VALUES(new.id,new.text,new.path); END;
        CREATE TRIGGER IF NOT EXISTS chunks_delete AFTER DELETE ON chunks BEGIN
          INSERT INTO chunks_fts(chunks_fts,rowid,text,path) VALUES('delete',old.id,old.text,old.path); END;
        CREATE TRIGGER IF NOT EXISTS chunks_update AFTER UPDATE ON chunks BEGIN
          INSERT INTO chunks_fts(chunks_fts,rowid,text,path) VALUES('delete',old.id,old.text,old.path);
          INSERT INTO chunks_fts(rowid,text,path) VALUES(new.id,new.text,new.path); END;
        CREATE TRIGGER IF NOT EXISTS web_insert AFTER INSERT ON web_captures BEGIN
          INSERT INTO web_fts(rowid,title,text) VALUES(new.rowid,new.title,new.text); END;
        CREATE TRIGGER IF NOT EXISTS web_delete AFTER DELETE ON web_captures BEGIN
          INSERT INTO web_fts(web_fts,rowid,title,text) VALUES('delete',old.rowid,old.title,old.text); END;
        CREATE TRIGGER IF NOT EXISTS web_update AFTER UPDATE ON web_captures BEGIN
          INSERT INTO web_fts(web_fts,rowid,title,text) VALUES('delete',old.rowid,old.title,old.text);
          INSERT INTO web_fts(rowid,title,text) VALUES(new.rowid,new.title,new.text); END;
      `);
      // Rebuild also covers databases initially opened on an FTS-less runtime.
      db.exec("INSERT INTO chunks_fts(chunks_fts) VALUES('rebuild'); INSERT INTO web_fts(web_fts) VALUES('rebuild');");
      searchMode = 'fts5';
    } catch {
      warn('memory_fts_unavailable');
    }
    return { db, searchMode };
  } catch (error) {
    db.close();
    throw error;
  }
}

// Parameterized LIKE + token scoring is a real fallback, not simulated FTS.
export function searchMemoryChunks(memory: MemoryDatabase, input: string[], limit = 10) {
  const terms = [...new Set(input.flatMap(term => term.toLowerCase().match(/[\p{L}\p{N}_]{3,}/gu) ?? []))].slice(0, 24);
  if (!terms.length) return [];
  const capped = Math.max(1, Math.min(50, Math.floor(limit) || 10));
  if (memory.searchMode === 'fts5') {
    return memory.db.prepare(`SELECT c.* FROM chunks_fts JOIN chunks c ON c.id=chunks_fts.rowid
      WHERE chunks_fts MATCH ? ORDER BY bm25(chunks_fts), c.id LIMIT ?`)
      .all(terms.map(term => `"${term}"`).join(' OR '), capped);
  }
  const predicate = terms.map(() => "lower(text) LIKE ? ESCAPE '\\'").join(' OR ');
  const patterns = terms.map(term => `%${term.replace(/[_%\\]/g, '\\$&')}%`);
  const rows = memory.db.prepare(`SELECT * FROM chunks WHERE ${predicate} ORDER BY id LIMIT 1000`)
    .all(...patterns) as { text: string; id: number }[];
  return rows.map(row => ({ row, score: terms.filter(term => row.text.toLowerCase().includes(term)).length }))
    .sort((a, b) => b.score - a.score || a.row.id - b.row.id).slice(0, capped).map(hit => hit.row);
}
