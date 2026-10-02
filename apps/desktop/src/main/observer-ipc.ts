import { explainFunction } from "./explain-context";
import { explanationBudget } from "../shared/explanation-budget";
import {ImproveCodeSession} from "./improve-code-session";
import {resolveImproveScope} from "./improve-scope";
import { FixCodeSession } from "./fix-code-session";
import { fixSelectionRange } from "../shared/fix-code";
import { ExplanationSession } from './explanation-session';
import { SettingsApiClient } from './settings-client';
import { LocalSettingsStore } from './settings-store';
import { BrowserWindow, clipboard, ipcMain, dialog, type IpcMainInvokeEvent } from "electron";
import {
  OBSERVER_CHANNELS,
  validateObserverPrepareRequest,
  validateObserverOutcome,
  validateObserverRequest,
} from "../shared/observer";
import { ObserverApiClient } from "./observer-client";
import { ProjectContextEngine, redactProjectSecrets } from "./project-context";
import type { ObserverRequest } from "../shared/observer";
import type { ProjectContextPackage } from "../shared/project-context";
import { createHash } from "node:crypto";
import { isEditableObserverMode } from "../shared/ai-edit";
import { validateDocumentationDraftRequest } from "../shared/documentation-update";

function isTrustedSender(event: IpcMainInvokeEvent, getMainWindow: () => BrowserWindow | null): boolean {
  const window = getMainWindow();
  return Boolean(window && !window.isDestroyed() && BrowserWindow.fromWebContents(event.sender) === window);
}

