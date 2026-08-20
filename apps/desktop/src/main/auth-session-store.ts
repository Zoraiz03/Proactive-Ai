import { chmod, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export interface StoredAuthSession {
  version: 1;
  accessToken: string;
  refreshToken: string;
}

export interface SessionEncryption {
  isAvailable: () => Promise<boolean>;
  encrypt: (plainText: string) => Promise<Buffer>;
  decrypt: (encrypted: Buffer) => Promise<{ value: string; shouldReEncrypt: boolean }>;
}

export class SessionStorageError extends Error {}

function validSession(value: unknown): value is StoredAuthSession {
  if (typeof value !== "object" || value === null) return false;
  const session = value as Partial<StoredAuthSession>;
  return session.version === 1 &&
    typeof session.accessToken === "string" && session.accessToken.length > 0 && session.accessToken.length <= 32_768 &&
    typeof session.refreshToken === "string" && session.refreshToken.length > 0 && session.refreshToken.length <= 8_192;
}

export class EncryptedAuthSessionStore {
  private readonly filePath: string;
  private readonly encryption: SessionEncryption;

  constructor(
    filePath: string,
    encryption: SessionEncryption
  ) {
    this.filePath = filePath;
    this.encryption = encryption;
  }

  async ensureAvailable(): Promise<void> {
    if (!(await this.encryption.isAvailable())) {
      throw new SessionStorageError("Secure operating-system session storage is unavailable.");
    }
  }

  async load(): Promise<StoredAuthSession | null> {
    await this.ensureAvailable();
    let encrypted: Buffer;
    try {
      encrypted = await readFile(this.filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw new SessionStorageError("The encrypted desktop session could not be read.");
    }

    let decrypted: { value: string; shouldReEncrypt: boolean };
    try {
      decrypted = await this.encryption.decrypt(encrypted);
    } catch {
      throw new SessionStorageError("The encrypted desktop session could not be decrypted.");
    }
    try {
      const parsed: unknown = JSON.parse(decrypted.value);
      if (!validSession(parsed)) throw new Error("Invalid session data.");
      if (decrypted.shouldReEncrypt) await this.save(parsed);
      return parsed;
    } catch {
      await this.clear();
      return null;
    }
  }

  async save(session: StoredAuthSession): Promise<void> {
    await this.ensureAvailable();
    if (!validSession(session)) throw new SessionStorageError("The desktop session is invalid.");
    try {
      const encrypted = await this.encryption.encrypt(JSON.stringify(session));
      await mkdir(dirname(this.filePath), { recursive: true, mode: 0o700 });
      await writeFile(this.filePath, encrypted, { mode: 0o600 });
      await chmod(this.filePath, 0o600).catch(() => undefined);
    } catch {
      throw new SessionStorageError("The encrypted desktop session could not be saved.");
    }
  }

  async clear(): Promise<void> {
    try {
      await unlink(this.filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw new SessionStorageError("The encrypted desktop session could not be removed.");
      }
    }
  }
}
