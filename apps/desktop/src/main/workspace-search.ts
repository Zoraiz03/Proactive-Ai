import { spawn, type ChildProcess } from "node:child_process";
import { isAbsolute, normalize, relative, sep } from "node:path";
import { rgPath } from "@vscode/ripgrep";
import {
  searchPathMatchesPatterns,
  SEARCH_LIMITS,
  type WorkspaceSearchBatch,
  type WorkspaceSearchCompletion,
  type WorkspaceFileSuggestion,
  type WorkspaceSearchMatch,
  type WorkspaceSearchRequest,
} from "../shared/search.ts";
import { isSupportedWorkspaceTextFile } from "./workspace-files.ts";

const SUPPORTED_EXTENSIONS = [
  "js", "mjs", "jsx", "ts", "tsx", "py", "java", "c", "cpp", "h", "html",
  "css", "json", "md", "mdx", "txt", "yml", "yaml",
];
const IGNORED_DIRECTORIES = [".git", "node_modules", ".next", "dist", "build", "coverage"];
const SECRET_GLOBS = [
  ".env", ".env.*", ".npmrc", ".pypirc", ".netrc", "credentials", "credentials.*",
  "secret", "secret.*", "secrets", "secrets.*", "service-account.json", "service_account.json",
  "application_default_credentials.json", "id_rsa", "id_ed25519", "*.pem", "*.key", "*.p12", "*.pfx",
];
const SEARCH_ENVIRONMENT_NAMES = ["SYSTEMROOT", "WINDIR", "TEMP", "TMP", "TMPDIR", "LANG", "LC_ALL"] as const;

export function searchProcessEnvironment(source: NodeJS.ProcessEnv): Record<string, string> {
  const environment: Record<string, string> = {};
  for (const name of SEARCH_ENVIRONMENT_NAMES) {
    const value = source[name];
    if (value !== undefined) environment[name] = value;
  }
  return environment;
}

