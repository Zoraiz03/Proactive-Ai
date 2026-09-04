import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

interface StoredCheckpoint {
  id: string;
  workspaceId: string;
  relativePath: string;
  previousContent: string;
  previousContentHash: string;
  appliedContentHash: string;
  suggestionId?: string;
  createdAt: number;
}

const HASH = /^[a-f0-9]{64}$/;
const safePath = (value: string) => value.length > 0 && value.length <= 4096 && !value.startsWith("/") && !value.includes("\0") && !value.split(/[\\/]/).includes("..");

export class CheckpointStore {
  private readonly filePath: string;

  constructor(userDataPath: string) {
    this.filePath = join(userDataPath, "observer-checkpoints", "checkpoints.json");
  }

  private async read(): Promise<StoredCheckpoint[]> {
    try {
      const parsed = JSON.parse(await readFile(this.filePath, "utf8"));
      return Array.isArray(parsed) ? parsed.filter((item): item is StoredCheckpoint =>
        item && typeof item === "object" && typeof item.id === "string" && HASH.test(item.workspaceId) &&
        safePath(item.relativePath) && typeof item.previousContent === "string" && item.previousContent.length <= 2 * 1024 * 1024 &&
        HASH.test(item.previousContentHash) && HASH.test(item.appliedContentHash) && Number.isFinite(item.createdAt)
      ) : [];
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      return [];
    }
  }

  private async write(items: StoredCheckpoint[]): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true, mode: 0o700 });
    const temporary = `${this.filePath}.tmp`;
    await writeFile(temporary, JSON.stringify(items), { encoding: "utf8", mode: 0o600 });
    await rename(temporary, this.filePath);
  }

  async create(input: Omit<StoredCheckpoint, "id" | "createdAt">, retentionLimit: number) {
    if (!HASH.test(input.workspaceId) || !safePath(input.relativePath) || !HASH.test(input.previousContentHash) ||
      !HASH.test(input.appliedContentHash) || input.previousContent.length > 2 * 1024 * 1024 ||
      !Number.isInteger(retentionLimit) || retentionLimit < 1 || retentionLimit > 100 ||
      (input.suggestionId !== undefined && (typeof input.suggestionId !== "string" || input.suggestionId.length > 128))) throw new Error("Invalid checkpoint data.");
    const createdAt = Date.now();
    const checkpoint: StoredCheckpoint = { ...input, id: crypto.randomUUID(), createdAt };
    const limit = Math.max(1, Math.min(100, Math.trunc(retentionLimit)));
    const items = [checkpoint, ...(await this.read())].sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
    await this.write(items);
    return { createdAt };
  }

  async restore(workspaceId: string, relativePath: string, currentContentHash: string) {
    const items = await this.read();
    const checkpoint = items.find((item) => item.workspaceId === workspaceId && item.relativePath === relativePath);
    if (!checkpoint) throw new Error("No Observer checkpoint is available for this file.");
    if (checkpoint.appliedContentHash !== currentContentHash) throw new Error("The file changed after the Observer edit, so the checkpoint cannot be safely restored.");
    await this.write(items.filter((item) => item.id !== checkpoint.id));
    return { previousContent: checkpoint.previousContent, previousContentHash: checkpoint.previousContentHash, createdAt: checkpoint.createdAt };
  }

  async clear() {
    await rm(dirname(this.filePath), { recursive: true, force: true });
  }
}
