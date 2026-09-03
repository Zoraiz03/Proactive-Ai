import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { basename, dirname, extname, posix } from "node:path";
import {
  OBSERVER_MODE_LABELS,
  isObserverModeForKind,
} from "../shared/observer.ts";
import {
  PROJECT_CONTEXT_VERSION,
  projectContextCost,
  type OmittedProjectContextItem,
  type ProjectContextItem,
  type ProjectContextItemType,
  type ProjectContextPackage,
  type ProjectContextProvenance,
  type ProjectContextSeed,
} from "../shared/project-context.ts";
import { redactContextSecrets, validateContextTrayItem, type ContextTrayItem } from "../shared/context-tray.ts";
import { isExcludedFromAiContext, isMandatorySecretFile } from "../shared/settings.ts";
import { normalizeWorkspaceRelativePath, readWorkspaceTextFile, resolveWorkspacePath } from "./workspace-files.ts";

const GENERATED = new Set([".git", "node_modules", ".next", "dist", "build", "coverage", "out", "vendor"]);
const CODE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".py", ".java", ".c", ".cpp", ".h"];
const CONFIG_FILES = ["package.json", "tsconfig.json", "vitest.config.ts", "vite.config.ts", "jest.config.js", "jest.config.ts", "pytest.ini", "pyproject.toml"];
const RULE_FILES = ["AGENTS.md", ".proactive/rules.md", "README.md"];

export interface ProjectContextEngineOptions { maximumCandidates?: number }

interface Candidate { relativePath: string; score: number; reason: string; provenance: ProjectContextProvenance; type: "related_file" | "project_rule" }

const lineNumberAt = (content: string, index: number) => content.slice(0, index).split("\n").length;

export function redactProjectSecrets(content: string): { content: string; redacted: boolean } {
  return redactContextSecrets(content);
}

