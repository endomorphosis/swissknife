// Authored unit media events and gateway responses; never real decoder/backend acceptance.
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

test('Cinema requires actual governed source consent and never treats cancellation/preview as decoded media',async t=>{
  const f=fixture(t);const pending=f.app.openNativeClip(f.root,cid);await until(()=>f.root.querySelector('[data-gateway-cancel]'));
  assert.equal(f.calls.length,0);f.root.querySelector('[data-gateway-cancel]').click();assert.equal(await pending,false);assert.equal(f.app.sourceMedia,null);assert.deepEqual(f.created,[]);
  f.setOwner({success:true,preview:true,dry_run:true});globalThis.__SWISSKNIFE_GATEWAY_FORCE_DRY_RUN__=true;
  assert.equal(await f.open(),false);assert.equal(f.calls.length,1);assert.equal(f.calls[0].input.policy.consent,'granted');assert.equal(f.calls[0].binding_id,'cinema.ipfs_kit_py.retrieve_content');assert.equal(f.calls[0].tool_id,'ipfs_cat');assert.equal(f.app.sourceMedia,null);
});
test('verified bytes alone cannot enable playback: native decode readiness and dimensions are required',async t=>{
 const f=fixture(t,{manualDecode:true});const pending=f.open();await until(()=>f.media.length===1);const m=f.media[0];
 assert.equal(f.app.sourceMedia,null);assert.equal(f.root.querySelector('[data-cinema-play]').disabled,true);assert.equal(f.root.querySelector('[data-cinema-video]').dataset.decodedCid,undefined);
 Object.assign(m.state,{readyState:1,videoWidth:160,videoHeight:90,duration:4});m.node.dispatchEvent(new f.window.Event('loadedmetadata'));await Promise.resolve();assert.equal(f.app.sourceMedia,null);
 m.complete();assert.equal(await pending,true);assert.equal(f.app.sourceMedia.video,m.node);assert.equal(m.node.dataset.decodedCid,cid);assert.equal(f.root.querySelector('[data-cinema-play]').disabled,false);assert.deepEqual(f.app.currentProject.source,sourceIdentity);
});
test('CID/hash/type/size and duration bounds reject dishonest source material without replacing a last-good clip',async t=>{
 const f=fixture(t);assert.equal(await f.open(),true);const saved=f.app.sourceMedia,project=sessionStorage.getItem('swissknife.cinema.localProject');
 const invalid=[{success:true,cid:'different',bytes_base64:encoded},{success:true,cid,bytes_base64:Buffer.from('different bytes').toString('base64')},{success:true,cid,bytes_base64:encoded,sha256:'0'.repeat(64)},{success:true,cid,bytes_base64:encoded,size:999}];
 for(const value of invalid){f.setOwner(value);assert.equal(await f.open(),false);assert.equal(f.app.sourceMedia,saved);assert.equal(sessionStorage.getItem('swissknife.cinema.localProject'),project);}
 await assert.rejects(f.app.verifyClipBytes(cid,'a'.repeat(1398110)),/exceed/);
 const notVideo=Uint8Array.from([1,2,3,4]);await assert.rejects(f.app.verifyClipBytes(await contentCidForBytes(notVideo),Buffer.from(notVideo).toString('base64')),/not a supported/);
 f.setOwner({success:true,cid,bytes_base64:encoded});f.options.push({duration:31});assert.equal(await f.open(),false);assert.equal(f.app.sourceMedia,saved);assert.equal(f.revoked.includes(f.created.at(-1)),true);assert.equal(f.revoked.includes(saved.url),false);
});
test('native decoder failure preserves the verified previous video and project',async t=>{
 const f=fixture(t);await f.open();const previous=f.app.sourceMedia,record=sessionStorage.getItem('swissknife.cinema.localProject');f.options.push({manual:true});const pending=f.open();await until(()=>f.media.length===2);f.media[1].node.dispatchEvent(new f.window.Event('error'));
 assert.equal(await pending,false);assert.equal(f.app.sourceMedia,previous);assert.equal(sessionStorage.getItem('swissknife.cinema.localProject'),record);assert.match(f.root.querySelector('[data-cinema-source-status]').textContent,/could not be decoded/);
});
test('play/pause/seek/time labels follow native media state and the selected trim',async t=>{
 const f=fixture(t);await f.open();f.root.querySelector('[data-cinema-trim="out"]').value='2';f.app.commitTimeline(f.root,2);const m=f.media[0],play=f.root.querySelector('[data-cinema-play]');play.click();await until(()=>!m.state.paused);assert.equal(play.getAttribute('aria-label'),'Pause');
 m.state.currentTime=1.25;m.node.dispatchEvent(new f.window.Event('timeupdate'));assert.match(f.root.querySelector('[data-cinema-seek]').getAttribute('aria-valuetext'),/1.3 seconds of 4.0/);assert.equal(f.app.timeline.currentTime,1.25);
 const seek=f.root.querySelector('[data-cinema-seek]');seek.value='1.5';seek.dispatchEvent(new f.window.Event('input'));assert.equal(m.state.currentTime,1.5);assert.equal(m.node.dataset.seekState,undefined,'script-dispatched authored seek is not trusted proof');
 f.app.seekMedia(99);assert.equal(m.state.currentTime,2);m.node.dispatchEvent(new f.window.Event('timeupdate'));assert.equal(m.state.paused,true);assert.equal(play.getAttribute('aria-label'),'Play');play.click();await until(()=>!m.state.paused);assert.equal(m.state.currentTime,0);
});
test('native playback rejection stays an honest error instead of a glyph-only success',async t=>{
 const f=fixture(t);f.options.push({playError:true});await f.open();f.root.querySelector('[data-cinema-play]').click();await until(()=>f.root.querySelector('[data-cinema-source-status]').dataset.sourceState==='failed');assert.equal(f.app.sourceMedia.video.paused,true);assert.equal(f.root.querySelector('[data-cinema-play]').getAttribute('aria-label'),'Play');
});
test('saved native source identity and trim are included in the exact persisted bytes and verified on reopen',async t=>{
 const f=fixture(t);await f.open();f.root.querySelector('[data-cinema-trim="out"]').value='2';f.app.commitTimeline(f.root,2);
 await f.approve(f.app.handleCinemaWorkflowAction(f.root,'load-project-media-cids',f.root.querySelector('[data-cinema-workflow="load-project-media-cids"]')));
 const persisted=f.calls.find(call=>call.tool_id==='artifacts_put'),record=JSON.parse(Buffer.from(persisted.input.payload.bytes_base64,'base64'));
 assert.deepEqual(record.source,sourceIdentity);assert.equal(record.timeline.tracks[0].out,2);assert.equal(await contentCidForBytes(Buffer.from(persisted.input.payload.bytes_base64,'base64')),persisted.input.payload.cid);
 f.shell.remove();await until(()=>f.app.sourceMedia===null);assert.equal(f.revoked.includes(f.created[0]),true);
 const reopened=f.mount();await reopened.app.projectRestoration;const selection=JSON.parse(reopened.root.querySelector('[data-cinema-selection]').dataset.cinemaSelectionState).selection;
 assert.deepEqual(selection,{source:sourceIdentity,trim:{in:0,out:2},track_order:['video'],saved:true,decoded:true});assert.equal(f.calls.length,2,'cached restore does not fabricate another owner retrieval');assert.equal(f.media.length,2);assert.notEqual(reopened.app.sourceMedia.video,f.media[0].node);
});
test('altered cached source bytes cannot regain saved decoded status',async t=>{
 const f=fixture(t);await f.open();const key='swissknife.cinema.media.'+cid,cached=JSON.parse(sessionStorage.getItem(key));cached.bytes_base64=Buffer.from('corrupted').toString('base64');sessionStorage.setItem(key,JSON.stringify(cached));f.shell.remove();await until(()=>f.app.sourceMedia===null);const reopened=f.mount();await reopened.app.projectRestoration;
 assert.equal(reopened.app.sourceMedia,null);assert.equal(reopened.root.querySelector('[data-cinema-play]').disabled,true);assert.equal(JSON.parse(reopened.root.querySelector('[data-cinema-selection]').dataset.cinemaSelectionState).selection.decoded,false);assert.match(reopened.root.querySelector('[data-cinema-source-status]').textContent,/do not match/);assert.equal(f.calls.length,1);
});
test('actual desktop Close cancels a pending decode, revokes its own URL and never commits to the departed view',async t=>{
 const f=fixture(t,{manualDecode:true});const desktopSource=fs.readFileSync(new URL('../../web/js/main-simple.js',import.meta.url),'utf8'),ast=parse(desktopSource,{ecmaVersion:'latest',sourceType:'module'}),klass=ast.body.find(item=>item.type==='ClassDeclaration'&&item.id.name==='SwissKnifeDesktop'),method=klass.body.body.find(item=>item.key?.name==='setupWindowControls');
 const setup=vm.runInNewContext('({'+desktopSource.slice(method.start,method.end)+'}).setupWindowControls',{document});f.shell.id='authored-cinema';const desktop={windows:new Map([[f.shell.id,{}]]),activeWindow:null,updateSystemStatus(){},updateTaskbar(){}};setup.call(desktop,f.shell);
 const pending=f.open();await until(()=>f.media.length===1);f.shell.querySelector('.window-control.close').click();assert.equal(await pending,false);assert.equal(f.shell.isConnected,false);assert.equal(f.app.sourceMedia,null);assert.equal(f.revoked.length,1);assert.equal(sessionStorage.getItem('swissknife.cinema.localProject'),null);f.media[0].complete();assert.equal(f.app.sourceMedia,null);
});
test('source failures, unsupported exports and legacy render entrypoint never invent output artifacts or destroy saved media',async t=>{
 const f=fixture(t);await f.open();const good=f.app.sourceMedia;for(const codec of ['flv','mp4']){f.root.querySelector('[data-cinema-codec]').value=codec;await f.app.handleCinemaWorkflowAction(f.root,'simulate-failed-export');assert.equal(f.app.sourceMedia,good);assert.equal(f.app.renderQueue.length,0);}
 assert.equal(f.root.querySelector('[data-cinema-workflow-status]').dataset.exportState,'unsupported');const before=f.calls.length;const result=await f.app.renderVideo('/should-not-exist.mp4');assert.deepEqual(result,{success:false,unsupported:true,outputPath:null,format:'mp4',quality:'high',error:'No encoder is connected; no media was rendered.'});assert.equal(f.calls.length,before);assert.equal(f.app.renderQueue.length,0);
});
test('Cinema preview has a real bounded video, opaque header and own scrolling without a duplicate taskbar gap',t=>{
 const f=fixture(t);assert.equal(f.root.querySelector('[data-cinema-video]').tagName,'VIDEO');assert.equal(f.window.getComputedStyle(f.root.querySelector('.cinema-header')).backgroundColor,'#101b18');assert.equal(f.window.getComputedStyle(f.root.querySelector('.cinema-root')).overflow,'auto');assert.equal(f.root.closest('.window-content').style.paddingBottom,'0px');assert.equal(f.window.getComputedStyle(f.root.querySelector('.cinema-preview-area')).overflow,'visible');
});

