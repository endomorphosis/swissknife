/** Shared presentation contracts; authored DOM/status fixtures, no browser or backend execution. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Window } from 'happy-dom';
import { mountAllAppBackendStatus } from '../../web/js/all-app-backend-status.js';
const source=fs.readFileSync(new URL('../../web/js/main-simple.js',import.meta.url),'utf8');
const start=source.indexOf('    detectAndShowGraphicsBadge() {');
const end=source.indexOf('\n    // Query WebGL support',start);
assert.ok(start>0&&end>start);
const graphics=new Function(`return (${source.slice(start,end).trim().replace('detectAndShowGraphicsBadge()', 'function detectAndShowGraphicsBadge()')})`)();
let sequence=0;
function dom(t){
 const window=new Window({url:'http://localhost'});
 const keys=['window','document','CustomEvent','fetch'];const before=Object.fromEntries(keys.map(k=>[k,globalThis[k]]));
 Object.assign(globalThis,{window,document:window.document,CustomEvent:window.CustomEvent});
 document.body.innerHTML='<div class="system-panel"><div class="panel-right"></div></div>';
 t.after(()=>{window.happyDOM.abort();for(const[k,v]of Object.entries(before)){if(v===undefined)delete globalThis[k];else globalThis[k]=v;}});
 return window;
}
const flush=()=>new Promise(resolve=>setTimeout(resolve,0));
test('software graphics warning remains a compact taskbar disclosure with truthful full details',t=>{
 dom(t);const renderer='ANGLE SwiftShader '+ 'long renderer '.repeat(30);
 graphics.call({getWebGLInfo:()=>({supported:true,isSoftware:true,renderer})});
 const notice=document.querySelector('#graphics-limited-badge');
 assert.equal(notice.tagName,'DETAILS');assert.equal(notice.open,false);
 assert.equal(notice.parentElement.className,'panel-right');
 assert.equal(notice.querySelector('summary').textContent,'⚠');
 assert.match(notice.querySelector('summary').getAttribute('aria-label'),/Limited graphics/);
 assert.ok(notice.querySelector('.graphics-details').textContent.includes(renderer));
 assert.equal(notice.querySelector('summary').textContent.includes(renderer),false);
 const css=document.querySelector('#swissknife-graphics-status-style').textContent;
 assert.match(css,/width:28px/);assert.match(css,/100vw - 16px/);assert.match(css,/100vh - 96px/);assert.match(css,/overflow:auto/);
 assert.equal(notice.querySelector('[aria-label="Dismiss"]'),null);
});
test('graphics disclosure closes on Escape without removing the warning and restores keyboard focus',t=>{
 const window=dom(t);graphics.call({getWebGLInfo:()=>({supported:false,isSoftware:true,renderer:null})});
 const notice=document.querySelector('#graphics-limited-badge'),summary=notice.querySelector('summary');
 notice.open=true;notice.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
 assert.equal(notice.open,false);assert.equal(document.activeElement,summary);assert.ok(notice.isConnected);
 assert.match(notice.textContent,/Graphics unavailable/);assert.match(notice.textContent,/Unknown renderer/);
});
test('graphics renderer strings stay text, duplicate warnings are refused, hardware rendering needs no warning',t=>{
 dom(t);graphics.call({getWebGLInfo:()=>({supported:true,isSoftware:false,renderer:'GPU'})});
 assert.equal(document.querySelector('#graphics-limited-badge'),null);
 const context={getWebGLInfo:()=>({supported:true,isSoftware:true,renderer:'<img src=x onerror=unsafe()>'})};
 graphics.call(context);graphics.call(context);
 assert.equal(document.querySelectorAll('#graphics-limited-badge').length,1);
 assert.equal(document.querySelector('#graphics-limited-badge img'),null);
 assert.ok(document.querySelector('.graphics-details').textContent.includes('<img'));
});
async function dock(t,{withWindow=false}={}){
 const window=dom(t),container=document.createElement('div');container.className='live-tool-gateway-host';
 let nativeContainer;
 if(withWindow){
  const frame=document.createElement('div');frame.className='window';
  const primary=document.createElement('div');primary.className='window-app-content';
  nativeContainer=document.createElement('div');nativeContainer.id='actual-native-app-mount';
  primary.append(nativeContainer,container);frame.append(primary);document.body.append(frame);
 }else document.body.append(container);
 const appId=`shared-notice-unit-${++sequence}`;
 globalThis.fetch=async()=>({ok:true,json:async()=>({app:{app_id:appId,disposition:'tool_backed',statuses:[{
  key:'A',owner:'ipfs_accelerate_py',label:'IPFS Accelerate',state:'unavailable',source:'authored-unit',role:'declared',
  receipt:{required:true},recovery:{routes:[{user_message:'A real owner must become available before execution.'}]} }]}})});
 await mountAllAppBackendStatus(container,appId);
 return{window,container,nativeContainer,disclosure:container.querySelector('[data-testid="backend-status-disclosure"]')};
}
test('backend status defaults to a visible compact disclosure with bounded wrapped details',async t=>{
 const{container,disclosure}=await dock(t);
 assert.equal(disclosure.open,false);
 assert.match(disclosure.querySelector('summary').textContent,/A: unavailable/);
 assert.match(disclosure.querySelector('summary').getAttribute('aria-label'),/A: unavailable/);
 assert.equal(container.style.minHeight,'2.5rem');assert.equal(container.style.overflow,'auto');
 assert.ok(disclosure.querySelector('.backend-status-disclosure-body').style.maxHeight);
 assert.match(disclosure.querySelector('[data-backend-owner]').style.gridTemplateColumns,/auto-fit/);
 assert.ok(disclosure.textContent.includes('A real owner must become available'));
});
test('actual gateway controls retain their nodes and handlers inside user disclosure',async t=>{
 const{container,disclosure}=await dock(t);const panel=document.createElement('section');panel.className='live-tool-gateway-panel';
 const button=document.createElement('button');button.textContent='Actual controlled action';let calls=0;button.addEventListener('click',()=>calls++);panel.append(button);container.append(panel);
 await flush();assert.ok(disclosure.querySelector('.backend-status-disclosure-body').contains(button));
 assert.equal(disclosure.open,false);disclosure.open=true;button.click();assert.equal(calls,1);
});
test('pending confirmation opens its actual controls without focus tricks or automatic consent',async t=>{
 const{container,disclosure}=await dock(t);const panel=document.createElement('section');container.append(panel);await flush();
 const confirm=document.createElement('button');confirm.dataset.gatewayConfirm='unit-only';let confirmed=0;confirm.addEventListener('click',()=>confirmed++);panel.append(confirm);
 await flush();assert.equal(disclosure.open,true);assert.equal(confirmed,0);assert.ok(confirm.isConnected);
 disclosure.open=false;await flush();assert.equal(disclosure.open,true);assert.equal(confirmed,0);
});
test('summary follows actual gateway status, correlation and receipt updates even while collapsed',async t=>{
 const{window,container,disclosure}=await dock(t);
 container.dispatchEvent(new window.CustomEvent('swissknife:live-gateway-result',{detail:{result:{owner:'ipfs_accelerate_py',state:'executed',correlation_id:'unit-correlation',receipt:{receipt_id:'unit-receipt',policy_outcome:'allow'}}}}));
 assert.match(disclosure.querySelector('summary').textContent,/A: live/);
 assert.equal(disclosure.querySelector('[data-backend-correlation]').textContent,'unit-correlation');
 assert.equal(disclosure.querySelector('[data-backend-receipt]').textContent,'unit-receipt');assert.equal(disclosure.open,false);
});
test('Accelerate model-catalog diagnostics stay in collapsed diagnostics, outside its primary card',()=>{
 const begin=source.indexOf('    async createAcceleratePanelSurface('),finish=source.indexOf('\n    async createAgentSupervisorApp',begin),section=source.slice(begin,finish);
 const diagnostic=section.indexOf('<details class="accelerate-diagnostics"');const status=section.indexOf('id="accelerate-model-status"');
 assert.ok(diagnostic>0&&status>diagnostic);
 assert.equal(section.includes('this surface asserts no artifact CIDs'),false);
 assert.match(section,/Model catalog has not been checked in this session/);
});


test('native sibling diagnostic output stays reusable under its original query root with compact details',async t=>{
 const{window,nativeContainer,container}=await dock(t,{withWindow:true});
 const primary=document.createElement('output');primary.id='actual-primary-result';primary.textContent='Real primary output';nativeContainer.append(primary);
 const status=document.createElement('output');status.dataset.gatewayStatus='unit-binding';status.setAttribute('aria-live','polite');
 status.textContent='failed; unit-correlation; actual controlled error';let events=0;status.addEventListener('unit-event',()=>events++);nativeContainer.append(status);
 await flush();const group=nativeContainer.querySelector('details[data-native-operation-details]');
 assert.ok(group);assert.equal(group.open,false);
 assert.equal(nativeContainer.querySelectorAll('output[data-gateway-status]').length,1);
 assert.equal(nativeContainer.querySelector('output[data-gateway-status]'),status);
 assert.equal(primary.parentElement,nativeContainer);assert.equal(container.contains(status),false);
 assert.equal(group.querySelector('[data-native-operation-summary]').textContent,'Backend operation details');
 assert.equal(group.querySelector('[data-native-operation-announcement]').getAttribute('aria-live'),'polite');
 assert.match(group.querySelector('[data-native-operation-announcement]').textContent,/actual controlled error/);
 status.dispatchEvent(new window.Event('unit-event'));assert.equal(events,1);
 status.textContent='run_inference_job unit-correlation; executed; receipt=unit-receipt; event=unit-event';await flush();
 assert.equal(nativeContainer.querySelector('output[data-gateway-status]'),status);
 assert.equal(nativeContainer.querySelectorAll('details[data-native-operation-details]').length,1);
 assert.match(group.querySelector('[data-native-operation-announcement]').textContent,/executed/);
 assert.equal(group.querySelector('[data-native-operation-summary]').textContent.includes('unit-receipt'),false);
});
