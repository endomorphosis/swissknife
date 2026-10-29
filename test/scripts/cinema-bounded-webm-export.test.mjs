// Authored recorder/decoder events only; these portable regressions never qualify real WebM/browser/backend behavior.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { parse } from 'acorn';
import { Window } from 'happy-dom';
import { CinemaApp } from '../../web/js/apps/cinema.js';
import { contentCidForBytes } from '../../web/js/core/mcp-plus-plus-desktop-client.js';

const bytes = Uint8Array.from([0x1a,0x45,0xdf,0xa3,1,2,3,4]); // Authored signature, not an actual encoded clip.
const cid = await contentCidForBytes(bytes);
const encoded = Buffer.from(bytes).toString('base64');
const checksum = Buffer.from(await crypto.subtle.digest('SHA-256',bytes)).toString('hex');
const sourceIdentity = {cid,sha256:checksum,size:bytes.length,mime:'video/webm'};
async function until(predicate) { for(let i=0;i<150;i++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,2));}throw Error('Authored Cinema event did not settle'); }
function fixture(t, {manualDecode=false}={}) {
  const window = new Window({url:'http://authored.invalid',settings:{disableCSSFileLoading:true,disableJavaScriptEvaluation:true}});
  const names=['window','document','localStorage','sessionStorage','CustomEvent','MutationObserver','fetch','__SWISSKNIFE_GATEWAY_FORCE_DRY_RUN__'];
  const originals=new Map(names.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
  Object.assign(globalThis,{window,document:window.document,localStorage:window.localStorage,sessionStorage:window.sessionStorage,CustomEvent:window.CustomEvent,MutationObserver:window.MutationObserver,__SWISSKNIFE_GATEWAY_FORCE_DRY_RUN__:false});
  const urlMethods={create:URL.createObjectURL,revoke:URL.revokeObjectURL};
  const created=[],revoked=[],calls=[],media=[],options=[];
  URL.createObjectURL=()=>{const url='blob:authored-'+(created.length+1);created.push(url);return url;};
  URL.revokeObjectURL=url=>revoked.push(url);
  const create=document.createElement.bind(document);
  document.createElement=(name,...args)=>{
    const node=create(name,...args);if(name.toLowerCase()!=='video')return node;
    const config=options.shift()||{},state={readyState:0,videoWidth:0,videoHeight:0,duration:NaN,error:null,currentTime:0,paused:true,playCalls:0,pauseCalls:0};
    for(const key of ['readyState','videoWidth','videoHeight','duration','paused','error'])Object.defineProperty(node,key,{configurable:true,get:()=>state[key]});
    Object.defineProperty(node,'currentTime',{configurable:true,get:()=>state.currentTime,set:value=>{state.currentTime=value;node.dispatchEvent(new window.Event('seeked'));}});
    node.play=async()=>{state.playCalls++;if(config.playError)throw Error('authored playback refused');state.paused=false;node.dispatchEvent(new window.Event('play'));};
    node.pause=()=>{state.pauseCalls++;const playing=!state.paused;state.paused=true;if(playing)node.dispatchEvent(new window.Event('pause'));};
    const complete=()=>{Object.assign(state,{readyState:2,videoWidth:160,videoHeight:90,duration:4},config);node.dispatchEvent(new window.Event('loadeddata'));};
    node.load=()=>{if(!manualDecode&&!config.manual)queueMicrotask(complete);};
    media.push({node,state,complete});return node;
  };
  let owner=()=>({success:true,cid,sha256:checksum,size:bytes.length,bytes_base64:encoded});
  globalThis.fetch=async(url,request={})=>{
    if(String(url).startsWith('/mcp/tools/bindings'))return{ok:true,json:async()=>({controls:[['retrieve_content','ipfs_cat'],['persist_artifact','artifacts_put']].map(([operation,tool])=>({app_id:'cinema',owner:'ipfs_kit_py',binding_id:'cinema.ipfs_kit_py.'+operation,intent_id:'cinema.ipfs_kit_py.'+operation,selected_tool_id:tool,preferred_tool_ids:[tool],transport:'http',transports:['http'],mutates_remote_state:true,safe_payload:{}}))})};
    if(url==='/mcp/tools/dispositions')return{ok:true,json:async()=>({entries:[]})};
    assert.equal(url,'/mcp/tools/call');const call=JSON.parse(request.body);calls.push(call);
    const result=call.tool_id==='artifacts_put'?{success:true,persisted:true,verified:true,cid:call.input.payload.cid}:owner(call);
    return{ok:true,status:200,json:async()=>({ok:true,outcome:'executed',correlation_id:call.correlation_id,result,receipt:{receipt_id:'authored-receipt-'+calls.length,event_dag_refs:['authored-event']}})};
  };
  function mount(){const shell=document.createElement('section');shell.className='window';shell.dataset.appId='cinema';shell.innerHTML='<button class="window-control close" type="button">Close</button><div class="window-content"><div class="mount"></div></div>';document.body.append(shell);const root=shell.querySelector('.mount'),app=new CinemaApp();app.createInterface(root);return{app,root,shell};}
  const current=mount();
  async function approve(pending,root=current.root){await until(()=>root.querySelector('[data-gateway-confirm]'));const event=new window.MouseEvent('click',{bubbles:true});Object.defineProperty(event,'isTrusted',{value:true}); // Authored trust sentinel only, not operational consent evidence.
    root.querySelector('[data-gateway-confirm]').dispatchEvent(event);return pending;}
  async function open(f=current){return approve(f.app.openNativeClip(f.root,cid,f.root.querySelector('[data-cinema-open-source]')),f.root);}
  t.after(async()=>{for(const app of instances)app.disposeMedia?.();await window.happyDOM.abort();URL.createObjectURL=urlMethods.create;URL.revokeObjectURL=urlMethods.revoke;for(const name of names){const descriptor=originals.get(name);if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}});
  const instances=[current.app];
  return{...current,window,calls,media,options,created,revoked,approve,open,setOwner:value=>{owner=typeof value==='function'?value:()=>value;},mount:()=>{const f=mount();instances.push(f.app);return f;}};
}

const originalRecorderDescriptor=Object.getOwnPropertyDescriptor(globalThis,'MediaRecorder'), nativeDateNow=Date.now;
const recordedBytes=Uint8Array.from([0x1a,0x45,0xdf,0xa3,9,8,7,6,5,4,3,2]); // Authored native-recorder payload, not an actual encoded WebM.
function recorderFixture(t,f,{empty=false,oversize=false,deadline=false,silentStop=false}={}){
 const descriptor=originalRecorderDescriptor,now=nativeDateNow,tracks=[],instances=[];
 const track={readyState:'live',stop(){this.readyState='ended';tracks.push('stop');}};
 f.media[0].node.captureStream=()=>({getVideoTracks:()=>[track],getTracks:()=>[track]});
 class Recorder extends f.window.EventTarget{
  static isTypeSupported(type){return type.startsWith('video/webm');}
  constructor(stream,options){super();this.stream=stream;this.options=options;this.state='inactive';this.mimeType=options.mimeType;instances.push(this);}
  start(){this.state='recording';queueMicrotask(()=>{if(deadline)Date.now=()=>now()+9000;f.media[0].state.currentTime=2;f.media[0].node.dispatchEvent(new f.window.Event('timeupdate'));});}
  stop(){if(this.state==='inactive')return;this.state='inactive';if(silentStop)return;const ev=new f.window.Event('dataavailable');Object.defineProperty(ev,'data',{value:new Blob(empty?[]:[oversize?new Uint8Array(65537):recordedBytes],{type:this.mimeType})});this.dispatchEvent(ev);this.dispatchEvent(new f.window.Event('stop'));}
 }
 Object.defineProperty(globalThis,'MediaRecorder',{configurable:true,writable:true,value:Recorder});t.after(()=>{Date.now=now;if(descriptor)Object.defineProperty(globalThis,'MediaRecorder',descriptor);else delete globalThis.MediaRecorder;});return{tracks,instances};
}
async function runExport(f){return f.approve(f.app.exportSelectedWebM(f.root,f.root.querySelector('[data-cinema-workflow="simulate-failed-export"]')));}

test('WebM owner consent follows actual recorder bytes and native output decode; exact output bytes/CID are persisted',async t=>{
 const f=fixture(t);await f.open();f.app.commitTimeline(f.root,2);const recorder=recorderFixture(t,f);
 const promise=f.app.exportSelectedWebM(f.root,f.root.querySelector('[data-cinema-workflow="simulate-failed-export"]'));
 await until(()=>f.root.querySelector('[data-gateway-confirm]'));assert.equal(f.calls.length,1);assert.equal(f.app.exportMedia,null,'decoded candidate cannot become an owner-persisted output before consent');
 assert.equal(await f.approve(promise),true);const write=f.calls.at(-1);assert.equal(write.tool_id,'artifacts_put');assert.equal(write.binding_id,'cinema.ipfs_kit_py.persist_artifact');assert.deepEqual(Buffer.from(write.input.payload.bytes_base64,'base64'),Buffer.from(recordedBytes));assert.equal(write.input.payload.cid,await contentCidForBytes(recordedBytes));assert.equal(f.app.exportMedia.cid,write.input.payload.cid);assert.equal(f.app.exportMedia.video.dataset.decodedCid,write.input.payload.cid);assert.equal(f.app.exportMedia.video.tagName,'VIDEO');assert.equal(f.app.exportMedia.video.hidden,false);assert.equal(f.app.sourceMedia.video.hidden,true);assert.equal(recorder.instances.length,1);assert.deepEqual(recorder.tracks,['stop']);assert.equal(f.app.renderQueue.length,0);
});
test('unsupported browser retains source/project without dispatching a second owner call',async t=>{
 const f=fixture(t);await f.open();f.app.commitTimeline(f.root,2);Object.defineProperty(globalThis,'MediaRecorder',{configurable:true,writable:true,value:undefined});const before=sessionStorage.getItem('swissknife.cinema.localProject'),source=f.app.sourceMedia;
 assert.equal(await f.app.exportSelectedWebM(f.root,null),false);assert.equal(f.calls.length,1);assert.equal(sessionStorage.getItem('swissknife.cinema.localProject'),before);assert.equal(f.app.sourceMedia,source);assert.equal(f.app.exportMedia,null);assert.match(f.root.querySelector('[data-cinema-export-outcome]').textContent,/unsupported by this browser/);
});
test('selection, empty-byte, size and wall-clock failures never publish output or call owner persistence',async t=>{
 for(const options of [{empty:true},{oversize:true},{deadline:true}]){const f=fixture(t);await f.open();f.app.commitTimeline(f.root,2);const before=sessionStorage.getItem('swissknife.cinema.localProject');recorderFixture(t,f,options);assert.equal(await f.app.exportSelectedWebM(f.root,null),false);assert.equal(f.calls.length,1);assert.equal(f.app.exportMedia,null);assert.equal(sessionStorage.getItem('swissknife.cinema.localProject'),before);}
 const f=fixture(t);await f.open();recorderFixture(t,f);f.app.commitTimeline(f.root,4);assert.equal(await f.app.exportSelectedWebM(f.root,null),false);assert.equal(f.calls.length,1);assert.match(f.root.querySelector('[data-cinema-export-outcome]').textContent,/at most three seconds/);
});
test('native decode is mandatory before owner dispatch, and close cancels decode without replacing prior media',async t=>{
 const f=fixture(t);await f.open();f.app.commitTimeline(f.root,2);recorderFixture(t,f);f.options.push({manual:true});const pending=f.app.exportSelectedWebM(f.root,null);await until(()=>f.media.length===2);assert.equal(f.calls.length,1);assert.equal(f.app.exportMedia,null);f.shell.remove();assert.equal(await pending,false);assert.equal(f.calls.length,1);assert.equal(f.app.exportMedia,null);assert.ok(f.revoked.includes(f.created[1]));
});
test('cancelled/preview/incorrect owner acknowledgements cannot publish output or mutate the saved project',async t=>{
 const f=fixture(t);await f.open();f.app.commitTimeline(f.root,2);recorderFixture(t,f);const saved=sessionStorage.getItem('swissknife.cinema.localProject');const pending=f.app.exportSelectedWebM(f.root,null);await until(()=>f.root.querySelector('[data-gateway-cancel]'));f.root.querySelector('[data-gateway-cancel]').click();assert.equal(await pending,false);assert.equal(f.app.exportMedia,null);assert.equal(sessionStorage.getItem('swissknife.cinema.localProject'),saved);assert.equal(f.calls.length,1);
 for(const value of [{persisted:false,verified:true,cid:'wrong'},{persisted:true,verified:false,cid:'wrong'},{persisted:true,verified:true,cid:'wrong'}]){f.app.invokeCinemaOwner=async()=>({preview:false,value});recorderFixture(t,f);assert.equal(await f.app.exportSelectedWebM(f.root,null),false);assert.equal(f.app.exportMedia,null);assert.equal(sessionStorage.getItem('swissknife.cinema.localProject'),saved);}
});
test('actual output CID is saved in project bytes and rehashed/redecoded on a fresh reopen without invented owner calls',async t=>{
 const f=fixture(t);await f.open();f.app.commitTimeline(f.root,2);recorderFixture(t,f);assert.equal(await runExport(f),true);const output=f.app.exportMedia,outputCid=output.cid;
 await f.approve(f.app.handleCinemaWorkflowAction(f.root,'load-project-media-cids',f.root.querySelector('[data-cinema-workflow="load-project-media-cids"]')));const record=JSON.parse(Buffer.from(f.calls.at(-1).input.payload.bytes_base64,'base64'));assert.equal(record.output.cid,outputCid);assert.equal(record.output.sha256,output.sha256);assert.deepEqual(record.output.trim,{in:0,out:2});assert.equal(f.root.querySelector('[data-cinema-output-reference]').value,outputCid);
 const calls=f.calls.length;f.shell.remove();await until(()=>f.app.exportMedia===null);const reopened=f.mount();await reopened.app.projectRestoration;assert.equal(f.calls.length,calls);assert.equal(reopened.app.exportMedia.cid,outputCid);assert.equal(reopened.app.exportMedia.restored,true);assert.notEqual(reopened.app.exportMedia.video,output.video);assert.equal(reopened.root.querySelector('[data-cinema-output-reference]').value,outputCid);assert.equal(JSON.parse(reopened.root.querySelector('[data-cinema-output-reference]').dataset.outputIdentity).restored,true);assert.equal(JSON.parse(reopened.root.querySelector('[data-cinema-selection]').dataset.cinemaSelectionState).selection.saved,true);
});
test('altered output cache cannot regain decoded/reference state after reopen',async t=>{
 const f=fixture(t);await f.open();f.app.commitTimeline(f.root,2);recorderFixture(t,f);assert.equal(await runExport(f),true);const key='swissknife.cinema.output.'+f.app.exportMedia.cid;const value=JSON.parse(sessionStorage.getItem(key));value.bytes_base64=encoded;sessionStorage.setItem(key,JSON.stringify(value));f.shell.remove();await until(()=>f.app.exportMedia===null);const reopened=f.mount();await reopened.app.projectRestoration;assert.equal(reopened.app.exportMedia,null);assert.equal(reopened.root.querySelector('[data-cinema-output-reference]').value,'');assert.match(reopened.root.querySelector('[data-cinema-export-outcome]').textContent,/do not match/);
});
test('unknown native output duration remains honest while native playback and actual current time work',async t=>{
 const f=fixture(t);await f.open();f.app.commitTimeline(f.root,2);recorderFixture(t,f);f.options.push({duration:Infinity});assert.equal(await runExport(f),true);assert.match(f.root.querySelector('[data-cinema-output-time]').textContent,/duration unavailable/);f.root.querySelector('[data-cinema-play]').click();await until(()=>!f.app.exportMedia.video.paused);assert.equal(f.root.querySelector('[data-cinema-play]').getAttribute('aria-label'),'Pause');f.media[1].state.currentTime=1.75;f.media[1].node.dispatchEvent(new f.window.Event('timeupdate'));assert.match(f.root.querySelector('[data-cinema-output-time]').textContent,/1.75s/);assert.equal(f.app.exportMedia.video.duration,Infinity);
});
test('duplicate exports and failed valid retries retain the last good output',async t=>{
 const f=fixture(t);await f.open();f.app.commitTimeline(f.root,2);recorderFixture(t,f);assert.equal(await runExport(f),true);const old=f.app.exportMedia;recorderFixture(t,f,{empty:true});const pending=f.app.exportSelectedWebM(f.root,null);assert.equal(await f.app.exportSelectedWebM(f.root,null),false);assert.equal(await pending,false);assert.equal(f.app.exportMedia,old);assert.equal(old.video.hidden,false);assert.equal(f.revoked.includes(old.url),false);
});
test('legacy render and MP4/FLV remain explicitly unsupported with no recorder or owner side effect',async t=>{
 const f=fixture(t);await f.open();const before=f.calls.length;for(const codec of ['mp4','flv']){f.root.querySelector('[data-cinema-codec]').value=codec;await f.app.handleCinemaWorkflowAction(f.root,'simulate-failed-export');assert.equal(f.app.exportMedia,null);}const old=await f.app.renderVideo('/unwritten.webm','webm');assert.equal(old.unsupported,true);assert.equal(old.outputPath,null);assert.equal(f.calls.length,before);assert.equal(f.app.renderQueue.length,0);
});
test('owner acknowledgement after close cannot publish to a departed window or overwrite project state',async t=>{
 const f=fixture(t);await f.open();f.app.commitTimeline(f.root,2);recorderFixture(t,f);const before=sessionStorage.getItem('swissknife.cinema.localProject');let resolveOwner,payload;f.app.invokeCinemaOwner=async(c,tool,value)=>{payload=value;return new Promise(resolve=>{resolveOwner=resolve;});};const pending=f.app.exportSelectedWebM(f.root,null);await until(()=>resolveOwner);f.shell.remove();await until(()=>f.app.sourceMedia===null);resolveOwner({preview:false,value:{persisted:true,verified:true,cid:payload.cid}});assert.equal(await pending,false);assert.equal(f.app.exportMedia,null);assert.equal(sessionStorage.getItem('swissknife.cinema.localProject'),before);assert.ok(f.revoked.includes(f.created[1]));
});
test('dead captured native track cannot create an owner-persisted result',async t=>{
 const f=fixture(t);await f.open();f.app.commitTimeline(f.root,2);recorderFixture(t,f);f.media[0].node.captureStream=()=>({getVideoTracks:()=>[{readyState:'ended'}],getTracks:()=>[]});assert.equal(await f.app.exportSelectedWebM(f.root,null),false);assert.equal(f.calls.length,1);assert.equal(f.app.exportMedia,null);assert.match(f.root.querySelector('[data-cinema-export-outcome]').textContent,/not live/);
});
test('scenario strengthens all original named media roles toward actual output, retains unsupported error and both governed native bindings',async()=>{
 const scenario=JSON.parse(fs.readFileSync(new URL('../e2e/functional-workflows/cinema.json',import.meta.url)));const {validateScenario}=await import('../../scripts/run-visual-functional-workflow.mjs');const app=JSON.parse(fs.readFileSync(new URL('../../config/visual-functional-app-contracts.json',import.meta.url))).apps.find(row=>row.app_id==='cinema');assert.equal(validateScenario(scenario,app),scenario);
 assert.deepEqual(scenario.backend_bindings.map(x=>[x.binding_id,x.mode,x.consent]),[['cinema.ipfs_kit_py.retrieve_content','isolated_mutation','ui_required'],['cinema.ipfs_kit_py.persist_artifact','isolated_mutation','ui_required']]);assert.equal(scenario.backend_bindings[0].result_assertion.expected,'bafkreiedh65a7kpxnldwlbhv4hszsqyld2l4gg3ybe4jq77dp2tnyzuhla');assert.equal(scenario.backend_bindings[1].result_assertion.expected,true);
 for(const phase of ['primary_result','failure_recovery']){const steps=scenario.phases[phase],role=steps.at(-1);assert.equal(role.requirement_id,phase==='primary_result'?'result_1':'failure_recovery');assert.equal(role.probe.kind,'media_state');assert.equal(role.probe.selector,'[data-cinema-video]');assert.equal(role.probe.temporal_ms,250);assert.equal(role.expected,.05);assert.ok(steps.some(s=>s.op==='select'&&s.value==='webm'));assert.ok(steps.some(s=>s.selector==='[data-gateway-confirm="cinema.ipfs_kit_py.persist_artifact"]'&&s.op==='click'));}
 const errors=scenario.phases.failure_recovery.filter(s=>s.checkpoint_id);assert.equal(errors.length,1);assert.equal(errors[0].checkpoint_id,'error_observed');assert.equal(errors[0].expected,'Unsupported codec');assert.ok(scenario.phases.failure_recovery.some(s=>s.expected==='Supported codec mp4 retried'));assert.equal(scenario.phases.persist_reopen.at(-1).requirement_id,'persist_reopen');const persistedSelection=scenario.phases.persist_reopen.find(step=>step.probe?.pointer==='/selection_serialized');assert.ok(persistedSelection);assert.equal(JSON.parse(persistedSelection.expected).saved,true);assert.equal(scenario.phases.persist_reopen.at(-1).probe.kind,'media_state');
});

test('close rejects a silent native recorder stop instead of waiting forever for its final event',async t=>{
 const f=fixture(t);await f.open();f.app.commitTimeline(f.root,2);recorderFixture(t,f,{silentStop:true});const pending=f.app.exportSelectedWebM(f.root,null);await until(()=>f.app.exportRecordCancel);f.shell.remove();assert.equal(await pending,false);assert.equal(f.calls.length,1);assert.equal(f.app.exportMedia,null);
});
test('an initially empty capture stream and never-settling native play promise are cancelled on close and release owned tracks',async t=>{
 const f=fixture(t);await f.open();f.app.commitTimeline(f.root,2);recorderFixture(t,f);let stopped=0;const stream=new f.window.EventTarget();stream.getVideoTracks=()=>[];stream.getTracks=()=>[{stop(){stopped++;}}];f.media[0].node.captureStream=()=>stream;f.media[0].node.play=()=>new Promise(()=>{});const pending=f.app.exportSelectedWebM(f.root,null);await until(()=>f.app.exportTrackCancel);f.shell.remove();assert.equal(await pending,false);assert.equal(stopped,1);assert.equal(f.calls.length,1);assert.equal(f.app.exportMedia,null);
});
test('the absolute deadline bounds an empty-track native play promise even when that promise never settles',async t=>{
 const f=fixture(t);await f.open();recorderFixture(t,f);let stopped=0;const stream=new f.window.EventTarget();stream.getVideoTracks=()=>[];stream.getTracks=()=>[{stop(){stopped++;}}];f.media[0].node.captureStream=()=>stream;f.media[0].node.play=()=>new Promise(()=>{});await assert.rejects(f.app.recordSelectedWebM(f.media[0].node,{in:0,out:2},Date.now()-1),/No captured native video track/);assert.equal(stopped,1);assert.equal(f.calls.length,1);
});
test('a missing output target after the owner acknowledgement cannot mutate the previous project',async t=>{
 const f=fixture(t);await f.open();f.app.commitTimeline(f.root,2);recorderFixture(t,f);const before=sessionStorage.getItem('swissknife.cinema.localProject');let resolveOwner,payload;f.app.invokeCinemaOwner=async(c,tool,value)=>{payload=value;return new Promise(resolve=>{resolveOwner=resolve;});};const pending=f.app.exportSelectedWebM(f.root,null);await until(()=>resolveOwner);f.root.querySelector('[data-cinema-output-video]').remove();resolveOwner({preview:false,value:{persisted:true,verified:true,cid:payload.cid}});assert.equal(await pending,false);assert.equal(sessionStorage.getItem('swissknife.cinema.localProject'),before);assert.equal(f.app.exportMedia,null);
});
test('a post-write preview publication failure rolls the project state back to the exact prior bytes',async t=>{
 const f=fixture(t);await f.open();f.app.commitTimeline(f.root,2);recorderFixture(t,f);const before=sessionStorage.getItem('swissknife.cinema.localProject');f.app.commitExportPreview=()=>{throw Error('authored failed preview publication');};assert.equal(await runExport(f),false);assert.equal(sessionStorage.getItem('swissknife.cinema.localProject'),before);assert.equal(f.app.exportMedia,null);assert.match(f.root.querySelector('[data-cinema-export-outcome]').textContent,/failed preview publication/);
});
test('the canonical post-import primary command order records the entered trim, saves the output reference, and leaves the actual output playing',async t=>{
 const f=fixture(t);await f.open();recorderFixture(t,f);const scenario=JSON.parse(fs.readFileSync(new URL('../e2e/functional-workflows/cinema.json',import.meta.url)));let role;
 // Source retrieval itself is covered above using the authored bytes; replay the exact canonical commands after that imported-source boundary.
 for(const step of scenario.phases.primary_result.slice(5)){
  if(step.op==='assert'){role=step;break;}
  if(step.op==='wait_for'){await until(()=>{const n=f.root.querySelector(step.selector);return n&&(step.state==='attached'||!n.hidden);});continue;}
  const node=f.root.querySelector(step.selector);assert.ok(node,'declared canonical target '+step.selector);
  if(step.op==='fill'||step.op==='select'){node.value=step.value;node.dispatchEvent(new f.window.Event('input',{bubbles:true}));node.dispatchEvent(new f.window.Event('change',{bubbles:true}));}
  else if(step.op==='click'){
   if(node.matches('[data-gateway-confirm]')){const event=new f.window.MouseEvent('click',{bubbles:true});Object.defineProperty(event,'isTrusted',{value:true});node.dispatchEvent(event);}else node.click();
  }else if(step.op==='press'&&step.key==='Enter'){
   if(node.matches('button'))node.click();else node.dispatchEvent(new f.window.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
  }
 }
 assert.equal(role.requirement_id,'result_1');const observed=f.root.querySelector(role.probe.selector);assert.equal(observed,f.app.exportMedia.video);assert.equal(observed.paused,false);assert.equal(f.app.readLocalProject().tracks[0].out,2);assert.ok(f.app.readLocalProject().projectCid);assert.equal(f.app.readLocalProject().output.cid,f.app.exportMedia.cid);assert.equal(f.calls.filter(c=>c.tool_id==='artifacts_put').length,2);
});
test('changed trim input while persistence is pending cannot be overwritten by a stale acknowledgement',async t=>{
 const f=fixture(t);await f.open();f.app.commitTimeline(f.root,2);recorderFixture(t,f);const before=sessionStorage.getItem('swissknife.cinema.localProject');let resolveOwner,payload;f.app.invokeCinemaOwner=async(c,tool,value)=>{payload=value;return new Promise(resolve=>{resolveOwner=resolve;});};const pending=f.app.exportSelectedWebM(f.root,null);await until(()=>resolveOwner);f.root.querySelector('[data-cinema-trim="out"]').value='1';resolveOwner({preview:false,value:{persisted:true,verified:true,cid:payload.cid}});assert.equal(await pending,false);assert.equal(sessionStorage.getItem('swissknife.cinema.localProject'),before);assert.equal(f.root.querySelector('[data-cinema-trim="out"]').value,'1');assert.equal(f.app.exportMedia,null);
});
test('unsupported recording keeps the previous saved edit bytes while retaining newly entered trim/codec input',async t=>{
 const f=fixture(t);await f.open();f.app.commitTimeline(f.root,2);Object.defineProperty(globalThis,'MediaRecorder',{configurable:true,writable:true,value:undefined});const before=sessionStorage.getItem('swissknife.cinema.localProject');f.root.querySelector('[data-cinema-trim="out"]').value='1';f.root.querySelector('[data-cinema-codec]').value='webm';assert.equal(await f.app.exportSelectedWebM(f.root,null),false);assert.equal(sessionStorage.getItem('swissknife.cinema.localProject'),before);assert.equal(f.root.querySelector('[data-cinema-trim="out"]').value,'1');assert.equal(f.root.querySelector('[data-cinema-codec]').value,'webm');assert.equal(f.calls.length,1);
});


test('retry waits for its actual persisted native preview commit while the previous decoded preview remains available',async t=>{
 const scenario=JSON.parse(fs.readFileSync(new URL('../e2e/functional-workflows/cinema.json',import.meta.url),'utf8'));
 const steps=scenario.phases.failure_recovery;
 const confirm=steps.findLastIndex(row=>row.op==='click'&&row.selector==='[data-gateway-confirm="cinema.ipfs_kit_py.persist_artifact"]');
 const wait=steps[confirm+1];
 assert.deepEqual(wait,{op:'wait_for',selector:'[data-cinema-export-outcome][data-export-state="persisted"]',state:'visible',timeout_ms:15000},'an old decoded reference cannot identify the current retry commit');
 const play=steps.findIndex((row,index)=>index>confirm&&row.op==='press'&&row.selector==='[data-cinema-play]'&&row.key==='Enter');assert.ok(play>confirm+1);
 const f=fixture(t);await f.open();f.app.commitTimeline(f.root,2);recorderFixture(t,f);assert.equal(await runExport(f),true);
 const previous=f.app.exportMedia,previousReference=f.root.querySelector('[data-cinema-output-reference]').value;
 let acknowledged=false,release;const held=new Promise(resolve=>{release=resolve;}),invoke=f.app.invokeCinemaOwner.bind(f.app);
 f.app.invokeCinemaOwner=async(...args)=>{const value=await invoke(...args);if(args[1]==='artifacts_put'){acknowledged=true;await held;}return value;};
 recorderFixture(t,f);const pending=f.app.exportSelectedWebM(f.root,f.root.querySelector('[data-cinema-workflow="simulate-failed-export"]'));
 const approval=f.approve(pending);await until(()=>acknowledged);
 assert.equal(f.app.exportMedia,previous);assert.equal(f.root.querySelector('[data-cinema-output-reference][data-output-state="decoded"]').value,previousReference,'the previous preview honestly remains decoded');
 assert.equal(f.root.querySelector(wait.selector),null,'the new retry must not be played before its own actual ACK/native commit');assert.equal(previous.video.paused,true);
 release();assert.equal(await approval,true);
 assert.notEqual(f.app.exportMedia.video,previous.video);assert.equal(previous.video.isConnected,false);assert.ok(f.root.querySelector(wait.selector));
 assert.equal(f.root.querySelector('[data-cinema-video]'),f.app.exportMedia.video);assert.equal(f.root.querySelector('[data-cinema-output-reference]').value,f.app.exportMedia.cid);
 f.root.querySelector('[data-cinema-play]').click();await until(()=>!f.app.exportMedia.video.paused);assert.equal(previous.video.paused,true);assert.equal(f.app.exportMedia.video.paused,false);
});

test('successful WebM retry replaces the current MP4 refusal while retaining its exact prior message in separate history',async t=>{
 const f=fixture(t);await f.open();f.app.commitTimeline(f.root,2);
 f.root.querySelector('[data-cinema-codec]').value='mp4';await f.app.handleCinemaWorkflowAction(f.root,'simulate-failed-export');
 const refusal=f.root.querySelector('[data-cinema-workflow-status]').textContent;assert.match(refusal,/Supported codec mp4 retried/);
 f.root.querySelector('[data-cinema-codec]').value='webm';recorderFixture(t,f);assert.equal(await runExport(f),true);
 const status=f.root.querySelector('[data-cinema-workflow-status]');assert.equal(status.dataset.exportState,'persisted');assert.match(status.textContent,/WebM output persisted/);assert.doesNotMatch(status.textContent,/no encoder|No output file/);
 assert.equal(f.root.querySelector('[data-cinema-export-history]').textContent,refusal);
 assert.equal(f.root.querySelector('[data-cinema-project-history]').hidden,false);
 assert.match(f.root.querySelector('[data-cinema-export-outcome]').textContent,/WebM output persisted:/);
 assert.equal(f.calls.length,2);assert.equal(f.app.readLocalProject().projectCid,undefined,'export is not project-save authority');
});

test('new output keeps current project unsaved and exposes only the previous local project reference without another save',async t=>{
 const f=fixture(t);await f.open();f.app.commitTimeline(f.root,2);recorderFixture(t,f);assert.equal(await runExport(f),true);
 await f.approve(f.app.handleCinemaWorkflowAction(f.root,'load-project-media-cids',f.root.querySelector('[data-cinema-workflow="load-project-media-cids"]')));
 const saved=f.app.readLocalProject().projectCid;assert.ok(saved);const beforeCalls=f.calls.length;
 recorderFixture(t,f);assert.equal(await runExport(f),true);
 assert.equal(f.calls.length,beforeCalls+1,'retry adds only the existing output-persistence operation');
 const current=f.app.readLocalProject();assert.equal(current.projectCid,undefined);assert.equal(current.lastSavedProjectCid,saved);
 assert.equal(f.root.querySelector('[data-cinema-project-reference]').value,'');assert.equal(f.root.querySelector('[data-cinema-project-reference]').dataset.referenceState,'not_saved');
 assert.equal(f.root.querySelector('[data-cinema-previous-project-reference]').value,saved);
 assert.equal(f.root.querySelector('[data-cinema-project-history]').hidden,false);
 assert.match(f.root.querySelector('.cinema-header .project-info').textContent,/Unsaved changes/);
 assert.equal(JSON.parse(f.root.querySelector('[data-cinema-selection]').dataset.cinemaSelectionState).selection.saved,false);
});

test('reopened verified output uses current restored status and retains the previous unsupported attempt separately',async t=>{
 const f=fixture(t);await f.open();f.app.commitTimeline(f.root,2);recorderFixture(t,f);assert.equal(await runExport(f),true);
 await f.approve(f.app.handleCinemaWorkflowAction(f.root,'load-project-media-cids',f.root.querySelector('[data-cinema-workflow="load-project-media-cids"]')));
 const saved=f.app.readLocalProject().projectCid;f.root.querySelector('[data-cinema-codec]').value='mp4';await f.app.handleCinemaWorkflowAction(f.root,'simulate-failed-export');
 const refusal=f.root.querySelector('[data-cinema-workflow-status]').textContent,calls=f.calls.length;
 f.shell.remove();await until(()=>f.app.sourceMedia===null);const reopened=f.mount();await reopened.app.projectRestoration;
 assert.equal(f.calls.length,calls);assert.match(reopened.root.querySelector('[data-cinema-workflow-status]').textContent,/Saved WebM output restored:/);
 assert.equal(reopened.root.querySelector('[data-cinema-export-history]').textContent,refusal);
 assert.equal(reopened.root.querySelector('[data-cinema-project-reference]').value,saved);
 assert.equal(JSON.parse(reopened.root.querySelector('[data-cinema-selection]').dataset.cinemaSelectionState).selection.saved,true);
});

test('own desktop controls keep complete button words and a compact timeline while mobile preview sizing remains unchanged',t=>{
 const f=fixture(t);f.window.happyDOM.setWindowSize({width:1440,height:900});
 const style=node=>f.window.getComputedStyle(node);
 assert.equal(style(f.root.querySelector('.cinema-actions')).gridTemplateColumns,'1fr');
 assert.equal(style(f.root.querySelector('[data-cinema-workflow="submit-render-queue"]')).overflowWrap,'normal');
 assert.equal(style(f.root.querySelector('[data-cinema-workflow-status]')).textTransform,'none');
 assert.equal(style(f.root.querySelector('[data-cinema-source-video]')).maxHeight,'140px');
 assert.equal(style(f.root.querySelector('.cinema-timeline-head')).gap,'4px');
 f.window.happyDOM.setWindowSize({width:390,height:844});const mobile=f.mount();assert.equal(style(mobile.root.querySelector('[data-cinema-source-video]')).maxHeight,'110px');
});

// R33: authored textarea value/computed-style checks, not native pixel geometry.
test('Cinema CID fields retain all 59 characters in selectable two-line controls at mobile and desktop widths',t=>{
 for(const width of [390,1440]){
  const f=fixture(t);f.window.happyDOM.setWindowSize({width,height:width===390?844:900});
  const selectors=['[data-cinema-source-cid]','[data-cinema-output-reference]','[data-cinema-project-reference]','[data-cinema-previous-project-reference]'];
  assert.equal(cid.length,59);
  for(const selector of selectors){
   const field=f.root.querySelector(selector);assert.equal(field.tagName,'TEXTAREA',selector);assert.equal(Number(field.rows),2);assert.equal(field.getAttribute('wrap'),'soft');
   field.value=cid;field.focus();field.select();assert.equal(field.value,cid);assert.equal(field.selectionStart,0);assert.equal(field.selectionEnd,59);
   const style=f.window.getComputedStyle(field);assert.equal(style.fontSize,'12px');assert.equal(style.lineHeight,'16px');
   assert.equal(style.height,'46px');assert.equal(style.minHeight,'46px');assert.equal(style.boxSizing,'border-box');
   assert.equal(style.paddingTop,'6px');assert.equal(style.paddingRight,'8px');assert.equal(style.whiteSpace,'pre-wrap');
   assert.equal(style.overflowWrap,'anywhere');assert.equal(style.resize,'vertical');assert.equal(parseFloat(style.minWidth),0);
  }
  assert.equal(f.calls.length,0,'rendering/selecting references grants no owner authority');
 }
});

test('Enter in the wrapped source CID prevents newline insertion and opens exactly the unchanged CID once',t=>{
 const f=fixture(t);const field=f.root.querySelector('[data-cinema-source-cid]');
 assert.equal(field.tagName,'TEXTAREA');field.value=cid;
 const calls=[];f.app.openNativeClip=(root,value,trigger)=>{calls.push({root,value,trigger});return Promise.resolve(false);};
 const event=new f.window.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true});
 assert.equal(field.dispatchEvent(event),false);assert.equal(event.defaultPrevented,true);assert.equal(field.value,cid);assert.equal(field.value.includes('\n'),false);
 assert.equal(calls.length,1);assert.equal(calls[0].root,f.root);assert.equal(calls[0].value,cid);assert.equal(calls[0].trigger,f.root.querySelector('[data-cinema-open-source]'));
 const repeated=new f.window.KeyboardEvent('keydown',{key:'Enter',repeat:true,bubbles:true,cancelable:true});field.dispatchEvent(repeated);
 assert.equal(repeated.defaultPrevented,true,'repeated Enter cannot insert a newline into the CID');assert.equal(field.value,cid);
 assert.equal(calls.length,1,'holding Enter cannot duplicate the existing open action');assert.equal(f.calls.length,0,'test stubs only the app entry point');
});

