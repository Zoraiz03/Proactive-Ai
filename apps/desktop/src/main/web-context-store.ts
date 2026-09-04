import { chmod, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { SessionEncryption } from "./auth-session-store";

export interface StoredWebContextPairing { version: 1; enabled: boolean; token: string; origin: string; deviceName: string; createdAt: number }

const valid = (value: unknown): value is StoredWebContextPairing => {
  const item = value as Partial<StoredWebContextPairing> | null;
  return Boolean(item && item.version === 1 && item.enabled === true && typeof item.token === "string" && /^[A-Za-z0-9_-]{43}$/.test(item.token) &&
    typeof item.origin === "string" && /^chrome-extension:\/\/[a-p]{32}$/.test(item.origin) && typeof item.deviceName === "string" && item.deviceName.length <= 80 && Number.isInteger(item.createdAt));
};

export class EncryptedWebContextStore {
  private readonly filePath: string;
  private readonly encryption: SessionEncryption;
  constructor(filePath: string, encryption: SessionEncryption) { this.filePath = filePath; this.encryption = encryption; }
  async available() { return this.encryption.isAvailable(); }
  async load(): Promise<StoredWebContextPairing | null> {
    if (!(await this.available())) return null;
    try {
      const decrypted = await this.encryption.decrypt(await readFile(this.filePath));
      const parsed: unknown = JSON.parse(decrypted.value);
      if (!valid(parsed)) { await this.clear(); return null; }
      if (decrypted.shouldReEncrypt) await this.save(parsed);
      return parsed;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") await this.clear().catch(() => undefined);
      return null;
    }
  }
  async save(value: StoredWebContextPairing) {
    if (!valid(value) || !(await this.available())) throw new Error("Secure operating-system storage is unavailable.");
    await mkdir(dirname(this.filePath), { recursive: true, mode: 0o700 });
    await writeFile(this.filePath, await this.encryption.encrypt(JSON.stringify(value)), { mode: 0o600 });
    await chmod(this.filePath, 0o600).catch(() => undefined);
  }
  async clear() { try { await unlink(this.filePath); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; } }
}
