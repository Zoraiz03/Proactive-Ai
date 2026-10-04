import type { IpcResult } from "./workspace";

export const SEARCH_CHANNELS = {
  start: "search:start",
  cancel: "search:cancel",
  batch: "search:batch",
} as const;

export const SEARCH_LIMITS = {
  query: 1_000,
  pattern: 500,
  minimumResults: 10,
  maximumResults: 2_000,
  defaultResults: 500,
  preview: 260,
  fileSuggestions: 50,
} as const;

export interface WorkspaceSearchRequest {
  searchId: string;
  query: string;
  caseSensitive: boolean;
  wholeWord: boolean;
  regularExpression: boolean;
  includePattern?: string;
  excludePattern?: string;
  resultLimit: number;
}

export interface WorkspaceSearchMatch {
  relativePath: string;
  line: number;
  column: number;
  endColumn: number;
  preview: string;
  previewMatchStart: number;
  previewMatchLength: number;
}

export interface WorkspaceFileSuggestion {
  relativePath: string;
  matchIndices: number[];
}

export interface WorkspaceSearchBatch {
  searchId: string;
  matches: WorkspaceSearchMatch[];
  files?: WorkspaceFileSuggestion[];
}

export interface WorkspaceSearchCompletion {
  searchId: string;
  matchCount: number;
  fileCount: number;
  files?: WorkspaceFileSuggestion[];
  truncated: boolean;
  cancelled: boolean;
}

export interface WorkspaceSearchBridge {
  search: (request: WorkspaceSearchRequest) => Promise<IpcResult<WorkspaceSearchCompletion>>;
  cancel: (searchId?: string) => Promise<IpcResult<void>>;
  onBatch: (listener: (batch: WorkspaceSearchBatch) => void) => () => void;
}

function validOptionalPattern(value: unknown): value is string | undefined {
  return value === undefined || (
    typeof value === "string" &&
    value.length <= SEARCH_LIMITS.pattern &&
    !/[\0\r\n{}[\]]/.test(value) &&
    splitSearchPatterns(value).every((pattern) => !pattern.startsWith("!"))
  );
}

export function validateWorkspaceSearchRequest(value: unknown): WorkspaceSearchRequest | null {
  if (!value || typeof value !== "object") return null;
  const request = value as Partial<WorkspaceSearchRequest>;
  if (
    typeof request.searchId !== "string" || !/^[a-zA-Z0-9-]{1,80}$/.test(request.searchId) ||
    typeof request.query !== "string" || !request.query.trim() || request.query.length > SEARCH_LIMITS.query ||
    typeof request.caseSensitive !== "boolean" ||
    typeof request.wholeWord !== "boolean" ||
    typeof request.regularExpression !== "boolean" ||
    !validOptionalPattern(request.includePattern) ||
    !validOptionalPattern(request.excludePattern) ||
    typeof request.resultLimit !== "number" || !Number.isInteger(request.resultLimit) ||
    request.resultLimit < SEARCH_LIMITS.minimumResults ||
    request.resultLimit > SEARCH_LIMITS.maximumResults
  ) return null;
  return {
    searchId: request.searchId,
    query: request.query,
    caseSensitive: request.caseSensitive,
    wholeWord: request.wholeWord,
    regularExpression: request.regularExpression,
    ...(request.includePattern?.trim() ? { includePattern: request.includePattern.trim() } : {}),
    ...(request.excludePattern?.trim() ? { excludePattern: request.excludePattern.trim() } : {}),
    resultLimit: request.resultLimit,
  };
}

export function splitSearchPatterns(value: string | undefined): string[] {
  return (value ?? "").split(",").map((pattern) => pattern.trim()).filter(Boolean);
}

function globRegex(pattern: string): RegExp | null {
  const normalized = pattern.replaceAll("\\", "/").replace(/^\.\//, "");
  if (!normalized || normalized.startsWith("!")) return null;
  let source = "";
  for (let index = 0; index < normalized.length; index += 1) {
    const character = normalized[index];
    if (character === "*" && normalized[index + 1] === "*") {
      const followedBySlash = normalized[index + 2] === "/";
      source += followedBySlash ? "(?:.*/)?" : ".*";
      index += followedBySlash ? 2 : 1;
    } else if (character === "*") source += "[^/]*";
    else if (character === "?") source += "[^/]";
    else source += character.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
  }
  const prefix = normalized.includes("/") ? "^" : "^(?:.*/)?";
  try {
    return new RegExp(`${prefix}${source}$`);
  } catch {
    return null;
  }
}

export function searchPathMatchesPatterns(
  relativePath: string,
  includePattern?: string,
  excludePattern?: string
): boolean {
  const normalized = relativePath.replaceAll("\\", "/");
  const includes = splitSearchPatterns(includePattern).map(globRegex).filter((value): value is RegExp => Boolean(value));
  const excludes = splitSearchPatterns(excludePattern).map((pattern) => pattern.replace(/^!+/, ""))
    .map(globRegex).filter((value): value is RegExp => Boolean(value));
  return (includes.length === 0 || includes.some((pattern) => pattern.test(normalized))) &&
    !excludes.some((pattern) => pattern.test(normalized));
}

export function searchMatchSelection(match: WorkspaceSearchMatch) {
  return {
    relativePath: match.relativePath,
    line: match.line,
    column: match.column,
    endColumn: match.endColumn,
  };
}
