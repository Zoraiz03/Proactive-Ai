import { ENGINE_CHANNELS, type EngineBridge, type MemoryStatusEvent, type MemoryRequest,
  type MemoryPauseRequest, type MemoryPurgeRequest, type MemoryStatus, type MemoryBufferRequest, type MemoryEditsRequest } from '../shared/observer-engine.ts';
import type { IpcResult } from '../shared/workspace';

export function createMemoryBridge(transport: {
  invoke: (channel: string, request: unknown) => Promise<IpcResult<MemoryStatus>>;
  send: (channel: string, request: unknown) => void;
  subscribe: (channel: string, listener: (event: MemoryStatusEvent) => void) => () => void;
}): EngineBridge {
  return Object.freeze({
    beginBuffer: (request: MemoryBufferRequest) => transport.invoke(ENGINE_CHANNELS.memoryBuffer, request),
    memoryEdits: (request: MemoryEditsRequest) => transport.send(ENGINE_CHANNELS.memoryEdits, request),
    openMemory: (request: MemoryRequest) => transport.invoke(ENGINE_CHANNELS.memoryOpen, request),
    memoryStatus: (request: MemoryRequest) => transport.invoke(ENGINE_CHANNELS.memoryStatus, request),
    pauseMemory: (request: MemoryPauseRequest) => transport.invoke(ENGINE_CHANNELS.memoryPause, request),
    purgeMemory: (request: MemoryPurgeRequest) => transport.invoke(ENGINE_CHANNELS.memoryPurge, request),
    onMemoryStatus: (listener: (event: MemoryStatusEvent) => void) => transport.subscribe(ENGINE_CHANNELS.memoryStatus, listener),
  });
}
