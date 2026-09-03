import type { IpcResult } from "../shared/workspace.ts";
import {
  OBSERVER_PROVIDERS,
  type ObserverAskResult,
  type ObserverOutcomeRequest,
  type ObserverRequest,
  type ObserverSuggestion,
} from "../shared/observer.ts";
import { parseStructuredObserverEdit } from "../shared/ai-edit.ts";
import { parseDocumentationEdit, validateDocumentationDraftRequest, type DocumentationDraftRequest } from "../shared/documentation-update.ts";

type FetchImplementation = typeof fetch;

function safeApiBaseUrl(value: string): string | null {
  try {
    const url = new URL(value);
    const local = url.hostname === "127.0.0.1" || url.hostname === "localhost";
    if ((url.protocol !== "https:" && !(local && url.protocol === "http:")) || url.username || url.password) {
      return null;
    }
    url.hash = "";
    url.search = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

function publicRequestError(error: unknown): string {
  if (error instanceof DOMException && error.name === "AbortError") {
    return "Observer timed out. Try again with a smaller context.";
  }
  const message = error instanceof Error ? error.message : "";
  if (/fetch|network|connect|resolve|enotfound|econnrefused/i.test(message)) {
    return "Unable to reach the Observer backend. Start or configure the Next.js server.";
  }
  return "Observer could not complete the request.";
}

function validSuggestion(value: unknown): ObserverSuggestion | null {
  if (typeof value !== "object" || value === null) return null;
  const suggestion = value as Partial<ObserverSuggestion>;
  if (
    (suggestion.id !== undefined && (typeof suggestion.id !== "string" || suggestion.id.length < 1 || suggestion.id.length > 128)) ||
    typeof suggestion.explanation !== "string" || suggestion.explanation.length < 1 || suggestion.explanation.length > 10_000 ||
    typeof suggestion.snippet !== "string" || suggestion.snippet.length > 50_000 ||
    typeof suggestion.reason !== "string" || suggestion.reason.length > 2_000
  ) return null;
  const edit = suggestion.edit === undefined ? undefined : parseStructuredObserverEdit(suggestion.edit);
  if (suggestion.edit !== undefined && !edit) return null;
  return { ...suggestion, ...(edit ? { edit } : {}) } as ObserverSuggestion;
}

export class ObserverApiClient {
  private readonly baseUrl: string | null;
  private readonly getAccessToken: () => Promise<string | null>;
  private readonly fetchImplementation: FetchImplementation;

  constructor(
    baseUrl: string,
    getAccessToken: () => Promise<string | null>,
    fetchImplementation: FetchImplementation = fetch
  ) {
    this.baseUrl = safeApiBaseUrl(baseUrl);
    this.getAccessToken = getAccessToken;
    this.fetchImplementation = fetchImplementation;
  }

  isConfigured(): boolean {
    return this.baseUrl !== null;
  }

  async ask(request: ObserverRequest): Promise<IpcResult<ObserverAskResult>> {
    if (!this.baseUrl) return { ok: false, error: "Observer backend is not configured." };
    const accessToken = await this.getAccessToken().catch(() => null);
    if (!accessToken) return { ok: false, error: "Sign in before asking Observer." };
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45_000);
    try {
      const response = await this.fetchImplementation(`${this.baseUrl}/api/suggest`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ ...request, client: "desktop" }),
        signal: controller.signal,
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const error = typeof payload === "object" && payload !== null &&
          typeof (payload as { error?: unknown }).error === "string"
          ? (payload as { error: string }).error
          : response.status === 401
            ? "Your desktop session is no longer valid. Sign in again."
            : "The Observer backend rejected the request.";
        return { ok: false, error };
      }
      if (typeof payload !== "object" || payload === null) {
        return { ok: false, error: "Observer returned an invalid response." };
      }
      const provider = (payload as { provider?: unknown }).provider;
      const suggestion = validSuggestion((payload as { suggestion?: unknown }).suggestion);
      if (!OBSERVER_PROVIDERS.includes(provider as ObserverAskResult["provider"]) || !suggestion) {
        return { ok: false, error: "Observer returned an invalid response." };
      }
      return { ok: true, value: { suggestion, provider: provider as ObserverAskResult["provider"] } };
    } catch (error) {
      return { ok: false, error: publicRequestError(error) };
    } finally {
      clearTimeout(timeout);
    }
  }

  async documentationDraft(request: DocumentationDraftRequest): Promise<IpcResult<{ edit: import("../shared/documentation-update.ts").StructuredDocumentationEdit; provider: ObserverAskResult["provider"] }>> {
    const safe = validateDocumentationDraftRequest(request);
    if (!safe || !this.baseUrl) return { ok: false, error: "Documentation update context is invalid or the backend is unavailable." };
    const accessToken = await this.getAccessToken().catch(() => null);
    if (!accessToken) return { ok: false, error: "Sign in before generating a documentation draft." };
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 45_000);
    try {
      const response = await this.fetchImplementation(`${this.baseUrl}/api/documentation-update`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` }, body: JSON.stringify(safe), signal: controller.signal });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) return { ok: false, error: typeof payload === "object" && payload !== null && typeof (payload as { error?: unknown }).error === "string" ? (payload as { error: string }).error : "The documentation backend rejected the request." };
      if (!payload || typeof payload !== "object") return { ok: false, error: "The documentation backend returned an invalid response." };
      const edit = parseDocumentationEdit((payload as { edit?: unknown }).edit); const provider = (payload as { provider?: unknown }).provider;
      if (!edit || !OBSERVER_PROVIDERS.includes(provider as ObserverAskResult["provider"])) return { ok: false, error: "The documentation backend returned a malformed edit." };
      return { ok: true, value: { edit, provider: provider as ObserverAskResult["provider"] } };
    } catch (error) { return { ok: false, error: publicRequestError(error) }; }
    finally { clearTimeout(timeout); }
  }

  async recordOutcome(request: ObserverOutcomeRequest): Promise<IpcResult<void>> {
    if (!this.baseUrl) return { ok: false, error: "Observer backend is not configured." };
    const accessToken = await this.getAccessToken().catch(() => null);
    if (!accessToken) return { ok: false, error: "Sign in before recording an Observer outcome." };
    try {
      const response = await this.fetchImplementation(
        `${this.baseUrl}/api/suggestions/${request.suggestionId}/outcome`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ outcome: request.outcome }),
        }
      );
      if (!response.ok) return { ok: false, error: "Could not record the Observer outcome." };
      return { ok: true, value: undefined };
    } catch {
      return { ok: false, error: "Could not record the Observer outcome." };
    }
  }
}
