import { join } from "node:path";
import { BrowserWindow, ipcMain, safeStorage, type IpcMainInvokeEvent } from "electron";
import { AUTH_CHANNELS, type DesktopAuthState, type DesktopSignInRequest } from "../shared/auth";
import { EncryptedAuthSessionStore, type SessionEncryption } from "./auth-session-store";
import { DesktopAuthController } from "./auth-controller";
import { SupabaseDesktopAuthProvider } from "./supabase-auth-provider";

declare const __DESKTOP_SUPABASE_URL__: string;
declare const __DESKTOP_SUPABASE_PUBLISHABLE_KEY__: string;

function isTrustedSender(event: IpcMainInvokeEvent, getMainWindow: () => BrowserWindow | null): boolean {
  const window = getMainWindow();
  return Boolean(window && !window.isDestroyed() && BrowserWindow.fromWebContents(event.sender) === window);
}

function createEncryption(): SessionEncryption {
  return {
    isAvailable: async () => {
      if (!(await safeStorage.isAsyncEncryptionAvailable())) return false;
      return process.platform !== "linux" || safeStorage.getSelectedStorageBackend() !== "basic_text";
    },
    encrypt: (plainText) => safeStorage.encryptStringAsync(plainText),
    decrypt: async (encrypted) => {
      const result = await safeStorage.decryptStringAsync(encrypted);
      return { value: result.result, shouldReEncrypt: result.shouldReEncrypt };
    },
  };
}

export function registerAuthIpc(
  getMainWindow: () => BrowserWindow | null,
  userDataPath: string,
  onStateChanged: (state: DesktopAuthState) => void
): { controller: DesktopAuthController; cleanup: () => void } {
  const url = __DESKTOP_SUPABASE_URL__.trim();
  const publishableKey = __DESKTOP_SUPABASE_PUBLISHABLE_KEY__.trim();
  const configured = /^https:\/\//.test(url) && publishableKey.length > 20;
  const controller = new DesktopAuthController(
    configured ? new SupabaseDesktopAuthProvider(url, publishableKey) : null,
    configured
      ? new EncryptedAuthSessionStore(join(userDataPath, "auth", "session.enc"), createEncryption())
      : null,
    configured
      ? null
      : "Desktop authentication is not configured. Add the public Supabase URL and publishable key."
  );
  const unsubscribeState = controller.subscribe((state) => {
    onStateChanged(state);
    const window = getMainWindow();
    if (window && !window.isDestroyed()) window.webContents.send(AUTH_CHANNELS.changed, state);
  });

  ipcMain.handle(AUTH_CHANNELS.state, (event) =>
    isTrustedSender(event, getMainWindow)
      ? controller.getState()
      : ({ status: "signed_out" } satisfies DesktopAuthState)
  );
  ipcMain.handle(AUTH_CHANNELS.signIn, (event, request: DesktopSignInRequest) =>
    isTrustedSender(event, getMainWindow)
      ? controller.signIn(request)
      : { ok: false, error: "Authentication request was rejected." }
  );
  ipcMain.handle(AUTH_CHANNELS.signOut, (event) =>
    isTrustedSender(event, getMainWindow)
      ? controller.signOut()
      : { ok: false, error: "Authentication request was rejected." }
  );

  return {
    controller,
    cleanup: () => {
      unsubscribeState();
      controller.dispose();
      ipcMain.removeHandler(AUTH_CHANNELS.state);
      ipcMain.removeHandler(AUTH_CHANNELS.signIn);
      ipcMain.removeHandler(AUTH_CHANNELS.signOut);
    },
  };
}