test('duplicate retrievals do not spend another owner call while native decoding is pending',async t=>{
 const f=fixture(t,{manualDecode:true});const pending=f.open();await until(()=>f.media.length===1);assert.equal(await f.app.openNativeClip(f.root,cid),false);assert.equal(f.calls.length,1);f.media[0].complete();assert.equal(await pending,true);
});
test('a native decoder error disables controls and removes decoded selection claims',async t=>{
 const f=fixture(t);await f.open();f.media[0].state.error=Error('authored late decoder failure');f.media[0].node.dispatchEvent(new f.window.Event('error'));assert.equal(f.root.querySelector('[data-cinema-play]').disabled,true);assert.equal(JSON.parse(f.root.querySelector('[data-cinema-selection]').dataset.cinemaSelectionState).selection.decoded,false);assert.match(f.root.querySelector('[data-cinema-source-status]').textContent,/decoder reported/);
});
test('a decoder that never produces native readiness times out and revokes its candidate URL',async t=>{
 const f=fixture(t,{manualDecode:true});t.mock.timers.enable({apis:['setTimeout']});const pending=f.app.decodeClip(f.root,bytes,sourceIdentity);const rejected=assert.rejects(pending,/timed out/);t.mock.timers.tick(10001);await rejected;assert.equal(f.app.sourceMedia,null);assert.deepEqual(f.revoked,f.created);
});
test('closing during source confirmation cancels without dispatching or retaining a pending source',async t=>{
 const f=fixture(t);const pending=f.app.openNativeClip(f.root,cid);await until(()=>f.root.querySelector('[data-gateway-cancel]'));f.shell.remove();assert.equal(await pending,false);assert.equal(f.calls.length,0);assert.equal(f.app.mediaLoadPending,false);
});

