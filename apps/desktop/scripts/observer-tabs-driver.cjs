const assert = require('node:assert/strict');
module.exports = async (win, js, wait, initial = false) => {
  const calls = (await js('window.fixture.summary()')).calls.length;
  const tab = name => `document.querySelector('[role="tab"][id$="-${name}-tab"]')`;
  const panel = name => `document.querySelector('[role="tabpanel"][id$="-${name}"]')`;
  const mouse = async name => {
    await js(`${tab(name)}.scrollIntoView({block:'center'})`);
    const box = await js(`(()=>{const r=${tab(name)}.getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`);
    win.webContents.sendInputEvent({type:'mouseDown',button:'left',...box,clickCount:1});
    win.webContents.sendInputEvent({type:'mouseUp',button:'left',...box,clickCount:1});
    await wait(`${tab(name)}.getAttribute('aria-selected')==='true'`);
  };
  await js('window.savedConversationNode=document.querySelector(".observer-conversation-panel");window.savedTrayNode=document.querySelector(".context-tray");window.savedGuidance=document.querySelector(\'[aria-label="Improvement instruction"]\').value');
  await mouse('context');
  assert.equal(await js(`${panel('conversation')}.hidden`), true);
  assert.equal(await js(`${panel('context')}.hidden`), false);
  assert.equal(await js(`${tab('context')}.tabIndex`), 0);
  assert.equal(await js(`${tab('conversation')}.tabIndex`), -1);
  assert.equal(await js('document.querySelectorAll(".context-tray").length'), 1);
  if (initial) {
    await js('document.querySelector(".observer-workspace").style.cssText="width:320px;height:460px";window.attachFixture()');
    await wait('document.querySelectorAll(".context-tray-item").length===2');
    assert.equal(await js(`${panel('context')}.scrollWidth<=${panel('context')}.clientWidth`),true);
    await js(`${panel('context')}.scrollTop=20;window.savedContextScroll=${panel('context')}.scrollTop`);
    await js('document.querySelector(\'[aria-label="Move First context down"]\').click()');
    await wait('document.querySelector(".context-tray-item strong").textContent==="Second context"');
    await js('document.querySelector(".context-tray-toggle").click()');
    assert.equal(await js('document.querySelector(".context-tray-toggle").getAttribute("aria-expanded")'), 'false');
  }
  for (const [key,target] of [['Left','conversation'],['Right','context'],['Right','conversation'],['End','context'],['Home','conversation']]) {
    win.webContents.sendInputEvent({type:'keyDown',keyCode:key});
    win.webContents.sendInputEvent({type:'keyUp',keyCode:key});
    await wait(`${tab(target)}.getAttribute('aria-selected')==='true'`);
    assert.equal(await js(`document.activeElement===${tab(target)}`), true);
    assert.notEqual(await js('getComputedStyle(document.activeElement).outlineStyle'), 'none');
  }
  assert.equal(await js('window.savedConversationNode===document.querySelector(".observer-conversation-panel") && window.savedTrayNode===document.querySelector(".context-tray")'), true);
  assert.equal(await js('document.querySelector(\'[aria-label="Improvement instruction"]\').value===window.savedGuidance'), true);
  assert.equal((await js('window.fixture.summary()')).calls.length,calls);
  if (initial) {
    await mouse('context');
    assert.equal(await js('document.querySelector(".context-tray-toggle").getAttribute("aria-expanded")'),'false');
    await js('document.querySelector(".context-tray-toggle").click()');
    assert.equal(await js('document.querySelector(".context-tray-item strong").textContent'),'Second context');
    await js('document.querySelector(".observer-workspace").scrollIntoView({block:"start"})');
    require('node:fs').writeFileSync('/tmp/observer-tabs-context.png',(await win.capturePage()).toPNG());
    await js('window.focusObserver()');
    await wait(`${tab('conversation')}.getAttribute('aria-selected')==='true'`);
    assert.equal(await js(`document.activeElement===${tab('conversation')}`),true);
    win.webContents.sendInputEvent({type:'keyDown',keyCode:'Tab'});
    win.webContents.sendInputEvent({type:'keyUp',keyCode:'Tab'});
    await wait(`document.activeElement===${panel('conversation')}`);
    assert.equal(await js(`${panel('conversation')}.getAttribute('aria-labelledby')===${tab('conversation')}.id`),true);
    assert.equal(await js(`${panel('conversation')}.scrollHeight>${panel('conversation')}.clientHeight`),true);
    await js(`${panel('conversation')}.scrollTop=60;window.savedConversationScroll=${panel('conversation')}.scrollTop`);
    await mouse('context');await mouse('conversation');
    assert.equal(await js(`${panel('conversation')}.scrollTop===window.savedConversationScroll`),true);
    await js('document.querySelector(".observer-workspace").style.cssText=""');
  }
};
