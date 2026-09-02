import { hashText, safeWebUrl } from "./web-context.ts";

export interface SiteAccessState {
  supported: boolean;
  enabled: boolean;
  hostname: string;
  pattern: string | null;
  tabId: number | null;
}

export function sitePattern(rawUrl: string | undefined): string | null {
  const url = rawUrl ? safeWebUrl(rawUrl) : null;
  return url ? `${url.protocol}//${url.host}/*` : null;
}

async function scriptId(pattern: string): Promise<string> { return `proactive-site-${(await hashText(pattern)).slice(0, 20)}`; }

export async function getSiteAccessState(tab: chrome.tabs.Tab): Promise<SiteAccessState> {
  const pattern = sitePattern(tab.url);
  const tabId = Number.isInteger(tab.id) && tab.id! >= 0 ? tab.id! : null;
  const enabled = Boolean(pattern && tabId !== null && await chrome.permissions.contains({ origins: [pattern] }));
  const hostname = pattern && tab.url ? new URL(tab.url).hostname : "Unsupported page";
  return { supported: Boolean(pattern && tabId !== null), enabled, hostname, pattern, tabId };
}

export async function enableSite(tab: chrome.tabs.Tab): Promise<SiteAccessState> {
  const state = await getSiteAccessState(tab);
  if (!state.supported || !state.pattern || state.tabId === null) throw new Error("Open a normal HTTP or HTTPS webpage first.");
  const granted = state.enabled || await chrome.permissions.request({ origins: [state.pattern] });
  if (!granted) throw new Error("Website access was not granted.");
  const id = await scriptId(state.pattern);
  const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [id] });
  if (existing.length === 0) await chrome.scripting.registerContentScripts([{ id, matches: [state.pattern], js: ["selection-overlay.js"], runAt: "document_idle", persistAcrossSessions: true }]);
  try { await chrome.scripting.executeScript({ target: { tabId: state.tabId }, files: ["selection-overlay.js"] }); } catch { /* Restricted pages fail closed. */ }
  await chrome.action.setBadgeText({ tabId: state.tabId, text: "ON" });
  await chrome.action.setBadgeBackgroundColor({ tabId: state.tabId, color: "#216e42" });
  return { ...state, enabled: true };
}

export async function disableSite(tab: chrome.tabs.Tab): Promise<SiteAccessState> {
  const state = await getSiteAccessState(tab);
  if (!state.pattern || state.tabId === null) return state;
  const matchingTabs = await chrome.tabs.query({ url: state.pattern });
  await Promise.all(matchingTabs.map(async (matching) => {
    if (!Number.isInteger(matching.id) || matching.id! < 0) return;
    try { await chrome.tabs.sendMessage(matching.id!, { type: "proactive:disable" }); } catch { /* No injected UI is already disabled. */ }
    await chrome.action.setBadgeText({ tabId: matching.id!, text: "" });
  }));
  const id = await scriptId(state.pattern);
  const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [id] });
  if (existing.length) await chrome.scripting.unregisterContentScripts({ ids: [id] });
  await chrome.permissions.remove({ origins: [state.pattern] });
  return { ...state, enabled: false };
}