test('the canonical Cinema scenario requires both original approved native bindings, actual playback and exact persisted source/trim',async()=>{
 const {validateScenario}=await import('../../scripts/run-visual-functional-workflow.mjs');
 const app=JSON.parse(fs.readFileSync(new URL('../../config/visual-functional-app-contracts.json',import.meta.url))).apps.find(row=>row.app_id==='cinema');
 const scenario=JSON.parse(fs.readFileSync(new URL('../e2e/functional-workflows/cinema.json',import.meta.url)));
 assert.equal(validateScenario(scenario,app),scenario);assert.equal(scenario.backend_bindings.length,2);
 for(const intent of scenario.backend_bindings){assert.equal(intent.mode,'isolated_mutation');assert.equal(intent.consent,'ui_required');assert.ok(intent.result_assertion);}
 const primary=scenario.phases.primary_result.at(-1),recovery=scenario.phases.failure_recovery.at(-1),persist=scenario.phases.persist_reopen.at(-1);
 for(const step of [primary,recovery]){assert.equal(step.probe.kind,'media_state');assert.equal(step.probe.pointer,'/current_time');assert.equal(step.probe.temporal_ms,250);assert.equal(step.expected,0.05);}
 assert.equal(persist.expected.source.cid,'bafkreiedh65a7kpxnldwlbhv4hszsqyld2l4gg3ybe4jq77dp2tnyzuhla');assert.deepEqual(persist.expected.trim,{in:0,out:2});assert.equal(persist.expected.saved,true);assert.equal(persist.expected.decoded,true);
 for(const change of [copy=>{copy.backend_bindings[0].consent='not_required';},copy=>{copy.backend_bindings[0].binding_id='cinema.invented.read';},copy=>{copy.phases.persist_reopen=[];}]){const invalid=structuredClone(scenario);change(invalid);assert.throws(()=>validateScenario(invalid,app));}
});

