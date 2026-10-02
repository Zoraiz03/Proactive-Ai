import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, readFile, realpath, utimes, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';
import Database from 'better-sqlite3';
import { ProjectMemoryService } from './memory-service.ts';
import { recentProjectId } from '../recent-projects.ts';

async function fixture(run: (f: { root: string; data: string; service: ProjectMemoryService; db: () => Database.Database }) => Promise<void>, enabled = true) {
  const base = await mkdtemp(join(tmpdir(), 'memory-scan-'));
  const root = join(base, 'project'), data = join(base, 'data');
  await mkdir(root);
  const service = new ProjectMemoryService(data, { settings: { memoryEnabled: enabled }, now: () => 1234567 });
  const databasePath = join(data, 'project-memory', `${recentProjectId(await realpath(root))}.db`);
  try { await run({ root, data, service, db: () => new Database(databasePath) }); }
  finally { await service.close(); await rm(base, { recursive: true, force: true }); }
}

test('scan stores compressed baselines locally, increments changed versions and survives reopen', async () => fixture(async ({ root, service, db }) => {
  await writeFile(join(root, 'main.ts'), 'export const value = 1;');
  const status = await service.open(root, 'existing');
  assert.equal(status.indexedFiles, 1); assert.equal(status.lastScanAt, 1234000);
  const connection = db();
  try {
    const row = connection.prepare('SELECT * FROM baselines').get() as { content: Buffer; version: number };
    assert.equal(inflateSync(row.content).toString(), 'export const value = 1;');
    assert.equal(row.version, 1);
    assert.equal((await service.scan()).unchanged, 1);
    await writeFile(join(root, 'main.ts'), 'export const value = 222;');
    assert.equal((await service.scan({ full: true })).updated, 1);
    assert.equal((connection.prepare('SELECT baseline_ver v FROM files').get() as { v: number }).v, 2);
  } finally { connection.close(); }
  await service.close();
  assert.equal((await service.open(root, 'existing')).indexedFiles, 1);
}));

test('mandatory secrets, user rules, generated dirs and lockfiles are metadata only', async () => fixture(async ({ root, service, db }) => {
  for (const name of ['.env.local', 'private.txt', 'package-lock.json']) await writeFile(join(root, name), 'not captured');
  await mkdir(join(root, 'node_modules')); await writeFile(join(root, 'node_modules', 'hidden.js'), 'never read');
  service.configure({ exclusions: ['private.txt'] });
  await service.open(root, 'new');
  const connection = db();
  try {
    assert.equal((connection.prepare('SELECT count(*) n FROM baselines').get() as { n: number }).n, 0);
    const rows = connection.prepare('SELECT excluded,content_hash FROM files').all() as { excluded: number; content_hash: null }[];
    assert.equal(rows.length, 4);
    assert.ok(rows.every(row => row.excluded === 1 && row.content_hash === null));
  } finally { connection.close(); }
}));

test('secret contamination purges previous baselines, journal, chunks and symbols, then clean scan recovers', async () => fixture(async ({ root, service, db }) => {
  await writeFile(join(root, 'main.ts'), 'initial clean source');
  await service.open(root, 'existing');
  const secret = 'sk-' + 'x'.repeat(32);
  const connection = db();
  try {
    connection.exec(`INSERT INTO edit_journal(path,ts,base_ver,offset,removed_len,inserted,origin,batch_id) VALUES('main.ts',0,1,0,0,'old','typing',1);
      INSERT INTO chunks(path,chunk_idx,line_start,line_end,text,hash) VALUES('main.ts',0,1,1,'old','hash');
      INSERT INTO symbols VALUES('main.ts','old','const',1,1);`);
    await writeFile(join(root, 'main.ts'), secret);
    await service.scan({ full: true });
    assert.deepEqual(connection.prepare('SELECT secret_flagged,content_hash FROM files').get(), { secret_flagged: 1, content_hash: null });
    for (const table of ['baselines', 'edit_journal', 'chunks', 'symbols']) assert.equal((connection.prepare(`SELECT count(*) n FROM ${table}`).get() as { n: number }).n, 0);
    assert.equal(JSON.stringify(connection.prepare('SELECT * FROM files').all()).includes(secret), false);
    await writeFile(join(root, 'main.ts'), 'clean again'); await service.scan({ full: true });
    assert.equal(service.status().indexedFiles, 1);
  } finally { connection.close(); }
}));

