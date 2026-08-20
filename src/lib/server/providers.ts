// One entry point per AI provider. Every provider returns
// { explanation, snippet, reason } — the shape the observer panel renders.
// SERVER-ONLY: imported from Route Handlers, never from client code.

import type { EditorRequestContext } from "@/lib/manual-suggestion";

export type Provider =
  | "gemini"
  | "openai"
  | "deepseek"
  | "anthropic"
  | "demo";

export interface SuggestContext {
  fileName: string;
  kind: "code" | "doc";
  content: string;
  context: EditorRequestContext;
}

export interface Suggestion {
  explanation: string;
  snippet: string;
  reason: string;
}

export class ProviderError extends Error {
  userMessage: string;
  needsKey: boolean;
  constructor(message: string, userMessage: string, needsKey = false) {
    super(message);
    this.userMessage = userMessage;
    this.needsKey = needsKey;
  }
}

function buildPrompt(ctx: SuggestContext) {
  const { fileName, kind, content, context } = ctx;
  const target =
    kind === "code" ? `the code file "${fileName}"` : `the document "${fileName}"`;
  const focus = context.selectedText
    ? `The user selected this text and wants it prioritized:\n${context.selectedText}`
    : kind === "code"
      ? `The cursor is on line ${context.cursorLine ?? "unknown"}. Nearby code:\n${context.nearbyContent ?? "(unavailable)"}`
      : "No text is selected, so review the complete document.";
  const reason = `You asked the Observer to review this ${kind}.`;
  return `You are the observer in Proactive AI Workspace. The user explicitly clicked Ask Observer while working on ${target}. Review the requested context and offer ONE concise, high-value suggestion — an improvement, fix, continuation, or next step. Do not imply that background monitoring or stuck detection triggered this request.

${focus}

Respond with JSON only: {"explanation": "<1-3 sentences on what you suggest and why>", "snippet": "<the exact ${kind === "code" ? "code" : "text"} to insert, or an empty string if the suggestion is advice only>", "reason": "${reason}"}
The snippet must preserve real line breaks (escaped as \\n in the JSON string) and indentation exactly as they should appear in the editor.

Current content:
${content}`;
}

function parseModelJson(text: string, fallbackReason: string): Suggestion {
  try {
    const parsed = JSON.parse(text);
    let snippet = String(parsed.snippet ?? "");
    // Some models double-escape line breaks, leaving literal "\n" text.
    if (!snippet.includes("\n") && snippet.includes("\\n")) {
      snippet = snippet.replace(/\\t/g, "\t").replace(/\\n/g, "\n");
    }
    return {
      explanation: String(parsed.explanation ?? "").trim(),
      snippet,
      reason: fallbackReason,
    };
  } catch {
    return {
      explanation: text.trim(),
      snippet: "",
      reason: fallbackReason,
    };
  }
}

function providerError(status: number, provider: string, body = ""): ProviderError {
  if (status === 400 && /api.?key/i.test(body)) {
    return new ProviderError(
      `${provider} HTTP ${status}`,
      `Your ${provider} API key was rejected. Check it and try again.`,
      true
    );
  }
  if (status === 401 || status === 403) {
    return new ProviderError(
      `${provider} HTTP ${status}`,
      `Your ${provider} API key was rejected. Check it and try again.`,
      true
    );
  }
  if (status === 429) {
    return new ProviderError(
      `${provider} HTTP ${status}`,
      `${provider} rate limit reached. Wait for the reset, switch models, or add your own API key.`,
      true
    );
  }
  return new ProviderError(
    `${provider} HTTP ${status}`,
    `The ${provider} request failed. Try again.`
  );
}

async function suggestWithGemini(apiKey: string, ctx: SuggestContext) {
  const fallbackReason = `You asked the Observer to review this ${ctx.kind}.`;
  const res = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [
          { parts: [{ text: buildPrompt(ctx) }] },
        ],
        generationConfig: { responseMimeType: "application/json" },
      }),
    }
  );
  if (!res.ok) throw providerError(res.status, "Gemini", await res.text());
  const data = await res.json();
  return parseModelJson(
    data.candidates?.[0]?.content?.parts?.[0]?.text ?? "",
    fallbackReason
  );
}

async function suggestWithOpenAICompatible(
  apiKey: string,
  ctx: SuggestContext,
  { baseUrl, model, label }: { baseUrl: string; model: string; label: string }
) {
  const fallbackReason = `You asked the Observer to review this ${ctx.kind}.`;
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "user", content: buildPrompt(ctx) },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) throw providerError(res.status, label, await res.text());
  const data = await res.json();
  return parseModelJson(
    data.choices?.[0]?.message?.content ?? "",
    fallbackReason
  );
}

async function suggestWithAnthropic(apiKey: string, ctx: SuggestContext) {
  const fallbackReason = `You asked the Observer to review this ${ctx.kind}.`;
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      messages: [
        { role: "user", content: buildPrompt(ctx) },
      ],
    }),
  });
  if (!res.ok) throw providerError(res.status, "Claude", await res.text());
  const data = await res.json();
  return parseModelJson(data.content?.[0]?.text ?? "", fallbackReason);
}

function suggestWithDemo(ctx: SuggestContext): Suggestion {
  if (ctx.kind === "code") {
    return {
      explanation:
        "Demo suggestion: your recursive function recomputes the same values many times. Memoization makes it linear time.",
      snippet:
        "from functools import lru_cache\n\n@lru_cache(maxsize=None)\ndef fibonacci_fast(n):\n    if n <= 1:\n        return n\n    return fibonacci_fast(n-1) + fibonacci_fast(n-2)",
      reason: "You asked the Observer to review this code.",
    };
  }
  return {
    explanation:
      "Demo suggestion: consider closing this section with a sentence that tells the reader what happens next.",
    snippet:
      "In the next section, we outline the steps required to put this plan into action.",
    reason: "You asked the Observer to review this document.",
  };
}

export async function getSuggestion(
  provider: Provider,
  apiKey: string | null,
  ctx: SuggestContext
): Promise<Suggestion> {
  switch (provider) {
    case "gemini":
      return suggestWithGemini(apiKey!, ctx);
    case "deepseek":
      return suggestWithOpenAICompatible(apiKey!, ctx, {
        baseUrl: "https://api.deepseek.com",
        model: "deepseek-chat",
        label: "DeepSeek",
      });
    case "openai":
      return suggestWithOpenAICompatible(apiKey!, ctx, {
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-4o-mini",
        label: "ChatGPT",
      });
    case "anthropic":
      return suggestWithAnthropic(apiKey!, ctx);
    case "demo":
      return suggestWithDemo(ctx);
    default:
      throw new ProviderError("unknown provider", "Unknown AI provider.");
  }
}
