import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";

const require = createRequire(import.meta.url);
const desktop = resolve(import.meta.dirname, "..");
const temporaryDirectory = await mkdtemp(join(tmpdir(), "settings-ui-"));
const server = await createServer({
  configFile: false,
  root: desktop,
  plugins: [react()],
  server: { host: "127.0.0.1", port: 0, fs: { allow: [resolve(desktop, "../.."), temporaryDirectory] } },
});

try {
  await writeFile(join(temporaryDirectory, "index.html"), `<html><head><script type="module">import RefreshRuntime from '/@react-refresh'; RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => type => type; window.__vite_plugin_react_preamble_installed__ = true;</script></head><body><div id="root"></div><script type="module" src="/@fs/${desktop}/scripts/settings-ui.tsx"></script></body></html>`);
  await server.listen();
  const port = server.httpServer.address().port;
  await writeFile(join(temporaryDirectory, "main.cjs"), `
    const { app, BrowserWindow } = require("electron");
    const assert = require("node:assert/strict");
    app.whenReady().then(async () => {
      const win = new BrowserWindow({ width: 1280, height: 860, show: false, webPreferences: { contextIsolation: true, nodeIntegration: false } });
      win.webContents.on("console-message", event => console.log("renderer:", event.message));
      try {
        await win.loadURL(${JSON.stringify(`http://127.0.0.1:${port}/@fs/${temporaryDirectory}/index.html`)});
        const js = code => win.webContents.executeJavaScript(code);
        const wait = async predicate => { for (let index = 0; index < 100; index += 1) { if (await js(predicate)) return; await new Promise(resolve => setTimeout(resolve, 50)); } throw new Error("UI timeout: " + predicate); };
        await wait('Boolean(document.querySelector(".settings-center"))');
        assert.deepEqual(await js('Array.from(document.querySelectorAll(".settings-nav-group-title")).map(node => node.textContent.trim())'), ["Workspace", "AI", "Observer", "Connections", "Privacy"]);
        const sections = ["General", "Editor", "AI Models", "API Keys", "Observer", "Observer Insights", "Documentation Impact", "Browser Extension", "Privacy", "Data and History"];
        for (const section of sections) {
          await js('Array.from(document.querySelectorAll(".settings-nav-item")).find(button => button.firstElementChild.textContent.trim() === ' + JSON.stringify(section) + ').click()');
          await wait('document.querySelector(".settings-page-title")?.textContent.trim() === ' + JSON.stringify(section));
          assert.equal(await js('document.querySelector(".settings-nav-item[aria-current=page]").firstElementChild.textContent.trim()'), section);
          assert.equal(await js('Boolean(document.querySelector(".settings-content-card"))'), true);
          assert.equal(await js('Boolean(document.querySelector(".settings-page-description"))'), true);
          assert.equal(await js('Boolean(document.querySelector(".storage-badge"))'), true);
          assert.equal(await js('Array.from(document.querySelectorAll(".settings-main h3")).filter(node => getComputedStyle(node).display !== "none").length'), 1, section + " should show one page title");
        }
        await js('Array.from(document.querySelectorAll(".settings-nav-item")).find(button => button.firstElementChild.textContent.trim() === "AI Models").click()');
        await wait('document.querySelector(".settings-page-title")?.textContent.trim() === "AI Models"');
        const providerSelect = await js('(()=>{const select=document.querySelector("[data-settings-page=ai-models] .setting-row select");return{value:select.value,label:select.selectedOptions[0]?.textContent.trim() ?? "",options:Array.from(select.options).map(option=>option.textContent.trim())};})()');
        assert.equal(providerSelect.value, "gemini", "Saved provider must remain selected while provider status is unavailable");
        assert.equal(providerSelect.label, "Gemini", "Default provider must never render as a blank field");
        assert.deepEqual(providerSelect.options, ["Gemini", "DeepSeek", "ChatGPT", "Claude", "Demo (offline)"]);
        await js('Array.from(document.querySelectorAll(".settings-nav-item")).find(button => button.firstElementChild.textContent.trim() === "General").click()');
        assert.ok(await js('document.querySelector(".settings-content-card").getBoundingClientRect().width > 500'));
        assert.ok(await js('document.querySelector(".setting-switch").getBoundingClientRect().width >= 44'));
        assert.equal(await js('document.querySelector(".setting-switch").getAttribute("role")'), "switch");
        const metrics = await js('(()=>{const dialog=document.querySelector(".settings-center").getBoundingClientRect();const nav=document.querySelector(".settings-navigation").getBoundingClientRect();const title=parseFloat(getComputedStyle(document.querySelector(".settings-page-title")).fontSize);const label=parseFloat(getComputedStyle(document.querySelector(".setting-row span")).fontSize);return{dialogWidth:dialog.width,navWidth:nav.width,title,label};})()');
        assert.ok(metrics.dialogWidth >= 1000 && metrics.navWidth >= 240 && metrics.title >= 22 && metrics.label >= 13, JSON.stringify(metrics));
        const lightTheme = await js('(()=>{const root=getComputedStyle(document.documentElement);const dialog=getComputedStyle(document.querySelector(".settings-center"));const card=getComputedStyle(document.querySelector(".settings-content-card"));return{scheme:root.colorScheme,dialog:dialog.backgroundColor,card:card.backgroundColor,text:card.color};})()');
        await js('document.documentElement.dataset.theme = "dark"');
        const darkTheme = await js('(()=>{const root=getComputedStyle(document.documentElement);const dialog=getComputedStyle(document.querySelector(".settings-center"));const card=getComputedStyle(document.querySelector(".settings-content-card"));return{scheme:root.colorScheme,dialog:dialog.backgroundColor,card:card.backgroundColor,text:card.color};})()');
        assert.equal(darkTheme.scheme, "dark", "Dark mode must opt native controls into the dark color scheme");
        assert.notEqual(darkTheme.dialog, lightTheme.dialog, "Dark mode must change the settings dialog surface");
        assert.notEqual(darkTheme.card, lightTheme.card, "Dark mode must change settings card surfaces");
        assert.notEqual(darkTheme.text, lightTheme.text, "Dark mode must change settings text to a readable foreground");
        await js('Array.from(document.querySelectorAll(".settings-nav-item")).find(button => button.firstElementChild.textContent.trim() === "Editor").click()');
        await wait('document.querySelector(".settings-page-title")?.textContent.trim() === "Editor"');
        const actionColors = await js('(()=>{const primary=document.querySelector(".settings-actions .primary");const secondary=document.querySelector(".settings-actions button:not(.primary)");return{primary:getComputedStyle(primary).backgroundColor,secondary:getComputedStyle(secondary).backgroundColor};})()');
        assert.notEqual(actionColors.primary, actionColors.secondary, "Primary save action must remain visually prominent");
        require("node:fs").writeFileSync("/tmp/proactive-ai-settings-ui.png", (await win.capturePage()).toPNG());
        console.log("PASS Settings UI: grouped navigation, ten consistent pages, accessible switches, readable project styling");
        app.exit(0);
      } catch (error) { console.error(error); app.exit(1); }
    });
  `);
  const environment = { ...process.env };
  delete environment.ELECTRON_RUN_AS_NODE;
  const exitCode = await new Promise(resolveExit => {
    const child = spawn(require("electron"), [join(temporaryDirectory, "main.cjs")], { stdio: "inherit", env: environment });
    child.on("exit", resolveExit);
  });
  assert.equal(exitCode, 0);
} finally {
  await server.close();
  await rm(temporaryDirectory, { recursive: true, force: true });
}
