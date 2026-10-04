import type { ObserverMode } from "./observer";

export const AI_EDITABLE_MODES = ["fix_error", "improve_code", "continue_code", "add_comments"] as const;
export type AiEditableMode = typeof AI_EDITABLE_MODES[number];
export type AiEditType = "replace" | "insert" | "delete";

export interface TextPosition { line: number; column: number }
export interface TextRange { start: TextPosition; end: TextPosition }

export interface ObserverEditBase {
  targetRelativePath: string;
  originalContentHash: string;
  contentLength: number;
  basedOnUnsavedContent: boolean;
}

export interface StructuredObserverEdit {
  targetRelativePath: string;
  originalContentHash: string;
  editType: AiEditType;
  range: TextRange;
  expectedOriginalText: string;
  replacementText: string;
  warnings?: string[];
}

export interface ValidatedProposedEdit {
  edit: StructuredObserverEdit;
  proposedContent: string;
  startOffset: number;
  endOffset: number;
}

export type EditValidationFailure = "malformed" | "target_mismatch" | "hash_mismatch" | "invalid_range" | "expected_text_mismatch" | "oversized";
export type EditValidationResult = { ok: true; value: ValidatedProposedEdit } | { ok: false; reason: EditValidationFailure; message: string };

export const isEditableObserverMode = (mode: ObserverMode): mode is AiEditableMode => AI_EDITABLE_MODES.includes(mode as AiEditableMode);

const positivePosition = (value: unknown): value is TextPosition => Boolean(value && typeof value === "object" && Number.isInteger((value as TextPosition).line) && (value as TextPosition).line >= 1 && Number.isInteger((value as TextPosition).column) && (value as TextPosition).column >= 1);
const safeRelativePath = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 4096 && !value.startsWith("/") && !value.includes("\0") && !value.split(/[\\/]/).includes("..");

export function parseStructuredObserverEdit(value: unknown): StructuredObserverEdit | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Partial<StructuredObserverEdit>;
  const keys = Object.keys(source);
  if (keys.some((key) => !["targetRelativePath", "originalContentHash", "editType", "range", "expectedOriginalText", "replacementText", "warnings"].includes(key))) return null;
  if (!safeRelativePath(source.targetRelativePath) || typeof source.originalContentHash !== "string" || !/^[a-f0-9]{64}$/.test(source.originalContentHash) || !["replace", "insert", "delete"].includes(source.editType ?? "") || !source.range || !positivePosition(source.range.start) || !positivePosition(source.range.end) || typeof source.expectedOriginalText !== "string" || source.expectedOriginalText.length > 50_000 || typeof source.replacementText !== "string" || source.replacementText.length > 50_000) return null;
  if (source.warnings !== undefined && (!Array.isArray(source.warnings) || source.warnings.length > 10 || source.warnings.some((item) => typeof item !== "string" || item.length > 500))) return null;
  if (source.editType === "insert" && (source.expectedOriginalText !== "" || source.range.start.line !== source.range.end.line || source.range.start.column !== source.range.end.column)) return null;
  if (source.editType === "delete" && source.replacementText !== "") return null;
  if (source.editType === "replace" && !source.expectedOriginalText) return null;
  return source as StructuredObserverEdit;
}

export function offsetForPosition(content: string, position: TextPosition): number | null {
  const lines = content.split("\n");
  if (position.line > lines.length) return null;
  const line = lines[position.line - 1];
  const maximumColumn = line.length + 1;
  if (position.column > maximumColumn) return null;
  let offset = 0;
  for (let index = 0; index < position.line - 1; index += 1) offset += lines[index].length + 1;
  return offset + position.column - 1;
}

function offsetForAbsolutePosition(content: string, lineStart: number, position: TextPosition): number | null {
  const relativeLine = position.line - lineStart + 1;
  return relativeLine < 1 ? null : offsetForPosition(content, { line: relativeLine, column: position.column });
}

function absolutePositionForOffset(content: string, lineStart: number, offset: number): TextPosition {
  const prefix = content.slice(0, offset);
  const lastNewline = prefix.lastIndexOf("\n");
  const line = lineStart + prefix.split("\n").length - 1;
  return { line, column: offset - lastNewline };
}

export function reconcileStructuredObserverEditRange(
  edit: StructuredObserverEdit,
  sourceContent: string,
  sourceLineStart: number
): StructuredObserverEdit | null {
  const startOffset = offsetForAbsolutePosition(sourceContent, sourceLineStart, edit.range.start);
  const endOffset = offsetForAbsolutePosition(sourceContent, sourceLineStart, edit.range.end);
  if (
    startOffset !== null && endOffset !== null && endOffset >= startOffset &&
    sourceContent.slice(startOffset, endOffset) === edit.expectedOriginalText
  ) return edit;
  if (!edit.expectedOriginalText) return null;
  const uniqueOffset = sourceContent.indexOf(edit.expectedOriginalText);
  if (uniqueOffset < 0 || sourceContent.indexOf(edit.expectedOriginalText, uniqueOffset + 1) >= 0) return null;
  return {
    ...edit,
    range: {
      start: absolutePositionForOffset(sourceContent, sourceLineStart, uniqueOffset),
      end: absolutePositionForOffset(sourceContent, sourceLineStart, uniqueOffset + edit.expectedOriginalText.length),
    },
  };
}

export function validateAndBuildProposedEdit(value: unknown, base: ObserverEditBase, currentContent: string, currentHash: string): EditValidationResult {
  const edit = parseStructuredObserverEdit(value);
  if (!edit) return { ok: false, reason: "malformed", message: "Observer returned a malformed structured edit." };
  if (edit.targetRelativePath !== base.targetRelativePath) return { ok: false, reason: "target_mismatch", message: "Observer targeted a different file." };
  if (edit.originalContentHash !== base.originalContentHash || currentHash !== base.originalContentHash) return { ok: false, reason: "hash_mismatch", message: "The file changed after this suggestion was generated." };
  const startOffset = offsetForPosition(currentContent, edit.range.start);
  const endOffset = offsetForPosition(currentContent, edit.range.end);
  if (startOffset === null || endOffset === null || endOffset < startOffset) return { ok: false, reason: "invalid_range", message: "Observer returned an invalid edit range." };
  if (edit.replacementText.length > 50_000 || currentContent.length - (endOffset - startOffset) + edit.replacementText.length > 2 * 1024 * 1024) return { ok: false, reason: "oversized", message: "The proposed edit is too large." };
  if (currentContent.slice(startOffset, endOffset) !== edit.expectedOriginalText) return { ok: false, reason: "expected_text_mismatch", message: "The expected original text no longer matches the editor." };
  return { ok: true, value: { edit, proposedContent: currentContent.slice(0, startOffset) + edit.replacementText + currentContent.slice(endOffset), startOffset, endOffset } };
}

export async function sha256Text(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
