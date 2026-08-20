"use client";

import type { StuckDetectionConfig } from "@/lib/stuck-config";
import type { StuckMetadata } from "@/lib/stuck-detectors";

// The API now lives in same-origin Next.js route handlers (/api/*),
// so requests are relative — no external base URL needed.

export type Provider = "gemini" | "deepseek" | "openai" | "anthropic" | "demo";

export const PROVIDER_LABELS: Record<Provider, string> = {
  gemini: "Gemini — free",
  deepseek: "DeepSeek — your key",
  openai: "ChatGPT — your key",
  anthropic: "Claude — your key",
  demo: "Demo — offline",
};

export interface Suggestion {
  id: string;
  explanation: string;
  snippet: string;
  reason: string;
}

export interface SuggestResult {
  suggestion?: Suggestion;
  error?: string;
  needsKey?: boolean;
}

export interface StuckSettingsResult {
  config: StuckDetectionConfig;
  proactiveHelpEnabled: boolean;
}

export async function fetchSuggestion(body: {
  provider: Provider;
  fileName: string;
  kind: "code" | "doc";
  content: string;
  stuck?: StuckMetadata;
}): Promise<SuggestResult> {
  try {
    const res = await fetch(`/api/suggest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      return { error: data.error, needsKey: Boolean(data.needsKey) };
    }
    return { suggestion: data.suggestion };
  } catch {
    return { error: "Cannot reach the server. Is the backend running?" };
  }
}

export async function fetchStuckSettings(): Promise<StuckSettingsResult | null> {
  try {
    const res = await fetch("/api/stuck-settings");
    if (!res.ok) return null;
    const data = await res.json();
    return {
      config: data.config as StuckDetectionConfig,
      proactiveHelpEnabled: data.proactiveHelpEnabled !== false,
    };
  } catch {
    return null;
  }
}

export async function saveProactiveHelpEnabled(enabled: boolean): Promise<boolean> {
  try {
    const res = await fetch("/api/stuck-settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ proactiveHelpEnabled: enabled }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function recordSuggestionOutcome(
  suggestionId: string,
  outcome: "accepted" | "dismissed"
): Promise<StuckDetectionConfig | null> {
  try {
    const res = await fetch(`/api/suggestions/${suggestionId}/outcome`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ outcome }),
      keepalive: true,
    });
    if (!res.ok) return null;
    return ((await res.json()).config as StuckDetectionConfig | null) ?? null;
  } catch {
    // Outcome persistence must never delay or block the editor interaction.
    return null;
  }
}

export async function saveApiKey(
  provider: Provider,
  apiKey: string
): Promise<string | null> {
  try {
    const res = await fetch(`/api/keys/${provider}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey }),
    });
    if (!res.ok) return (await res.json()).error ?? "Could not save the key.";
    return null;
  } catch {
    return "Cannot reach the server.";
  }
}
