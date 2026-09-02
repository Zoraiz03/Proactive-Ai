import { createWebContext, safeWebUrl, type ChromeSelectedTextContext } from "./web-context.ts";

export interface RawPageSelection { text: string; blockedField: boolean }

export function readExplicitPageSelection(): RawPageSelection {
  const active = document.activeElement;
  const tag = active?.tagName.toLowerCase() ?? "";
  const editable = tag === "input" || tag === "textarea" || Boolean((active as HTMLElement | null)?.isContentEditable);
  const autocomplete = active?.getAttribute("autocomplete")?.toLowerCase() ?? "";
  const password = tag === "input" && (active?.getAttribute("type")?.toLowerCase() === "password" || ["current-password", "new-password", "one-time-code"].includes(autocomplete));
  if (editable || password) return { text: "", blockedField: true };
  return { text: window.getSelection()?.toString() ?? "", blockedField: false };
}

export async function captureTabSelection(tab: chrome.tabs.Tab): Promise<ChromeSelectedTextContext> {
  if (!tab.active || !tab.id || !tab.url || !safeWebUrl(tab.url)) throw new Error("Open an active, normal HTTP or HTTPS page before capturing a selection.");
  const results = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: readExplicitPageSelection });
  const selection = results[0]?.result;
  if (!selection) throw new Error("The page selection could not be read.");
  if (selection.blockedField) throw new Error("Selections from form, editable, password, or sensitive fields are not captured.");
  return createWebContext({ selectedText: selection.text, sourceTitle: tab.title ?? "Selected webpage", sourceUrl: tab.url });
}

export async function captureActiveTabSelection(): Promise<ChromeSelectedTextContext> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) throw new Error("No active webpage is available.");
  return captureTabSelection(tab);
}
