export const MARKDOWN_EXTENSIONS = [".md", ".mdx"] as const;

export type MarkdownViewMode = "edit" | "preview" | "split";

export interface MarkdownHeading {
  id: string;
  level: number;
  line: number;
  text: string;
}

function extensionOf(fileName: string): string {
  const dotIndex = fileName.lastIndexOf(".");
  return dotIndex >= 0 ? fileName.slice(dotIndex).toLowerCase() : "";
}

export function isMarkdownFile(fileName: string): boolean {
  return MARKDOWN_EXTENSIONS.includes(extensionOf(fileName) as typeof MARKDOWN_EXTENSIONS[number]);
}

function headingText(value: string): string {
  return value
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/[`*_~]/g, "")
    .replace(/\\([\\`*_{}[\]()#+.!-])/g, "$1")
    .trim();
}

export function markdownHeadingId(line: number): string {
  return `markdown-heading-${line}`;
}

export function extractMarkdownHeadings(source: string): MarkdownHeading[] {
  const lines = source.split(/\r?\n/);
  const headings: MarkdownHeading[] = [];
  let fence: string | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const fenceMatch = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (fenceMatch) {
      const marker = fenceMatch[1][0];
      if (!fence) fence = marker;
      else if (fence === marker) fence = null;
      continue;
    }
    if (fence) continue;

    const atx = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (atx) {
      const text = headingText(atx[2]);
      if (text) headings.push({ id: markdownHeadingId(index + 1), level: atx[1].length, line: index + 1, text });
      continue;
    }

    const nextLine = lines[index + 1] ?? "";
    const setext = nextLine.match(/^\s{0,3}(=+|-+)\s*$/);
    if (line.trim() && setext) {
      const text = headingText(line);
      if (text) {
        headings.push({
          id: markdownHeadingId(index + 1),
          level: setext[1][0] === "=" ? 1 : 2,
          line: index + 1,
          text,
        });
      }
      index += 1;
    }
  }

  return headings;
}

export function safeMarkdownUrl(url: string): string {
  const value = url.trim();
  if (!value) return "";
  if (value.startsWith("#") || value.startsWith("/") || value.startsWith("./") || value.startsWith("../")) {
    return value;
  }
  const scheme = value.match(/^([a-z][a-z\d+.-]*):/i)?.[1]?.toLowerCase();
  return !scheme || ["http", "https", "mailto"].includes(scheme) ? value : "";
}
