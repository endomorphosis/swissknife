import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {Window} from 'happy-dom';
import {contentCidForBytes} from '../../web/js/core/mcp-plus-plus-desktop-client.js';
const coreURL=new URL('../../web/js/core/mcp-plus-plus-desktop-client.js',import.meta.url).href;
let source=fs.readFileSync(new URL('../../web/js/apps/navi.js',import.meta.url),'utf8');
// Unit fixture adapter only: no model, network, SDK or browser execution.
source=source.replace("from '../core/mcp-plus-plus-desktop-client.js'",`from ${JSON.stringify(coreURL)}`).replace("await import('../live-tool-gateway.js')","await Promise.resolve({invokeNativeTool:globalThis.__SVF_NAVI_UNIT_GATEWAY__})");
const {NAVIApp}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
async function fixture(t,{rows=[{id:'gpt2',device:'cpu',task:'text-generation'}],tamper=false,resultOverride,configured=true}={}){const names=['window','document','localStorage','fetch','__SVF_NAVI_UNIT_GATEWAY__'];const prior=Object.fromEntries(names.map(n=>[n,globalThis[n]]));const w=new Window({url:'http://localhost'});globalThis.window=w;globalThis.document=w.document;globalThis.localStorage=w.localStorage;document.body.innerHTML='<section class="window-app-content"><input id="message-input"><p id="navi-intent-status" hidden></p><div id="navi-match-list" hidden></div><p id="navi-selected-target"></p></section>';t.after(()=>{w.happyDOM.abort();for(const n of names){if(prior[n]===undefined)delete globalThis[n];else globalThis[n]=prior[n];}});const content=JSON.stringify(rows),cid=await contentCidForBytes(new TextEncoder().encode(content));const calls=[];globalThis.fetch=async url=>{assert.equal(url,'/mcp/tools/bindings?app_id=navi');return{ok:true,json:async()=>({controls:[{binding_id:'navi.ipfs_datasets_py.query_catalog',owner:'ipfs_datasets_py',preferred_tool_ids:['load_dataset','get_from_ipfs'],safe_payloads:{get_from_ipfs:configured?{cid,gateway:'http://127.0.0.1:8091'}:{}}}]})};};globalThis.__SVF_NAVI_UNIT_GATEWAY__=async(_container,app,binding,options)=>{calls.push({app,binding,options});return resultOverride??{ok:true,outcome:'executed',result:{result:{content:[{type:'json',json:{status:'success',cid,content:tamper?'[]':content,content_type:'text'}}]}}};};const app=Object.create(NAVIApp.prototype);app.addMessage=()=>{};app.selectedTarget='';return{app,calls,cid,w};}
test('Navi reads qualified actual catalog CID with real supported schema and selects only a returned row',async t=>{const f=await fixture(t);await f.app.resolveCatalogIntent('gpt2');assert.equal(f.calls.length,1);const c=f.calls[0];assert.equal(c.options.toolId,'get_from_ipfs');assert.equal(c.options.executionMode,'execute');assert.deepEqual(c.options.payload,{cid:f.cid,gateway:'http://127.0.0.1:8091'});assert.equal(document.querySelector('#navi-match-list').hidden,false);assert.equal(document.querySelector('#navi-use-target').dataset.target,'gpt2');f.app.commitSelectedTarget('gpt2');assert.equal(JSON.parse(localStorage.getItem('navi-workflow-state')).selectedTarget,'gpt2');document.querySelector('#navi-selected-target').textContent='';const reopened=Object.create(NAVIApp.prototype);reopened.restoreWorkflowState();assert.equal(reopened.selectedTarget,'gpt2');assert.equal(document.querySelector('#navi-selected-target').textContent,'Selected target: gpt2');});
test('Navi never synthesizes the query text from a count-only owner result',async t=>{const f=await fixture(t,{resultOverride:{ok:true,outcome:'executed',result:{count:7}}});await f.app.resolveCatalogIntent('invented target');assert.equal(document.querySelector('#navi-match-list').hidden,true);assert.match(document.querySelector('#navi-intent-status').textContent,/could not be verified/);});
test('Navi content hash mismatch preserves original intent and grants no target',async t=>{const f=await fixture(t,{tamper:true});await f.app.resolveCatalogIntent('gpt2');assert.equal(document.querySelector('#message-input').value,'gpt2');assert.equal(document.querySelector('#navi-match-list').hidden,true);});
test('Navi nested owner error is rejected before a success-shaped inner payload can create matches',async t=>{const f=await fixture(t,{resultOverride:{ok:true,outcome:'executed',result:{isError:true,content:[{type:'json',json:{status:'success',count:1}}]}}});await f.app.resolveCatalogIntent('gpt2');assert.equal(document.querySelector('#navi-match-list').hidden,true);});
test('Navi no-match and ambiguous rows stay honest instead of silently picking another target',async t=>{const f=await fixture(t,{rows:[{id:'gpt2'},{id:'gpt2-large'}]});await f.app.resolveCatalogIntent('not-in-catalog');assert.equal(document.querySelector('#navi-match-list').hidden,true);await f.app.resolveCatalogIntent('gpt2');assert.match(document.querySelector('#navi-intent-status').textContent,/ambiguous/);assert.equal(document.querySelectorAll('.navi-target-choice').length,2);assert.equal(f.app.selectedTarget,'');});
test('Navi ambiguous punctuation dispatches no owner call and keeps the original editable intent',async t=>{const f=await fixture(t);await f.app.resolveCatalogIntent('??');assert.equal(f.calls.length,0);assert.match(document.querySelector('#navi-intent-status').textContent,/Not resolved/);assert.equal(document.querySelector('#message-input').value,'??');});
test('Navi absent qualified CID cannot fall back to the obsolete notes collection or Hub source',async t=>{const f=await fixture(t,{configured:false});await f.app.resolveCatalogIntent('gpt2');assert.equal(f.calls.length,0);assert.equal(document.querySelector('#navi-match-list').hidden,true);});

