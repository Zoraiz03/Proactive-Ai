import { sendToDesktop } from "./bridge-client.ts";
import { createWebContext } from "./web-context.ts";
import { getSiteAccessState } from "./site-access.ts";

interface SelectionSendMessage { type: "proactive:send-selection"; selectedText: string; userEdited: boolean }

async function updateBadge(tab: chrome.tabs.Tab) {
  if (!Number.isInteger(tab.id) || tab.id! < 0) return;
  const tabId = tab.id!;
  const state = await getSiteAccessState(tab);
  await chrome.action.setBadgeText({ tabId, text: state.enabled ? "ON" : "" });
  if (state.enabled) await chrome.action.setBadgeBackgroundColor({ tabId, color: "#216e42" });
}

chrome.tabs.onActivated.addListener(({ tabId }) => { void chrome.tabs.get(tabId).then(updateBadge).catch(() => undefined); });
chrome.tabs.onUpdated.addListener((_tabId, change, tab) => { if (change.status === "complete" || change.url) void updateBadge(tab).catch(() => undefined); });

chrome.runtime.onMessage.addListener((value: unknown, sender, sendResponse) => {
  const message = value as Partial<SelectionSendMessage>;
  if (message.type !== "proactive:send-selection") return false;
  void (async () => {
    const tab = sender.tab;
    if (!tab?.active || !tab.url || typeof message.selectedText !== "string" || typeof message.userEdited !== "boolean") return { ok: false, message: "The active page selection is no longer available." };
    const capture = await createWebContext({ selectedText: message.selectedText, sourceTitle: tab.title ?? "Selected webpage", sourceUrl: tab.url, userEdited: message.userEdited });
    return sendToDesktop(capture);
  })().then(sendResponse).catch((error: unknown) => sendResponse({ ok: false, message: error instanceof Error ? error.message : "Selection could not be sent." }));
  return true;
});