test('binary, invalid UTF-8 and oversized files are excluded', async () => fixture(async ({ root, service, db }) => {
  await writeFile(join(root, 'binary.dat'), Buffer.from([0, 1, 2]));
  await writeFile(join(root, 'invalid.txt'), Buffer.from([255, 254]));
  await writeFile(join(root, 'large.txt'), 'x'.repeat(65537));
  service.configure({ maxFileBytes: 65536 }); await service.open(root, 'existing');
  assert.equal(service.status().indexedFiles, 0);
  const connection = db();
  try { assert.deepEqual(connection.prepare('SELECT exclusion FROM files ORDER BY path').all(), [{ exclusion: 'binary' }, { exclusion: 'binary' }, { exclusion: 'too_large' }]); }
  finally { connection.close(); }
}));

test('disabled and paused memory performs no scan writes; pause is persisted', async () => fixture(async ({ root, service }) => {
  await writeFile(join(root, 'a.txt'), 'alpha');
  assert.equal((await service.open(root, 'existing')).files, 0);
  service.configure({ memoryEnabled: true }); await service.scan();
  assert.equal(service.status().indexedFiles, 1);
  service.setPaused(true); await writeFile(join(root, 'b.txt'), 'beta');
  assert.equal((await service.scan()).cancelled, true);
  await service.close(); assert.equal((await service.open(root, 'existing')).paused, true);
  assert.equal(service.status().files, 1);
  service.setPaused(false); await service.scan(); assert.equal(service.status().files, 2);
}, false));

test('new exclusions purge already indexed content immediately', async () => fixture(async ({ root, service, db }) => {
  await writeFile(join(root, 'a.txt'), 'alpha'); await service.open(root, 'existing');
  service.configure({ exclusions: ['a.txt'] });
  assert.equal(service.status().indexedFiles, 0);
  const connection = db();
  try { assert.equal((connection.prepare('SELECT count(*) n FROM baselines').get() as { n: number }).n, 0); }
  finally { connection.close(); }
}));

test('deleted files purge content while retaining journal until future retention', async () => fixture(async ({ root, service, db }) => {
  await writeFile(join(root, 'a.txt'), 'alpha'); await service.open(root, 'existing');
  const connection = db();
  try {
    connection.exec("INSERT INTO edit_journal(path,ts,base_ver,offset,removed_len,inserted,origin,batch_id) VALUES('a.txt',0,1,0,0,'alpha','typing',1)");
    await rm(join(root, 'a.txt')); assert.equal((await service.scan()).deleted, 1);
    assert.equal(service.status().files, 0); assert.equal(service.status().journalRows, 1);
    assert.equal((connection.prepare('SELECT count(*) n FROM baselines').get() as { n: number }).n, 0);
  } finally { connection.close(); }
}));

test('purge scopes are isolated and all clears project memory', async () => fixture(async ({ root, service, db }) => {
  await writeFile(join(root, 'a.txt'), 'alpha'); await writeFile(join(root, 'b.txt'), 'beta');
  await service.open(root, 'existing');
  const connection = db();
  try {
    connection.exec("INSERT INTO edit_journal(path,ts,base_ver,offset,removed_len,inserted,origin,batch_id) VALUES('a.txt',0,1,0,0,'alpha','typing',1)");
    connection.exec("INSERT INTO web_captures(id,captured_at,expires_at,source,url,hostname,title,text,content_hash) VALUES('web',0,1000,'selection','https://example.org','example.org','title','web text','hash')");
    service.purge('web'); assert.equal(service.status().webCaptures, 0); assert.equal(service.status().journalRows, 1);
    service.purge('journal'); assert.equal(service.status().journalRows, 0); assert.equal(service.status().indexedFiles, 2);
    service.purge({ path: 'a.txt' }); assert.equal(service.status().indexedFiles, 1);
    assert.throws(() => service.purge({ path: '../escape' }));
    service.purge('all'); assert.equal(service.status().files, 0); assert.equal(service.status().lastScanAt, null);
  } finally { connection.close(); }
}));

