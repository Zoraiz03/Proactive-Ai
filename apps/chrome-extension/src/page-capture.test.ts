import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { captureTabSelection, readExplicitPageSelection } from "./page-capture.ts";

const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");

function installPage(activeElement: Record<string, unknown> | null, text: string) {
  Object.defineProperty(globalThis, "document", { configurable: true, value: { activeElement } });
  Object.defineProperty(globalThis, "window", { configurable: true, value: { getSelection: () => ({ toString: () => text }) } });
}

function element(tagName: string, attributes: Record<string, string> = {}, isContentEditable = false) {
  return { tagName, isContentEditable, getAttribute: (name: string) => attributes[name] ?? null };
}

afterEach(() => {
  if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument);
  else Reflect.deleteProperty(globalThis, "document");
  if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
  else Reflect.deleteProperty(globalThis, "window");
});

test("reads only the explicit document selection", () => {
  installPage(element("P"), "Selected paragraph");
  assert.deepEqual(readExplicitPageSelection(), { text: "Selected paragraph", blockedField: false });
});

test("rejects password, sensitive autocomplete, form, and editable fields", () => {
  const blocked = [
    element("INPUT", { type: "password" }),
    element("INPUT", { autocomplete: "one-time-code" }),
    element("INPUT", { type: "text" }),
    element("TEXTAREA"),
    element("DIV", {}, true),
  ];
  for (const active of blocked) {
    installPage(active, "must not capture");
    assert.deepEqual(readExplicitPageSelection(), { text: "", blockedField: true });
  }
});

test("rejects a background tab before attempting script injection", async () => {
  await assert.rejects(
    () => captureTabSelection({ id: 7, active: false, title: "Background", url: "https://example.test" }),
    /active, normal HTTP or HTTPS page/,
  );
});