export function registerObserverIpc(
  getMainWindow: () => BrowserWindow | null,
  getAccessToken: () => Promise<string | null>,
  apiBaseUrl: string,
  cancelLive: () => void = () => {},
  userData?: string
): { controller: ObserverContextController; cleanup: () => void } {
  const client = new ObserverApiClient(apiBaseUrl, getAccessToken);
  const local = userData ? new LocalSettingsStore(userData) : null;
  const settings = new SettingsApiClient(apiBaseUrl, getAccessToken, (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10000) }));
  const policy = async () => {
      const [synced, stored] = await Promise.all([settings.getSynced(), local?.get()]);
      if (!synced.ok || !stored) throw new Error(`Privacy settings unavailable: ${!synced.ok ? synced.error : 'local settings unavailable'}. Nothing was sent.`);
      return { enabled: synced.value.observerEnabled, exclusions: stored.aiContextExclusions, maximumCharacters: synced.value.maximumContextChars, maximumFileCharacters: stored.contextMaximumFileCharacters, explainMaximumCodeCharacters: stored.explainMaximumCodeCharacters ?? stored.contextMaximumFileCharacters, confirmCompleteFile: synced.value.confirmCompleteFile, includeDiagnostics: synced.value.includeDiagnostics, includeTerminalError: synced.value.includeTerminalError };
    };
  const explanation = new ExplanationSession({ policy,
    confirm: async () => (await dialog.showMessageBox(getMainWindow()!, { message: 'This explanation includes a complete local file. Send the reviewed snapshot?', detail: 'Follow-up questions reuse this exact approved snapshot for this session. No other files are added.', buttons: ['Cancel', 'Send approved snapshot'], defaultId: 0, cancelId: 0 })).response === 1,
    ask: (request, signal) => client.ask(request, signal),
  });
  const fix = new FixCodeSession({ policy,
    confirm: async () => (await dialog.showMessageBox(getMainWindow()!, {message:'Fix Code includes a complete local file. Send the reviewed snapshot?', detail:'Clarification answers reuse this approved snapshot. Changes require a separate diff review and explicit Apply.',buttons:['Cancel','Send approved snapshot'],defaultId:0,cancelId:0})).response===1,
    ask: (request, signal) => client.ask(request, signal),
  });
  const improve = new ImproveCodeSession({policy,
    confirm:async()=>(await dialog.showMessageBox(getMainWindow()!,{message:'Improve Code includes complete local file context. Send the reviewed snapshot?',detail:'Clarifications reuse this approved context. Edits still require a separate diff and explicit approval.',buttons:['Cancel','Send approved snapshot'],defaultId:0,cancelId:0})).response===1,
    ask:(request,signal)=>client.ask(request,signal),
  });
  const controller = new ObserverContextController(() => { explanation.clear(); fix.clear(); improve.clear(); });
  ipcMain.handle(OBSERVER_CHANNELS.improveStart,async(event,id:string,value:unknown)=>{
    if(!isTrustedSender(event,getMainWindow))return {ok:false,error:'Improve Code request rejected.'};
    const request=validateObserverRequest(value);
    const content=request && controller.authorizeImprove(event.sender.id,request);
    if(!request || content===false || content===null)return {ok:false,error:'Improve Code scope changed. Build a fresh preview.'};
    cancelLive();return improve.start(id,request,content);
  });
  ipcMain.handle(OBSERVER_CHANNELS.improveClarify,async(event,id:string,answer:string,hash:string)=>{
    if(!isTrustedSender(event,getMainWindow))return {ok:false,error:'Improve Code request rejected.'};
    cancelLive();return improve.send(id,answer,hash);
  });
  ipcMain.handle(OBSERVER_CHANNELS.improveClear,event=>{if(isTrustedSender(event,getMainWindow))improve.clear();});
  ipcMain.handle(OBSERVER_CHANNELS.fixStart, async (event, id: string, value: unknown) => {
    if (!isTrustedSender(event,getMainWindow)) return {ok:false,error:'Fix Code request rejected.'};
    const request=validateObserverRequest(value);
    const content=request && controller.authorizeFix(event.sender.id,request);
    if(!request || content===false || content===null) return {ok:false,error:'Fix Code scope changed. Build a fresh preview.'};
    cancelLive(); return fix.start(id,request,content);
  });
  ipcMain.handle(OBSERVER_CHANNELS.fixClarify, async (event,id:string,answer:string,hash:string) => {
    if(!isTrustedSender(event,getMainWindow))return {ok:false,error:'Fix Code request rejected.'};
    cancelLive(); return fix.send(id,answer,hash);
  });
  ipcMain.handle(OBSERVER_CHANNELS.fixClear,event=>{if(isTrustedSender(event,getMainWindow))fix.clear();});
  ipcMain.handle(OBSERVER_CHANNELS.explain, async (event, id: string, value: unknown) => {
    if (!isTrustedSender(event, getMainWindow)) return { ok: false, error: 'Explanation request rejected.' };
    const request = validateObserverRequest(value);
    if (!request?.contextPackage || !controller.authorize(event.sender.id, request.contextPackage)) return { ok: false, error: 'Context changed. Review the preview again.' };
    cancelLive();
    return explanation.start(id, request);
  });
  ipcMain.handle(OBSERVER_CHANNELS.followup, async (event, id: string, question: string) => {
    if (!isTrustedSender(event, getMainWindow)) return { ok: false, error: 'Explanation request rejected.' };
    cancelLive(); return explanation.send(id, question);
  });
  ipcMain.handle(OBSERVER_CHANNELS.cancelExplanation, event => { if (isTrustedSender(event, getMainWindow)) explanation.cancel(); });
  ipcMain.handle(OBSERVER_CHANNELS.clearExplanation, event => { if (isTrustedSender(event, getMainWindow)) explanation.clear(); });

  ipcMain.handle(OBSERVER_CHANNELS.explainScopes, (event, value: unknown) => {
    if (!isTrustedSender(event,getMainWindow)) return {ok:false,error:'Explanation scope request rejected.'};
    const request=validateObserverPrepareRequest(value);
    if(!request || request.seed.mode!=='explain' || request.seed.kind!=='code') return {ok:false,error:'Invalid explanation scope.'};
    return {ok:true,value:explainFunction(request.seed)};
  });
  ipcMain.handle(OBSERVER_CHANNELS.prepare, async (event, value: unknown) => {
    if (!isTrustedSender(event, getMainWindow)) return { ok: false, error: "Observer context request was rejected." };
    cancelLive();
    const request = validateObserverPrepareRequest(value);
    if (!request) return { ok: false, error: "Observer context options are invalid." };
    try { return { ok: true, value: await controller.prepare(event.sender.id, request) }; }
    catch (error) { return { ok: false, error: error instanceof Error ? error.message : "Observer context could not be built." }; }
  });

  ipcMain.handle(OBSERVER_CHANNELS.ask, async (event, value: unknown) => {
    // Automatic requests are built only by the consent-gated main-process runner.
    if (value && typeof value === "object" && "automaticRun" in value) return { ok: false, error: "Use the dedicated automatic failed-run control." };
    if (!isTrustedSender(event, getMainWindow)) {
      return { ok: false, error: "Observer request was rejected." };
    }
    cancelLive();
    if (value && typeof value === "object" && "liveObserver" in value) return { ok: false, error: "Use Live Observer controls." };
    if (value && typeof value === "object" && "explanation" in value) return { ok: false, error: "Use the approved Explain conversation." };
    const request = validateObserverRequest(value);
    if (!request) return { ok: false, error: "Observer context is invalid or unsafe." };
    if (request.mode === "improve_code") return {ok:false,error:"Use Improve Code and its reviewed scope."};
    if (request.mode === "fix_error") return { ok: false, error: "Use Fix Code and its reviewed context." };
    if (request.contextPackage && !controller.authorize(event.sender.id, request.contextPackage)) {
      return { ok: false, error: "Observer context changed after preview. Build the preview again." };
    }
    return client.ask(request);
  });

  ipcMain.handle(OBSERVER_CHANNELS.outcome, async (event, value: unknown) => {
    if (!isTrustedSender(event, getMainWindow)) {
      return { ok: false, error: "Observer outcome was rejected." };
    }
    const request = validateObserverOutcome(value);
    if (!request) return { ok: false, error: "Observer outcome is invalid." };
    return client.recordOutcome(request);
  });

  ipcMain.handle(OBSERVER_CHANNELS.documentationDraft, async (event, value: unknown) => {
    if (!isTrustedSender(event, getMainWindow)) return { ok: false, error: "Documentation draft request was rejected." };
    const request = validateDocumentationDraftRequest(value);
    if (!request) return { ok: false, error: "Documentation update context is invalid or unsafe." };
    return client.documentationDraft(request);
  });

  ipcMain.handle(OBSERVER_CHANNELS.copy, (event, value: unknown) => {
    if (!isTrustedSender(event, getMainWindow)) {
      return { ok: false, error: "Observer copy request was rejected." };
    }
    if (typeof value !== "string" || !value || value.length > 50_000) {
      return { ok: false, error: "Observer snippet is invalid." };
    }
    clipboard.writeText(value);
    return { ok: true, value: undefined };
  });

  return {
    controller,
    cleanup: () => {
      controller.clearWorkspace();
      for (const channel of [OBSERVER_CHANNELS.improveStart, OBSERVER_CHANNELS.improveClarify, OBSERVER_CHANNELS.improveClear, OBSERVER_CHANNELS.fixStart, OBSERVER_CHANNELS.fixClarify, OBSERVER_CHANNELS.fixClear, OBSERVER_CHANNELS.explain, OBSERVER_CHANNELS.followup, OBSERVER_CHANNELS.cancelExplanation, OBSERVER_CHANNELS.clearExplanation]) ipcMain.removeHandler(channel);
      ipcMain.removeHandler(OBSERVER_CHANNELS.prepare);
      ipcMain.removeHandler(OBSERVER_CHANNELS.explainScopes);
      ipcMain.removeHandler(OBSERVER_CHANNELS.ask);
      ipcMain.removeHandler(OBSERVER_CHANNELS.outcome);
      ipcMain.removeHandler(OBSERVER_CHANNELS.copy);
      ipcMain.removeHandler(OBSERVER_CHANNELS.documentationDraft);
    },
  };
}

