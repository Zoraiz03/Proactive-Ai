// Contracts only: no Node, Electron, filesystem or database imports.
import type { IpcResult } from './workspace';
export const ENGINE_CHANNELS = {
  memoryOpen: 'memory:open', memoryStatus: 'memory:status', memoryEdits: 'memory:edits', memoryBuffer: 'memory:buffer',
  memoryPause: 'memory:pause', memoryPurge: 'memory:purge', configure: 'engine:configure',
  edit: 'engine:edit', activity: 'engine:activity', state: 'engine:state',
  outcome: 'engine:outcome', resume: 'engine:resume', stream: 'engine:stream',
} as const;

export interface MemorySettings {
  memoryEnabled: boolean;
  exclusions: readonly string[];
  journalRetentionDays: number;
  maxFileBytes: number;
  maxFiles: number;
  webTtlHours: number;
  maxWebCaptures: number;
  maxDatabaseBytes: number;
}
export const DEFAULT_MEMORY_SETTINGS: Readonly<MemorySettings> = Object.freeze({
  // Explicit caller consent is required; creating the service never opts a user in.
  memoryEnabled: false, exclusions: Object.freeze([] as string[]),
  journalRetentionDays: 30, maxFileBytes: 512 * 1024, maxFiles: 5000,
  webTtlHours: 24, maxWebCaptures: 200, maxDatabaseBytes: 256 * 1024 * 1024,
});

export type MemoryExclusion = 'secret_file' | 'user_rule' | 'binary' | 'too_large' |
  'generated' | 'secret_flagged' | 'unsafe_path' | 'file_limit' | 'unreadable';
export interface MemoryStatus {
  workspaceId: string | null;
  open: boolean;
  paused: boolean;
  scanning: boolean;
  files: number;
  indexedFiles: number;
  chunks: number;
  symbols: number;
  journalBytes: number;
  excludedFiles: number;
  journalRows: number;
  webCaptures: number;
  databaseBytes: number;
  overSizeCap: boolean;
  lastScanAt: number | null;
  searchMode: 'fts5' | 'fallback';
}

export interface MemoryRequest { workspaceId: string }
export interface MemoryBufferRequest extends MemoryRequest { sessionId: string; path: string; content: string }
export interface MemoryEditsRequest extends MemoryRequest { sessionId: string; batch: EditBatch }
export interface MemoryPauseRequest extends MemoryRequest { paused: boolean }
export interface MemoryPurgeRequest extends MemoryRequest { scope: PurgeScope }
export interface MemoryStatusEvent { workspaceId: string | null; result: IpcResult<MemoryStatus> }
export interface EngineBridge {
  beginBuffer(request: MemoryBufferRequest): Promise<IpcResult<MemoryStatus>>;
  memoryEdits(request: MemoryEditsRequest): void;
  openMemory(request: MemoryRequest): Promise<IpcResult<MemoryStatus>>;
  memoryStatus(request: MemoryRequest): Promise<IpcResult<MemoryStatus>>;
  pauseMemory(request: MemoryPauseRequest): Promise<IpcResult<MemoryStatus>>;
  purgeMemory(request: MemoryPurgeRequest): Promise<IpcResult<MemoryStatus>>;
  onMemoryStatus(listener: (event: MemoryStatusEvent) => void): () => void;
}
export interface ScanReport {
  scanned: number; updated: number; unchanged: number; excluded: number;
  deleted: number; errors: number; capped: boolean; cancelled: boolean;
}
export type PurgeScope = 'all' | 'web' | 'journal' | { path: string };
export type EditOrigin = 'typing' | 'paste' | 'ai_apply' | 'undo_redo' | 'external';
export interface EditDelta {
  path: string; offset: number; removedLen: number; inserted: string;
  origin: EditOrigin; ts: number;
}
export interface EditBatch {
  path: string; deltas: EditDelta[]; clientSeq: number; expectedBaseHash?: string;
}
export interface JournalRow {
  seq: number; path: string; ts: number; base_ver: number; offset: number;
  removed_len: number; removed_text: string | null; inserted: string;
  origin: EditOrigin; batch_id: number; post_hash: string | null;
}
export interface ContextManifest {
  totalChars: number; estTokens: number;
  blocks: { id: 'A'|'B'|'C'|'D'|'E'|'F'|'G'|'H'|'I'|'J'; type: string;
    source: string; lineStart?: number; lineEnd?: number; chars: number;
    hash: string; redacted: boolean; truncated: boolean }[];
  omitted: { id: string; reason: 'budget'|'excluded'|'secret'|'stale'|'none_found' }[];
}