test('direct accidental legacy render invocation honestly refuses without an output path or queued job',async t=>{
 const f=fixture(t),calls=f.calls.length;const result=await f.app.renderVideo('/authored-no-output.webm','webm','medium');assert.equal(result.success,false);assert.equal(result.unsupported,true);assert.equal(result.outputPath,null);assert.match(result.error,/no media was rendered/);assert.equal(f.calls.length,calls);assert.equal(f.app.renderQueue.length,0);assert.equal(f.app.currentProject,null);
});


// Source-matched Chrome failure: recovery Play was y32.8 beneath a sticky
// header while the native video was above the pane. Geometry below is authored
// to reproduce that scroll relationship, never claimed as a Chrome result.
function authoredPreviewGeometry(f, nested = false) {
  const root=f.root.querySelector('.cinema-root'),editing=root.querySelector('.cinema-editing'),preview=root.querySelector('.cinema-preview-area'),video=f.app.sourceMedia.video;
  const rect=(top,height,width=300)=>({top,bottom:top+height,left:1,right:1+width,width,height});
  Object.defineProperties(root,{clientHeight:{configurable:true,value:762},scrollHeight:{configurable:true,value:nested?762:2200}});
  Object.defineProperties(editing,{clientHeight:{configurable:true,value:nested?450:1000},scrollHeight:{configurable:true,value:nested?900:1000}});
  root.scrollTop=nested?0:500;editing.scrollTop=nested?120:0;
  root.getBoundingClientRect=()=>rect(33,762,388);root.querySelector('.cinema-header').getBoundingClientRect=()=>rect(33,102,388);
  editing.getBoundingClientRect=()=>rect(135,450);
  preview.getBoundingClientRect=()=>rect(nested?160-editing.scrollTop:280-root.scrollTop,400);
  video.getBoundingClientRect=()=>rect(nested?200-editing.scrollTop:400-root.scrollTop,180);
  return{root,editing,preview,video};
}

