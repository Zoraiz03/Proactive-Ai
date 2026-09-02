import { z } from "zod";

const ContextItem = z.object({
  id: z.string().min(1).max(80),
  type: z.enum(["user_instruction", "selected_code", "diagnostic", "current_symbol", "nearby_code", "related_file", "project_rule", "attached_markdown", "terminal_error", "file_excerpt", "complete_file", "controlled_run_error", "task_failure", "selected_output", "selected_markdown", "markdown_section"]),
  priority: z.number().int().min(1).max(8),
  content: z.string().min(1).max(50_000),
  source: z.object({
    provenance: z.enum(["user", "editor_selection", "editor_cursor", "diagnostics", "run_output", "local_import", "nearby_test", "project_configuration", "project_instruction", "user_attached"]),
    relativePath: z.string().min(1).max(4096).regex(/^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$)).+$/).optional(),
    lineStart: z.number().int().positive().optional(),
    lineEnd: z.number().int().positive().optional(),
  }),
  reason: z.string().min(1).max(500),
  estimatedCharacters: z.number().int().nonnegative(),
  estimatedTokens: z.number().int().nonnegative(),
  optional: z.boolean(), completeFile: z.boolean(), truncated: z.boolean(), redacted: z.boolean(), relevanceScore: z.number().min(0).max(100).optional(),
  title: z.string().min(1).max(160).optional(),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  createdAt: z.number().int().nonnegative().optional(),
  attachmentProvenance: z.enum(["automatic", "user_attached"]).optional(),
  staleState: z.enum(["fresh", "stale", "keep_original", "unavailable"]).optional(),
});

export const ProjectContextSchema = z.object({
  version: z.literal(1),
  intent: z.object({ mode: z.string().min(1).max(60), instruction: z.string().min(1).max(500) }),
  activeFile: z.object({ relativePath: z.string().min(1).max(4096).regex(/^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$)).+$/), fileName: z.string().min(1).max(255), language: z.string().min(1).max(64), kind: z.enum(["code", "doc"]) }),
  cursor: z.object({ line: z.number().int().positive(), column: z.number().int().positive() }),
  items: z.array(ContextItem).min(1).max(30),
  omitted: z.array(z.object({ type: z.string().max(60), source: z.string().max(4096).optional(), reason: z.string().max(500) })).max(100),
  totalCharacters: z.number().int().min(1).max(50_000), estimatedTokens: z.number().int().positive(),
  limits: z.object({ maximumTotalCharacters: z.number().int().min(1_000).max(50_000), maximumRelatedFiles: z.number().int().min(0).max(10), maximumCharactersPerFile: z.number().int().min(500).max(20_000) }),
  containsCompleteFile: z.boolean(),
}).superRefine((context, refinement) => {
  const ids = new Set<string>(); let total = 0;
  for (const item of context.items) {
    if (ids.has(item.id)) refinement.addIssue({ code: z.ZodIssueCode.custom, message: "Context item IDs must be unique." });
    ids.add(item.id); total += item.content.length;
    if (item.estimatedCharacters !== item.content.length || item.estimatedTokens !== Math.ceil(item.content.length / 4)) refinement.addIssue({ code: z.ZodIssueCode.custom, message: "Context item cost is invalid." });
    if (item.source.provenance === "user_attached" && (!item.title || !item.contentHash || !item.createdAt || item.attachmentProvenance !== "user_attached")) refinement.addIssue({ code: z.ZodIssueCode.custom, message: "Attached context provenance is incomplete." });
    if (item.staleState === "stale" || item.staleState === "unavailable") refinement.addIssue({ code: z.ZodIssueCode.custom, message: "Resolve stale or unavailable attached context before sending." });
  }
  if (total !== context.totalCharacters || total > context.limits.maximumTotalCharacters || context.estimatedTokens !== Math.ceil(total / 4)) refinement.addIssue({ code: z.ZodIssueCode.custom, message: "Context package size is invalid." });
  if (context.containsCompleteFile !== context.items.some((item) => item.completeFile)) refinement.addIssue({ code: z.ZodIssueCode.custom, message: "Complete-file metadata is invalid." });
  if (!context.items.some((item) => item.type === "user_instruction" && !item.optional)) refinement.addIssue({ code: z.ZodIssueCode.custom, message: "Explicit user intent is required." });
  const secret = /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\b(?:AKIA|ASIA)[A-Z0-9]{16}\b|\bgh[pousr]_[A-Za-z0-9]{20,}\b|\bsk-[A-Za-z0-9_-]{16,}\b|\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s"']+|\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|session[_-]?secret|password)\b\s*[:=]\s*["']?[^\s"']{8,}/i;
  if (context.items.some((item) => secret.test(item.content))) refinement.addIssue({ code: z.ZodIssueCode.custom, message: "Potential secret material cannot be sent." });
});

export type ServerProjectContext = z.infer<typeof ProjectContextSchema>;

export function formatUntrustedProjectContext(context: ServerProjectContext): string {
  const projectItems = context.items.filter((item) => item.type !== "user_instruction").map((item) => `[CONTEXT ITEM ${item.id}]
Type: ${item.type}
Source: ${item.source.relativePath ?? item.source.provenance}${item.source.lineStart ? `:${item.source.lineStart}-${item.source.lineEnd ?? item.source.lineStart}` : ""}
Selection reason: ${item.reason}
BEGIN UNTRUSTED PROJECT CONTENT
${item.content}
END UNTRUSTED PROJECT CONTENT`).join("\n\n");
  return `EXPLICIT USER ACTION (selected in the IDE): ${context.intent.instruction}\n\n${projectItems}`;
}

export function safeProjectContextMetadata(context: ServerProjectContext) {
  return { version: context.version, itemTypes: context.items.map((item) => item.type), itemSizes: context.items.map((item) => ({ type: item.type, characters: item.estimatedCharacters, provenance: item.source.provenance === "user_attached" ? "user_attached" : "automatic" })), itemCount: context.items.length, userAttachedCount: context.items.filter((item) => item.source.provenance === "user_attached").length, totalCharacters: context.totalCharacters, estimatedTokens: context.estimatedTokens, omittedCount: context.omitted.length, redactedCount: context.items.filter((item) => item.redacted).length, truncatedCount: context.items.filter((item) => item.truncated).length, completeFileIncluded: context.containsCompleteFile };
}
