import { captureTabSelection } from "./page-capture.ts";
import { savePendingCapture } from "./pending-storage.ts";

const MENU_ID = "preview-selection-for-proactive-ide";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: MENU_ID, title: "Send selected text to Proactive AI IDE", contexts: ["selection"] });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== MENU_ID || !tab) return;
  void captureTabSelection(tab).then(async (capture) => {
    await savePendingCapture(chrome.storage.local, capture);
    await chrome.action.openPopup().catch(() => undefined);
  }).catch(() => undefined);
});
