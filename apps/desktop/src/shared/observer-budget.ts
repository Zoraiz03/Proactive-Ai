/** Transport ceiling is independent of the user's (possibly smaller) Privacy budget.
 * Model limits are conservative envelopes; UTF-8 bytes upper-bound text tokens.
 * The actual serialized prompt is checked again on the server, including JSON overhead.
 */
export const OBSERVER_CONTEXT_CHARACTERS = 50_000;
export const OBSERVER_MODELS = {
  gemini: { model: 'gemini-3.5-flash', contextTokens: 1_048_576, outputTokens: 8192 },
  openai: { model: 'gpt-4o-mini', contextTokens: 128_000, outputTokens: 8192 },
  deepseek: { model: 'deepseek-chat', contextTokens: 64_000, outputTokens: 8192 },
  anthropic: { model: 'claude-haiku-4-5-20251001', contextTokens: 200_000, outputTokens: 8192 },
  demo: { model: 'demo-local', contextTokens: 128_000, outputTokens: 8192 },
} as const;
export function observerInputBudget(provider: keyof typeof OBSERVER_MODELS, privacyCharacters = OBSERVER_CONTEXT_CHARACTERS) {
  const model = OBSERVER_MODELS[provider];
  // Plan at one token per character (conservative for ordinary ASCII code).
  // The server checks actual UTF-8 prompt bytes before any provider request.
  return Math.min(privacyCharacters, OBSERVER_CONTEXT_CHARACTERS, Math.floor((model.contextTokens - model.outputTokens - 4096)));
}
export function assertObserverPromptBudget(provider: keyof typeof OBSERVER_MODELS, prompt: string) {
  const model = OBSERVER_MODELS[provider];
  if (new TextEncoder().encode(prompt).length + model.outputTokens + 4096 > model.contextTokens)
    throw new Error('Blocked before provider send: serialized context exceeds the configured model budget. Select less context.');
}
/** Never accept arbitrary error strings, paths, code, or credentials in telemetry. */
export function observerTelemetry(stage: string, elapsedMs: number, context?: {totalCharacters: number; items: {type: string; content: string}[]; omitted: {reason: string}[]}, traceId?: string) {
  console.info('[observer-timing]', JSON.stringify({stage, ...(traceId ? {traceId} : {}), elapsedMs: Math.round(elapsedMs), ...(context ? {
    contextCharacters: context.totalCharacters, itemSizes: context.items.map(i => ({type:i.type, characters:i.content.length})),
    omissions: context.omitted.map(i => /stale|unavailable/i.test(i.reason) ? 'unavailable_or_stale' : /secret|unsafe|excluded/i.test(i.reason) ? 'privacy' : /count/i.test(i.reason) ? 'file_count' : /confirm/i.test(i.reason) ? 'consent' : /budget|limit|truncat/i.test(i.reason) ? 'budget' : 'other'),
  } : {})}));
}
