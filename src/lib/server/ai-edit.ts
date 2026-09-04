import { z } from "zod";

const Position = z.object({ line: z.number().int().positive(), column: z.number().int().positive() }).strict();
export const EditBaseSchema = z.object({
  targetRelativePath: z.string().min(1).max(4096).regex(/^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$)).+$/),
  originalContentHash: z.string().regex(/^[a-f0-9]{64}$/),
  contentLength: z.number().int().min(0).max(2 * 1024 * 1024),
  basedOnUnsavedContent: z.boolean(),
}).strict();

export const StructuredEditSchema = z.object({
  targetRelativePath: z.string().min(1).max(4096).regex(/^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$)).+$/),
  originalContentHash: z.string().regex(/^[a-f0-9]{64}$/),
  editType: z.enum(["replace", "insert", "delete"]),
  range: z.object({ start: Position, end: Position }).strict(),
  expectedOriginalText: z.string().max(50_000),
  replacementText: z.string().max(50_000),
  warnings: z.array(z.string().max(500)).max(10).optional(),
}).strict().superRefine((edit, refinement) => {
  const beforeOrEqual = edit.range.start.line < edit.range.end.line || (edit.range.start.line === edit.range.end.line && edit.range.start.column <= edit.range.end.column);
  if (!beforeOrEqual) refinement.addIssue({ code: z.ZodIssueCode.custom, message: "The edit range is invalid." });
  if (edit.editType === "insert" && (edit.expectedOriginalText !== "" || edit.range.start.line !== edit.range.end.line || edit.range.start.column !== edit.range.end.column)) refinement.addIssue({ code: z.ZodIssueCode.custom, message: "Insertion ranges must be empty." });
  if (edit.editType === "delete" && edit.replacementText !== "") refinement.addIssue({ code: z.ZodIssueCode.custom, message: "Deletion replacement must be empty." });
  if (edit.editType === "replace" && !edit.expectedOriginalText) refinement.addIssue({ code: z.ZodIssueCode.custom, message: "Replacement requires expected text." });
});

export type ServerEditBase = z.infer<typeof EditBaseSchema>;
export type ServerStructuredEdit = z.infer<typeof StructuredEditSchema>;

export function validateModelEdit(value: unknown, base: ServerEditBase): ServerStructuredEdit | null {
  const parsed = StructuredEditSchema.safeParse(value);
  if (!parsed.success || parsed.data.targetRelativePath !== base.targetRelativePath || parsed.data.originalContentHash !== base.originalContentHash) return null;
  return parsed.data;
}
