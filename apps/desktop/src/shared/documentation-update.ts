import { offsetForPosition, type TextRange } from "./ai-edit.ts";
import { redactContextSecrets } from "./context-tray.ts";
import type { DocumentationConfidence, DocumentationRelationshipType } from "./documentation-impact.ts";
import type { ObserverProvider } from "./observer.ts";

export const DOCUMENTATION_ACTIONS = ["update_section", "add_section", "correct_path", "correct_route", "correct_command", "update_symbol_description", "update_setup_instructions", "update_code_example"] as const;
export type DocumentationAction = typeof DOCUMENTATION_ACTIONS[number];

export interface DocumentationUpdateContext {
  userRequest: string;
  relationshipId: string;
  evidenceHash: string;
  relationshipType: DocumentationRelationshipType;
  confidence: DocumentationConfidence;
  reference: string;
  evidence: string;
  codePath: string;
  codeHash: string;
  codeExcerpt: string;
  documentationPath: string;
  documentationHash: string;
  documentationContent: string;
  affectedHeading: string;
  sectionRange: TextRange;
  sectionText: string;
  redacted: boolean;
  projectRules?: string;
  selectedContext: Array<{ title: string; type: string; content: string; source?: string }>;
}

export type DocumentationDraftRequest = Omit<DocumentationUpdateContext, "documentationContent"> & {
  provider: ObserverProvider;
  model?: string;
  storeHistory: boolean;
};

export interface StructuredDocumentationEdit {
  suggestionId: string;
  targetRelativePath: string;
  action: DocumentationAction;
  affectedHeading: string;
  explanation: string;
  reason: string;
  relationshipReferences: string[];
  originalDocumentHash: string;
  range: TextRange;
  expectedOriginalMarkdown: string;
  replacementMarkdown: string;
  warnings: string[];
  verificationNotes: string[];
}

export interface ValidatedDocumentationEdit { edit: StructuredDocumentationEdit; proposedContent: string; addedLines: number; deletedLines: number }
export type DocumentationEditValidation = { ok: true; value: ValidatedDocumentationEdit } | { ok: false; message: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HASH = /^[a-f0-9]{64}$/;
const safePath = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 4096 && !value.startsWith("/") && !/^[A-Za-z]:[\\/]/.test(value) && !value.includes("\\") && !value.includes("\0") && !value.split("/").includes("..") && /(?:^|\/)README(?:\.[^.]+)?\.md$|\.md$/i.test(value);
const position = (value: unknown): value is TextRange["start"] => Boolean(value && typeof value === "object" && Number.isInteger((value as TextRange["start"]).line) && (value as TextRange["start"]).line > 0 && Number.isInteger((value as TextRange["start"]).column) && (value as TextRange["start"]).column > 0);
const strings = (value: unknown, count: number, length: number): value is string[] => Array.isArray(value) && value.length <= count && value.every((item) => typeof item === "string" && item.length <= length);
const plain = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));

export function parseDocumentationEdit(value: unknown): StructuredDocumentationEdit | null {
  if (!plain(value)) return null;
  const keys = ["suggestionId", "targetRelativePath", "action", "affectedHeading", "explanation", "reason", "relationshipReferences", "originalDocumentHash", "range", "expectedOriginalMarkdown", "replacementMarkdown", "warnings", "verificationNotes"];
  if (Object.keys(value).some((key) => !keys.includes(key)) || keys.some((key) => !(key in value)) || !UUID.test(String(value.suggestionId)) || !safePath(value.targetRelativePath) || !DOCUMENTATION_ACTIONS.includes(value.action as DocumentationAction) || typeof value.affectedHeading !== "string" || value.affectedHeading.length > 300 || typeof value.explanation !== "string" || !value.explanation.trim() || value.explanation.length > 4_000 || typeof value.reason !== "string" || !value.reason.trim() || value.reason.length > 2_000 || !strings(value.relationshipReferences, 10, 300) || !HASH.test(String(value.originalDocumentHash)) || !plain(value.range) || !position(value.range.start) || !position(value.range.end) || typeof value.expectedOriginalMarkdown !== "string" || value.expectedOriginalMarkdown.length > 20_000 || typeof value.replacementMarkdown !== "string" || !value.replacementMarkdown.trim() || value.replacementMarkdown.length > 20_000 || !strings(value.warnings, 20, 500) || !strings(value.verificationNotes, 20, 500)) return null;
  return value as unknown as StructuredDocumentationEdit;
}

