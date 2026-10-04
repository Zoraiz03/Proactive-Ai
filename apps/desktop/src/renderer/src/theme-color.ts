const MODERN_RGB = /^rgb\(\s*(\d+)\s+(\d+)\s+(\d+)(?:\s*\/\s*([\d.]+)(%?))?\s*\)$/i;

const hexByte = (value: number) => Math.round(value).toString(16).padStart(2, "0");

export function editorThemeForResolvedTheme(theme: "light" | "dark"): string {
  return theme === "dark" ? "proactive-dark" : "proactive-cream";
}

export function monacoThemeColor(value: string): string {
  const match = value.trim().match(MODERN_RGB);
  if (!match) return value.trim();

  const red = Math.min(255, Number(match[1]));
  const green = Math.min(255, Number(match[2]));
  const blue = Math.min(255, Number(match[3]));
  const alphaValue = match[4];
  if (alphaValue === undefined) return `#${hexByte(red)}${hexByte(green)}${hexByte(blue)}`;

  const alpha = match[5] === "%" ? Number(alphaValue) / 100 : Number(alphaValue);
  return `#${hexByte(red)}${hexByte(green)}${hexByte(blue)}${hexByte(Math.min(1, Math.max(0, alpha)) * 255)}`;
}
