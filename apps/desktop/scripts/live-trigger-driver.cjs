const assert = require('node:assert/strict');
module.exports = async function run(win, js, wait) {
 const status = value => wait(`document.querySelector('[data-live-status="${value}"]') !== null`);
 const advance = ms => js(`window.fixture.advance(${ms})`);
 const count = () => js('window.fixture.summary().then(s=>s.requests.length)');
 const type = text => js(`window.monaco.editor.getEditors()[0].trigger('keyboard','type',{text:${JSON.stringify(text)}})`);
 await wait('window.monaco?.editor.getEditors().length > 0');
 await status('off');
 await js('document.querySelector(\'[aria-label="Live Observer"]\').click()'); await status('idle');
 await js('window.monaco.editor.getEditors()[0].setPosition({lineNumber:1,column:6})');
 await advance(10000); assert.equal(await count(),0);
 await type('1'); await status('waiting'); await advance(3000);
 await type('\n'); await status('waiting'); await advance(3999); assert.equal(await count(),0);
 await advance(1); await status('idle'); assert.equal(await count(),1);
 const first = await js('window.fixture.summary().then(s=>s.requests[0])');
 assert.equal(first.cursorLine,2); assert.ok(first.contextPackage.items[0].content.endsWith('\n'));
 await type('   '); await advance(4000); assert.equal(await count(),1); await status('idle');
 await type('y = 2'); await status('cooldown'); await advance(26000); await status('idle'); assert.equal(await count(),2);
 await type('3'); await status('cooldown'); await advance(29000); await type('  '); await advance(1000); await status('waiting');
 await advance(3000); assert.equal(await count(),3);
 // Specific blockers and no automatic retry. The action prepares a manual preview, never sends.
 await js('window.fixture.setPolicy({confirmCompleteFile:true})'); await type('4'); await advance(30000); await status('blocked');
 assert.equal(await js('document.querySelector("[data-live-status]").textContent.includes("Confirm complete files")'),true);
 assert.equal(await count(),3);
 await js('Array.from(document.querySelectorAll("button")).find(b=>b.textContent==="Review with Ask Observer").click()');
 await wait('document.querySelector("#context-preview-title")?.textContent === "Context Preview"');
 assert.equal(await js('window.fixture.summary().then(s=>s.prepares)'),1);
 assert.equal(await js('window.fixture.summary().then(s=>s.manualSends)'),0);
 await js('document.querySelector(\'[aria-label="Close Context Preview"]\').click()');
 for (const reason of ['manual','automatic','review','dialog']) {
  await js(`window.fixture.activity({blocked:true,reason:${JSON.stringify(reason)}})`); await status('paused');
  assert.equal(await js(`document.querySelector('[data-live-status]').textContent.includes(${JSON.stringify(reason)})`),true);
  await advance(60000); assert.equal(await count(),3);
  await js('window.fixture.activity({blocked:false,reason:undefined})');
 }
 await js('window.fixture.setPolicy({confirmCompleteFile:false}); window.fixture.delay(true)');
 await type('5'); await advance(4000); await status('thinking'); await advance(2000);
 assert.equal(await js('document.querySelector("[data-live-status]").textContent.includes("2s elapsed")'),true);
 await type('\n'); await status('cooldown');
 assert.equal(await js('window.fixture.summary().then(s=>s.aborted)'),true);
 await js('window.fixture.release()'); assert.equal(await js('document.querySelector("[data-live-status]").getAttribute("data-live-status")'),'cooldown');
 await js('document.querySelector(\'[aria-label="Live Observer"]\').click()'); await status('off');
 await advance(60000); assert.equal(await count(),4);
 console.log('PASS Live trigger renderer: code→Enter→pause, trailing spaces, whitespace-only, cursor snapshot, cooldown queue, blockers, manual preview only, competing statuses, provider time, stale response, disable');
};
