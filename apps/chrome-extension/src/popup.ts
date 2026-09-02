import { captureActiveTabSelection } from "./page-capture.ts";
import { clearPendingCapture, loadPendingCapture, savePendingCapture } from "./pending-storage.ts";
import { editWebContext, type ChromeSelectedTextContext } from "./web-context.ts";

const element = <T extends HTMLElement>(id: string): T => {
  const value = document.getElementById(id);
  if (!value) throw new Error(`Missing popup element: ${id}`);
  return value as T;
};

const status = element<HTMLParagraphElement>("status");
const preview = element<HTMLElement>("preview");
const selectedText = element<HTMLTextAreaElement>("selected-text");
const sourceTitle = element<HTMLElement>("source-title");
const hostname = element<HTMLElement>("hostname");
const sourceUrl = element<HTMLElement>("source-url");
const characterCount = element<HTMLElement>("character-count");
const capturedAt = element<HTMLTimeElement>("captured-at");
const flags = element<HTMLElement>("flags");
let current: ChromeSelectedTextContext | null = null;

function render(capture: ChromeSelectedTextContext | null, message?: string) {
  current = capture;
  preview.hidden = !capture;
  status.textContent = message ?? (capture ? "Review or trim this untrusted plain text. Nothing has been sent." : "Select text on a normal webpage, then choose Refresh Selection.");
  if (!capture) { selectedText.value = ""; return; }
  sourceTitle.textContent = capture.sourceTitle;
  hostname.textContent = capture.hostname;
  sourceUrl.textContent = capture.sourceUrl;
  selectedText.value = capture.selectedText;
  characterCount.textContent = `${capture.characterCount.toLocaleString()} characters`;
  capturedAt.dateTime = new Date(capture.capturedAt).toISOString();
  capturedAt.textContent = new Date(capture.capturedAt).toLocaleString();
  flags.textContent = [capture.truncated ? "Selection truncated to 10,000 characters." : "", capture.userEdited ? "Text edited locally; original source metadata preserved." : ""].filter(Boolean).join(" ");
}

async function refresh() {
  try {
    const capture = await captureActiveTabSelection();
    await savePendingCapture(chrome.storage.local, capture);
    render(capture);
  } catch (error) { render(current, error instanceof Error ? error.message : "Selection could not be captured."); }
}

async function clear(close = false) {
  await clearPendingCapture(chrome.storage.local);
  render(null, "Pending selection cleared.");
  if (close) window.close();
}

element<HTMLButtonElement>("refresh").addEventListener("click", () => void refresh());
element<HTMLButtonElement>("clear").addEventListener("click", () => void clear());
element<HTMLButtonElement>("cancel").addEventListener("click", () => void clear(true));
selectedText.addEventListener("input", () => {
  if (!current) return;
  void editWebContext(current, selectedText.value).then(async (edited) => { await savePendingCapture(chrome.storage.local, edited); render(edited); }).catch((error: unknown) => { status.textContent = error instanceof Error ? error.message : "Edited text is invalid."; });
});

void loadPendingCapture(chrome.storage.local).then((capture) => render(capture));
