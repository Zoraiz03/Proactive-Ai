import { join } from "node:path";
import { app, BrowserWindow, session, type WebPreferences } from "electron";

function createMainWindow(): BrowserWindow {
  const webPreferences: WebPreferences = {
    preload: join(__dirname, "../preload/index.js"),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    webSecurity: true,
  };
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 760,
    minHeight: 560,
    backgroundColor: "#11151b",
    title: "Proactive AI IDE",
    show: false,
    webPreferences,
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (url !== mainWindow.webContents.getURL()) event.preventDefault();
  });
  mainWindow.webContents.once("did-finish-load", () => {
    console.info(
      `[desktop] shell ready (contextIsolation=${String(webPreferences.contextIsolation)}, nodeIntegration=${String(webPreferences.nodeIntegration)}, sandbox=${String(webPreferences.sandbox)})`
    );
    mainWindow.show();
  });

  const rendererUrl = process.env.ELECTRON_RENDERER_URL;
  if (rendererUrl) {
    void mainWindow.loadURL(rendererUrl);
  } else {
    void mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }

  return mainWindow;
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });

  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
