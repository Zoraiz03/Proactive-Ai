import { writeFile } from "node:fs/promises";
import { dialog, ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from "electron";
import { INSIGHTS_CHANNELS, type InsightsExportRequest, type InsightsQuery } from "../shared/proactive-insights.ts";
import { ProactiveInsightsStore } from "./proactive-insights-store.ts";

export function registerProactiveInsightsIpc(getWindow: () => BrowserWindow | null, userDataPath: string) {
  const store = new ProactiveInsightsStore(userDataPath);
  const trusted = (event: IpcMainInvokeEvent) => event.sender === getWindow()?.webContents;
  const local = async <T>(event: IpcMainInvokeEvent, action: () => Promise<T>) => {
    if (!trusted(event)) return { ok: false, error: "Observer insights request denied." } as const;
    try { return { ok: true, value: await action() } as const; } catch { return { ok: false, error: "Observer insights data could not be processed." } as const; }
  };
  ipcMain.handle(INSIGHTS_CHANNELS.report, (event, query: InsightsQuery) => local(event, () => store.report(query)));
  ipcMain.handle(INSIGHTS_CHANNELS.mutate, (event, mutation, retentionDays: number) => local(event, () => store.mutate(mutation, retentionDays)));
  ipcMain.handle(INSIGHTS_CHANNELS.session, (event, request) => local(event, () => store.session(request)));
  ipcMain.handle(INSIGHTS_CHANNELS.clear, (event) => local(event, () => store.clear()));
  ipcMain.handle(INSIGHTS_CHANNELS.export, (event, request: InsightsExportRequest) => local(event, async () => {
    const window = getWindow(); if (!window) throw new Error("Window unavailable.");
    const data = await store.export(request); const result = await dialog.showSaveDialog(window, { title: "Export Observer evaluation data", defaultPath: `observer-evaluation.${data.extension}`, filters: [{ name: data.extension.toUpperCase(), extensions: [data.extension] }] });
    if (result.canceled || !result.filePath) throw new Error("Export cancelled.");
    await writeFile(result.filePath, data.content, { encoding: "utf8", mode: 0o600 });
    return { fileName: result.filePath.split(/[\\/]/).at(-1) ?? `observer-evaluation.${data.extension}` };
  }));
  return { cleanup: () => Object.values(INSIGHTS_CHANNELS).forEach((channel) => ipcMain.removeHandler(channel)) };
}
