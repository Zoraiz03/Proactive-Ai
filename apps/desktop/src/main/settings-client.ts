import type { ObserverProvider } from "../shared/observer.ts";
import {
  normalizeSyncedSettings,
  type ProviderStatus,
  type SaveApiKeyRequest,
  type SyncedSettings,
} from "../shared/settings.ts";
import type { IpcResult } from "../shared/workspace.ts";

type FetchImplementation = typeof fetch;

function safeBaseUrl(value: string): string | null {
  try {
    const url = new URL(value);
    const local = ["localhost", "127.0.0.1"].includes(url.hostname);
    if ((url.protocol !== "https:" && !(local && url.protocol === "http:")) || url.username || url.password) return null;
    return url.toString().replace(/\/$/, "");
  } catch { return null; }
}

export class SettingsApiClient {
  private readonly baseUrl: string | null;
  private readonly getAccessToken: () => Promise<string | null>;
  private readonly fetchImplementation: FetchImplementation;
  constructor(
    baseUrl: string,
    getAccessToken: () => Promise<string | null>,
    fetchImplementation: FetchImplementation = fetch
  ) {
    this.baseUrl = safeBaseUrl(baseUrl);
    this.getAccessToken = getAccessToken;
    this.fetchImplementation = fetchImplementation;
  }

  private async request(path: string, init?: RequestInit): Promise<IpcResult<unknown>> {
    if (!this.baseUrl) return { ok: false, error: "Settings backend is not configured." };
    const token = await this.getAccessToken().catch(() => null);
    if (!token) return { ok: false, error: "Sign in to manage synced settings." };
    try {
      const response = await this.fetchImplementation(`${this.baseUrl}${path}`, {
        ...init,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...init?.headers },
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message = typeof payload === "object" && payload && typeof (payload as { error?: unknown }).error === "string"
          ? (payload as { error: string }).error : response.status === 401 ? "Your session is no longer valid." : "Settings request failed.";
        return { ok: false, error: message };
      }
      return { ok: true, value: payload };
    } catch { return { ok: false, error: "Unable to reach the settings service." }; }
  }

  async getSynced(): Promise<IpcResult<SyncedSettings>> {
    const result = await this.request("/api/desktop-settings");
    if (!result.ok) return result;
    const settings = (result.value as { settings?: unknown } | null)?.settings;
    return settings ? { ok: true, value: normalizeSyncedSettings(settings) } : { ok: false, error: "Settings service returned invalid data." };
  }

  async updateSynced(settings: SyncedSettings): Promise<IpcResult<SyncedSettings>> {
    const result = await this.request("/api/desktop-settings", { method: "PUT", body: JSON.stringify({ settings }) });
    if (!result.ok) return result;
    return { ok: true, value: normalizeSyncedSettings((result.value as { settings?: unknown } | null)?.settings) };
  }

  async providerStatus(): Promise<IpcResult<ProviderStatus[]>> {
    const result = await this.request("/api/desktop-settings/providers");
    if (!result.ok) return result;
    const providers = (result.value as { providers?: unknown } | null)?.providers;
    if (!Array.isArray(providers)) return { ok: false, error: "Provider service returned invalid data." };
    const safe = providers.filter((item): item is ProviderStatus => {
      if (!item || typeof item !== "object") return false;
      const candidate = item as Partial<ProviderStatus>;
      return typeof candidate.provider === "string" && typeof candidate.label === "string" &&
        Array.isArray(candidate.models) && candidate.models.every((model) => typeof model === "string") &&
        typeof candidate.systemProvided === "boolean" && typeof candidate.userKeyConfigured === "boolean" &&
        typeof candidate.available === "boolean" && !("apiKey" in item) && !("encrypted_key" in item);
    });
    return safe.length === providers.length ? { ok: true, value: safe } : { ok: false, error: "Provider service returned unsafe data." };
  }

  async saveApiKey(request: SaveApiKeyRequest): Promise<IpcResult<void>> {
    const result = await this.request(`/api/keys/${request.provider}`, { method: "PUT", body: JSON.stringify({ apiKey: request.apiKey, verify: request.verify }) });
    return result.ok ? { ok: true, value: undefined } : result;
  }

  async deleteApiKey(provider: Exclude<ObserverProvider, "demo">): Promise<IpcResult<void>> {
    const result = await this.request(`/api/keys/${provider}`, { method: "DELETE" });
    return result.ok ? { ok: true, value: undefined } : result;
  }

}
