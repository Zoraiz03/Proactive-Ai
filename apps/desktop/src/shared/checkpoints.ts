import type { IpcResult } from "./workspace";

export const CHECKPOINT_CHANNELS = {
  create: "checkpoints:create",
  restore: "checkpoints:restore",
  clear: "checkpoints:clear",
} as const;

export interface CreateCheckpointRequest {
  workspaceId: string;
  relativePath: string;
  previousContent: string;
  previousContentHash: string;
  appliedContentHash: string;
  suggestionId?: string;
  retentionLimit: number;
}

export interface RestoreCheckpointRequest {
  workspaceId: string;
  relativePath: string;
  currentContentHash: string;
}

export interface RestoredCheckpoint {
  previousContent: string;
  previousContentHash: string;
  createdAt: number;
}

export interface CheckpointBridge {
  create: (request: CreateCheckpointRequest) => Promise<IpcResult<{ createdAt: number }>>;
  restore: (request: RestoreCheckpointRequest) => Promise<IpcResult<RestoredCheckpoint>>;
  clear: () => Promise<IpcResult<void>>;
}
