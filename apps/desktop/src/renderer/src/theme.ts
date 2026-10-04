import { monacoThemeColor } from "./theme-color";

export const MONACO_CREAM_THEME = "proactive-cream";
export const MONACO_DARK_THEME = "proactive-dark";

export function themeColor(token: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  if (!value) throw new Error(`Missing desktop theme token: ${token}`);
  return monacoThemeColor(value);
}
