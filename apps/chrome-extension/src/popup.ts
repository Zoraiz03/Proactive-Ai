import { bridgeStatus, pairDesktop } from "./bridge-client.ts";
import { disableSite, enableSite, getSiteAccessState, type SiteAccessState } from "./site-access.ts";

const element = <T extends HTMLElement>(id: string): T => {
  const value = document.getElementById(id);
  if (!value) throw new Error(`Missing popup element: ${id}`);
  return value as T;
};

const badge = element<HTMLElement>("site-badge");
const siteName = element<HTMLElement>("site-name");
const siteStatus = element<HTMLParagraphElement>("site-status");
const toggle = element<HTMLButtonElement>("site-toggle");
const desktopStatus = element<HTMLParagraphElement>("desktop-status");
const code = element<HTMLInputElement>("pairing-code");
const pair = element<HTMLButtonElement>("pair");
let tab: chrome.tabs.Tab | null = null;
let site: SiteAccessState | null = null;

function renderSite(state: SiteAccessState) {
  site = state; siteName.textContent = state.hostname;
  badge.textContent = state.enabled ? "On" : "Off"; badge.classList.toggle("on", state.enabled);
  siteStatus.textContent = !state.supported ? "Chrome does not allow selection tools on this page." : state.enabled ? "Highlight page text to show the inline P icon." : "No page text is observed while this website is off.";
  toggle.disabled = !state.supported; toggle.textContent = state.enabled ? "Turn off for this website" : "Turn on for this website";
}

async function initialize() {
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  tab = activeTab ?? null;
  const current = tab ? await getSiteAccessState(tab) : { supported: false, enabled: false, hostname: "No active webpage", pattern: null, tabId: null };
  renderSite(tab && current.enabled ? await enableSite(tab) : current);
  const desktop = await bridgeStatus(); desktopStatus.textContent = desktop.message;
}

toggle.addEventListener("click", () => {
  if (!tab || !site) return;
  toggle.disabled = true;
  void (site.enabled ? disableSite(tab) : enableSite(tab)).then(renderSite).catch((error: unknown) => { siteStatus.textContent = error instanceof Error ? error.message : "Website access could not be changed."; toggle.disabled = false; });
});

code.addEventListener("input", () => { code.value = code.value.replace(/\D/g, "").slice(0, 8); });
pair.addEventListener("click", () => {
  pair.disabled = true; desktopStatus.textContent = "Connecting to the local IDE…";
  void pairDesktop(code.value).then((status) => { desktopStatus.textContent = status.message; code.value = ""; }).catch((error: unknown) => { desktopStatus.textContent = error instanceof Error ? error.message : "The IDE could not be paired."; }).finally(() => { pair.disabled = false; });
});

void initialize().catch(() => { siteStatus.textContent = "Extension state could not be loaded."; desktopStatus.textContent = "Desktop state could not be loaded."; });
