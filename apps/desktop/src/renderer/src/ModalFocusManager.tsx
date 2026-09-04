import { useEffect } from "react";
import { wrappedFocusIndex } from "./dialog-focus";

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "summary",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function visibleFocusTargets(dialog: HTMLElement): HTMLElement[] {
  return Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((element) => (
    element.getAttribute("aria-hidden") !== "true"
    && element.getAttribute("aria-disabled") !== "true"
    && element.getClientRects().length > 0
  ));
}

function topModalDialog(): HTMLElement | null {
  const dialogs = document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]');
  return dialogs.item(dialogs.length - 1);
}

export default function ModalFocusManager() {
  useEffect(() => {
    let activeDialog: HTMLElement | null = null;
    let restoreTarget: HTMLElement | null = null;
    let focusFrame = 0;

    const focusDialog = (dialog: HTMLElement) => {
      focusFrame = requestAnimationFrame(() => {
        if (!dialog.isConnected || dialog.contains(document.activeElement)) return;
        const autofocus = dialog.querySelector<HTMLElement>("[autofocus]");
        (autofocus ?? visibleFocusTargets(dialog)[0] ?? dialog).focus();
      });
    };

    const syncDialog = () => {
      const nextDialog = topModalDialog();
      if (nextDialog === activeDialog) return;

      if (!activeDialog && nextDialog) {
        restoreTarget = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      }

      const closedLastDialog = Boolean(activeDialog && !nextDialog);
      activeDialog = nextDialog;
      cancelAnimationFrame(focusFrame);

      if (activeDialog) {
        focusDialog(activeDialog);
      } else if (closedLastDialog) {
        const target = restoreTarget;
        restoreTarget = null;
        focusFrame = requestAnimationFrame(() => {
          if (target?.isConnected) target.focus();
        });
      }
    };

    const mutations = new MutationObserver(syncDialog);
    mutations.observe(document.body, { childList: true, subtree: true });
    syncDialog();

    const handleKeyDown = (event: KeyboardEvent) => {
      const dialog = activeDialog;
      if (!dialog) return;

      if (event.key === "Escape" && !event.defaultPrevented) {
        const dismiss = dialog.querySelector<HTMLButtonElement>(
          "[data-dialog-dismiss], button[aria-label^='Close ']",
        );
        if (dismiss && !dismiss.disabled) {
          event.preventDefault();
          event.stopPropagation();
          dismiss.click();
        }
        return;
      }

      if (event.key !== "Tab") return;
      const targets = visibleFocusTargets(dialog);
      if (targets.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const currentIndex = targets.indexOf(document.activeElement as HTMLElement);
      const atBoundary = currentIndex < 0
        || (event.shiftKey ? currentIndex === 0 : currentIndex === targets.length - 1);
      if (!atBoundary) return;

      event.preventDefault();
      targets[wrappedFocusIndex(currentIndex, targets.length, event.shiftKey)]?.focus();
    };

    const containFocus = (event: FocusEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      const enteredDialog = target?.closest<HTMLElement>('[role="dialog"][aria-modal="true"]') ?? null;
      if (!activeDialog && enteredDialog) {
        restoreTarget = event.relatedTarget instanceof HTMLElement ? event.relatedTarget : null;
        activeDialog = enteredDialog;
      }

      const dialog = activeDialog;
      if (!dialog || dialog.contains(event.target as Node)) return;
      (visibleFocusTargets(dialog)[0] ?? dialog).focus();
    };

    document.addEventListener("keydown", handleKeyDown, { capture: true });
    document.addEventListener("focusin", containFocus, { capture: true });
    return () => {
      cancelAnimationFrame(focusFrame);
      mutations.disconnect();
      document.removeEventListener("keydown", handleKeyDown, { capture: true });
      document.removeEventListener("focusin", containFocus, { capture: true });
    };
  }, []);

  return null;
}
