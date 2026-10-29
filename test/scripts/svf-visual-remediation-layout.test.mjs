// Authored DOM/HTTP fixtures verify layout ownership and scrolling, never app acceptance.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import test from 'node:test';
import {Window} from 'happy-dom';
import {AIChatApp} from '../../web/js/apps/ai-chat.js';
import {mountAllAppBackendStatus} from '../../web/js/all-app-backend-status.js';
const initial=new Window({url:'http://localhost'});
Object.assign(globalThis,{window:initial,localStorage:initial.localStorage});
const {HuggingFaceApp}=await import('../../web/js/apps/huggingface.js');
delete globalThis.window;delete globalThis.localStorage;await initial.happyDOM.abort();
function environment(t,width=1440){
 const window=new Window({url:'http://localhost',width,height:900,settings:{disableJavaScriptEvaluation:true,disableCSSFileLoading:true}});
 const names=['window','document','localStorage','CustomEvent','requestAnimationFrame','fetch','__SWISSKNIFE_GATEWAY_FORCE_DRY_RUN__'];
 const old=new Map(names.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
 Object.assign(globalThis,{window,document:window.document,localStorage:window.localStorage,CustomEvent:window.CustomEvent,requestAnimationFrame:window.requestAnimationFrame.bind(window),fetch:async()=>{throw Error('UNIT_FORBIDS_NETWORK')},__SWISSKNIFE_GATEWAY_FORCE_DRY_RUN__:false});
 t.after(async()=>{await window.happyDOM.abort();for(const name of names){const value=old.get(name);if(value)Object.defineProperty(globalThis,name,value);else delete globalThis[name];}});
 const index=fs.readFileSync(new URL('../../web/index.html',import.meta.url),'utf8');
 for(const match of index.matchAll(/<link\s+rel="stylesheet"\s+href="([^"]+)"/g)){const style=document.createElement('style');style.textContent=fs.readFileSync(new URL('../../web'+match[1],import.meta.url),'utf8');document.head.append(style);}
 return window;
}
async function mount(id,app){
 const shell=document.createElement('section');shell.className='window';shell.dataset.appId=id;
 shell.innerHTML='<div class="window-content"><div class="window-app-content"><div id="unit-content"></div><div class="live-tool-gateway-host"></div></div></div>';
 document.body.append(shell);shell.querySelector('#unit-content').innerHTML=await app.render();return shell;
}
function waitForDisclosure(root,window){
 return new Promise((resolve,reject)=>{
  const ready=()=>root.querySelector('output[data-gateway-status]')?.closest('details[data-native-operation-details]');
  if(ready())return resolve();
  const observer=new window.MutationObserver(()=>{if(ready()){observer.disconnect();window.clearTimeout(timeout);resolve();}});
  observer.observe(root,{childList:true,subtree:true});
  const timeout=window.setTimeout(()=>{observer.disconnect();reject(Error('shared disclosure did not settle'));},1000);
 });
}
function reference(){
 const content=JSON.stringify([{id:'gpt2',snapshot:'a'.repeat(40),task:'text-generation',device:'cpu'}]);
 const bytes=Buffer.concat([Buffer.from([1,85,18,32]),createHash('sha256').update(content).digest()]);
 const alphabet='abcdefghijklmnopqrstuvwxyz234567';let cid='b',bits=0,buffer=0;
 for(const byte of bytes){buffer=(buffer<<8)|byte;bits+=8;while(bits>=5){bits-=5;cid+=alphabet[(buffer>>>bits)&31];}}if(bits)cid+=alphabet[(buffer<<(5-bits))&31];
 return{cid,content};
}
test('AI native read keeps actual shared operation disclosure in chat main, never a third root column',async t=>{
 const window=environment(t);const app=new AIChatApp({windows:new Map()});const shell=await mount('ai-chat',app);const fixture=reference();
 const binding={app_id:'ai-chat',binding_id:'ai-chat.ipfs_datasets_py.query_catalog',owner:'ipfs_datasets_py',intent_id:'unit-read',selected_tool_id:'get_from_ipfs',preferred_tool_ids:['get_from_ipfs'],mutates_remote_state:false,confirmation_required:false,transport:'http',transports:['http'],safe_payloads:{get_from_ipfs:{cid:fixture.cid,gateway:'http://127.0.0.1:8091'}}};
 const calls=[];globalThis.fetch=async(url,options={})=>{
  if(String(url).startsWith('/mcp/apps/backend-status'))return{ok:true,json:async()=>({app:{app_id:'ai-chat',disposition:'tool_backed',statuses:[]}})};
  if(String(url).startsWith('/mcp/tools/bindings'))return{ok:true,json:async()=>({controls:[binding]})};
  if(url==='/mcp/tools/dispositions')return{ok:true,json:async()=>({entries:[]})};
  assert.equal(url,'/mcp/tools/call');const call=JSON.parse(options.body);calls.push(call);
  return{ok:true,status:200,json:async()=>({ok:true,outcome:'executed',correlation_id:call.correlation_id,result:{content:[{type:'json',json:{status:'success',cid:fixture.cid,content:fixture.content}}]},receipt:{receipt_id:'authored-unit-only'}})};
 };
 await mountAllAppBackendStatus(shell.querySelector('.live-tool-gateway-host'),'ai-chat');
 assert.equal((await app.retrieveStoredReference()).cid,fixture.cid);await waitForDisclosure(shell,window);
 const output=shell.querySelector('output[data-gateway-status]');const disclosure=output.closest('details[data-native-operation-details]');
 assert.ok(disclosure,'the actual shared module must retain the real output in a reachable disclosure');
 assert.equal(disclosure.parentElement===shell.querySelector('.chat-main'),true,'shared disclosure must stay in chat main');
 assert.equal(shell.querySelector('.ai-chat-container').children.length,2);
 assert.equal(window.getComputedStyle(disclosure.parentElement).flexDirection,'column');
 assert.match(disclosure.querySelector('summary').textContent,/Backend operation details/);disclosure.open=true;assert.equal(disclosure.contains(output),true);assert.equal(calls.length,1);
});
test('AI latest/earlier scrolling changes only the transcript and new replies reveal their tail',async t=>{
 const window=environment(t);const app=new AIChatApp({windows:new Map()});const shell=await mount('ai-chat',app);const pane=shell.querySelector('.chat-messages');
 Object.defineProperty(pane,'scrollHeight',{value:1400,configurable:true});document.documentElement.scrollTop=75;shell.scrollTop=55;pane.scrollTop=30;
 app.addMessage('assistant','Authored unit reply tail preserved');assert.equal(pane.scrollTop,1400);assert.match(pane.textContent,/reply tail preserved/);
 app.scrollTranscript('start');assert.equal(pane.scrollTop,0);app.scrollTranscript('end');assert.equal(pane.scrollTop,1400);
 assert.equal(document.documentElement.scrollTop,75);assert.equal(shell.scrollTop,55);
 assert.equal(pane.getAttribute('tabindex'),'0');assert.equal(shell.querySelector('[data-chat-scroll="end"]').textContent,'Latest reply');
 assert.equal(window.getComputedStyle(pane).scrollBehavior,'auto');assert.equal(window.getComputedStyle(pane.querySelector('.message')).paddingTop,'0px');
});
test('AI reference preference survives reopen without forcing an unconfigured reference on a new user',async t=>{
 environment(t);const app=new AIChatApp({windows:new Map()});const shell=await mount('ai-chat',app);
 assert.equal(shell.querySelector('#ai-chat-reference-enabled').checked,false);
 app.setReferenceEnabled(true);const reopened=new AIChatApp({windows:new Map()});
 const retained=document.createElement('div');retained.innerHTML=await reopened.render();
 assert.equal(retained.querySelector('#ai-chat-reference-enabled').checked,true);
 reopened.setReferenceEnabled(false);const disabled=new AIChatApp({windows:new Map()});
 retained.innerHTML=await disabled.render();assert.equal(retained.querySelector('#ai-chat-reference-enabled').checked,false);
});
for(const width of [1440,390])test(`HF ${width}px retains a bounded flex chain, visible catalog and all navigation/status controls`,async t=>{
 const window=environment(t,width);const observed='2026-10-27T01:00:00.000Z';
 localStorage.setItem('huggingface-native-catalog',JSON.stringify({rows:[{id:'gpt2',snapshot:'a'.repeat(40),task:'text-generation'}],observedAt:observed}));
 const app=new HuggingFaceApp();const shell=await mount('huggingface',app);
 for(const selector of ['.window-content','.window-app-content','#unit-content','.huggingface-app']){const style=window.getComputedStyle(shell.querySelector(selector));assert.equal(style.display,'flex',selector);assert.equal(style.minHeight,'0',selector);}
 assert.equal(window.getComputedStyle(shell.querySelector('#unit-content')).flexGrow,'1');
 assert.equal(window.getComputedStyle(shell.querySelector('.huggingface-app')).height,'auto');
 assert.equal(window.getComputedStyle(shell.querySelector('.hf-content')).overflowY,'auto');
 assert.equal(window.getComputedStyle(shell.querySelector('.hf-nav-tabs')).flexWrap,'wrap');
 assert.equal(shell.querySelectorAll('.hf-nav-tabs [role="tab"]').length,5);
 assert.equal(window.getComputedStyle(shell.querySelector('.hf-status-bar')).overflow,'visible');
 assert.match(shell.querySelector('.hf-status-bar').textContent,/Catalog: 1 items/);assert.match(shell.querySelector('#hf-last-refresh').textContent,new RegExp(observed.replaceAll('.','\\.')));
 assert.ok(shell.querySelector('.model-card[data-model-id="gpt2"]'));assert.match(shell.querySelector('.hf-content').textContent,/Stored catalog metadata/);
});
