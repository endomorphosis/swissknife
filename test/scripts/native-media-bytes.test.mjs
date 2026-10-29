// Authored DOM/codec event fixtures exercise real app logic; no browser/native acceptance claim.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createHash,webcrypto} from 'node:crypto';
import {File,Blob} from 'node:buffer';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {Window} from 'happy-dom';
const require=createRequire(import.meta.url);
const ROOT=process.env.SVF_MEDIA_TEST_ROOT||fileURLToPath(new URL('../../../',import.meta.url));
const {cidForBytes}=require(path.join(ROOT,'swissknife/scripts/mcpplusplus-profile-a.cjs'));
const fixtureRoot=new URL('../fixtures/native-media/',import.meta.url);
const bytes=name=>fs.readFileSync(new URL(name,fixtureRoot));
function appModule(name,context={}){
 const file=new URL('../../web/js/apps/'+name+'.js',import.meta.url);
 let source=fs.readFileSync(file,'utf8').replace(/^import .*?;\s*$/gm,'').replace(/export class /g,'class ').replace(/^export \{[^\n]+\};?\s*$/gm,'');
 const names=(name==='peertube'?'PeerTubeApp,nativeMediaResult,guessVideoMime,waitForDecodedMedia':name==='media-player'?'MediaPlayer,nativeMediaResult,guessMimeFromArtifact,waitForDecodedMedia':'NeuralPhotoshopApp,workflowOwnerResult').split(',');
 source+='\nthis.appExports={'+names.map(key=>key+': typeof '+key+' === \"undefined\" ? undefined : '+key).join(',')+'};';
 const sandbox={console,setTimeout,clearTimeout,performance,File,Blob,crypto:webcrypto,atob:value=>Buffer.from(value,'base64').toString('binary'),contentCidForBytes:async value=>cidForBytes(Buffer.from(value)),stableStringifyValue:JSON.stringify,base64ForBytes:value=>Buffer.from(value).toString('base64'),...context};
 vm.runInNewContext(source,sandbox,{filename:file.pathname});return sandbox.appExports;
}
function owner(data,extra={}){
 const payload={success:true,cid:cidForBytes(data),bytes_base64:data.toString('base64'),size:data.length,sha256:createHash('sha256').update(data).digest('hex'),...extra};
 return {ok:true,outcome:'executed',correlation_id:'authored-unit-correlation',receipt:{receipt_id:'authored-unit-receipt'},result:{result:{content:[{type:'json',json:payload}]}}};
}
function dom(t){const w=new Window({url:'http://localhost'});t.after(()=>w.happyDOM.abort());return w;}
function mediaElement(w,tag='audio',ready=2){const el=w.document.createElement(tag);Object.defineProperties(el,{readyState:{value:ready,writable:true,configurable:true},duration:{value:3,writable:true,configurable:true},error:{value:null,writable:true,configurable:true}});el.pause=()=>{};el.load=()=>{};return el;}
function urls(){let n=0;const revoked=[];return {revoked,createObjectURL:()=>`blob:authored-unit-${++n}`,revokeObjectURL:url=>revoked.push(url)};}
for(const name of ['peertube','media-player']){
 test(name+' unwraps actual nested native payload, preserves content strings, rejects errors/ambiguity',()=>{
  const {nativeMediaResult}=appModule(name);const payload=owner(Buffer.from('source'));payload.result.result.content[0].json.content='ordinary native string';
  assert.equal(nativeMediaResult(payload).content,'ordinary native string');
  assert.equal(nativeMediaResult(payload).cid,cidForBytes(Buffer.from('source')));
  const bad=structuredClone(payload);bad.result.result.content[0].json.success=false;assert.throws(()=>nativeMediaResult(bad),/rejected/);
  const ambiguous=structuredClone(payload);ambiguous.result.result.content.push(ambiguous.result.result.content[0]);assert.throws(()=>nativeMediaResult(ambiguous),/ambiguous/);
  assert.throws(()=>nativeMediaResult({...payload,outcome:'validated_preview'}),/did not execute/);
 });
 test(name+' waits for actual decoded media data, refuses errors and bounded timeout',async t=>{
  const w=dom(t),{waitForDecodedMedia}=appModule(name);const media=mediaElement(w,'video',1);let resolved=false;
  const pending=waitForDecodedMedia(media,100).then(()=>{resolved=true;});await Promise.resolve();assert.equal(resolved,false,'metadata alone cannot grant decoded playback');
  media.readyState=2;media.dispatchEvent(new w.Event('loadeddata'));await pending;assert.equal(resolved,true);
  const failed=mediaElement(w,'video',1);const failure=waitForDecodedMedia(failed,100);failed.error={code:4};failed.dispatchEvent(new w.Event('error'));await assert.rejects(failure,/could not be decoded/);
  await assert.rejects(waitForDecodedMedia(mediaElement(w,'video',1),5),/Timed out/);
 });
}
test('media signatures use real WebM/WAV bytes rather than names or misleading RIFF',()=>{
 const pt=appModule('peertube'),mp=appModule('media-player');
 assert.equal(pt.guessVideoMime({},bytes('svf-motion.webm')),'video/webm');assert.equal(mp.guessMimeFromArtifact({},bytes('svf-tone.wav')),'audio/wav');
 assert.equal(mp.guessMimeFromArtifact({},bytes('svf-motion.webm')),'video/webm');
 assert.throws(()=>pt.guessVideoMime({name:'pretend.webm'},bytes('svf-tone.wav')),/Unsupported/);
 assert.throws(()=>mp.guessMimeFromArtifact({name:'pretend.wav'},bytes('svf-checker.png')),/Unsupported/);
});
function player(t,data=bytes('svf-tone.wav'),gateway){
 const w=dom(t),url=urls(),audio=mediaElement(w);w.document.body.innerHTML='<div id="mount"><input id="mpArtifactCid"><button data-native-gateway-binding="media-player.ipfs_kit_py.retrieve_content"></button></div>';
 const container=w.document.querySelector('#mount');container.querySelector('input').value=cidForBytes(data);container.append(audio);const calls=[];
 const {MediaPlayer}=appModule('media-player',{document:w.document,localStorage:w.localStorage,URL:url,invokeNativeTool:async(...args)=>{calls.push(args);return gateway?gateway(...args):owner(data);}});
 const app=Object.create(MediaPlayer.prototype);Object.assign(app,{container,currentElement:audio,playlist:[],currentTrack:0,isPlaying:false,events:[]});
 for(const name of ['setWorkflowLine','appendReceiptLog','setWorkflowReceipt','setWorkflowState','markWorkflowAction','updatePlaylist','showNotification'])app[name]=(...args)=>app.events.push([name,...args]);
 app.loadTrack=async index=>{app.currentTrack=index;audio.src=app.playlist[index].url;};
 return {w,url,audio,app,calls,MediaPlayer};
}
test('Media Player selects verified native WAV, waits decode and retains only truthful stored identity',async t=>{
 const f=player(t);await f.app.retrieveCidMedia();assert.equal(f.calls.length,1);assert.equal(f.app.playlist.length,1);const cid=cidForBytes(bytes('svf-tone.wav'));
 assert.equal(f.app.playlist[f.app.currentTrack].cid,cid);assert.equal(f.audio.dataset.decodedCid,cid);assert.equal(f.app.lastRetrievedArtifact.verified,true);
 assert.equal(f.calls[0][3].payload.cid,cid);assert.equal(f.calls[0][3].executionMode,'execute');assert.ok(!('arg' in f.calls[0][3].payload));
 const saved=JSON.parse(f.w.localStorage.getItem('mediaPlayerRetrievedIndex'));assert.deepEqual(saved,[{cid,type:'audio'}]);
 const restored=Object.create(f.MediaPlayer.prototype);restored.initializeDefaultPlaylist();const track=restored.playlist.find(item=>item.cid===cid);assert.equal(track.storedMetadataOnly,true);assert.match(track.artist,/retrieve again/i);assert.equal(track.url,undefined);
 restored.currentElement=f.audio;restored.container=f.app.container;restored.updateDisplay=()=>{};restored.updatePlaylist=()=>{};restored.showNotification=()=>{};restored.generateDemoAudio=()=>assert.fail('A cached CID must never become a local demo tone');await restored.loadTrack(restored.playlist.indexOf(track));
});
test('Media Player refuses unrecognized bytes or mismatched CID without selected native success',async t=>{
 const f=player(t,bytes('svf-checker.png'));await f.app.retrieveCidMedia();assert.equal(f.app.playlist.length,0);assert.equal(f.audio.dataset.decodedCid,undefined);assert.ok(f.app.events.some(row=>JSON.stringify(row).includes('Unsupported source')));
 const data=bytes('svf-tone.wav'),g=player(t,data,async()=>owner(data,{cid:cidForBytes(Buffer.from('wrong'))}));await g.app.retrieveCidMedia();assert.equal(g.app.playlist.length,0);assert.equal(g.app.lastRetrievedArtifact,undefined);
});
test('Media Player blocks duplicate governed dispatch and clears previous decoded marker before retry',async t=>{
 let release;const wait=new Promise(resolve=>{release=resolve;});const f=player(t,bytes('svf-tone.wav'),()=>wait);f.audio.dataset.decodedCid=cidForBytes(bytes('svf-tone.wav'));
 const first=f.app.retrieveCidMedia();await Promise.resolve();await f.app.retrieveCidMedia();assert.equal(f.calls.length,1);assert.equal(f.audio.dataset.decodedCid,undefined);release(owner(bytes('svf-tone.wav')));await first;assert.equal(f.app.cidRetrievalPending,false);
});
function peer(t,data=bytes('svf-motion.webm')){
 const w=dom(t),url=urls(),video=mediaElement(w,'video');w.document.body.innerHTML='<section id="owned"><div id="video-grid"></div><div id="video-player"></div><span id="cid-open-status"></span><h2 id="video-title"></h2><p id="video-desc"></p><p id="video-views"></p><button data-cid-play></button><input data-cid-seek value="50"></section><section id="sibling"><h2 id="video-title">Sibling unchanged</h2></section>';
 const container=w.document.querySelector('#owned');video.id='video-element';container.append(video);video.play=async()=>{video.playCalls=(video.playCalls||0)+1;};
 const calls=[];const {PeerTubeApp}=appModule('peertube',{document:w.document,Element:w.Element,URL:url,invokeNativeTool:async(...args)=>{calls.push(args);return owner(data);}});const app=Object.create(PeerTubeApp.prototype);Object.assign(app,{container,videoLibrary:new Map(),vdaG036:{},events:[]});
 app.setCidOpenStatus=value=>{container.querySelector('#cid-open-status').textContent=value;};for(const name of ['saveLocalLibraryIndex','renderVideoLibrary','appendWorkflowLog','refreshWorkflowSection'])app[name]=()=>app.events.push(name);
 return {w,url,video,app,calls,container};
}
test('PeerTube opens exact native WebM, owns controls, observes actual seek and preserves sibling',async t=>{
 const f=peer(t),cid=cidForBytes(bytes('svf-motion.webm'));await f.app.openVideoByCid(cid);
 assert.equal(f.video.dataset.decodedCid,cid);assert.equal(f.app.videoLibrary.size,1);assert.equal(f.calls[0][3].payload.cid,cid);assert.ok(!('arg' in f.calls[0][3].payload));assert.equal(f.calls[0][3].executionMode,'execute');
 assert.equal(f.w.document.querySelector('#sibling h2').textContent,'Sibling unchanged');assert.equal(f.video.playCalls,undefined,'retrieval cannot pretend to play before user action');await f.container.querySelector('[data-cid-play]').onclick();assert.equal(f.video.playCalls,1);
 f.container.querySelector('[data-cid-seek]').onchange();assert.equal(f.video.currentTime,1.5);assert.equal(f.video.dataset.seekState,'seeking');f.video.dispatchEvent(new f.w.Event('seeked'));assert.equal(f.video.dataset.seekState,'observed');
});
test('PeerTube does not save undecodable or unsupported source as a loaded library item',async t=>{
 const f=peer(t,bytes('svf-tone.wav'));await f.app.openVideoByCid(cidForBytes(bytes('svf-tone.wav')));assert.equal(f.app.videoLibrary.size,0);assert.equal(f.video.dataset.decodedCid,undefined);assert.equal(f.container.querySelector('#cid-open-status').dataset.retrievalState,'failed');
 const g=peer(t);g.video.readyState=1;const pending=g.app.openVideoByCid(cidForBytes(bytes('svf-motion.webm')));await new Promise(resolve=>setTimeout(resolve,5));assert.equal(g.app.videoLibrary.size,0);g.video.error={code:4};g.video.dispatchEvent(new g.w.Event('error'));await pending;assert.equal(g.app.videoLibrary.size,0);
});
function photoshop(t,{fail=false}={}){
 const w=dom(t),url=urls();w.document.body.innerHTML='<section id="owned"><input data-source-cid-input><div data-source-cid-state="old"></div><span data-source-result></span></section>';
 const data=bytes('svf-checker.png'),rgba=Buffer.from(Array.from({length:64*48},(_,i)=>{const x=i%64,y=Math.floor(i/64);return (Math.floor(x/8)+Math.floor(y/8))%2===0?[25,150,90,255]:[45,80,190,255];}).flat());
 const images=[];class Image{constructor(){images.push(this);this.width=this.naturalWidth=64;this.height=this.naturalHeight=48;}set src(value){this.url=value;}}
 const {NeuralPhotoshopApp}=appModule('neural-photoshop',{document:w.document,Image,URL:url,invokeNativeTool:async()=>owner(data)});
 const app=Object.create(NeuralPhotoshopApp.prototype),canvas={width:100,height:100,dataset:{sourceCid:'old',sourcePixelsSha256:'old'}};const ctx={drawn:null,drawImage(img){this.drawn=img;},getImageData(){assert.ok(this.drawn,'must draw actual decoded image before source pixel observation');return{data:rgba};}};
 Object.assign(app,{container:w.document.querySelector('#owned'),currentProject:{width:100,height:100},layers:[],vdaG042:{},canvas,context:ctx,events:[]});app.container.querySelector('input').value=cidForBytes(data);
 app.createLayer=name=>{const layer={name,context:ctx};app.layers.push(layer);return layer;};app.setupCanvas=()=>{canvas.width=app.currentProject.width;canvas.height=app.currentProject.height;};app.refreshUI=()=>{};app.saveToHistory=action=>app.events.push(action);app.appendVdaG042Receipt=()=>{};app.updateVdaG042Status=value=>app.events.push(value);
 return{app,images,canvas,ctx,url,w,data};
}
test('Neural Photoshop waits for real decode and draws verified source before publishing pixel identity',async t=>{
 const f=photoshop(t);let done=false;const pending=f.app.markVdaG042SourceLoaded(f.app.container).then(()=>{done=true;});
 for(let n=0;n<20&&!f.images.length;n++)await new Promise(resolve=>setTimeout(resolve,1));assert.equal(done,false);assert.equal(f.canvas.dataset.sourceCid,undefined);assert.equal(f.app.vdaG042.sourceCid,undefined);assert.equal(f.images.length,1);
 f.images[0].onload();await pending;assert.equal(f.ctx.drawn,f.images[0]);assert.equal(f.canvas.width,64);assert.equal(f.canvas.height,48);assert.equal(f.app.layers[0].name,'Background');assert.equal(f.canvas.dataset.sourcePixelsSha256,'9fdb6b885b647934503a0738caad55ff72c56f47726e06b09332fd606ebafc11');assert.equal(f.app.container.querySelector('[data-source-cid-state]').dataset.sourceCidState,'decoded-image');assert.equal(f.url.revoked.length,1);
});
test('Neural Photoshop decode error preserves existing project and cannot mark source verified',async t=>{
 const f=photoshop(t);const pending=f.app.markVdaG042SourceLoaded(f.app.container);for(let n=0;n<20&&!f.images.length;n++)await new Promise(resolve=>setTimeout(resolve,1));f.images[0].onerror();await pending;
 assert.equal(f.ctx.drawn,null);assert.equal(f.app.currentProject.width,100);assert.equal(f.app.vdaG042.sourceCid,undefined);assert.equal(f.app.container.querySelector('[data-source-cid-state]').dataset.sourceCidState,'error');assert.equal(f.app.sourceReadPending,false);assert.equal(f.url.revoked.length,1);
});
test('Media Player decode failure rolls back uncommitted item and keeps previous source',async t=>{
 const f=player(t);f.app.playlist=[{cid:cidForBytes(Buffer.from('previous')),url:'blob:previous-native',title:'Previous native source'}];f.audio.readyState=1;
 const pending=f.app.retrieveCidMedia();await new Promise(resolve=>setTimeout(resolve,5));assert.equal(f.app.lastRetrievedArtifact,undefined);f.audio.error={code:4};f.audio.dispatchEvent(new f.w.Event('error'));await pending;
 assert.equal(f.app.playlist.length,1);assert.equal(f.app.playlist[0].title,'Previous native source');assert.equal(f.audio.src,'blob:previous-native');assert.equal(f.w.localStorage.getItem('mediaPlayerRetrievedIndex'),null);assert.equal(f.app.lastRetrievedArtifact,undefined);
});
test('PeerTube restored library metadata never asserts fresh verified native content',t=>{
 const f=peer(t),cid=cidForBytes(bytes('svf-motion.webm'));f.w.localStorage.setItem('peertube-library',JSON.stringify([{cid,id:'stored',verified:true}]));
 // Loading only reads the index: no native request and no cached-byte claim.
 const {PeerTubeApp}=appModule('peertube',{localStorage:f.w.localStorage});const restored=Object.create(PeerTubeApp.prototype);restored.videoLibrary=new Map();restored.loadLocalLibraryIndex();assert.equal(restored.videoLibrary.get('stored').verified,false);assert.equal(restored.videoLibrary.get('stored').storedMetadataOnly,true);assert.equal(f.calls.length,0);
});
test('Neural Photoshop records the actual edited project before replacing its image so undo can recover it',async t=>{
 const f=photoshop(t),snapshots=[];f.app.layers=[{name:'Existing edited source',context:{}}];f.app.saveToHistory=action=>snapshots.push({action,layers:f.app.layers.map(row=>row.name)});
 const pending=f.app.loadImageFile(new File([f.data],'replacement.png',{type:'image/png'}));assert.equal(snapshots.length,0,'no destructive import before decode');f.images[0].onload();await pending;
 assert.deepEqual(JSON.parse(JSON.stringify(snapshots)),[{action:'Before image import',layers:['Existing edited source']},{action:'Load image',layers:['Background']}]);
});