function safeRelativePath(rootPath: string, candidate: string): string | null {
  const withoutDot = candidate.replaceAll("\\", "/").replace(/^\.\//, "");
  if (!withoutDot || withoutDot.includes("\0") || isAbsolute(withoutDot)) return null;
  const normalized = normalize(withoutDot);
  if (normalized === ".." || normalized.startsWith(`..${sep}`) || isAbsolute(normalized)) return null;
  const resolvedRelative = relative(rootPath, normalize(`${rootPath}${sep}${normalized}`));
  if (resolvedRelative === ".." || resolvedRelative.startsWith(`..${sep}`) || isAbsolute(resolvedRelative)) return null;
  return normalized.replaceAll("\\", "/");
}

export function isDefaultSearchSecret(relativePath: string): boolean {
  const name = relativePath.replaceAll("\\", "/").split("/").at(-1)?.toLowerCase() ?? "";
  return name === ".env" || name.startsWith(".env.") ||
    [
      ".npmrc", ".pypirc", ".netrc", "credentials", "secret", "secrets", "service-account.json",
      "service_account.json", "application_default_credentials.json", "id_rsa", "id_ed25519",
    ].includes(name) || /^(?:credentials|secrets?)\./.test(name) || /\.(?:pem|key|p12|pfx)$/.test(name);
}

export function isIgnoredSearchPath(relativePath: string): boolean {
  const segments = relativePath.replaceAll("\\", "/").toLowerCase().split("/");
  return segments.some((segment) => IGNORED_DIRECTORIES.includes(segment));
}

export function buildRipgrepSearchArguments(request: WorkspaceSearchRequest): string[] {
  const args = [
    "--json",
    "--line-number",
    "--column",
    "--color", "never",
    "--no-config",
    "--hidden",
    "--no-follow",
    "--no-require-git",
    "--max-filesize", "1M",
    request.caseSensitive ? "--case-sensitive" : "--ignore-case",
  ];
  if (!request.regularExpression) args.push("--fixed-strings");
  if (request.wholeWord) args.push("--word-regexp");
  for (const extension of SUPPORTED_EXTENSIONS) {
    const insensitiveExtension = extension.split("").map((character) => `[${character.toLowerCase()}${character.toUpperCase()}]`).join("");
    args.push("--type-add", `proactive:*.${insensitiveExtension}`);
  }
  args.push("--type", "proactive");
  for (const directory of IGNORED_DIRECTORIES) {
    args.push("--iglob", `!${directory}/**`, "--iglob", `!**/${directory}/**`);
  }
  for (const secret of SECRET_GLOBS) {
    args.push("--iglob", `!${secret}`, "--iglob", `!**/${secret}`);
  }
  args.push("--regexp", request.query, ".");
  return args;
}

export function buildRipgrepFileArguments(): string[] {
  const args = ["--files", "--hidden", "--no-follow", "--no-require-git", "--no-config"];
  for (const extension of SUPPORTED_EXTENSIONS) {
    const insensitiveExtension = extension.split("").map((character) => `[${character.toLowerCase()}${character.toUpperCase()}]`).join("");
    args.push("--type-add", `proactive:*.${insensitiveExtension}`);
  }
  args.push("--type", "proactive");
  for (const directory of IGNORED_DIRECTORIES) {
    args.push("--iglob", `!${directory}/**`, "--iglob", `!**/${directory}/**`);
  }
  for (const secret of SECRET_GLOBS) {
    args.push("--iglob", `!${secret}`, "--iglob", `!**/${secret}`);
  }
  return args;
}

function fuzzyFileMatch(relativePath: string, rawQuery: string): { matchIndices: number[]; score: number } | null {
  const query = rawQuery.trim().toLocaleLowerCase();
  const candidate = relativePath.toLocaleLowerCase();
  if (!query) return null;
  const basenameStart = relativePath.lastIndexOf("/") + 1;
  const basename = candidate.slice(basenameStart);
  const direct = candidate.indexOf(query);
  if (direct >= 0) {
    const matchIndices = Array.from({ length: query.length }, (_, index) => direct + index);
    const inBasename = direct >= basenameStart;
    const atBasenameStart = direct === basenameStart;
    return { matchIndices, score: (atBasenameStart ? 0 : inBasename ? 20 : 50) + direct + relativePath.length / 1_000 };
  }
  const matchIndices: number[] = [];
  let cursor = 0;
  for (const character of query) {
    const index = candidate.indexOf(character, cursor);
    if (index < 0) return null;
    matchIndices.push(index);
    cursor = index + 1;
  }
  const gaps = matchIndices.at(-1)! - matchIndices[0] - matchIndices.length + 1;
  const basenamePenalty = matchIndices[0] >= basenameStart ? 0 : 40;
  const boundaryBonus = basename.startsWith(query[0]) ? -10 : 0;
  return { matchIndices, score: 100 + basenamePenalty + boundaryBonus + gaps * 4 + matchIndices[0] + relativePath.length / 1_000 };
}

export function rankWorkspaceFileSuggestions(
  paths: readonly string[],
  request: WorkspaceSearchRequest
): WorkspaceFileSuggestion[] {
  return paths.flatMap((relativePath): Array<WorkspaceFileSuggestion & { score: number }> => {
    if (
      !isSupportedWorkspaceTextFile(relativePath) || isIgnoredSearchPath(relativePath) ||
      isDefaultSearchSecret(relativePath) ||
      !searchPathMatchesPatterns(relativePath, request.includePattern, request.excludePattern)
    ) return [];
    const match = fuzzyFileMatch(relativePath, request.query);
    return match ? [{ relativePath, matchIndices: match.matchIndices, score: match.score }] : [];
  }).sort((left, right) => left.score - right.score || left.relativePath.localeCompare(right.relativePath))
    .slice(0, SEARCH_LIMITS.fileSuggestions)
    .map(({ relativePath, matchIndices }) => ({ relativePath, matchIndices }));
}

function textValue(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const text = (value as { text?: unknown }).text;
  return typeof text === "string" ? text : null;
}

function byteOffsetToStringIndex(value: string, byteOffset: number): number {
  return Buffer.from(value, "utf8").subarray(0, Math.max(0, byteOffset)).toString("utf8").length;
}

function previewForMatch(lineText: string, matchStart: number, matchLength: number) {
  const source = lineText.replace(/[\r\n]+$/, "");
  const start = Math.max(0, matchStart - 80);
  const end = Math.min(source.length, Math.max(matchStart + matchLength + 100, start + SEARCH_LIMITS.preview));
  const prefix = start > 0 ? "…" : "";
  const suffix = end < source.length ? "…" : "";
  return {
    preview: `${prefix}${source.slice(start, end)}${suffix}`,
    previewMatchStart: prefix.length + matchStart - start,
    previewMatchLength: matchLength,
  };
}

export function parseRipgrepMatch(
  rootPath: string,
  request: WorkspaceSearchRequest,
  raw: unknown
): WorkspaceSearchMatch[] {
  if (!raw || typeof raw !== "object") return [];
  const message = raw as { type?: unknown; data?: Record<string, unknown> };
  if (message.type !== "match" || !message.data) return [];
  const path = safeRelativePath(rootPath, textValue(message.data.path) ?? "");
  const lineText = textValue(message.data.lines);
  const line = message.data.line_number;
  const submatches = message.data.submatches;
  if (
    !path || !isSupportedWorkspaceTextFile(path) || isIgnoredSearchPath(path) || isDefaultSearchSecret(path) ||
    !searchPathMatchesPatterns(path, request.includePattern, request.excludePattern) ||
    !lineText || typeof line !== "number" || !Number.isInteger(line) || line < 1 ||
    !Array.isArray(submatches)
  ) return [];
  return submatches.flatMap((candidate): WorkspaceSearchMatch[] => {
    if (!candidate || typeof candidate !== "object") return [];
    const submatch = candidate as { start?: unknown; end?: unknown; match?: unknown };
    if (typeof submatch.start !== "number" || typeof submatch.end !== "number") return [];
    const matchText = textValue(submatch.match);
    if (matchText === null) return [];
    const start = byteOffsetToStringIndex(lineText, submatch.start);
    const length = matchText.length;
    return [{
      relativePath: path,
      line,
      column: start + 1,
      endColumn: start + length + 1,
      ...previewForMatch(lineText, start, length),
    }];
  });
}

export interface WorkspaceSearchServiceOptions {
  binaryPath?: string;
}

export class WorkspaceSearchService {
  private active: { searchId: string; process: Pick<ChildProcess, "kill"> | null; cancelled: boolean } | null = null;
  private readonly binaryPath: string;

  constructor(options: WorkspaceSearchServiceOptions = {}) {
    this.binaryPath = options.binaryPath ?? rgPath;
  }

  cancel(searchId?: string): boolean {
    if (!this.active || (searchId && this.active.searchId !== searchId)) return false;
    this.active.cancelled = true;
    this.active.process?.kill();
    return true;
  }

  search(
    rootPath: string,
    request: WorkspaceSearchRequest,
    onBatch: (batch: WorkspaceSearchBatch) => void
  ): Promise<WorkspaceSearchCompletion> {
    this.cancel();
    const active = { searchId: request.searchId, process: null as Pick<ChildProcess, "kill"> | null, cancelled: false };
    this.active = active;
    const discoverFiles = () => new Promise<WorkspaceFileSuggestion[]>((resolve, reject) => {
      const child = spawn(this.binaryPath, buildRipgrepFileArguments(), {
        cwd: rootPath,
        shell: false,
        windowsHide: true,
        env: searchProcessEnvironment(process.env) as NodeJS.ProcessEnv,
        stdio: ["ignore", "pipe", "pipe"],
      });
      active.process = child;
      let stdout = "";
      let stderr = "";
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => { stdout += chunk; });
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk: string) => { stderr = (stderr + chunk).slice(-4_000); });
      child.once("error", reject);
      child.once("close", (code) => {
        if (active.cancelled) return resolve([]);
        if (code !== 0 && code !== 1) return reject(new Error(stderr.trim() || "Workspace file discovery failed."));
        const paths = stdout.split(/\r?\n/).flatMap((candidate) => {
          const safe = safeRelativePath(rootPath, candidate);
          return safe ? [safe] : [];
        });
        resolve(rankWorkspaceFileSuggestions(paths, request));
      });
    });
    const searchContent = () => new Promise<WorkspaceSearchCompletion>((resolve, reject) => {
      const child = spawn(this.binaryPath, buildRipgrepSearchArguments(request), {
        cwd: rootPath,
        shell: false,
        windowsHide: true,
        env: searchProcessEnvironment(process.env) as NodeJS.ProcessEnv,
        stdio: ["ignore", "pipe", "pipe"],
      });
      active.process = child;
      let stdout = "";
      let stderr = "";
      let matchCount = 0;
      let truncated = false;
      let pending: WorkspaceSearchMatch[] = [];

      const flush = () => {
        if (!pending.length) return;
        onBatch({ searchId: request.searchId, matches: pending });
        pending = [];
      };
      const consumeLine = (line: string) => {
        if (!line || truncated || active.cancelled) return;
        let parsed: unknown;
        try { parsed = JSON.parse(line); } catch { return; }
        for (const match of parseRipgrepMatch(rootPath, request, parsed)) {
          if (matchCount >= request.resultLimit) {
            truncated = true;
            child.kill();
            break;
          }
          pending.push(match);
          matchCount += 1;
          if (pending.length >= 50) flush();
        }
      };

      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        stdout += chunk;
        const lines = stdout.split("\n");
        stdout = lines.pop() ?? "";
        lines.forEach(consumeLine);
      });
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk: string) => { stderr = (stderr + chunk).slice(-4_000); });
      child.once("error", (error) => {
        reject(error);
      });
      child.once("close", (code) => {
        if (stdout) consumeLine(stdout);
        flush();
        if (active.cancelled) {
          resolve({ searchId: request.searchId, matchCount, fileCount: 0, truncated: false, cancelled: true });
        } else if (truncated) {
          resolve({ searchId: request.searchId, matchCount, fileCount: 0, truncated: true, cancelled: false });
        } else if (code === 0 || code === 1) {
          resolve({ searchId: request.searchId, matchCount, fileCount: 0, truncated: false, cancelled: false });
        } else {
          reject(new Error(stderr.trim() || "Workspace search failed."));
        }
      });
    });
    return discoverFiles().then(async (files) => {
      if (active.cancelled) return { searchId: request.searchId, matchCount: 0, fileCount: 0, truncated: false, cancelled: true };
      if (files.length) onBatch({ searchId: request.searchId, matches: [], files });
      const completion = await searchContent();
      return { ...completion, fileCount: files.length, files };
    }).finally(() => {
      if (this.active === active) this.active = null;
    });
  }
}