export class ObserverContextController {
  private generation = 0;
  private workspace: { rootPath: string; webContentsId: number } | null = null;
  private prepared: ProjectContextPackage | null = null;
  private improvePrepared: {content:string;request:ObserverRequest} | null = null;
  private fixPrepared: {content:string;request:ObserverRequest} | null = null;
  readonly engine = new ProjectContextEngine();
  constructor(private readonly onWorkspaceChange: () => void = () => {}) {}
  setWorkspace(rootPath: string, webContentsId: number) { this.generation++; this.onWorkspaceChange(); this.workspace = { rootPath, webContentsId }; this.prepared = null; this.fixPrepared = null; this.improvePrepared = null; this.engine.setWorkspace(rootPath); }
  clearWorkspace(webContentsId?: number) { if (webContentsId !== undefined && this.workspace?.webContentsId !== webContentsId) return; this.generation++; this.onWorkspaceChange(); this.workspace = null; this.prepared = null; this.fixPrepared = null; this.improvePrepared = null; this.engine.clearWorkspace(); }
  invalidate() { this.generation++; this.prepared = null; this.fixPrepared = null; this.improvePrepared = null; this.engine.invalidate(); }
  async prepare(webContentsId: number, request: import("../shared/observer").ObserverPrepareRequest): Promise<ObserverRequest> {
    if (!this.workspace || this.workspace.webContentsId !== webContentsId) throw new Error("Open a workspace before asking Observer.");
    const generation=this.generation;
    const contextPackage = await this.engine.build(request.seed);
    if(["explain","improve_code"].includes(request.seed.mode) && generation!==this.generation)throw new Error(`${request.seed.mode === "explain" ? "Explain" : "Improve Code"} context changed while preparing. Preview the current project again.`);
    if(request.seed.mode === "explain" && request.seed.kind === "code") { const budget=explanationBudget(contextPackage,undefined,request.provider,request.model);if(budget.error)throw new Error(budget.error); }
    this.prepared = contextPackage;
    const source = contextPackage.items.some((item) => item.type === "selected_code") ? "selection" : contextPackage.items.some((item) => item.type === "diagnostic") ? "diagnostic" : "cursor";
    const result: ObserverRequest = {
      ...(request.seed.mode === "improve_code" ? {improveCode:{...resolveImproveScope(request.seed),goal:request.seed.improveGoal ?? "readability",clarifications:[]}} : {}),
      ...(request.seed.mode === "fix_error" ? {fixCode: {scope: request.seed.selectedCode ? "selection" : "file", range:fixSelectionRange(request.seed.content,request.seed.selectedCode,request.seed.selectionRange),clarifications:[]}} : {}),
      provider: request.provider,
      ...(request.model ? { model: request.model } : {}),
      ...(request.storeHistory === false ? { storeHistory: false } : {}),
      mode: request.seed.mode,
      kind: request.seed.kind,
      fileName: request.seed.fileName,
      language: request.seed.language,
      source,
      cursorLine: request.seed.cursorLine,
      cursorColumn: request.seed.cursorColumn,
      contextPackage,
      ...(isEditableObserverMode(request.seed.mode) ? { editBase: {
        targetRelativePath: request.seed.activeRelativePath,
        originalContentHash: createHash("sha256").update(request.seed.content).digest("hex"),
        contentLength: request.seed.content.length,
        basedOnUnsavedContent: Boolean(request.seed.activeContentDirty),
      } } : {}),
    };
    this.improvePrepared = request.seed.mode === 'improve_code' ? {content:request.seed.content,request:structuredClone(result)} : null;
    this.fixPrepared = request.seed.mode === 'fix_error' ? {content:request.seed.content,request:structuredClone(result)} : null;
    return result;
  }
  authorizeImprove(webContentsId:number,request:ObserverRequest):string|false {
    const prepared=this.improvePrepared;
    if(!prepared || !request.contextPackage || !this.authorize(webContentsId,request.contextPackage) || JSON.stringify(request.improveCode)!==JSON.stringify(prepared.request.improveCode) || JSON.stringify(request.editBase)!==JSON.stringify(prepared.request.editBase))return false;
    return prepared.content;
  }
  authorizeFix(webContentsId:number,request:ObserverRequest):string|false {
    const prepared=this.fixPrepared;
    if(!prepared || !request.contextPackage || !this.authorize(webContentsId,request.contextPackage) || JSON.stringify(request.fixCode)!==JSON.stringify(prepared.request.fixCode) || JSON.stringify(request.editBase)!==JSON.stringify(prepared.request.editBase))return false;
    return prepared.content;
  }
  authorize(webContentsId: number, candidate: ProjectContextPackage): boolean {
    if (!this.workspace || this.workspace.webContentsId !== webContentsId || !this.prepared) return false;
    if (candidate.version !== this.prepared.version || candidate.activeFile.relativePath !== this.prepared.activeFile.relativePath || candidate.intent.mode !== this.prepared.intent.mode || candidate.intent.instruction !== this.prepared.intent.instruction) return false;
    if(candidate.intent.mode === 'explain' && (JSON.stringify(candidate.limits)!==JSON.stringify(this.prepared.limits) || JSON.stringify(candidate.cursor)!==JSON.stringify(this.prepared.cursor) || JSON.stringify(candidate.activeFile)!==JSON.stringify(this.prepared.activeFile))) return false;
    const prepared = new Map(this.prepared.items.map((item) => [item.id, item]));
    if (candidate.items.some((item) => JSON.stringify(prepared.get(item.id)) !== JSON.stringify(item) || redactProjectSecrets(item.content).redacted || item.staleState === "stale" || item.staleState === "unavailable")) return false;
    const mandatoryIds = this.prepared.items.filter((item) => !item.optional).map((item) => item.id);
    return mandatoryIds.every((id) => candidate.items.some((item) => item.id === id));
  }
}
