import { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import editorWorker from "monaco-editor/editor/editor.worker?worker";
import cssWorker from "monaco-editor/language/css/css.worker?worker";
import htmlWorker from "monaco-editor/language/html/html.worker?worker";
import jsonWorker from "monaco-editor/language/json/json.worker?worker";
import typescriptWorker from "monaco-editor/language/typescript/ts.worker?worker";
import { MONACO_CREAM_THEME, MONACO_DARK_THEME, themeColor } from "./theme";

self.MonacoEnvironment = {
  getWorker(_moduleId: string, label: string): Worker {
    if (label === "json") return new jsonWorker();
    if (label === "css" || label === "scss" || label === "less") return new cssWorker();
    if (label === "html" || label === "handlebars" || label === "razor") {
      return new htmlWorker();
    }
    if (label === "typescript" || label === "javascript") return new typescriptWorker();
    return new editorWorker();
  },
};

loader.config({ monaco });

monaco.editor.defineTheme(MONACO_CREAM_THEME, {
  base: "vs",
  inherit: true,
  rules: [
    { token: "comment", foreground: themeColor("--ink-soft").slice(1), fontStyle: "italic" },
    { token: "keyword", foreground: themeColor("--ember").slice(1) },
    { token: "string", foreground: themeColor("--bronze").slice(1) },
    { token: "number", foreground: themeColor("--bronze-deep").slice(1) },
    { token: "type", foreground: themeColor("--bronze-deep").slice(1) },
    { token: "type.identifier", foreground: themeColor("--bronze-deep").slice(1) },
    { token: "function", foreground: themeColor("--bronze").slice(1) },
    { token: "variable", foreground: themeColor("--ink").slice(1) },
  ],
  colors: {
    "editor.background": themeColor("--desktop-canvas"),
    "editor.foreground": themeColor("--desktop-text"),
    "editorCursor.foreground": themeColor("--desktop-accent"),
    "editorLineNumber.foreground": themeColor("--desktop-text-muted"),
    "editorLineNumber.activeForeground": themeColor("--desktop-accent"),
    "editor.lineHighlightBackground": themeColor("--desktop-hover"),
    "editor.selectionBackground": themeColor("--bronze-15"),
    "editor.inactiveSelectionBackground": themeColor("--desktop-selected"),
    "editorIndentGuide.background1": themeColor("--desktop-border"),
    "editorIndentGuide.activeBackground1": themeColor("--desktop-border-strong"),
    "editorWhitespace.foreground": themeColor("--desktop-border"),
    "editorGutter.background": themeColor("--desktop-canvas"),
    "editorWidget.background": themeColor("--desktop-surface"),
    "editorWidget.border": themeColor("--desktop-border"),
    "editorSuggestWidget.background": themeColor("--desktop-surface"),
    "editorSuggestWidget.border": themeColor("--desktop-border"),
    "editorSuggestWidget.foreground": themeColor("--desktop-text"),
    "editorSuggestWidget.selectedBackground": themeColor("--desktop-selected"),
    "editorHoverWidget.background": themeColor("--desktop-surface"),
    "editorHoverWidget.border": themeColor("--desktop-border"),
    "editor.findMatchBackground": themeColor("--bronze-40"),
    "editor.findMatchBorder": themeColor("--desktop-accent-hover"),
    "editor.findMatchHighlightBackground": themeColor("--bronze-15"),
    "editorError.foreground": themeColor("--desktop-error"),
    "editorWarning.foreground": themeColor("--desktop-accent-hover"),
    "editorInfo.foreground": themeColor("--desktop-text-muted"),
    "editorOverviewRuler.border": themeColor("--desktop-border"),
    "editorOverviewRuler.errorForeground": themeColor("--desktop-error"),
    "editorOverviewRuler.warningForeground": themeColor("--desktop-accent-hover"),
    "editorOverviewRuler.infoForeground": themeColor("--desktop-text-muted"),
    "diffEditor.insertedTextBackground": themeColor("--bronze-15"),
    "diffEditor.removedTextBackground": themeColor("--ember-10"),
    "diffEditor.insertedLineBackground": themeColor("--bronze-15"),
    "diffEditor.removedLineBackground": themeColor("--ember-5"),
    "scrollbar.shadow": themeColor("--ink-10"),
    "scrollbarSlider.background": themeColor("--ink-15"),
    "scrollbarSlider.hoverBackground": themeColor("--bronze-40"),
    "scrollbarSlider.activeBackground": themeColor("--desktop-accent-hover"),
  },
});

monaco.editor.defineTheme(MONACO_DARK_THEME, {
  base: "vs-dark",
  inherit: true,
  rules: [
    { token: "comment", foreground: "CBBBA7", fontStyle: "italic" },
    { token: "keyword", foreground: "E58A62" },
    { token: "string", foreground: "D7AA6F" },
    { token: "number", foreground: "E7C38F" },
    { token: "type", foreground: "E7C38F" },
    { token: "type.identifier", foreground: "E7C38F" },
    { token: "function", foreground: "D7AA6F" },
    { token: "variable", foreground: "F5EDE1" },
  ],
  colors: {
    "editor.background": "#18100b",
    "editor.foreground": "#f5ede1",
    "editorCursor.foreground": "#d7aa6f",
    "editorLineNumber.foreground": "#987e62",
    "editorLineNumber.activeForeground": "#e7c38f",
    "editor.lineHighlightBackground": "#2d2016",
    "editor.selectionBackground": "#72583c80",
    "editor.inactiveSelectionBackground": "#342418",
    "editorIndentGuide.background1": "#4c3827",
    "editorIndentGuide.activeBackground1": "#72583c",
    "editorWhitespace.foreground": "#4c3827",
    "editorGutter.background": "#18100b",
    "editorWidget.background": "#211710",
    "editorWidget.border": "#4c3827",
    "editorSuggestWidget.background": "#211710",
    "editorSuggestWidget.border": "#4c3827",
    "editorSuggestWidget.foreground": "#f5ede1",
    "editorSuggestWidget.selectedBackground": "#342418",
    "editorHoverWidget.background": "#211710",
    "editorHoverWidget.border": "#4c3827",
    "editor.findMatchBackground": "#72583c99",
    "editor.findMatchBorder": "#e7c38f",
    "editor.findMatchHighlightBackground": "#72583c66",
    "editorError.foreground": "#e5654f",
    "editorWarning.foreground": "#e8b84f",
    "editorInfo.foreground": "#cbbba7",
    "editorOverviewRuler.border": "#4c3827",
    "editorOverviewRuler.errorForeground": "#e5654f",
    "editorOverviewRuler.warningForeground": "#e8b84f",
    "editorOverviewRuler.infoForeground": "#cbbba7",
    "diffEditor.insertedTextBackground": "#72583c66",
    "diffEditor.removedTextBackground": "#b4552d33",
    "diffEditor.insertedLineBackground": "#72583c33",
    "diffEditor.removedLineBackground": "#b4552d1f",
    "scrollbar.shadow": "#00000066",
    "scrollbarSlider.background": "#987e6255",
    "scrollbarSlider.hoverBackground": "#d7aa6f66",
    "scrollbarSlider.activeBackground": "#e7c38f88",
  },
});
