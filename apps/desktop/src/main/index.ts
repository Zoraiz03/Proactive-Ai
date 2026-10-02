import { registerLiveObserverIpc } from "./live-observer-ipc";
import { join } from "node:path";
import { app, BrowserWindow, dialog, session, ipcMain, type WebPreferences } from "electron";
import { registerMemoryIpc } from './observer-engine/ipc';
import { registerWorkspaceIpc } from "./workspace-ipc";
import { registerTerminalIpc } from "./terminal-ipc";
import { registerRunIpc } from "./run-ipc";
import { registerAuthIpc } from "./auth-ipc";
import { registerObserverIpc } from "./observer-ipc";
import { registerSettingsIpc } from "./settings-ipc";
import { registerGitIpc } from "./git-ipc";
import { registerCheckpointIpc } from "./checkpoint-ipc";
import { registerMultiFileIpc } from "./multi-file-ipc";
import { registerVerificationTaskIpc } from "./verification-task-ipc";
import { registerProactiveInsightsIpc } from "./proactive-insights-ipc";
import { registerWebContextIpc } from "./web-context-ipc";
import { DESKTOP_WINDOW_BACKGROUND } from "../shared/desktop-theme";
import { registerAutomaticRunIpc } from "./automatic-run-ipc";

declare const __DESKTOP_API_BASE_URL__: string;

