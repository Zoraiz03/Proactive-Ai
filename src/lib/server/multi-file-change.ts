import { randomUUID, createHash } from "node:crypto";
import { z } from "zod";

const SafePath = z.string().min(1).max(4096).regex(/^(?!\/)(?![A-Za-z]:[\\/])(?!.*\\)(?!.*(?:^|\/)\.\.(?:\/|$))(?!.*(?:^|\/)\.git(?:\/|$)).+\.(?:js|mjs|jsx|ts|tsx|py|java|c|cpp|h|html|css|json|md|mdx|txt|yml|yaml)$/i).refine((path) => {
  if (path.split("/").some((segment) => !segment || segment === "." || segment === "..")) return false;
  const name = path.split("/").at(-1)?.toLowerCase() ?? "";
  return !/^\.env(?:\.|$)/.test(name) && ![".npmrc", ".pypirc", ".netrc", "credentials", "id_rsa", "id_ed25519"].includes(name) && !/\.(?:pem|key|p12|pfx)$/.test(name);
}, "Secret files are not allowed.");

export const MultiFileLimitsSchema = z.object({
  maximumFiles: z.number().int().min(1).max(10),
  maximumChangedLines: z.number().int().min(25).max(5000),
  maximumGeneratedBytes: z.number().int().min(10_000).max(1_000_000),
}).strict();

const PlannedFile = z.object({ operation: z.enum(["update", "create"]), relativePath: SafePath, reason: z.string().min(1).max(1000) }).strict();
export const ModelPlanSchema = z.object({ summary: z.string().min(1).max(2000), files: z.array(PlannedFile).min(1).max(10), risks: z.array(z.string().min(1).max(500)).max(20), verificationSuggestions: z.array(z.string().min(1).max(500)).max(20) }).strict();
export const MultiFilePlanSchema = ModelPlanSchema.extend({ planId: z.string().uuid() }).strict();

const UpdateBase = z.object({ operation: z.literal("update"), relativePath: SafePath, originalContentHash: z.string().regex(/^[a-f0-9]{64}$/), originalContent: z.string().max(2 * 1024 * 1024) }).strict();
const CreateBase = z.object({ operation: z.literal("create"), relativePath: SafePath, expectedAbsent: z.literal(true) }).strict();
export const MultiFileBaseSchema = z.discriminatedUnion("operation", [UpdateBase, CreateBase]);

const ModelUpdate = UpdateBase.extend({ proposedContent: z.string().max(2 * 1024 * 1024), explanation: z.string().min(1).max(2000) }).strict();
const ModelCreate = CreateBase.extend({ proposedContent: z.string().min(1).max(2 * 1024 * 1024), explanation: z.string().min(1).max(2000) }).strict();
export const ModelChangeSetSchema = z.object({ summary: z.string().min(1).max(2000), explanation: z.string().min(1).max(10_000), warnings: z.array(z.string().min(1).max(500)).max(20), verificationSuggestions: z.array(z.string().min(1).max(500)).max(20), changes: z.array(z.discriminatedUnion("operation", [ModelUpdate, ModelCreate])).min(1).max(10) }).strict();
export const MultiFileChangeSetSchema = ModelChangeSetSchema.extend({ changeSetId: z.string().uuid(), planId: z.string().uuid() }).strict();

export type ServerMultiFileLimits = z.infer<typeof MultiFileLimitsSchema>;
export type ServerMultiFilePlan = z.infer<typeof MultiFilePlanSchema>;
export type ServerMultiFileBase = z.infer<typeof MultiFileBaseSchema>;
export type ServerMultiFileChangeSet = z.infer<typeof MultiFileChangeSetSchema>;

const uniquePaths = (items: readonly { relativePath: string }[]) => new Set(items.map((item) => item.relativePath)).size === items.length;

export function createTrustedPlan(value: unknown, limits: ServerMultiFileLimits): ServerMultiFilePlan | null {
  const parsed = ModelPlanSchema.safeParse(value);
  if (!parsed.success || parsed.data.files.length > limits.maximumFiles || !uniquePaths(parsed.data.files)) return null;
  return { planId: randomUUID(), ...parsed.data };
}

function lineChanges(before: string, after: string) {
  const left = before.split("\n"); const right = after.split("\n"); let prefix = 0; let suffix = 0;
  while (prefix < left.length && prefix < right.length && left[prefix] === right[prefix]) prefix += 1;
  while (suffix < left.length - prefix && suffix < right.length - prefix && left[left.length - 1 - suffix] === right[right.length - 1 - suffix]) suffix += 1;
  return left.length + right.length - prefix * 2 - suffix * 2;
}

export function createTrustedChangeSet(value: unknown, plan: ServerMultiFilePlan, bases: ServerMultiFileBase[], limits: ServerMultiFileLimits): ServerMultiFileChangeSet | null {
  const parsed = ModelChangeSetSchema.safeParse(value);
  if (!parsed.success || parsed.data.changes.length !== plan.files.length || !uniquePaths(parsed.data.changes)) return null;
  const planMap = new Map(plan.files.map((file) => [file.relativePath, file])); const baseMap = new Map(bases.map((base) => [base.relativePath, base]));
  let bytes = 0; let changedLines = 0;
  for (const change of parsed.data.changes) {
    const planned = planMap.get(change.relativePath); const base = baseMap.get(change.relativePath);
    if (!planned || !base || change.operation !== planned.operation || change.operation !== base.operation) return null;
    bytes += Buffer.byteLength(change.proposedContent, "utf8");
    if (change.operation === "update") {
      if (base.operation !== "update" || change.originalContent !== base.originalContent || change.originalContentHash !== base.originalContentHash || createHash("sha256").update(change.originalContent).digest("hex") !== change.originalContentHash || change.proposedContent === change.originalContent) return null;
      changedLines += lineChanges(change.originalContent, change.proposedContent);
    } else changedLines += change.proposedContent.split("\n").length;
  }
  if (bytes > limits.maximumGeneratedBytes || changedLines > limits.maximumChangedLines) return null;
  return { changeSetId: randomUUID(), planId: plan.planId, ...parsed.data };
}
