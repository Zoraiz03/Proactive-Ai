import assert from "node:assert/strict";
import test from "node:test";
import * as themeColors from "./theme-color.ts";
import { monacoThemeColor } from "./theme-color.ts";

test("serializes semantic alpha colors for Monaco without changing their values", () => {
  assert.equal(monacoThemeColor("rgb(138 90 52 / 15%)"), "#8a5a3426");
  assert.equal(monacoThemeColor("rgb(180 85 45 / 10%)"), "#b4552d1a");
  assert.equal(monacoThemeColor("rgb(180 85 45 / 5%)"), "#b4552d0d");
});

test("preserves already compatible theme colors", () => {
  assert.equal(monacoThemeColor("#faf7f0"), "#faf7f0");
  assert.equal(monacoThemeColor(" rgb(43 33 24) "), "#2b2118");
});

test("selects a matching Monaco theme for the resolved application theme", () => {
  const selectEditorTheme = (themeColors as Record<string, unknown>).editorThemeForResolvedTheme;
  assert.equal(typeof selectEditorTheme, "function", "Editor theme resolver must be available");
  assert.equal((selectEditorTheme as (theme: "light" | "dark") => string)("light"), "proactive-cream");
  assert.equal((selectEditorTheme as (theme: "light" | "dark") => string)("dark"), "proactive-dark");
});