test('decoded output and actual saved-project CID remain readonly full-value textareas with honest markers',async t=>{
 const f=fixture(t);f.root.querySelector('[data-cinema-source-cid]').value=cid;
 await f.open();f.app.commitTimeline(f.root,2);recorderFixture(t,f);assert.equal(await runExport(f),true);
 const output=f.root.querySelector('[data-cinema-output-reference]'),project=f.root.querySelector('[data-cinema-project-reference]');
 assert.equal(output.tagName,'TEXTAREA');assert.equal(output.readOnly,true);assert.equal(output.value,f.app.exportMedia.cid);assert.equal(output.dataset.outputState,'decoded');
 assert.equal(f.window.getComputedStyle(output).height,'46px');assert.equal(project.tagName,'TEXTAREA');assert.equal(project.readOnly,true);
 assert.equal(project.value,'');assert.equal(project.dataset.referenceState,'not_saved','output persistence alone cannot mark the project saved');
 await f.approve(f.app.handleCinemaWorkflowAction(f.root,'load-project-media-cids',f.root.querySelector('[data-cinema-workflow="load-project-media-cids"]')));
 const request=f.calls.at(-1),saved=f.app.readLocalProject();assert.equal(request.tool_id,'artifacts_put');assert.equal(project.value,request.input.payload.cid);
 assert.equal(project.value,saved.projectCid);assert.equal(project.dataset.referenceState,'saved');assert.equal(project.readOnly,true);
 for(const field of [output,project]){field.select();assert.equal(field.selectionEnd-field.selectionStart,field.value.length);assert.equal(field.value.length,59);}
 assert.equal(f.root.querySelector('[data-cinema-previous-project-reference]').readOnly,true);
 assert.equal(f.calls.length,3,'same authored source/export/project calls, no reference-display dispatch');
});