const fenceCount = (value: string) => value.split(/\r?\n/).filter((line) => /^\s*(```|~~~)/.test(line)).length;
const unsafeMarkup = (value: string) => /<\s*(?:script|iframe|object|embed|form|link|meta|style)\b|\son\w+\s*=|javascript\s*:/i.test(value);
const absolutePath = /(?:file:\/\/|\/(?:Users|home|private|var|etc)\/[^\s)`]+|[A-Za-z]:\\[^\s)`]+)/g;
const containsAbsolutePath = (value: string) => /(?:file:\/\/|\/(?:Users|home|private|var|etc)\/[^\s)`]+|[A-Za-z]:\\[^\s)`]+)/.test(value);
const safeContextSource = (value: unknown): value is string => typeof value === "string" && value.length <= 4_096 && (/^https?:\/\/[^\s/@]+(?:\/|$)/i.test(value) || (value.length > 0 && !value.startsWith("/") && !/^[A-Za-z]:[\\/]/.test(value) && !value.includes("\\") && !value.split("/").includes("..")));
const unverifiedClaim = /\b(?:all\s+)?(?:tests?|builds?)\s+(?:pass|passed|passing|succeed|succeeded)\b/i;

export function validateDocumentationEdit(value: unknown, context: DocumentationUpdateContext, currentDocument: string, currentDocumentHash: string, currentCodeHash: string): DocumentationEditValidation {
  const parsed = parseDocumentationEdit(value);
  if (!parsed) return { ok: false, message: "The model returned a malformed documentation edit." };
  if (parsed.targetRelativePath !== context.documentationPath || parsed.originalDocumentHash !== context.documentationHash) return { ok: false, message: "The model targeted a different document or content version." };
  if (!parsed.relationshipReferences.includes(context.relationshipId) || !parsed.relationshipReferences.includes(context.evidenceHash)) return { ok: false, message: "The draft does not cite the confirmed relationship evidence." };
  if (parsed.range.start.line !== context.sectionRange.start.line || parsed.range.start.column !== context.sectionRange.start.column || parsed.range.end.line !== context.sectionRange.end.line || parsed.range.end.column !== context.sectionRange.end.column) return { ok: false, message: "The model changed the trusted Markdown range." };
  if (currentDocumentHash !== context.documentationHash) return { ok: false, message: "The Markdown document changed after context preparation." };
  if (currentCodeHash !== context.codeHash) return { ok: false, message: "The code evidence changed after context preparation." };
  const start = offsetForPosition(currentDocument, parsed.range.start); const end = offsetForPosition(currentDocument, parsed.range.end);
  if (start === null || end === null || end < start || currentDocument.slice(start, end) !== parsed.expectedOriginalMarkdown) return { ok: false, message: "The expected Markdown range no longer matches." };
  const redacted = redactContextSecrets(parsed.replacementMarkdown);
  const replacement = redacted.content.replace(absolutePath, "[REDACTED LOCAL PATH]");
  const warnings = [...parsed.warnings];
  if (redacted.redacted) warnings.push("Potential secret material was redacted from the draft.");
  if (replacement !== redacted.content) warnings.push("An absolute local path was redacted from the draft.");
  if (unsafeMarkup(replacement)) return { ok: false, message: "The draft contains executable or unsafe HTML." };
  const originalHeading = parsed.expectedOriginalMarkdown.split(/\r?\n/)[0]?.match(/^#{1,6}\s+(.+?)\s*#*$/)?.[0];
  if (originalHeading && replacement.split(/\r?\n/)[0] !== originalHeading) return { ok: false, message: "The draft changed or removed an unaffected section heading." };
  const links = (text: string) => Array.from(text.matchAll(/\[[^\]]+\]\(([^)]+)\)/g), (match) => match[1]);
  const removedLinks = links(parsed.expectedOriginalMarkdown).filter((link) => !links(replacement).includes(link));
  if (removedLinks.length) warnings.push("The draft removes or changes an existing Markdown link; verify it intentionally corrects the relationship.");
  const proposedContent = currentDocument.slice(0, start) + replacement + currentDocument.slice(end);
  if (fenceCount(proposedContent) % 2 !== 0) return { ok: false, message: "The draft leaves a Markdown code fence unbalanced." };
  const deletedLines = parsed.expectedOriginalMarkdown ? parsed.expectedOriginalMarkdown.split(/\r?\n/).length : 0;
  const addedLines = replacement.split(/\r?\n/).length;
  const changed = addedLines + deletedLines; const total = Math.max(1, currentDocument.split(/\r?\n/).length);
  if (changed > 200 || (changed > 20 && changed > total * 0.4)) return { ok: false, message: "The draft rewrites more documentation than this relationship safely supports." };
  if (unverifiedClaim.test(replacement)) warnings.push("The draft claims tests or builds passed; verify this claim before accepting.");
  return { ok: true, value: { edit: { ...parsed, replacementMarkdown: replacement, warnings: Array.from(new Set(warnings)).slice(0, 20) }, proposedContent, addedLines, deletedLines } };
}

export function validateDocumentationDraftRequest(value: unknown): DocumentationDraftRequest | null {
  const keys = ["provider", "model", "storeHistory", "userRequest", "relationshipId", "evidenceHash", "relationshipType", "confidence", "reference", "evidence", "codePath", "codeHash", "codeExcerpt", "documentationPath", "documentationHash", "affectedHeading", "sectionRange", "sectionText", "redacted", "projectRules", "selectedContext"];
  if (!plain(value) || Object.keys(value).some((key) => !keys.includes(key)) || !["gemini", "openai", "deepseek", "anthropic", "demo"].includes(String(value.provider)) || typeof value.storeHistory !== "boolean" || typeof value.userRequest !== "string" || !value.userRequest.trim() || value.userRequest.length > 1_000 || typeof value.relationshipId !== "string" || !/^[a-f0-9]{24}$/.test(value.relationshipId) || !HASH.test(String(value.evidenceHash)) || !["file_path", "symbol", "api_route", "package_script", "configuration_key", "project_link", "readme_setup", "test_documentation"].includes(String(value.relationshipType)) || !["high", "medium", "low"].includes(String(value.confidence)) || typeof value.reference !== "string" || !value.reference || value.reference.length > 500 || typeof value.evidence !== "string" || value.evidence.length > 1_000 || !safePath(value.documentationPath) || typeof value.codePath !== "string" || value.codePath.startsWith("/") || /^[A-Za-z]:[\\/]/.test(value.codePath) || value.codePath.includes("\\") || value.codePath.split("/").includes("..") || !HASH.test(String(value.codeHash)) || !HASH.test(String(value.documentationHash)) || typeof value.codeExcerpt !== "string" || !value.codeExcerpt || value.codeExcerpt.length > 20_000 || typeof value.affectedHeading !== "string" || value.affectedHeading.length > 300 || !plain(value.sectionRange) || !position(value.sectionRange.start) || !position(value.sectionRange.end) || typeof value.sectionText !== "string" || value.sectionText.length > 20_000 || typeof value.redacted !== "boolean" || (value.projectRules !== undefined && (typeof value.projectRules !== "string" || value.projectRules.length > 8_000)) || !Array.isArray(value.selectedContext) || value.selectedContext.length > 10 || value.selectedContext.some((item) => !plain(item) || typeof item.title !== "string" || item.title.length > 160 || typeof item.type !== "string" || item.type.length > 60 || typeof item.content !== "string" || item.content.length > 8_000 || (item.source !== undefined && !safeContextSource(item.source))) || (value.model !== undefined && (typeof value.model !== "string" || value.model.length > 100))) return null;
  const content = [value.userRequest, value.reference, value.evidence, value.codeExcerpt, value.sectionText, value.projectRules, ...value.selectedContext.flatMap((item) => [item.title, item.content])].filter((item): item is string => typeof item === "string");
  if (content.some((item) => redactContextSecrets(item).redacted || containsAbsolutePath(item))) return null;
  return value as unknown as DocumentationDraftRequest;
}
