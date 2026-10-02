import { build } from 'esbuild';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const triggers = process.argv.includes('--triggers');
const explain = process.argv.includes('--explain');
const improve=process.argv.includes('--improve');
const fix = process.argv.includes('--fix') || improve;
const desktop = resolve(import.meta.dirname, '..');
const temp = await mkdtemp(join(tmpdir(), 'live-observer-ui-'));
const server = await createServer({ configFile: false, root: desktop, plugins: [react()], server: { host: '127.0.0.1', port: 0, fs: { allow: [resolve(desktop, '../..'), temp] } } });
try {
 await writeFile(join(temp, 'index.html'), `<html><head><script type="module">import RefreshRuntime from '/@react-refresh'; RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => type => type; window.__vite_plugin_react_preamble_installed__ = true;</script></head><body><div id="root"></div><script type="module" src="/@fs/${desktop}/scripts/${improve ? 'improve-code-ui' : fix ? 'fix-code-ui' : explain ? 'explanation-ui' : triggers ? 'live-trigger-ui' : 'live-observer-ui'}.tsx"></script></body></html>`);
 if (fix) {
  await build({entryPoints:[join(desktop,improve?'scripts/improve-code-main.ts':'scripts/fix-code-main.ts')],bundle:true,platform:'node',format:'cjs',external:['electron'],outfile:join(temp,'fix-main.cjs')});
  await writeFile(join(temp,'fix-preload.cjs'), `const {contextBridge,ipcRenderer}=require('electron');const call=k=>(...args)=>ipcRenderer.invoke('${improve?'improve':'fix'}-fixture-'+k,...args);contextBridge.exposeInMainWorld('observer',Object.fromEntries(${JSON.stringify(improve?['prepare','improveStart','improveClarify','improveClear']:['prepare','fixStart','fixClarify','fixClear'])}.map(k=>[k,call(k)])));contextBridge.exposeInMainWorld('fixture',Object.fromEntries(['checkpoint','undo','summary','mode','delay','release','permit','consent'].map(k=>[k,call(k)])));`);
 }
 if (triggers) {
  await build({ entryPoints: [join(desktop, 'src/main/live-observer.ts')], bundle: true, platform: 'node', format: 'cjs', outfile: join(temp, 'controller.cjs') });
  await writeFile(join(temp, 'preload.cjs'), `const {contextBridge,ipcRenderer}=require('electron');
  contextBridge.exposeInMainWorld('liveObserver',{configure:(...args)=>ipcRenderer.invoke('configure',...args),edit:e=>ipcRenderer.send('edit',e),cancel:()=>ipcRenderer.send('cancel'),onState:fn=>{const cb=(_e,s)=>fn(s);ipcRenderer.on('state',cb);return()=>ipcRenderer.removeListener('state',cb);}});
  contextBridge.exposeInMainWorld('fixture',Object.fromEntries(['advance','summary','setPolicy','activity','delay','release'].map(k=>[k,(...args)=>ipcRenderer.invoke(k,...args)])));
  contextBridge.exposeInMainWorld('observer',{prepare:r=>ipcRenderer.invoke('prepare',r),ask:r=>ipcRenderer.invoke('ask',r)});`);
 }
 await server.listen();
 const port = server.httpServer.address().port;
 await writeFile(join(temp, 'main.cjs'), String.raw`const { app, BrowserWindow, ipcMain } = require('electron');
 const assert = require('node:assert/strict');
 app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1000, height: 800, show: true, webPreferences: { contextIsolation: true, nodeIntegration: false, preload: ${fix ? JSON.stringify(join(temp, 'fix-preload.cjs')) : triggers ? JSON.stringify(join(temp, 'preload.cjs')) : 'undefined'} } });
  if (${fix}) await require(${JSON.stringify(join(temp,'fix-main.cjs'))}).install(${JSON.stringify(temp)});
  if (${triggers}) {
   const {LiveObserverController,buildLiveRequest}=require(${JSON.stringify(join(temp, 'controller.cjs'))});
   let now=100000, delayed=false, release=null, signal=null, latest=null, prepares=0, manualSends=0;
   let activity={relativePath:'main.py',focused:true,blocked:false};
   let policy={observerEnabled:true,includeDiagnostics:true,confirmCompleteFile:false,exclusions:[],maximumCharacters:9000,maximumFileCharacters:6000};
   const requests=[];
   const answer={ok:true,value:{provider:'demo',suggestion:{explanation:'NO_SUGGESTION',snippet:'',reason:''}}};
   const controller=new LiveObserverController({now:()=>now,policy:async()=>policy,publish:s=>win.webContents.send('state',s),ask:async(r,s)=>{requests.push(r);signal=s;return delayed?new Promise(resolve=>{release=()=>resolve(answer);}):answer;}});
   controller.observeActivity(activity);
   ipcMain.handle('configure',(_e,enabled,provider,pause)=>{controller.configure(enabled,provider,pause);return {ok:true,value:controller.getState()};});
   ipcMain.on('edit',(_e,e)=>{latest=e;controller.edit(e);});
   ipcMain.on('cancel',()=>controller.dismiss());
   ipcMain.handle('advance',async(_e,ms)=>{now+=ms;controller.observeActivity(activity);void controller.tick();await new Promise(r=>setImmediate(r));return controller.getState();});
   ipcMain.handle('summary',()=>({requests,prepares,manualSends,aborted:signal?.aborted}));
   ipcMain.handle('setPolicy',(_e,p)=>{policy={...policy,...p};});
   ipcMain.handle('activity',(_e,a)=>{activity={...activity,...a};controller.observeActivity(activity);});
   ipcMain.handle('delay',(_e,value)=>{delayed=value;});
   ipcMain.handle('release',async()=>{release?.();await new Promise(r=>setImmediate(r));});
   ipcMain.handle('prepare',()=>{prepares++;controller.pause('Paused: a review is open.');return {ok:true,value:buildLiveRequest(latest,'demo',{...policy,confirmCompleteFile:false})};});
   ipcMain.handle('ask',()=>{manualSends++;return answer;});
  }
  const rendererErrors = [];
  win.webContents.on('console-message', event => { console.log('renderer:', event.message); if (event.message?.includes('Uncaught')) rendererErrors.push(event.message); });
  try {
   await win.loadURL(${JSON.stringify(`http://127.0.0.1:${port}/@fs/${temp}/index.html`)});
   const js = code => win.webContents.executeJavaScript(code);
   const wait = async predicate => { for (let n=0;n<300;n++) { if(await js(predicate)) return; await new Promise(r=>setTimeout(r,100)); } throw new Error('UI timeout: '+predicate); };
   if (${fix}) { await require(${JSON.stringify(join(desktop,improve?'scripts/improve-code-driver.cjs':'scripts/fix-code-driver.cjs'))})(win,js,wait); assert.deepEqual(rendererErrors,[]); app.exit(0); return; }
   if (${explain}) { await require(${JSON.stringify(join(desktop, 'scripts/explanation-driver.cjs'))})(win,js,wait); assert.deepEqual(rendererErrors,[]); app.exit(0); return; }
   if (${fix}) await require(${JSON.stringify(join(temp,'fix-main.cjs'))}).install(${JSON.stringify(temp)});
  if (${triggers}) { await require(${JSON.stringify(join(desktop, 'scripts/live-trigger-driver.cjs'))})(win,js,wait); assert.deepEqual(rendererErrors,[]); app.exit(0); return; }
   await wait('Boolean(document.querySelector(\'[aria-label="Live Observer"]\'))');
   assert.equal(await js('document.querySelector(\'[aria-label="Live Observer"]\').getAttribute("aria-checked")'), 'false');
   await wait('window.monaco.editor.getEditors().length > 0');
   assert.equal(await js('window.counters.edits'), 0);
   await js('window.monaco.editor.getEditors()[0].setPosition({lineNumber:1,column:3})');
   assert.equal(await js('window.counters.edits'), 0);
   await js('window.monaco.editor.getEditors()[0].trigger("keyboard", "type", {text:"a"})');
   await wait('window.counters.edits === 1');
   await js('document.querySelector(\'[aria-label="Live Observer"]\').click()');
   await wait('document.querySelector(\'[aria-label="Live Observer"]\').getAttribute("aria-checked") === "true"');
   assert.equal(await js('document.querySelector("select").disabled'), true);
   await js('document.querySelector("textarea").focus(); window.showSuggestion()');
   await wait('Boolean(document.querySelector(\'[aria-label="Live Observer suggestion"]\'))');
   assert.equal(await js('document.activeElement.tagName'), 'TEXTAREA');
   await wait('Boolean(document.querySelector(\'[aria-label="Live Observer near code"]\'))');
   assert.equal(await js('window.counters.apply'), 0);
   require('node:fs').writeFileSync('/tmp/live-observer-ui.png', (await win.capturePage()).toPNG());
   await js('Array.from(document.querySelectorAll("button")).find(b=>b.textContent==="Dismiss").click()');
   await wait('!document.querySelector(\'[aria-label="Live Observer suggestion"]\')');
   await js('window.showSuggestion()');
   await wait('Boolean(document.querySelector(\'[aria-label="Live Observer suggestion"]\'))');
   await js('window.dispatchEvent(new KeyboardEvent("keydown", {key:"Escape", bubbles:true}))');
   await wait('!document.querySelector(\'[aria-label="Live Observer suggestion"]\')');
   await js('window.showSuggestion()');
   await wait('Boolean(document.querySelector(\'[aria-label="Live Observer suggestion"]\'))');
   await js('Array.from(document.querySelectorAll("button")).find(b=>b.textContent==="Review diff").click()');
   await wait('Boolean(document.querySelector(".monaco-diff-editor"))');
   assert.equal(await js('window.counters.apply'), 0);
   await js('window.setStale(true)');
   await wait('Array.from(document.querySelectorAll("button")).find(b=>b.textContent==="Accept Change").disabled');
   await js('Array.from(document.querySelectorAll("button")).find(b=>b.textContent==="Accept Change").click()');
   assert.equal(await js('window.counters.apply'), 0);
   await js('window.setStale(false)');
   await wait('!Array.from(document.querySelectorAll("button")).find(b=>b.textContent==="Accept Change").disabled');
   await js('Array.from(document.querySelectorAll("button")).find(b=>b.textContent==="Accept Change").click()');
   assert.equal(await js('window.counters.apply'), 1);
   await js('window.showManual()');
   await wait('Boolean(document.querySelector("#manual-answer .observer-explanation"))');
   assert.equal(await js('document.querySelector("#manual-answer .observer-explanation").textContent'), 'This code prints the value.');
   assert.equal(await js('document.querySelector("#manual-answer").textContent.includes("not saved to history")'), true);
   await js('Array.from(document.querySelectorAll("#manual-answer button")).find(b=>b.textContent==="Dismiss").click()');
   await wait('!document.querySelector("#manual-answer")');
   await new Promise(r => setTimeout(r, 300)); assert.deepEqual(rendererErrors, []);
   console.log('PASS Electron UI: off default, switch, pause control, focus preservation, Dismiss, Escape, real Monaco inline card and edit events, real Monaco diff, stale rejection, explicit-only Apply, manual answer with history warning and dismissal'); app.exit(0);
  } catch(e) { console.error(e); app.exit(1); }
 });`);
 const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
 const exit = await new Promise(done => { const child = spawn(require('electron'), [join(temp, 'main.cjs')], { stdio: 'inherit', env }); child.on('exit', done); });
 if (exit !== 0) process.exitCode = 1;
} finally { await server.close(); await rm(temp, { recursive: true, force: true }); }
