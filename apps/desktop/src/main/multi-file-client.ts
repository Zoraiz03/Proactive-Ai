import type { IpcResult } from "../shared/workspace.ts";
import { OBSERVER_PROVIDERS } from "../shared/observer.ts";
import { parseMultiFilePlan, validateMultiFileChangeSet, type MultiFileGenerateRequest, type MultiFileOutcomeRequest, type MultiFilePlanRequest } from "../shared/multi-file-change.ts";

function safeBaseUrl(value: string): string | null {
  try { const url = new URL(value); const local = ["localhost", "127.0.0.1"].includes(url.hostname); if ((url.protocol !== "https:" && !(local && url.protocol === "http:")) || url.username || url.password) return null; return url.toString().replace(/\/$/, ""); } catch { return null; }
}

export class MultiFileApiClient {
  private readonly baseUrl: string | null;
  private readonly getAccessToken: () => Promise<string | null>;
  private readonly fetchImplementation: typeof fetch;
  constructor(baseUrl: string, getAccessToken: () => Promise<string | null>, fetchImplementation: typeof fetch = fetch) { this.baseUrl = safeBaseUrl(baseUrl); this.getAccessToken = getAccessToken; this.fetchImplementation = fetchImplementation; }
  private async request(body: Record<string, unknown>): Promise<IpcResult<unknown>> {
    if (!this.baseUrl) return { ok: false, error: "Observer backend is not configured." };
    const token = await this.getAccessToken().catch(() => null); if (!token) return { ok: false, error: "Sign in before using multi-file Observer." };
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 90_000);
    try {
      const response = await this.fetchImplementation(`${this.baseUrl}/api/multi-file-change`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ client: "desktop", ...body }), signal: controller.signal });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) return { ok: false, error: payload && typeof payload === "object" && typeof (payload as { error?: unknown }).error === "string" ? (payload as { error: string }).error : response.status === 401 ? "Your desktop session is no longer valid." : "The multi-file Observer request failed." };
      return { ok: true, value: payload };
    } catch (error) { return { ok: false, error: error instanceof DOMException && error.name === "AbortError" ? "The multi-file Observer request timed out." : "Unable to reach the Observer backend." }; }
    finally { clearTimeout(timeout); }
  }
  async plan(request: MultiFilePlanRequest) {
    const result = await this.request({ ...request, phase: "plan" }); if (!result.ok) return result;
    const payload = result.value as { plan?: unknown; provider?: unknown }; const plan = parseMultiFilePlan(payload?.plan, request.limits);
    return plan && OBSERVER_PROVIDERS.includes(payload.provider as never) ? { ok: true as const, value: { plan, provider: payload.provider as typeof request.provider } } : { ok: false as const, error: "Observer returned an invalid plan." };
  }
  async generate(request: MultiFileGenerateRequest) {
    const result = await this.request({ ...request, phase: "generate" }); if (!result.ok) return result;
    const payload = result.value as { changeSet?: unknown; provider?: unknown }; const changeSet = validateMultiFileChangeSet(payload?.changeSet, request.plan, request.fileBases, request.limits);
    return changeSet && OBSERVER_PROVIDERS.includes(payload.provider as never) ? { ok: true as const, value: { changeSet, provider: payload.provider as typeof request.provider } } : { ok: false as const, error: "Observer returned an invalid change set." };
  }
  async outcome(request: MultiFileOutcomeRequest): Promise<IpcResult<void>> { const result = await this.request({ ...request, outcomePhase: request.phase, phase: "outcome" }); return result.ok ? { ok: true, value: undefined } : result; }
}
