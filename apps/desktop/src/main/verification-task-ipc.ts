import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from "electron";
import { VERIFICATION_TASK_CHANNELS } from "../shared/verification-task.ts";
import { VerificationTaskController } from "./verification-task.ts";

export function registerVerificationTaskIpc(getWindow: () => BrowserWindow | null) {
  const controller = new VerificationTaskController();
  const trusted = (event: IpcMainInvokeEvent) => { const window = getWindow(); return Boolean(window && !window.isDestroyed() && BrowserWindow.fromWebContents(event.sender) === window); };
  ipcMain.handle(VERIFICATION_TASK_CHANNELS.run, (event, request) => trusted(event) ? controller.run(event.sender.id, request) : { ok: false, error: "Verification task request was rejected." });
  return { controller, cleanup: () => { controller.dispose(); ipcMain.removeHandler(VERIFICATION_TASK_CHANNELS.run); } };
}