test('scan yields progress and cancellation cannot repopulate purged content', async () => fixture(async ({ root, data, service }) => {
  await service.close();
  for (let index = 0; index < 125; index++) await writeFile(join(root, `${index}.txt`), `value ${index}`);
  let purged = false;
  const cancellable = new ProjectMemoryService(data, { settings: { memoryEnabled: true }, onStatus: state => {
    if (state.indexedFiles >= 49 && !purged) { purged = true; cancellable.purge('all'); }
  } });
  try { await cancellable.open(root, 'existing'); assert.ok(purged); assert.equal(cancellable.status().files, 0); }
  finally { await cancellable.close(); }
}));

test('file count cap is enforced without marking live files deleted', async () => fixture(async ({ root, service }) => {
  for (let index = 0; index < 105; index++) await writeFile(join(root, `${index}.txt`), `value ${index}`);
  service.configure({ maxFiles: 100 }); await service.open(root, 'existing');
  assert.equal(service.status().indexedFiles, 100); assert.equal(service.status().excludedFiles, 5);
  assert.equal((await service.scan()).capped, true); assert.equal(service.status().files, 105);
}));

test('database cannot be placed inside workspace', async () => fixture(async ({ root }) => {
  const invalid = new ProjectMemoryService(join(root, 'data'), { settings: { memoryEnabled: true } });
  await assert.rejects(invalid.open(root, 'existing'), /memory_storage_inside_workspace/);
  assert.equal(invalid.status().open, false);
}));

test('database directory itself cannot be the selected workspace', async () => fixture(async ({ data }) => {
  const root = join(data, 'project-memory'); await mkdir(root, { recursive: true });
  const invalid = new ProjectMemoryService(data, { settings: { memoryEnabled: true } });
  await assert.rejects(invalid.open(root, 'existing'), /memory_storage_inside_workspace/);
}));

test('directory junctions never expose external files and invalidate old descendant context', async () => fixture(async ({ root, data, service, db }) => {
  const directory = join(root, 'linked'); await mkdir(directory);
  await writeFile(join(directory, 'a.txt'), 'old local content');
  await service.open(root, 'existing');
  await rm(directory, { recursive: true });
  const outside = join(data, 'outside'); await mkdir(outside);
  await writeFile(join(outside, 'a.txt'), 'outside content must never persist');
  await symlink(outside, directory, process.platform === 'win32' ? 'junction' : 'dir');
  await service.scan();
  assert.equal(service.status().indexedFiles, 0);
  const connection = db();
  try { assert.equal((connection.prepare('SELECT count(*) n FROM baselines').get() as { n: number }).n, 0); }
  finally { connection.close(); }
}));

test('mtime-only changes do not create redundant baselines and full scan checks equal-metadata changes', async () => fixture(async ({ root, service, db }) => {
  const path = join(root, 'a.txt'); await writeFile(path, 'alpha'); await service.open(root, 'existing');
  await utimes(path, new Date(), new Date(Date.now() + 10000));
  assert.equal((await service.scan()).unchanged, 1);
  const connection = db();
  try { assert.equal((connection.prepare('SELECT count(*) n FROM baselines').get() as { n: number }).n, 1); }
  finally { connection.close(); }
  assert.equal(await readFile(path, 'utf8'), 'alpha');
}));
