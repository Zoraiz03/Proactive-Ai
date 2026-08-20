import { join } from "node:path";
import { app, BrowserWindow, dialog, session, type WebPreferences } from "electron";
import { registerWorkspaceIpc } from "./workspace-ipc";

let mainWindow: BrowserWindow | null = null;

function createMainWindow(): BrowserWindow {
  const webPreferences: WebPreferences = {
    preload: join(__dirname, "../preload/index.js"),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    webSecurity: true,
  };
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 760,
    minHeight: 560,
    backgroundColor: "#11151b",
    title: "Proactive AI IDE",
    show: false,
    webPreferences,
  });

  mainWindow = window;
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, url) => {
    if (url !== window.webContents.getURL()) event.preventDefault();
  });
  window.webContents.on("will-prevent-unload", (event) => {
    const choice = dialog.showMessageBoxSync(window, {
      type: "warning",
      buttons: ["Discard and Close", "Cancel"],
      defaultId: 1,
      cancelId: 1,
      noLink: true,
      title: "Unsaved changes",
      message: "One or more open files have unsaved changes.",
      detail: "Close the desktop IDE and discard all unsaved changes?",
    });
    if (choice === 0) event.preventDefault();
  });
  window.webContents.once("did-finish-load", () => {
    console.info(
      `[desktop] shell ready (contextIsolation=${String(webPreferences.contextIsolation)}, nodeIntegration=${String(webPreferences.nodeIntegration)}, sandbox=${String(webPreferences.sandbox)})`
    );
    window.show();
  });
  window.once("closed", () => {
    if (mainWindow === window) mainWindow = null;
  });

  const rendererUrl = process.env.ELECTRON_RENDERER_URL;
  if (rendererUrl) {
    void window.loadURL(rendererUrl);
  } else {
    void window.loadFile(join(__dirname, "../renderer/index.html"));
  }

  return window;
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });

  registerWorkspaceIpc(() => mainWindow);
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
