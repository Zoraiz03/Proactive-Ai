import { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import editorWorker from "monaco-editor/editor/editor.worker?worker";
import cssWorker from "monaco-editor/language/css/css.worker?worker";
import htmlWorker from "monaco-editor/language/html/html.worker?worker";
import jsonWorker from "monaco-editor/language/json/json.worker?worker";
import typescriptWorker from "monaco-editor/language/typescript/ts.worker?worker";
import { MONACO_CREAM_THEME, themeColor } from "./theme";

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