test('actual Play after mobile export reveals native video below the sticky header without scrolling the desktop or another editor',async t=>{
 const f=fixture(t);await f.open();const g=authoredPreviewGeometry(f),other=document.createElement('div');other.className='cinema-root';document.body.append(other);other.scrollTop=88;document.documentElement.scrollTop=77;f.shell.scrollTop=12;
 assert.ok(g.video.getBoundingClientRect().top<33+102);f.root.querySelector('[data-cinema-play]').click();await until(()=>!f.media[0].state.paused);
 assert.equal(g.root.scrollTop,137);assert.ok(g.video.getBoundingClientRect().top>=33+102+8);assert.ok(g.video.getBoundingClientRect().bottom<=795);assert.equal(g.editing.scrollTop,0);
 assert.equal(other.scrollTop,88);assert.equal(document.documentElement.scrollTop,77);assert.equal(f.shell.scrollTop,12);assert.equal(f.calls.length,1);assert.equal(g.video.dataset.decodedCid,cid);
});

test('real seek action reveals clipped desktop video through its own editing pane only',async t=>{
 const f=fixture(t);await f.open();const g=authoredPreviewGeometry(f,true);f.app.seekMedia(.8);
 assert.equal(g.editing.scrollTop,17);assert.equal(g.root.scrollTop,0);assert.equal(f.media[0].state.currentTime,.8);assert.ok(g.video.getBoundingClientRect().top>=143);assert.equal(f.calls.length,1);
});

test('already visible media and a detached editor do not cause scroll jumps',async t=>{
 const f=fixture(t);await f.open();const g=authoredPreviewGeometry(f);g.root.scrollTop=137;f.app.seekMedia(.6);assert.equal(g.root.scrollTop,137);f.shell.remove();assert.equal(f.app.revealMediaPreview(f.root),false);assert.equal(g.root.scrollTop,137);
});