function nativeApp() {
  const app=Object.create(NAVIApp.prototype);
  app.initializeIntegrations=async()=>{};
  app.loadInitialContext=async()=>{};
  app.startPeriodicUpdates=()=>{};
  app.addMessage=()=>{};
  app.personality='helpful';app.aiModel='gpt-4';app.voiceEnabled=false;app.isListening=false;
  return app;
}
async function actualHostOrder(app) {
  // Mirrors main-simple.createNaviApp: initialize BEFORE inserting HTML,
  // then createWindow(), actual DOM insertion, and setupEventListeners(host).
  await app.initialize();
  const host=document.createElement('div');host.className='window-app-content';
  host.innerHTML=app.createWindow();document.body.append(host);app.setupEventListeners(host);
  return host;
}
test('real dynamically rendered target click persists and real initialize-before-mount order restores its exact label',async t=>{
  const f=await fixture(t);document.body.replaceChildren();const first=nativeApp();let host=await actualHostOrder(first);
  await first.resolveCatalogIntent('gpt2');host.querySelector('#navi-use-target').click();
  assert.equal(first.selectedTarget,'gpt2');assert.equal(JSON.parse(localStorage.getItem('navi-workflow-state')).selectedTarget,'gpt2');
  host.remove();const reopened=nativeApp();host=await actualHostOrder(reopened);
  assert.equal(reopened.selectedTarget,'gpt2');assert.equal(host.querySelector('#navi-selected-target').textContent,'Selected target: gpt2');
  assert.equal(f.calls.length,1,'restoration must not repeat catalog owner execution');
});
test('target click delegation binds once to the live native root and detached old instances cannot handle a new target',async t=>{
  await fixture(t);document.body.replaceChildren();const old=nativeApp();let oldCommits=0;old.commitSelectedTarget=()=>{oldCommits++;};const retired=await actualHostOrder(old);retired.remove();
  const current=nativeApp();let commits=0;const commit=NAVIApp.prototype.commitSelectedTarget;current.commitSelectedTarget=function(label){commits++;return commit.call(this,label);};const host=await actualHostOrder(current);current.setupEventListeners(host);
  current.showIntentOutcome('gpt2','Matched actual unit catalog',['gpt2']);host.querySelector('#navi-use-target').click();
  assert.equal(commits,1);assert.equal(oldCommits,0);assert.equal(current.selectedTarget,'gpt2');
});

async function nativeWindowFixture(t) {
  await fixture(t);document.body.replaceChildren();
  const globalStyle=document.createElement('style');globalStyle.textContent='.window-content{display:block;padding-bottom:56px}.window-app-content{display:block}';document.head.append(globalStyle);
  const shell=document.createElement('div');shell.className='window';shell.dataset.appId='navi';
  shell.innerHTML='<div class="window-content"><div class="window-app-content"><div id="native-navi-content"></div><div class="live-tool-gateway-host"><details><summary>Actual backend details remain accessible</summary><button id="unit-owner-control">Owner diagnostic</button></details></div></div></div>';
  shell.querySelector('#native-navi-content').innerHTML=nativeApp().createWindow();document.body.append(shell);
  return shell;
}
test('Navi confines its actual parent content and native root to a shrinking flex column',async t=>{
  const shell=await nativeWindowFixture(t),computed=n=>window.getComputedStyle(shell.querySelector(n));
  assert.equal(computed('.window-content').display,'flex');assert.equal(computed('.window-content').flexDirection,'column');assert.equal(computed('.window-content').paddingBottom,'0px');
  for(const selector of ['.window-app-content','#native-navi-content','.navi-container']){const css=computed(selector);assert.match(css.minHeight,/^0(px)?$/);assert.equal(css.overflow,'hidden');}
  assert.equal(computed('#native-navi-content').flexGrow,'1');assert.match(computed('#native-navi-content').flexBasis,/^0(px)?$/);
  assert.ok(shell.querySelector('#message-input'));assert.ok(shell.querySelector('#unit-owner-control'));assert.notEqual(computed('.live-tool-gateway-host').display,'none');
});
test('long real message nodes scroll inside the message region while intent and composer stay in normal flow',async t=>{
  const shell=await nativeWindowFixture(t),messages=shell.querySelector('.conversation-messages');
  for(let n=0;n<100;n++){const row=document.createElement('p');row.textContent='Authored long conversation row '+n;messages.append(row);}
  const css=window.getComputedStyle(messages);assert.equal(css.overflow,'auto');assert.match(css.minHeight,/^0(px)?$/);assert.match(css.flexBasis,/^0(px)?$/);
  for(const selector of ['.conversation-header','.navi-resolution','.conversation-input'])assert.equal(window.getComputedStyle(shell.querySelector(selector)).flexShrink,'0');
  assert.equal(messages.querySelectorAll('p').length,100);assert.ok(shell.querySelector('#send-message-btn'));assert.ok(shell.querySelector('#show-context'));
});
test('Navi parent-frame corrections do not alter a different application window',async t=>{
  await nativeWindowFixture(t);const other=document.createElement('div');other.className='window';other.dataset.appId='another-app';other.innerHTML='<div class="window-content"><div class="window-app-content">Other application</div></div>';document.body.append(other);
  const css=window.getComputedStyle(other.querySelector('.window-content'));assert.equal(css.display,'block');assert.equal(css.paddingBottom,'56px');
});
