// Authored DOM/local-shell fixtures: no host shell, browser geometry, backend or task acceptance.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {Window} from 'happy-dom';
const appSource = process.env.SVF_TERMINAL_APP_SOURCE || new URL('../../web/js/apps/terminal.js', import.meta.url).href;
const {TerminalApp} = await import(appSource);
function environment(t, width=1440, height=900) {
  const browser = new Window({url:'http://localhost',width,height,settings:{disableJavaScriptEvaluation:true,disableCSSFileLoading:true,disableJavaScriptFileLoading:true}});
  const names=['window','document','localStorage','sessionStorage','requestAnimationFrame','fetch','navigator'];
  const prior=new Map(names.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
  const deny=()=>{throw Error('Authored Terminal fixture forbids network');};
  for (const [name,value] of Object.entries({window:browser,document:browser.document,localStorage:browser.localStorage,sessionStorage:browser.sessionStorage,requestAnimationFrame:browser.requestAnimationFrame.bind(browser),fetch:deny,navigator:browser.navigator})) {
    Object.defineProperty(globalThis,name,{value,writable:true,configurable:true});
  }
  browser.fetch=deny;
  t.after(async()=>{await browser.happyDOM.abort();for(const name of names){const descriptor=prior.get(name);if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}});
  const index=fs.readFileSync(new URL('../../web/index.html',import.meta.url),'utf8');
  for(const match of index.matchAll(/<link\s+rel="stylesheet"\s+href="([^"]+)"/g)){
    const style=document.createElement('style');style.textContent=fs.readFileSync(new URL('../../web'+match[1],import.meta.url),'utf8');document.head.append(style);
  }
  // main-simple injects this same existing reservation after the stylesheet links.
  const reservation=document.createElement('style');reservation.textContent='.window-content{padding-bottom:56px;scroll-padding-bottom:64px}.window-app-content{min-height:0}';document.head.append(reservation);
  return browser;
}
function frame(id='terminal',height=600) {
  const root=document.createElement('section');root.className='window';root.dataset.appId=id;root.style.height=height+'px';
  root.innerHTML='<div class="window-titlebar">Terminal</div><div class="window-content"><div class="window-app-content"><div id="unit-terminal-content"></div><div class="live-tool-gateway-host"><details><summary>Existing backend status</summary></details></div></div></div>';
  document.body.append(root);return root;
}
async function mount(root){const app=new TerminalApp({});await app.initialize(root.querySelector('#unit-terminal-content'));return app;}
async function command(app,value){app.input.value=value;await app.executeCommand();}
for(const [width,height,clientHeight]of[[1440,900,600],[390,844,796]])test(`Terminal ${width}px owns an opaque bounded flex chain instead of a content-sized transparent client`,async t=>{
  const browser=environment(t,width,height);const foreign=frame('notes');const foreignBefore=foreign.outerHTML;
  const root=frame('terminal',clientHeight);await mount(root);
  for(const selector of['.window-content','.window-app-content','#unit-terminal-content','.terminal-container']){
    const actual=browser.getComputedStyle(root.querySelector(selector));
    assert.equal(actual.display,'flex',selector);assert.equal(actual.flexDirection,'column',selector);
    assert.equal(actual.minHeight,'0',selector);assert.equal(actual.overflow,'hidden',selector);
    assert.equal(actual.height,'auto',selector);assert.equal(actual.flexGrow,'1',selector);
    assert.ok(['#0c0c0c','rgb(12, 12, 12)'].includes(actual.backgroundColor),selector+' must be opaque Terminal black');
  }
  const frameStyle=browser.getComputedStyle(root.querySelector('.window-content'));
  assert.equal(parseFloat(frameStyle.paddingBottom),0);assert.equal(parseFloat(frameStyle.scrollPaddingBottom),0);
  assert.equal(browser.getComputedStyle(root.querySelector('.terminal-body')).height,'auto');
  assert.equal(browser.getComputedStyle(root.querySelector('.terminal-output')).overflow,'auto');
  assert.equal(browser.getComputedStyle(root.querySelector('.terminal-input-line')).flexShrink,'0');
  assert.equal(browser.getComputedStyle(root.querySelector('.terminal-status')).flexShrink,'0');
  assert.equal(browser.getComputedStyle(root.querySelector('.live-tool-gateway-host')).flex,'0 0 auto');
  assert.equal(foreign.outerHTML,foreignBefore,'layout pins must never touch a different window');
  assert.equal(parseFloat(browser.getComputedStyle(foreign.querySelector('.window-content')).paddingBottom),56);
  root.remove();assert.equal(foreign.outerHTML,foreignBefore,'closing Terminal leaves no shared CSS mutation');
});
test('the real browser-local primary commands retain readable listing/help output and keyboard history',async t=>{
  environment(t);const app=await mount(frame());
  await command(app,'help');await command(app,'ls');
  assert.match(app.output.textContent,/Available commands:/);assert.match(app.output.textContent,/local directory listing: \/home\/swissknife/);
  assert.match(app.output.textContent,/README\.md/);assert.match(app.output.textContent,/config\.json/);
  let prevented=0;app.handleKeyDown({key:'ArrowUp',preventDefault(){prevented++;}});assert.equal(app.input.value,'ls');assert.equal(prevented,1);
  app.handleKeyDown({key:'ArrowDown',preventDefault(){prevented++;}});assert.equal(app.input.value,'');assert.equal(prevented,2);
  await command(app,'history');assert.match(app.output.textContent,/help/);assert.match(app.output.textContent,/ls/);
  assert.deepEqual(JSON.parse(localStorage.getItem('swissknife-terminal-history')),['help','ls','history']);
});
test('reopen restores actual command history and clear/error/whoami semantics stay unchanged',async t=>{
  environment(t,390,844);const old=frame();const first=await mount(old);await command(first,'help');await command(first,'ls');old.remove();
  const root=frame();const reopened=await mount(root);await command(reopened,'history');
  assert.match(reopened.output.textContent,/help/);assert.match(reopened.output.textContent,/ls/);
  await command(reopened,'not-a-real-command');assert.match(reopened.output.textContent,/Command not found: not-a-real-command/);assert.equal(reopened.input.disabled,false);assert.equal(reopened.input.value,'');
  await command(reopened,'clear');assert.equal(reopened.output.textContent,'');
  await command(reopened,'whoami');assert.match(reopened.output.textContent,/swissknife-user/);assert.equal(reopened.input.disabled,false);assert.equal(reopened.input.value,'');
  assert.equal(root.querySelectorAll('#terminal-input').length,1);assert.equal(root.querySelector('.live-tool-gateway-host details').textContent,'Existing backend status');
});

test('mobile status grows beyond the shared fixed20px bar and contains both bounded status labels',async t=>{
 const browser=environment(t,390,844);const root=frame('terminal',796);await mount(root);
 const bar=root.querySelector('.terminal-status'),style=browser.getComputedStyle(bar);
 assert.equal(style.height,'auto','two wrapped rows must not inherit the old20px clipping height');assert.equal(style.minHeight,'20px');assert.equal(style.flexShrink,'0');assert.equal(style.flexWrap,'wrap');
 for(const selector of['.status-left','.status-right']){const item=bar.querySelector(selector),css=browser.getComputedStyle(item);assert.equal(css.minWidth,'0');assert.equal(css.maxWidth,'100%');assert.equal(css.overflowWrap,'anywhere');}
 assert.match(bar.querySelector('.status-left').textContent,/Ready/);assert.match(bar.querySelector('.status-right').textContent,/Session: main.*swissknife-256color/);
});