// Source-matched genuine review31c638: desktop was forcibly560px and hid its
// timeline. These are authored allocation/control tests, not Chrome evidence.
test('Cinema initially uses its own bounded editing size and preserves subsequent user resize or maximize',t=>{
 const f=fixture(t);f.window.happyDOM.setWindowSize({width:1440,height:900});const desktop=f.mount();
 assert.equal(desktop.shell.style.width,'1200px');assert.equal(desktop.shell.style.height,'800px');
 assert.equal(desktop.shell.style.getPropertyPriority('height'),'');
 assert.equal(desktop.shell.style.top,'24px');assert.equal(desktop.shell.style.left,'24px');
 desktop.shell.style.width='640px';desktop.shell.style.height='420px';desktop.shell.style.top='70px';
 desktop.app.keepTimelineClickable(desktop.root);assert.equal(desktop.shell.style.width,'640px');assert.equal(desktop.shell.style.height,'420px');assert.equal(desktop.shell.style.top,'70px');
 desktop.shell.style.height='calc(100vh - 48px)';desktop.shell.classList.add('maximized');
 desktop.app.keepTimelineClickable(desktop.root);assert.equal(desktop.shell.style.height,'calc(100vh - 48px)');
 f.window.happyDOM.setWindowSize({width:390,height:844});const mobile=f.mount();
 assert.equal(mobile.shell.style.width,'374px');assert.equal(mobile.shell.style.height,'780px');assert.equal(mobile.shell.style.left,'8px');assert.equal(mobile.shell.style.top,'8px');
 assert.ok(parseFloat(mobile.shell.style.left)+parseFloat(mobile.shell.style.width)<=390);
 assert.ok(parseFloat(mobile.shell.style.top)+parseFloat(mobile.shell.style.height)<=844-48);
});
test('Cinema compact viewport styles keep native preview and trim/codec tracks in their own usable layout',t=>{
 const f=fixture(t);f.window.happyDOM.setWindowSize({width:390,height:844});const mobile=f.mount();
 const style=node=>f.window.getComputedStyle(node);
 assert.equal(style(mobile.root.querySelector('.cinema-timeline-head')).display,'grid');
 assert.equal(style(mobile.root.querySelector('.cinema-timeline-head')).gridTemplateColumns,'repeat(2,minmax(0,1fr))');
 assert.equal(style(mobile.root.querySelector('[data-cinema-video]')).maxHeight,'110px');
 assert.equal(style(mobile.root.querySelector('.cinema-timeline')).overflow,'visible');
 assert.equal(style(mobile.root.querySelector('[data-cinema-export-outcome]')).overflowWrap,'anywhere');
 assert.ok(mobile.root.querySelector('[data-cinema-trim="out"]'));assert.ok(mobile.root.querySelector('[data-cinema-codec]'));assert.ok(mobile.root.querySelector('.timeline-tracks'));
 f.window.happyDOM.setWindowSize({width:1440,height:900});const desktop=f.mount();assert.equal(style(desktop.root.querySelector('[data-cinema-video]')).maxHeight,'140px');
});
test('only the actual verified persisted project CID becomes the readonly reference across real app reopen',async t=>{
 const f=fixture(t);await f.open();f.root.querySelector('[data-cinema-trim="out"]').value='2';f.app.commitTimeline(f.root,2);
 const empty=f.root.querySelector('[data-cinema-project-reference]');assert.equal(empty.value,'');assert.equal(empty.readOnly,true);
 await f.approve(f.app.handleCinemaWorkflowAction(f.root,'load-project-media-cids',f.root.querySelector('[data-cinema-workflow="load-project-media-cids"]')));
 const persisted=f.calls.find(call=>call.tool_id==='artifacts_put'),projectCid=persisted.input.payload.cid;
 assert.notEqual(projectCid,cid);assert.equal(empty.value,projectCid);assert.equal(empty.dataset.referenceState,'saved');
 f.shell.remove();await until(()=>f.app.sourceMedia===null);const reopened=f.mount();await reopened.app.projectRestoration;
 assert.equal(reopened.root.querySelector('[data-cinema-project-reference]').value,projectCid);
 assert.equal(reopened.root.querySelector('[data-cinema-trim="out"]').value,'2');assert.equal(reopened.root.querySelector('[data-cinema-codec]').value,'mp4');
 assert.match(reopened.root.querySelector('.cinema-clip').textContent,/in 0s.*out 2s/);
 assert.equal(reopened.app.sourceMedia.cid,cid);assert.equal(f.calls.length,2,'reopen verifies its cache without inventing a new owner call');
});
test('actual unsupported export retry is visible near native media without pretending a rendered output or spending owner calls',async t=>{
 const f=fixture(t);await f.open();const media=f.app.sourceMedia,ownerCalls=f.calls.length;
 const codec=f.root.querySelector('[data-cinema-codec]'),outcome=f.root.querySelector('[data-cinema-export-outcome]');
 codec.value='flv';await f.app.handleCinemaWorkflowAction(f.root,'simulate-failed-export');
 assert.equal(outcome.dataset.exportState,'unsupported_codec');assert.match(outcome.textContent,/Unsupported codec flv/);
 codec.value='mp4';await f.app.handleCinemaWorkflowAction(f.root,'simulate-failed-export');
 assert.equal(outcome.dataset.exportState,'unsupported');assert.match(outcome.textContent,/no encoder.*No output file was created/);
 assert.equal(outcome.closest('.cinema-preview-area')!==null,true);assert.equal(f.app.sourceMedia,media);
 assert.equal(f.root.querySelector('[data-cinema-play]').disabled,false);assert.equal(f.calls.length,ownerCalls);assert.equal(f.app.renderQueue.length,0);
 const result=await f.app.renderVideo('/authored-no-file.mp4');assert.equal(result.outputPath,null);assert.equal(result.success,false);
});
test('Cinema scenario retains every original semantic and actual retry while recording native saved-reference/trim controls on reopen',()=>{
 const s=JSON.parse(fs.readFileSync(new URL('../e2e/functional-workflows/cinema.json',import.meta.url)));
 assert.equal(s.phases.primary_result.at(-1).requirement_id,'result_1');assert.equal(s.phases.persist_reopen.at(-1).requirement_id,'persist_reopen');assert.equal(s.phases.failure_recovery.at(-1).requirement_id,'failure_recovery');
 for(const name of ['primary_result','persist_reopen'])assert.ok(s.phases[name].some(step=>step.op==='press'&&step.selector==='[data-cinema-project-reference]'&&step.key==='Tab'));
 assert.ok(s.phases.persist_reopen.some(step=>step.op==='press'&&step.selector==='[data-cinema-trim="out"]'&&step.key==='Tab'));
 assert.ok(s.phases.persist_reopen.some(step=>step.op==='press'&&step.selector==='[data-cinema-codec]'&&step.key==='Tab'));
 const retry=s.phases.failure_recovery.findIndex(step=>step.op==='select'&&step.value==='mp4');assert.equal(s.phases.failure_recovery[retry+1].op,'click');assert.equal(s.phases.failure_recovery[retry+1].selector,'[data-cinema-workflow="simulate-failed-export"]');
 assert.ok(s.phases.failure_recovery.some(step=>step.op==='wait_for'&&step.selector==='[data-cinema-export-outcome][data-export-state="unsupported"]'));
});