let mainWindow: BrowserWindow | null = null;
let liveObserverIpc: ReturnType<typeof registerLiveObserverIpc> | null = null;
let automaticRunIpc: ReturnType<typeof registerAutomaticRunIpc> | null = null;
let memoryIpc: ReturnType<typeof registerMemoryIpc> | null = null;

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
    backgroundColor: DESKTOP_WINDOW_BACKGROUND,
    title: "Proactive AI IDE",
    show: false,
    webPreferences,
  });

  mainWindow = window;
  window.webContents.on("did-start-loading", () => { automaticRunIpc?.reset(); liveObserverIpc?.reset(); void memoryIpc?.clearWorkspace(); });
  window.webContents.once("destroyed", () => { automaticRunIpc?.clearWorkspace(); liveObserverIpc?.clearWorkspace(); void memoryIpc?.clearWorkspace(); });
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

  let terminalIpc: ReturnType<typeof registerTerminalIpc> | null = null;
  let runIpc: ReturnType<typeof registerRunIpc> | null = null;
  let workspaceIpc: ReturnType<typeof registerWorkspaceIpc> | null = null;
  const authIpc = registerAuthIpc(() => mainWindow, app.getPath("userData"), (state) => {
    if (state.status !== "signed_out" && state.status !== "configuration_error") return;
    terminalIpc?.controller.clearWorkspace();
    runIpc?.controller.clearWorkspace();
    automaticRunIpc?.clearWorkspace();
    liveObserverIpc?.clearWorkspace();
    void memoryIpc?.clearWorkspace();
    void workspaceIpc?.clearWorkspace();
  });
  const getAuthenticatedWindow = () => authIpc.controller.isAuthenticated() ? mainWindow : null;
  memoryIpc = registerMemoryIpc({
    ipc: ipcMain, getWindow: getAuthenticatedWindow, userData: app.getPath('userData'),
    confirm: async kind => {
      const window = getAuthenticatedWindow(); if (!window) return false;
      const answer = await dialog.showMessageBox(window, {
        title: 'Local project memory',
        message: kind === 'purge' ? 'Purge the requested project memory?' : kind === 'resume' ? 'Resume local project indexing?' : 'Index this project locally for this session?',
        detail: kind === 'purge' ? 'This removes the selected local memory records, not your project files.' :
          'Eligible saved files will be stored in local SQLite outside your project, with chunks and a symbol outline. Secret files and your exclusions are skipped. No AI requests or web capture are enabled. The Privacy Memory panel shows read-only counts. Consent ends when this workspace closes.',
        buttons: ['Cancel', kind === 'purge' ? 'Purge memory' : 'Allow local indexing'], defaultId: 0, cancelId: 0, noLink: true,
      });
      return answer.response === 1;
    },
  });
  automaticRunIpc = registerAutomaticRunIpc(getAuthenticatedWindow, app.getPath("userData"), () => authIpc.controller.getAccessToken(), __DESKTOP_API_BASE_URL__.trim());
  liveObserverIpc = registerLiveObserverIpc(getAuthenticatedWindow, app.getPath("userData"), () => authIpc.controller.getAccessToken(), __DESKTOP_API_BASE_URL__.trim(), () => ["waiting", "thinking", "ready"].includes(automaticRunIpc?.controller.getState().status ?? "off"));
  const observerIpc = registerObserverIpc(
    getAuthenticatedWindow,
    () => authIpc.controller.getAccessToken(),
    __DESKTOP_API_BASE_URL__.trim(),
    () => liveObserverIpc?.controller.pause('Paused: manual Observer has priority. Make a new edit when it finishes.'),
    app.getPath("userData")
  );
  const settingsIpc = registerSettingsIpc(
    getAuthenticatedWindow,
    app.getPath("userData"),
    () => authIpc.controller.getAccessToken(),
    __DESKTOP_API_BASE_URL__.trim(),
    () => memoryIpc?.refreshPolicy() ?? Promise.resolve()
  );
  const gitIpc = registerGitIpc(getAuthenticatedWindow);
  const checkpointIpc = registerCheckpointIpc(getAuthenticatedWindow, app.getPath("userData"));
  const multiFileIpc = registerMultiFileIpc(getAuthenticatedWindow, () => authIpc.controller.getAccessToken(), __DESKTOP_API_BASE_URL__.trim(), app.getPath("userData"), (webContentsId, context) => observerIpc.controller.authorize(webContentsId, context));
  const verificationTaskIpc = registerVerificationTaskIpc(getAuthenticatedWindow);
  const proactiveInsightsIpc = registerProactiveInsightsIpc(getAuthenticatedWindow, app.getPath("userData"));
  const webContextIpc = registerWebContextIpc(getAuthenticatedWindow, app.getPath("userData"));
  terminalIpc = registerTerminalIpc(getAuthenticatedWindow);
  runIpc = registerRunIpc(getAuthenticatedWindow, automaticRunIpc.controller);
  workspaceIpc = registerWorkspaceIpc(getAuthenticatedWindow, {
    onWorkspaceOpened: (rootPath, webContentsId) => {
      void memoryIpc?.setWorkspace(rootPath, webContentsId);
      automaticRunIpc?.setWorkspace(rootPath, webContentsId);
      liveObserverIpc?.setWorkspace(rootPath, webContentsId);
      terminalIpc?.controller.setWorkspace(rootPath, webContentsId);
      runIpc?.controller.setWorkspace(rootPath, webContentsId);
      gitIpc.controller.setWorkspace(rootPath, webContentsId);
      observerIpc.controller.setWorkspace(rootPath, webContentsId);
      checkpointIpc.controller.setWorkspace(rootPath, webContentsId);
      multiFileIpc.controller.setWorkspace(rootPath, webContentsId);
      verificationTaskIpc.controller.setWorkspace(rootPath, webContentsId);
      webContextIpc.controller.setWorkspace(webContentsId);
    },
    onWorkspaceClosed: (webContentsId) => {
      void memoryIpc?.clearWorkspace();
      automaticRunIpc?.clearWorkspace();
      liveObserverIpc?.clearWorkspace();
      terminalIpc?.controller.clearWorkspace(webContentsId);
      runIpc?.controller.clearWorkspace(webContentsId);
      gitIpc.controller.clearWorkspace(webContentsId);
      observerIpc.controller.clearWorkspace(webContentsId);
      checkpointIpc.controller.clearWorkspace(webContentsId);
      multiFileIpc.controller.clearWorkspace(webContentsId);
      verificationTaskIpc.controller.clearWorkspace(webContentsId);
      webContextIpc.controller.clearWorkspace(webContentsId);
    },
    onFileSaved: async (path) => { await memoryIpc?.fileSaved(path); },
    onWorkspaceChanged: () => { observerIpc.controller.invalidate(); automaticRunIpc?.controller.invalidateFiles(); },
  }, app.getPath("userData"));
  app.once('before-quit', event => {
    event.preventDefault();
    void (memoryIpc?.cleanup() ?? Promise.resolve()).finally(() => { memoryIpc = null; app.quit(); });
  });
  app.once("will-quit", () => {
    automaticRunIpc?.cleanup();
    liveObserverIpc?.cleanup();
    observerIpc.cleanup();
    settingsIpc.cleanup();
    gitIpc.cleanup();
    checkpointIpc.cleanup();
    multiFileIpc.cleanup();
    verificationTaskIpc.cleanup();
    proactiveInsightsIpc.cleanup();
    void webContextIpc.cleanup();
    authIpc.cleanup();
    runIpc?.cleanup();
    terminalIpc?.cleanup();
    void workspaceIpc?.cleanup();
  });
  createMainWindow();
  void authIpc.controller.initialize().then(() => {
    console.info(`[desktop] authentication ready (${authIpc.controller.getState().status})`);
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