export function detectCurrentSymbol(content: string, cursorLine: number): { content: string; lineStart: number; lineEnd: number; name: string } | null {
  const lines = content.split(/\r?\n/);
  const cursor = Math.min(lines.length, Math.max(1, cursorLine));
  const pattern = /^\s*(?:export\s+)?(?:async\s+)?(?:function|class|interface|type|def)\s+([A-Za-z_$][\w$]*)|^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(?[^=]*=>/;
  let start = -1; let name = "";
  for (let index = cursor - 1; index >= 0; index -= 1) {
    const match = pattern.exec(lines[index]);
    if (match) { start = index; name = match[1] ?? match[2]; break; }
  }
  if (start < 0) return null;
  let end = Math.min(lines.length, start + 80);
  for (let index = start + 1; index < end; index += 1) {
    if (pattern.test(lines[index]) && /^\S/.test(lines[index])) { end = index; break; }
  }
  return { content: lines.slice(start, end).join("\n"), lineStart: start + 1, lineEnd: end, name };
}

function importSpecifiers(content: string): string[] {
  const values = new Set<string>();
  const patterns = [/(?:from\s+|import\s*\(|require\s*\()\s*["']([^"']+)["']/g, /(?:import|export)\s+[^;]*?\sfrom\s+["']([^"']+)["']/g];
  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) if (match[1].startsWith(".")) values.add(match[1]);
  }
  return Array.from(values);
}

function candidatePathsForImport(activePath: string, specifier: string): string[] {
  const raw = posix.normalize(posix.join(dirname(activePath).replaceAll("\\", "/"), specifier));
  if (raw.startsWith("../") || raw === "..") return [];
  if (extname(raw)) return [raw];
  return [...CODE_EXTENSIONS.map((extension) => `${raw}${extension}`), ...CODE_EXTENSIONS.map((extension) => `${raw}/index${extension}`)];
}

function testNameCandidates(activePath: string): string[] {
  const directory = dirname(activePath).replaceAll("\\", "/");
  const extension = extname(activePath);
  const stem = basename(activePath, extension);
  const candidates = [`${stem}.test${extension}`, `${stem}.spec${extension}`, `${stem}_test${extension}`, `test_${stem}${extension}`];
  return candidates.flatMap((name) => [posix.join(directory, name), posix.join(directory, "__tests__", name), posix.join("tests", name)]);
}

function isGitIgnored(path: string, patterns: readonly string[]): boolean {
  const normalized = path.replaceAll("\\", "/");
  return patterns.some((raw) => {
    const pattern = raw.trim().replace(/^!/, "").replace(/^\//, "").replace(/\/$/, "");
    if (!pattern || raw.trim().startsWith("!")) return false;
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replaceAll("**", "§§").replaceAll("*", "[^/]*").replaceAll("§§", ".*");
    return new RegExp(pattern.includes("/") ? `^${escaped}(?:/.*)?$` : `(?:^|/)${escaped}(?:/.*)?$`).test(normalized);
  });
}

function isIgnored(path: string, exclusions: readonly string[], gitignore: readonly string[] = []): boolean {
  const normalized = path.replaceAll("\\", "/");
  return normalized.split("/").some((segment) => GENERATED.has(segment.toLowerCase())) || isMandatorySecretFile(normalized) || isExcludedFromAiContext(normalized, exclusions) || isGitIgnored(normalized, gitignore);
}

function validateSeed(value: ProjectContextSeed): ProjectContextSeed {
  const activeRelativePath = normalizeWorkspaceRelativePath(value.activeRelativePath).relativePath;
  if (!activeRelativePath || value.fileName !== basename(activeRelativePath) || !isObserverModeForKind(value.mode, value.kind)) throw new Error("Context seed is invalid.");
  return {
    ...value,
    activeRelativePath,
    cursorLine: Math.max(1, Math.trunc(value.cursorLine)),
    cursorColumn: Math.max(1, Math.trunc(value.cursorColumn)),
    ...(value.selectedLineStart ? { selectedLineStart: Math.max(1, Math.trunc(value.selectedLineStart)) } : {}),
    ...(value.selectedLineEnd ? { selectedLineEnd: Math.max(1, Math.trunc(value.selectedLineEnd)) } : {}),
    maximumTotalCharacters: Math.max(1_000, Math.min(50_000, Math.trunc(value.maximumTotalCharacters))),
    maximumRelatedFiles: Math.max(0, Math.min(10, Math.trunc(value.maximumRelatedFiles))),
    maximumCharactersPerFile: Math.max(500, Math.min(20_000, Math.trunc(value.maximumCharactersPerFile))),
    exclusions: value.exclusions.slice(0, 100),
    ...(value.userRequest ? { userRequest: value.userRequest.trim().slice(0, 500) } : {}),
    ...(value.trayItems ? { trayItems: value.trayItems.slice(0, 20) } : {}),
  };
}

const fileBackedTrayType = (item: ContextTrayItem) => Boolean(item.source?.relativePath);
const highPriorityTrayType = (item: ContextTrayItem) => ["selected_code", "diagnostic", "controlled_run_error", "task_failure", "selected_output", "selected_markdown"].includes(item.type);

export class ProjectContextEngine {
  private rootPath: string | null = null;
  private generation = 0;
  private cache = new Map<string, { generation: number; candidates: Candidate[] }>();
  private readonly options: ProjectContextEngineOptions;
  constructor(options: ProjectContextEngineOptions = {}) { this.options = options; }
  setWorkspace(rootPath: string) { this.rootPath = rootPath; this.invalidate(); }
  clearWorkspace() { this.rootPath = null; this.invalidate(); }
  invalidate() { this.generation += 1; this.cache.clear(); }
  cacheGeneration() { return this.generation; }

  async build(rawSeed: ProjectContextSeed): Promise<ProjectContextPackage> {
    if (!this.rootPath) throw new Error("Open a workspace before building Observer context.");
    const seed = validateSeed(rawSeed);
    if (seed.mode === "fix_error" && !seed.diagnostic) throw new Error("Fix Error requires a selected diagnostic.");
    if (seed.mode === "plan_multi_file" && !seed.userRequest) throw new Error("Describe the requested multi-file change before continuing.");
    const gitignore = await this.gitignorePatterns();
    if (isIgnored(seed.activeRelativePath, seed.exclusions, gitignore)) throw new Error("The active file is excluded from AI context.");
    await resolveWorkspacePath(this.rootPath, seed.activeRelativePath);
    const items: ProjectContextItem[] = [];
    const omitted: OmittedProjectContextItem[] = [];
    let sequence = 0;
    const add = (type: ProjectContextItemType, priority: number, content: string | undefined, provenance: ProjectContextProvenance, reason: string, details: Partial<ProjectContextItem["source"]> = {}, optional = false, completeFile = false, relevanceScore?: number) => {
      if (!content?.trim()) return;
      const safe = redactProjectSecrets(content);
      const bounded = safe.content.slice(0, type === "related_file" || type === "project_rule" ? seed.maximumCharactersPerFile : 20_000);
      const cost = projectContextCost(bounded);
      items.push({ id: `ctx-${++sequence}`, type, priority, content: bounded, source: { provenance, ...details }, reason, ...cost, optional, completeFile: completeFile && bounded.length === content.length, truncated: bounded.length < safe.content.length, redacted: safe.redacted, attachmentProvenance: "automatic", staleState: "fresh", ...(relevanceScore === undefined ? {} : { relevanceScore }) });
    };

    const instruction = seed.mode === "plan_multi_file" ? `${OBSERVER_MODE_LABELS[seed.mode]}: ${seed.userRequest}` : OBSERVER_MODE_LABELS[seed.mode];
    add("user_instruction", 1, instruction, "user", "The explicitly selected Observer action.");
    const trayItems: ContextTrayItem[] = [];
    for (const raw of seed.trayItems ?? []) {
      const item = validateContextTrayItem(raw);
      if (!item) throw new Error("A Context Tray item is invalid or contains unsafe content.");
      if (isMandatorySecretFile(item.source?.relativePath ?? "") || isExcludedFromAiContext(item.source?.relativePath ?? "", seed.exclusions) || (item.source?.relativePath && isIgnored(item.source.relativePath, seed.exclusions, gitignore))) throw new Error(`${item.title} is excluded from AI context.`);
      if (createHash("sha256").update(item.content).digest("hex") !== item.contentHash) throw new Error(`${item.title} changed after it was attached.`);
      let staleState = item.staleState;
      if (fileBackedTrayType(item)) {
        const current = item.source!.relativePath === seed.activeRelativePath
          ? { content: seed.content }
          : await this.safeRead(item.source!.relativePath!, seed.exclusions, gitignore);
        if (!current) {
          if (item.staleState === "unavailable") staleState = "unavailable";
          else throw new Error(`${item.title} is unavailable, excluded, or unsafe.`);
        }
        else if (item.sourceContentHash && createHash("sha256").update(current.content).digest("hex") !== item.sourceContentHash && staleState === "fresh") staleState = "stale";
      }
      trayItems.push({ ...item, staleState });
    }
    const trayCharacters = trayItems.reduce((sum, item) => sum + item.estimatedCharacters, 0);
    const instructionCharacters = items[0]?.estimatedCharacters ?? 0;
    if (trayCharacters + instructionCharacters > seed.maximumTotalCharacters) {
      const overflowing = trayItems.find((_, index) => trayItems.slice(0, index + 1).reduce((sum, item) => sum + item.estimatedCharacters, instructionCharacters) > seed.maximumTotalCharacters);
      throw new Error(`${overflowing?.title ?? "A user-attached item"} exceeds the configured context budget. Remove or truncate it, or increase the safe context limit.`);
    }
    for (let trayIndex = 0; trayIndex < trayItems.length; trayIndex += 1) {
      const tray = trayItems[trayIndex];
      const cost = projectContextCost(tray.content);
      items.push({
        id: `tray-${tray.id}`,
        type: tray.type as ProjectContextItemType,
        priority: highPriorityTrayType(tray) ? 2 : 3,
        content: tray.content,
        source: { provenance: tray.provenance, ...(tray.source ?? {}), ...(tray.webSource ? { sourceUrl: tray.webSource.sourceUrl, hostname: tray.webSource.hostname } : {}) },
        reason: tray.reason,
        ...cost,
        optional: true,
        completeFile: tray.completeFile,
        truncated: tray.truncated,
        redacted: tray.redacted,
        title: tray.title,
        contentHash: tray.contentHash,
        createdAt: tray.createdAt,
        attachmentProvenance: "user_attached",
        staleState: tray.staleState,
        relevanceScore: Math.max(0, 100 - trayIndex),
      });
    }
    const trayContains = (content: string | undefined) => Boolean(content && trayItems.some((item) => item.content === content));
    if (seed.selectedCode && !trayContains(seed.selectedCode)) add("selected_code", 2, seed.selectedCode, "editor_selection", "The user explicitly selected this content.", { relativePath: seed.activeRelativePath, ...(seed.selectedLineStart ? { lineStart: seed.selectedLineStart } : {}), ...(seed.selectedLineEnd ? { lineEnd: seed.selectedLineEnd } : {}) });
    if (seed.mode === "fix_error" && seed.diagnostic) add("diagnostic", 3, `${seed.diagnostic.fileName}:${seed.diagnostic.line}:${seed.diagnostic.column}\n${seed.diagnostic.message}`, "diagnostics", "The selected error is required to diagnose Fix Error.", { relativePath: seed.activeRelativePath, lineStart: seed.diagnostic.line, lineEnd: seed.diagnostic.line });
    const symbol = detectCurrentSymbol(seed.content, seed.cursorLine);
    const wantsSymbol = ["explain", "fix_error", "improve_code", "continue_code", "generate_tests", "add_comments", "plan_multi_file"].includes(seed.mode);
    if (seed.mode === "add_comments" && !seed.selectedCode) throw new Error("Select code before asking Observer to add comments or documentation.");
    if (wantsSymbol && symbol && !trayContains(symbol.content)) add("current_symbol", 4, symbol.content, "editor_cursor", `Current symbol “${symbol.name}” contains the cursor.`, { relativePath: seed.activeRelativePath, lineStart: symbol.lineStart, lineEnd: symbol.lineEnd });
    if (!seed.selectedCode || seed.mode === "fix_error" || seed.mode === "continue_code") add("nearby_code", 5, seed.nearbyCode, "editor_cursor", seed.mode === "continue_code" ? "Preceding and nearby code anchors continuation at the cursor." : "Nearby lines provide bounded local context.", { relativePath: seed.activeRelativePath, lineStart: Math.max(1, seed.cursorLine - 20), lineEnd: seed.cursorLine + 20 }, Boolean(symbol));

    if (seed.kind === "code") {
      const candidates = await this.discover(seed, gitignore);
      let related = 0;
      for (const candidate of candidates) {
        if (candidate.type === "related_file" && related >= seed.maximumRelatedFiles) { omitted.push({ type: "related_file", source: candidate.relativePath, reason: "Maximum related-file count reached." }); continue; }
        const file = await this.safeRead(candidate.relativePath, seed.exclusions, gitignore);
        if (!file) { omitted.push({ type: candidate.type, source: candidate.relativePath, reason: "Unavailable, excluded, binary, oversized, or unsafe." }); continue; }
        add(candidate.type, candidate.type === "project_rule" ? 7 : 6, file.content, candidate.provenance, candidate.reason, { relativePath: candidate.relativePath, lineStart: 1, lineEnd: file.content.split(/\r?\n/).length }, true, true, candidate.score);
        if (candidate.type === "related_file") related += 1;
      }
    } else if (!seed.selectedCode && ["explain_document", "summarize", "generate_readme_section"].includes(seed.mode)) {
      add("attached_markdown", 2, seed.content, "editor_selection", "The active Markdown document was explicitly requested for this documentation action.", { relativePath: seed.activeRelativePath, lineStart: 1, lineEnd: seed.content.split(/\r?\n/).length }, false, true);
    }
    if (seed.mode === "fix_error") add("terminal_error", 8, seed.runError, "run_output", "Run output directly matches the selected diagnostic.", {}, true);

    items.sort((left, right) => left.priority - right.priority || (right.relevanceScore ?? 0) - (left.relevanceScore ?? 0) || left.id.localeCompare(right.id));
    const selected: ProjectContextItem[] = []; let used = 0;
    for (const item of items) {
      const remaining = seed.maximumTotalCharacters - used;
      if (remaining <= 0) { omitted.push({ type: item.type, source: item.source.relativePath, reason: "Total context budget exhausted by higher-priority items." }); continue; }
      if (item.content.length <= remaining) { selected.push(item); used += item.content.length; continue; }
      if (item.optional || remaining < 100) { omitted.push({ type: item.type, source: item.source.relativePath, reason: "Omitted because higher-priority context consumed the budget." }); continue; }
      const content = item.content.slice(0, remaining);
      selected.push({ ...item, content, ...projectContextCost(content), truncated: true, completeFile: false }); used += content.length;
      omitted.push({ type: item.type, source: item.source.relativePath, reason: "Truncated deterministically to fit the total context budget." });
    }
    return {
      version: PROJECT_CONTEXT_VERSION,
      intent: { mode: seed.mode, instruction },
      activeFile: { relativePath: seed.activeRelativePath, fileName: seed.fileName, language: seed.language, kind: seed.kind },
      cursor: { line: seed.cursorLine, column: seed.cursorColumn },
      items: selected,
      omitted,
      totalCharacters: used,
      estimatedTokens: Math.ceil(used / 4),
      limits: { maximumTotalCharacters: seed.maximumTotalCharacters, maximumRelatedFiles: seed.maximumRelatedFiles, maximumCharactersPerFile: seed.maximumCharactersPerFile },
      containsCompleteFile: selected.some((item) => item.completeFile),
    };
  }

  private async discover(seed: ProjectContextSeed, gitignore: readonly string[]): Promise<Candidate[]> {
    const contentHash = createHash("sha256").update(seed.content).digest("hex").slice(0, 16);
    const cacheKey = `${seed.activeRelativePath}:${seed.mode}:${contentHash}:${seed.exclusions.join("|")}`;
    const cached = this.cache.get(cacheKey); if (cached?.generation === this.generation) return cached.candidates;
    const candidates = new Map<string, Candidate>();
    const offer = (candidate: Candidate) => { if (candidate.relativePath !== seed.activeRelativePath && !isIgnored(candidate.relativePath, seed.exclusions, gitignore) && (!candidates.has(candidate.relativePath) || candidates.get(candidate.relativePath)!.score < candidate.score)) candidates.set(candidate.relativePath, candidate); };
    for (const specifier of importSpecifiers(seed.content)) for (const relativePath of candidatePathsForImport(seed.activeRelativePath, specifier)) offer({ relativePath, score: 100, reason: `Direct local import “${specifier}” from the active file.`, provenance: "local_import", type: "related_file" });
    if (["generate_tests", "plan_multi_file"].includes(seed.mode)) {
      for (const relativePath of testNameCandidates(seed.activeRelativePath)) offer({ relativePath, score: 90, reason: "Nearby test naming pattern for the active implementation.", provenance: "nearby_test", type: "related_file" });
      for (const relativePath of CONFIG_FILES) offer({ relativePath, score: 70, reason: "Project configuration may identify the test framework or language conventions.", provenance: "project_configuration", type: "related_file" });
    }
    if (["improve_code", "continue_code", "generate_tests", "plan_multi_file"].includes(seed.mode)) for (const relativePath of RULE_FILES) offer({ relativePath, score: relativePath === "AGENTS.md" ? 85 : 60, reason: "Workspace-scoped project instructions or conventions.", provenance: "project_instruction", type: "project_rule" });
    const result = Array.from(candidates.values()).sort((a, b) => b.score - a.score || a.relativePath.localeCompare(b.relativePath)).slice(0, this.options.maximumCandidates ?? 100);
    this.cache.set(cacheKey, { generation: this.generation, candidates: result }); return result;
  }

  private async safeRead(relativePath: string, exclusions: readonly string[], gitignore: readonly string[]) {
    if (!this.rootPath || isIgnored(relativePath, exclusions, gitignore)) return null;
    try { return await readWorkspaceTextFile(this.rootPath, relativePath); } catch { return null; }
  }

  private async gitignorePatterns(): Promise<string[]> {
    if (!this.rootPath) return [];
    try {
      const target = await resolveWorkspacePath(this.rootPath, ".gitignore");
      const value = await readFile(target.realPath, "utf8");
      if (value.length > 100_000) return [];
      return value.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#")).slice(0, 1_000);
    } catch { return []; }
  }
}