// Actual49c51d failure: a source response's long base64 PRE made the implicit
// project grid scroll horizontally by151441px and displaced normal click targets.
test('large actual-format owner responses stay in bounded diagnostics without expanding the project action grid',t=>{
 const f=fixture(t),panel=f.root.querySelector('.cinema-vda-panel'),raw=panel.querySelector('[data-cinema-owner-envelope]');
 const payload=JSON.stringify({result:{content:[{type:'json',json:{bytes_base64:'A'.repeat(40000)}}]}});raw.textContent=payload;
 const styles=node=>f.window.getComputedStyle(node);
 assert.equal(styles(panel).gridTemplateColumns,'minmax(0, 1fr)');
 assert.equal(styles(raw).whiteSpace,'pre-wrap');assert.equal(styles(raw).overflowWrap,'anywhere');assert.equal(styles(raw).overflow,'auto');assert.equal(styles(raw).maxHeight,'128px');
 assert.equal(raw.textContent,payload,'diagnostic contents remain exact and accessible');
 const details=raw.closest('details.cinema-diagnostics');assert.ok(details,'raw output must be inside the existing diagnostics');assert.equal(details.open,false);
 for(const action of ['load-project-media-cids','simulate-failed-export']){const button=panel.querySelector('[data-cinema-workflow="'+action+'"]');assert.equal(button.disabled,false);assert.equal(details.contains(button),false);assert.notEqual(styles(button).pointerEvents,'none');}
 details.open=true;assert.equal(styles(raw).maxHeight,'128px');assert.equal(raw.textContent,payload);
});
test('project panel native responses retain zero minimum intrinsic width at desktop and mobile sizes',t=>{
 const f=fixture(t);for(const width of [1440,390]){f.window.happyDOM.setWindowSize({width,height:width===1440?900:844});const view=f.mount(),panel=view.root.querySelector('.cinema-vda-panel');
  for(const child of panel.children){const style=f.window.getComputedStyle(child);assert.equal(Number.parseFloat(style.minWidth),0);assert.equal(style.maxWidth,'100%');}
  assert.equal(f.window.getComputedStyle(panel).gridTemplateColumns,'minmax(0, 1fr)');
  assert.equal(view.root.querySelector('[data-cinema-workflow="load-project-media-cids"]').closest('.cinema-props')!==null,true);
 }
});
test('actual nested desktop mount stacks native operation details after Cinema rather than alongside its controls',t=>{
 const f=fixture(t),shell=document.createElement('section');shell.className='window';shell.dataset.appId='cinema';
 shell.innerHTML='<div class="window-content"><div class="window-app-content"><div id="cinema-nested-content"></div></div></div>';document.body.append(shell);
 const mount=shell.querySelector('#cinema-nested-content'),app=new CinemaApp();app.createInterface(mount);
 const details=document.createElement('details');details.dataset.nativeOperationDetails='true';details.style.cssText='grid-column:1 / -1;flex:0 0 auto;min-width:0;max-width:100%';details.innerHTML='<summary>Backend operation details</summary><output data-gateway-status="cinema.ipfs_kit_py.retrieve_content">Actual-format diagnostic sibling</output>';mount.append(details);
 assert.equal(f.window.getComputedStyle(mount).display,'flex');assert.equal(f.window.getComputedStyle(mount).flexDirection,'column');
 assert.equal(mount.firstElementChild.classList.contains('cinema-root'),true);assert.equal(mount.lastElementChild,details);
 assert.equal(mount.querySelector('[data-cinema-workflow="load-project-media-cids"]').closest('details'),null);
 assert.notEqual(f.window.getComputedStyle(details).pointerEvents,'none');assert.equal(details.hidden,false);
 app.disposeMedia();
});
