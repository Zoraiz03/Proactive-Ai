(() => {
  const stateKey = "__proactiveAiSelectionOverlayV2";
  const scope = globalThis as typeof globalThis & { [stateKey]?: { destroy(): void } };
  if (scope[stateKey]) return;

  const host = document.createElement("div");
  host.setAttribute("data-proactive-selection-ui", "");
  host.style.cssText = "all:initial;position:fixed;left:0;top:0;z-index:2147483647;display:none";
  const shadow = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = `
    :host{all:initial;color-scheme:light dark;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    *{box-sizing:border-box}.bubble{width:30px;height:30px;border:0;border-radius:50%;background:#1677ff;color:#fff;font:700 15px/30px system-ui;box-shadow:0 3px 14px rgba(0,0,0,.3);cursor:pointer;padding:0}
    .bubble:hover,.bubble:focus-visible{background:#075dcc;outline:2px solid #fff;outline-offset:2px}
    .card{display:none;width:310px;padding:11px;border:1px solid #475569;border-radius:10px;background:#111827;color:#f8fafc;box-shadow:0 8px 28px rgba(0,0,0,.38)}
    .card.open{display:grid;gap:8px}.heading{display:flex;justify-content:space-between;gap:8px;align-items:center}.heading strong{font-size:13px}.heading span,.meta,.status{font-size:11px;color:#aeb9c8}
    textarea{width:100%;min-height:110px;max-height:220px;resize:vertical;border:1px solid #475569;border-radius:6px;padding:8px;background:#0b1220;color:#f8fafc;font:12px/1.45 ui-monospace,SFMono-Regular,monospace}
    .actions{display:flex;justify-content:flex-end;gap:7px}button.action{min-height:30px;border:1px solid #475569;border-radius:6px;padding:5px 9px;background:#1f2937;color:#f8fafc;font:600 12px system-ui;cursor:pointer}button.send{border-color:#1677ff;background:#1677ff}button:disabled{opacity:.55;cursor:default}.status{margin:0;min-height:16px}.status.error{color:#fda4af}.status.success{color:#86efac}
  `;
  const bubble = document.createElement("button"); bubble.type = "button"; bubble.className = "bubble"; bubble.textContent = "P"; bubble.title = "Review selection for Proactive AI IDE"; bubble.setAttribute("aria-label", "Review selected text for Proactive AI IDE");
  const card = document.createElement("section"); card.className = "card"; card.setAttribute("aria-label", "Selected text preview");
  const heading = document.createElement("div"); heading.className = "heading";
  const title = document.createElement("strong"); title.textContent = "Send to Proactive AI IDE";
  const source = document.createElement("span"); source.textContent = location.hostname;
  heading.append(title, source);
  const textarea = document.createElement("textarea"); textarea.maxLength = 10_000; textarea.spellcheck = false; textarea.setAttribute("aria-label", "Selected text");
  const meta = document.createElement("div"); meta.className = "meta";
  const status = document.createElement("p"); status.className = "status"; status.setAttribute("role", "status");
  const actions = document.createElement("div"); actions.className = "actions";
  const cancel = document.createElement("button"); cancel.type = "button"; cancel.className = "action"; cancel.textContent = "Cancel";
  const send = document.createElement("button"); send.type = "button"; send.className = "action send"; send.textContent = "Send to IDE";
  actions.append(cancel, send); card.append(heading, textarea, meta, status, actions); shadow.append(style, bubble, card); document.documentElement.append(host);

  let originalText = "";
  const sanitize = (value: string) => value.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").slice(0, 10_000);
  const selectedElement = (node: Node | null): Element | null => node instanceof Element ? node : node?.parentElement ?? null;
  const blockedSelection = (selection: Selection) => {
    for (const node of [selection.anchorNode, selection.focusNode]) {
      const element = selectedElement(node);
      if (!element) continue;
      if (element.closest("input,textarea,select,[contenteditable]:not([contenteditable='false'])") || (element as HTMLElement).isContentEditable) return true;
    }
    return false;
  };
  const hide = () => { host.style.display = "none"; card.classList.remove("open"); bubble.style.display = "block"; status.textContent = ""; status.className = "status"; originalText = ""; };
  const place = (left: number, top: number, width: number, height: number) => {
    const x = Math.max(8, Math.min(window.innerWidth - width - 8, left)); const y = Math.max(8, Math.min(window.innerHeight - height - 8, top));
    host.style.left = `${x}px`; host.style.top = `${y}px`;
  };
  const showBubble = () => {
    if (card.classList.contains("open")) return;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0 || blockedSelection(selection)) { hide(); return; }
    const range = selection.getRangeAt(0); const rect = range.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) { hide(); return; }
    card.classList.remove("open"); bubble.style.display = "block"; host.style.display = "block"; place(rect.right + 7, rect.bottom + 7, 30, 30);
  };
  const scheduleSelection = () => requestAnimationFrame(showBubble);
  const openPreview = () => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || blockedSelection(selection)) { hide(); return; }
    originalText = sanitize(selection.toString());
    if (!originalText.trim()) { hide(); return; }
    textarea.value = originalText; meta.textContent = `${originalText.length.toLocaleString()} characters · review before sending`; bubble.style.display = "none"; card.classList.add("open");
    const rect = selection.getRangeAt(0).getBoundingClientRect(); place(rect.right + 7, rect.bottom + 7, 310, 220); textarea.focus({ preventScroll: true }); textarea.setSelectionRange(originalText.length, originalText.length);
  };
  const outside = (event: Event) => { if (!event.composedPath().includes(host)) hide(); };
  const escape = (event: KeyboardEvent) => { if (event.key === "Escape") hide(); else scheduleSelection(); };
  const destroy = () => { document.removeEventListener("mouseup", scheduleSelection, true); document.removeEventListener("keyup", escape, true); document.removeEventListener("selectionchange", scheduleSelection, true); document.removeEventListener("pointerdown", outside, true); window.removeEventListener("scroll", hide, true); window.removeEventListener("resize", hide); host.remove(); delete scope[stateKey]; };

  bubble.addEventListener("mousedown", (event) => event.preventDefault()); bubble.addEventListener("click", openPreview);
  cancel.addEventListener("click", hide);
  textarea.addEventListener("input", () => { meta.textContent = `${textarea.value.length.toLocaleString()} characters · review before sending`; status.textContent = ""; status.className = "status"; });
  send.addEventListener("click", () => {
    const selectedText = sanitize(textarea.value);
    if (!selectedText.trim()) { status.textContent = "The selection cannot be empty."; status.className = "status error"; return; }
    send.disabled = true; cancel.disabled = true; status.textContent = "Sending to the local IDE…"; status.className = "status";
    void chrome.runtime.sendMessage({ type: "proactive:send-selection", selectedText, userEdited: selectedText !== originalText }).then((value: unknown) => {
      const result = value as { ok?: unknown; message?: unknown };
      if (result?.ok === true) { status.textContent = typeof result.message === "string" ? result.message : "Added to the IDE Context Tray."; status.className = "status success"; setTimeout(hide, 900); return; }
      status.textContent = typeof result?.message === "string" ? result.message : "The IDE rejected this selection."; status.className = "status error";
    }).catch(() => { status.textContent = "IDE not connected. Open the extension to pair it."; status.className = "status error"; }).finally(() => { send.disabled = false; cancel.disabled = false; });
  });
  document.addEventListener("mouseup", scheduleSelection, true); document.addEventListener("keyup", escape, true); document.addEventListener("selectionchange", scheduleSelection, true); document.addEventListener("pointerdown", outside, true); window.addEventListener("scroll", hide, true); window.addEventListener("resize", hide);
  chrome.runtime.onMessage.addListener((message: unknown) => { if ((message as { type?: unknown })?.type === "proactive:disable") destroy(); });
  scope[stateKey] = { destroy };
})();
