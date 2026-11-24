import type { ProjectContextPackage } from './project-context.ts';
import type { ExplanationInput } from './explanation.ts';
import { EXPLANATION_LIMITS } from './explanation.ts';

type ExplainContext = Pick<ProjectContextPackage, 'activeFile' | 'cursor' | 'items' | 'limits'> & {intent:{mode:string;instruction:string}};

// Application ceilings, not model capacities. No setting is raised automatically.
export const EXPLAIN_BUDGET = { maximumCodeCharacters: 20000, contextTokens: 64000, framingTokens: 4096 } as const;
// Official capacity references and alias caveats: docs/CONTEXT_PIPELINE_AUDIT.md.
export const EXPLAIN_MODELS = {
 openai: { model: 'gpt-4o-mini', context: 128000, output: 16384 },
 gemini: { model: 'gemini-2.5-flash', context: 1048576, output: 65536 },
 anthropic: { model: 'claude-haiku-4-5-20251001', context: 200000, output: 64000 },
 // Discontinued 2026-07-24 per official changelog. No guessed capacity or silent migration.
 deepseek: { model: 'deepseek-chat', context: 0, output: 0 },
 demo: { model: 'demo-local', context: 64000, output: 6000 },
} as const;
export type ExplainProvider = keyof typeof EXPLAIN_MODELS;
// UTF-8 bytes are a deliberately conservative token estimate, not characters = tokens.
export const estimateExplainTokens = (text: string) => new TextEncoder().encode(text).length;
export function initialExplanationInput(context: ExplainContext): ExplanationInput {
 const question = context.intent.instruction.replace(/^Explain:\s*/, '');
 return { question: question === 'Explain' ? 'Explain this code.' : question, messages: [] };
}
export function explanationData(context: ExplainContext, input: ExplanationInput) {
 return JSON.stringify({ fileName: context.activeFile.fileName, cursor: context.cursor, items: context.items, priorMessages: input.messages });
}
export function explanationBudget(context: ExplainContext, input = initialExplanationInput(context), provider: ExplainProvider = 'demo', model?: string) {
 const capacity = EXPLAIN_MODELS[provider];
 const characters = context.items.reduce((n,i) => n+i.content.length,0) + input.question.length + input.messages.reduce((n,m)=>n+m.content.length,0);
 const characterLimit = Math.min(context.limits.maximumTotalCharacters, EXPLANATION_LIMITS.contextCharacters);
 const codeLimit = Math.min(context.limits.maximumCharactersPerFile, EXPLAIN_BUDGET.maximumCodeCharacters);
 const inputTokens = estimateExplainTokens(explanationData(context,input)) + estimateExplainTokens(JSON.stringify(input.question)) + EXPLAIN_BUDGET.framingTokens;
 const totalTokens = inputTokens + EXPLANATION_LIMITS.outputTokens;
 const tokenLimit = Math.min(capacity?.context ?? 0, EXPLAIN_BUDGET.contextTokens);
 let error: string | null = null;
 if (provider === 'deepseek') error = 'Manual Explain cannot use the configured deepseek-chat model: its published support ended on 2026-07-24. Choose OpenAI, Gemini, Anthropic or Demo for Explain. No code was sent; no model was changed automatically.';
 else if (!capacity || (model && model !== capacity.model)) error = 'Explain model capacity is not configured. Select the supported provider model in Settings and preview again.';
 else if (context.items.some(i=>!['user_instruction','selected_code','current_symbol','nearby_code','complete_file'].includes(i.type) || i.truncated || i.redacted || (i.source.relativePath && i.source.relativePath!==context.activeFile.relativePath))) error = 'Explain requires exact, untruncated active-file context. Refresh Context Preview.';
 else {
  const oversized = context.items.find(i=>i.type!=='user_instruction' && i.content.length>codeLimit);
  if(oversized) error = `Explain scope is ${oversized.content.length.toLocaleString()} characters; the manual Explain code limit is ${codeLimit.toLocaleString()}. Select less code or explicitly adjust Manual Explain code limit in Settings (up to 20,000). Nothing was sent or truncated.`;
  else if(characters>characterLimit) error = `Explain context, question and history total ${characters.toLocaleString()} characters; the total context limit is ${characterLimit.toLocaleString()}. Select less code or explicitly adjust Total AI context in Settings (up to 50,000). Nothing was sent or truncated.`;
  else if(totalTokens>tokenLimit || EXPLANATION_LIMITS.outputTokens>capacity.output) error = `Explain needs an estimated ${totalTokens.toLocaleString()} tokens including prompt framing and ${EXPLANATION_LIMITS.outputTokens.toLocaleString()} reserved response tokens; the application/model limit is ${tokenLimit.toLocaleString()}. Select a smaller scope or clear conversation history. Nothing was sent or truncated.`;
 }
 return { characters, characterLimit, codeLimit, inputTokens, totalTokens, tokenLimit, error };
}
