import type { Provider } from "./providers";

export async function verifyProviderApiKey(
  provider: Exclude<Provider, "demo">,
  apiKey: string,
  fetchImplementation: typeof fetch = fetch
): Promise<boolean> {
  const config: { url: string; headers: Record<string, string> } = {
    gemini: { url: "https://generativelanguage.googleapis.com/v1beta/models", headers: { "x-goog-api-key": apiKey } },
    openai: { url: "https://api.openai.com/v1/models", headers: { Authorization: `Bearer ${apiKey}` } },
    deepseek: { url: "https://api.deepseek.com/models", headers: { Authorization: `Bearer ${apiKey}` } },
    anthropic: { url: "https://api.anthropic.com/v1/models", headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" } },
  }[provider];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetchImplementation(config.url, { method: "GET", headers: config.headers, signal: controller.signal });
    return response.ok;
  } finally { clearTimeout(timeout); }
}
