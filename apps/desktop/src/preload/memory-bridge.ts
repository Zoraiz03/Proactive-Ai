import { ENGINE_CHANNELS, type EngineBridge, type MemoryStatusEvent, type MemoryRequest,
  type MemoryPauseRequest, type MemoryPurgeRequest, type MemoryStatus } from '../shared/observer-engine.ts';
import type { IpcResult } from '../shared/workspace';

export function createMemoryBridge(transport: {
  invoke: (channel: string, request: unknown) => Promise<IpcResult<MemoryStatus>>;
  subscribe: (channel: string, listener: (event: MemoryStatusEvent) => void) => () => void;
}): EngineBridge {
  return Object.freeze({
    openMemory: (request: MemoryRequest) => transport.invoke(ENGINE_CHANNELS.memoryOpen, request),
    memoryStatus: (request: MemoryRequest) => transport.invoke(ENGINE_CHANNELS.memoryStatus, request),
    pauseMemory: (request: MemoryPauseRequest) => transport.invoke(ENGINE_CHANNELS.memoryPause, request),
    purgeMemory: (request: MemoryPurgeRequest) => transport.invoke(ENGINE_CHANNELS.memoryPurge, request),
    onMemoryStatus: (listener: (event: MemoryStatusEvent) => void) => transport.subscribe(ENGINE_CHANNELS.memoryStatus, listener),
  });
}
