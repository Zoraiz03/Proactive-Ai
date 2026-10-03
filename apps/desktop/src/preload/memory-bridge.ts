import { ENGINE_CHANNELS, type EngineBridge, type MemoryStatusEvent, type MemoryRequest,
  type MemoryPauseRequest, type MemoryPurgeRequest, type MemoryStatus, type MemoryBufferRequest, type MemoryEditsRequest } from '../shared/observer-engine.ts';
import type { IpcResult } from '../shared/workspace';
import type { ContextManifest } from '../shared/observer-engine';
import type { ContextSeed } from '../shared/engine-context';

export function createMemoryBridge(transport: {
  invoke: (channel: string, request: unknown) => Promise<IpcResult<MemoryStatus>>;
  send: (channel: string, request: unknown) => void;
  preview: (channel: string, request: ContextSeed) => Promise<IpcResult<ContextManifest>>;
  subscribe: (channel: string, listener: (event: MemoryStatusEvent) => void) => () => void;
}): EngineBridge {
  return Object.freeze({
    memoryContext: (request: ContextSeed) => transport.preview(ENGINE_CHANNELS.memoryContext,request),
    beginBuffer: (request: MemoryBufferRequest) => transport.invoke(ENGINE_CHANNELS.memoryBuffer, request),
    memoryEdits: (request: MemoryEditsRequest) => transport.send(ENGINE_CHANNELS.memoryEdits, request),
    openMemory: (request: MemoryRequest) => transport.invoke(ENGINE_CHANNELS.memoryOpen, request),
    memoryStatus: (request: MemoryRequest) => transport.invoke(ENGINE_CHANNELS.memoryStatus, request),
    pauseMemory: (request: MemoryPauseRequest) => transport.invoke(ENGINE_CHANNELS.memoryPause, request),
    purgeMemory: (request: MemoryPurgeRequest) => transport.invoke(ENGINE_CHANNELS.memoryPurge, request),
    onMemoryStatus: (listener: (event: MemoryStatusEvent) => void) => transport.subscribe(ENGINE_CHANNELS.memoryStatus, listener),
  });
}
