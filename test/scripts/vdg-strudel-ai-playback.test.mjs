import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { Window } from 'happy-dom';
import { StrudelAIDAW, StrudelAIDAWApp } from '../../web/js/apps/strudel-ai-daw.js';

const workletSource = fs.readFileSync(new URL('../../web/js/audio/strudel-processor.js', import.meta.url), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));
function deferred() { let resolve, reject; const promise = new Promise((a,b) => {resolve=a;reject=b;});return {promise,resolve,reject}; }
function fixture(t, options = {}) {
  const keys = ['window','document','AudioContext','AudioWorkletNode','requestAnimationFrame','cancelAnimationFrame','fetch'];
  const previous = Object.fromEntries(keys.map(key => [key, globalThis[key]]));
  const window = new Window();
  Object.assign(globalThis, {window, document:window.document});
  let rafId = 0, ownerCalls = 0;
  const frames = new Map(), contexts = [], nodes = [];
  globalThis.requestAnimationFrame = callback => {const id=++rafId;frames.set(id,callback);return id;};
  globalThis.cancelAnimationFrame = id => frames.delete(id);
  globalThis.fetch = () => {ownerCalls++;throw new Error('Local playback must not invoke a backend');};
  class Node {
    constructor() {this.disconnected=false;this.connections=[];}
    connect(destination) {this.connections.push(destination);return destination;}
    disconnect() {this.disconnected=true;this.connections=[];}
  }
  class Context {
    constructor() {
      this.state='suspended';this.destination={};this.sampleRate=8000;this.currentTime=1;this.oscillators=[];contexts.push(this);
      if(options.nativeFallback)this.createOscillator=()=>{const node=new Node();node.frequency={value:0};node.start=time=>{node.startTime=time??this.currentTime;};node.stop=time=>{node.stopTime=time??this.currentTime;if(time===undefined)node.stopped=true;};this.oscillators.push(node);return node;};
      if (!options.noWorklet) this.audioWorklet={addModule:async url => {
        this.workletUrl=String(url);this.moduleState=this.state;
        if(options.requireRunningWorklet) assert.equal(this.state,'running','Real gesture must resume audio before loading its worklet');
        if(options.moduleWait) await options.moduleWait.promise;
        if(options.moduleFailure) throw new Error('actual module load failed');
      }};
    }
    createAnalyser() {const node=new Node();node.frequencyBinCount=16;node.getByteTimeDomainData=a=>a.fill(128);node.getByteFrequencyData=a=>a.fill(0);return node;}
    createGain() {const node=new Node();node.gain={value:0,setValueAtTime(value,time){this.value=value;this.set={value,time};},exponentialRampToValueAtTime(value,time){this.ramp={value,time};}};return node;}
    createBuffer(channels,length,rate) {const data=new Float32Array(length);return {getChannelData:()=>data,sampleRate:rate};}
    async resume() {this.resumes=(this.resumes||0)+1;if(options.resumeWait)await options.resumeWait.promise;if(this.state==='closed')throw new Error('Cannot resume closed AudioContext');this.state='running';}
    async suspend() {if(options.suspendWait)await options.suspendWait.promise;if(this.state==='closed')throw new Error('Cannot suspend closed AudioContext');this.state='suspended';}
    async close() {this.closes=(this.closes||0)+1;if(options.closeWait)await options.closeWait.promise;this.state='closed';}
  }
  class WorkletNode extends Node {
    constructor(context,name) {
      super();assert.equal(name,'strudel-processor');nodes.push(this);this.messages=[];
      let Processor;
      vm.runInNewContext(workletSource, {sampleRate:context.sampleRate,
        AudioWorkletProcessor: class {constructor(){this.port={};}},
        registerProcessor:(id,klass)=>{assert.equal(id,name);Processor=klass;}});
      this.processor=new Processor();
      this.port={postMessage:message=>{this.messages.push(message);this.processor.port.onmessage({data:message});}};
    }
    output() {const left=new Float32Array(256),right=new Float32Array(256);assert.equal(this.processor.process([],[[left,right]]),true);return left;}
  }
  Object.assign(globalThis,{AudioContext:Context,AudioWorkletNode:WorkletNode});
  // Only canvas and WebAudio platform primitives are supplied; app transport and
  // actual processor algorithm run unchanged, including real output samples.
  window.HTMLCanvasElement.prototype.getContext=()=>new Proxy({}, {get:(_,key)=>key==='fillStyle'||key==='strokeStyle'?null:()=>{}});
  const root=document.createElement('main');document.body.append(root);
  const app=new StrudelAIDAW({swissknife:{}});root.innerHTML=app.getContentHTML();
  t.after(async()=>{
    if(typeof app.onDestroy==='function') await app.onDestroy();
    else {if(app.animationFrame!==null)cancelAnimationFrame(app.animationFrame);await app.audioContext?.close();}
    await window.happyDOM.abort();
    for(const [key,value]of Object.entries(previous)) {if(value===undefined)delete globalThis[key];else globalThis[key]=value;}
    assert.equal(ownerCalls,0);
  });
  return {app,root,window,contexts,nodes,frames,mount:()=>app.mount(root)};
}
const status=root=>root.querySelector('#audio-playback-status')?.textContent;
const energy=samples=>samples.reduce((sum,value)=>sum+value*value,0);
function sdk(overrides={}) {const calls=[];return {calls,evaluate:async code=>calls.push(['evaluate',code]),start:async()=>calls.push(['start']),stop:async()=>calls.push(['stop']),...overrides};}

test('real factory export remains the app class; mount does not replace a complete SDK',async t=>{
  assert.equal(StrudelAIDAWApp,StrudelAIDAW);
  const f=fixture(t);const engine=sdk();f.app.strudelEngine=engine;
  await f.mount();assert.equal(f.app.strudelEngine,engine);
  assert.equal(f.app.playbackMode,'strudel');assert.equal(f.app.samples.size,8);
  await f.app.play(f.root);assert.equal(f.app.isPlaying,true);
  assert.deepEqual(engine.calls.map(call=>call[0]),['evaluate','start']);
  assert.equal(engine.calls[0][1],f.app.currentCode);
  assert.match(status(f.root),/Playing Strudel pattern/);
  assert.equal(f.nodes.length,0,'No metronome is mixed into real SDK playback');
  await f.app.pause(f.root);assert.equal(f.app.isPlaying,false);assert.equal(engine.calls.at(-1)[0],'stop');
});

test('the actual mounted fallback Play emits real worklet samples with truthful visible preview state',async t=>{
  const f=fixture(t);await f.mount();
  await assert.doesNotReject(f.app.play(f.root), 'Actual mounted Play must not replace its first failure with missing stop()');
  await f.app.stop(f.root);const node=f.nodes[0];
  assert.equal(f.app.strudelEngine,null);
  assert.equal(energy(node.output()),0);
  await f.app.play(f.root);
  assert.equal(f.app.isPlaying,true);assert.equal(f.app.audioContext.state,'running');
  assert.ok(energy(node.output())>0,'Production metronome processor emits real nonzero audio');
  assert.match(status(f.root),/Local audio preview.*metronome\/reference tone.*compilation unavailable/);
  assert.equal(f.root.querySelector('#play-btn').disabled,true);
  assert.equal(f.root.querySelector('#pause-btn').disabled,false);
  await f.app.pause(f.root);assert.equal(energy(node.output()),0);assert.equal(status(f.root),'Paused');
  await f.app.play(f.root);assert.ok(energy(node.output())>0);
  await f.app.stop(f.root);assert.equal(energy(node.output()),0);assert.equal(status(f.root),'Stopped');
});

test('real button events play, pause and stop without an async page error',async t=>{
  const f=fixture(t);await f.mount();
  f.root.querySelector('#play-btn').click();await tick();assert.equal(f.app.isPlaying,true);
  f.root.querySelector('#pause-btn').click();await tick();assert.equal(f.app.isPlaying,false);
  f.root.querySelector('#play-btn').click();await tick();f.root.querySelector('#stop-btn').click();await tick();
  assert.equal(f.app.isPlaying,false);assert.equal(energy(f.nodes[0].output()),0);
});

test('Pattern/core namespace is not a usable transport and fallback cannot recursively evaluate code',async t=>{
  const f=fixture(t);f.window.strudel={Pattern:class{}};f.app.strudelEngine=f.window.strudel;
  await f.mount();assert.equal(f.app.strudelEngine,null);
  await assert.rejects(f.app.evaluateStrudelCode('s("bd")'),/compilation unavailable/);
  await f.app.play(f.root);await f.app.updateLiveAudio(f.root);
  assert.match(f.root.querySelector('#console-output').textContent,/does not compile edited Strudel code/);
});

test('real SDK evaluation failure is preserved and is never masked by stop or false playing state',async t=>{
  const f=fixture(t);let stops=0;const failure=new Error('original compiler rejected pattern');
  f.app.strudelEngine=sdk({evaluate:async()=>{throw failure;},stop:async()=>{stops++;throw new Error('secondary stop failure');}});
  await f.mount();await assert.doesNotReject(f.app.play(f.root));
  assert.equal(f.app.isPlaying,false);assert.equal(stops,0);
  assert.match(f.root.querySelector('#console-output').textContent,/original compiler rejected pattern/);
  assert.equal(status(f.root),'Playback failed');assert.equal(f.nodes.length,0);
});

test('SDK start failure is stopped and a stop rejection is surfaced with retryable controls',async t=>{
  const f=fixture(t);let attempts=0;const engine=sdk({start:async()=>{throw new Error('start failed');},stop:async()=>{attempts++;if(attempts===1)throw new Error('stop failed');}});
  f.app.strudelEngine=engine;await f.mount();await f.app.play(f.root);
  assert.equal(f.app.isPlaying,false);assert.equal(f.app._sdkActive,true);
  assert.equal(f.root.querySelector('#stop-btn').disabled,false);
  assert.match(f.root.querySelector('#console-output').textContent,/start failed/);
  await f.app.stop(f.root);assert.equal(attempts,2);assert.equal(f.app._sdkActive,false);
});

test('missing or failed worklet is honest unavailable playback without an SDK',async t=>{
  const f=fixture(t,{noWorklet:true});await f.mount();await assert.doesNotReject(f.app.play(f.root));
  assert.equal(f.app.isPlaying,false);assert.equal(f.app.playbackMode,'unavailable');
  assert.match(f.root.querySelector('#console-output').textContent,/No Strudel transport or WebAudio preview/);
});

test('real tempo and gain controls affect worklet state, and SDK tempo support is optional',async t=>{
  const f=fixture(t);await f.mount();await f.app.play(f.root);
  const bpm=f.root.querySelector('#bpm-input');bpm.value='156';bpm.dispatchEvent(new f.window.Event('change'));
  const volume=f.root.querySelector('#master-volume');volume.value='0.25';volume.dispatchEvent(new f.window.Event('input'));
  assert.equal(f.nodes[0].processor.bpm,156);assert.equal(f.nodes[0].processor.volume,0.25);
  assert.equal(f.app.masterGain.gain.value,0.25);assert.equal(f.root.querySelector('#volume-display').textContent,'25%');
  f.app.strudelEngine=sdk();assert.doesNotThrow(()=>f.app.setBPM(f.root,'144'));
  f.app.setBPM(f.root,'not-a-number');assert.equal(f.app.bpm,144);
});

test('double Play during resume has one real start, and Stop cancels a pending resume',async t=>{
  const pending=deferred();const f=fixture(t,{resumeWait:pending});await f.mount();
  const first=f.app.play(f.root);await f.app.play(f.root);assert.equal(f.app.audioContext.resumes,1);
  await f.app.stop(f.root);pending.resolve();await first;
  assert.equal(f.app.isPlaying,false);assert.equal(f.nodes.length,0);
});

test('stop while SDK compilation is pending cannot start audio afterward',async t=>{
  const pending=deferred();const f=fixture(t);const engine=sdk({evaluate:()=>pending.promise});f.app.strudelEngine=engine;
  await f.mount();const play=f.app.play(f.root);await tick();await f.app.stop(f.root);pending.resolve();await play;
  assert.equal(engine.calls.some(call=>call[0]==='start'),false);assert.equal(f.app.isPlaying,false);
});

test('actual window detach closes audio, cancels RAF and pending editor timers exactly once',async t=>{
  const f=fixture(t);await f.mount();await f.app.play(f.root);f.app.onCodeChange(f.root);
  assert.equal(f.frames.size,1);const context=f.app.audioContext;
  f.root.remove();await tick();await f.app.onDestroy();await f.app.onDestroy();
  assert.equal(f.app._closed,true);assert.equal(context.state,'closed');assert.equal(context.closes,1);
  assert.equal(f.app.isPlaying,false);assert.equal(f.frames.size,0);assert.equal(energy(f.nodes[0].output()),0);
  assert.equal(f.nodes[0].disconnected,true);assert.equal(f.app.masterGain.disconnected,true);assert.equal(f.app.analyser.disconnected,true);
});

test('connected window moves and ordinary control rerenders do not dispose owned playback',async t=>{
  const f=fixture(t);await f.mount();await f.app.play(f.root);
  const wrapper=document.createElement('section');document.body.append(wrapper);wrapper.append(f.root);
  f.root.querySelector('#console-output').replaceChildren();f.root.remove();wrapper.append(f.root);await tick();
  assert.equal(f.app._closed,false);assert.equal(f.app.isPlaying,true);assert.ok(energy(f.nodes[0].output())>0);
  await f.mount();assert.equal(f.contexts.length,1);assert.equal(f.frames.size,1);
});

test('pagehide disposes actual graph without requiring a desktop cleanup callback',async t=>{
  const f=fixture(t);await f.mount();await f.app.play(f.root);
  f.window.dispatchEvent(new f.window.Event('pagehide'));await tick();
  assert.equal(f.app.audioContext.state,'closed');assert.equal(f.frames.size,0);
});

test('detach during Play worklet loading cannot create an orphan audio node or visualization loop',async t=>{
  const pending=deferred();const f=fixture(t,{moduleWait:pending});await f.mount();const play=f.app.play(f.root);await tick();
  assert.equal(f.contexts.length,1);f.root.remove();await tick();pending.resolve();await play;
  assert.equal(f.contexts[0].state,'closed');assert.equal(f.nodes.length,0);assert.equal(f.frames.size,0);
});

test('SDK start resolving after detach is stopped again and never restores playing UI or audio',async t=>{
  const pending=deferred();const f=fixture(t);let starts=0,stops=0;
  f.app.strudelEngine=sdk({start:async()=>{starts++;await pending.promise;},stop:async()=>{stops++;}});
  await f.mount();const play=f.app.play(f.root);await tick();assert.equal(starts,1);
  f.root.remove();await tick();pending.resolve();await play;
  assert.ok(stops>=2);assert.equal(f.app.isPlaying,false);assert.equal(f.app.audioContext.state,'closed');assert.equal(f.frames.size,0);
});

test('a stalled external stop cannot delay immediate worklet silence or wait forever',async t=>{
  const f=fixture(t);const pending=deferred();f.app.strudelEngine=sdk({stop:()=>pending.promise});
  f.app._transportTimeoutMs=20;await f.mount();await f.app.play(f.root);await f.app.setupRealTimeProcessing();
  // Include owned local output so silence ordering is observed independently
  // of the deliberately stalled external SDK primitive.
  f.nodes[0].port.postMessage({type:'setPlaying',value:true});assert.ok(energy(f.nodes[0].output())>0);
  const stopping=f.app.stop(f.root);assert.equal(energy(f.nodes[0].output()),0);
  await stopping;assert.equal(f.app.audioContext.state,'suspended');
  assert.match(status(f.root),/Audio stop failed/);assert.equal(f.app._transportFaulted,true);
  pending.resolve();await f.app.onDestroy();
});

test('a never-settling compiler has a bounded failure instead of permanent pending Play',async t=>{
  const f=fixture(t);f.app._transportTimeoutMs=20;
  f.app.strudelEngine=sdk({evaluate:()=>new Promise(()=>{})});await f.mount();await f.app.play(f.root);
  assert.equal(f.app._playPending,false);assert.equal(f.app.isPlaying,false);assert.equal(f.app._transportFaulted,true);
  assert.match(f.root.querySelector('#console-output').textContent,/transport timed out/);
});

test('a timed-out start that completes late is stopped and cannot resume after a failed Play',async t=>{
  const f=fixture(t);f.app._transportTimeoutMs=20;const pending=deferred();let stops=0;
  f.app.strudelEngine=sdk({start:()=>pending.promise,stop:async()=>{stops++;}});
  await f.mount();await f.app.play(f.root);assert.equal(f.app.isPlaying,false);assert.equal(stops,1);
  pending.resolve();await tick();assert.equal(stops,2);assert.equal(f.app.isPlaying,false);
});

test('factory initialize accepts a complete global SDK and mount keeps its real transport intact',async t=>{
  const f=fixture(t);const engine=sdk();f.window.Strudel=engine;
  await f.app.initialize();assert.equal(f.app.strudelEngine,engine);await f.mount();assert.equal(f.app.strudelEngine,engine);
  await f.app.play(f.root);assert.deepEqual(engine.calls.map(call=>call[0]),['evaluate','start']);
});

test('a complete SDK remains usable when AudioWorklet is unavailable',async t=>{
  const f=fixture(t,{noWorklet:true});const engine=sdk();f.app.strudelEngine=engine;
  await f.mount();assert.equal(f.app.playbackMode,'strudel');await f.app.play(f.root);
  assert.equal(f.app.isPlaying,true);assert.match(status(f.root),/Playing Strudel pattern/);
  await f.app.stop(f.root);assert.equal(f.app.isPlaying,false);assert.equal(engine.calls.at(-1)[0],'stop');
});

test('a real module load failure leaves visible unavailable state instead of claiming working playback',async t=>{
  const f=fixture(t,{moduleFailure:true});await f.mount();
  await assert.doesNotReject(f.app.play(f.root));
  assert.equal(f.app.isPlaying,false);assert.equal(f.nodes.length,0);assert.equal(f.app.playbackMode,'unavailable');
});

test('SDK import timeout chooses actual local preview, and late exports/globals cannot replace it',async t=>{
  const f=fixture(t),pending=deferred(),late=sdk();f.app._sdkLoadTimeoutMs=20;f.app.importStrudelSDK=()=>pending.promise;
  await f.app.initialize();assert.equal(f.app.strudelEngine,null);
  f.window.Strudel=late;pending.resolve({default:late});await tick();await f.mount();
  assert.equal(f.app.strudelEngine,null);assert.equal(f.app.playbackMode,'local-preview');
  await f.app.play(f.root);assert.ok(energy(f.nodes[0].output())>0);assert.deepEqual(late.calls,[]);
});

test('complete SDK exports that arrive within the bounded import remain the actual selected engine',async t=>{
  const f=fixture(t),engine=sdk();f.app.importStrudelSDK=async()=>({default:engine});
  await f.app.initialize();await f.mount();assert.equal(f.app.strudelEngine,engine);await f.app.play(f.root);
  assert.deepEqual(engine.calls.map(call=>call[0]),['evaluate','start']);
});

test('closing during SDK import or before mount cannot create an orphan graph on a detached window',async t=>{
  const f=fixture(t),pending=deferred(),engine=sdk();f.app.importStrudelSDK=()=>pending.promise;
  const initialize=f.app.initialize();await f.app.onDestroy();pending.resolve({default:engine});await initialize;await f.mount();
  assert.equal(f.contexts.length,0);assert.equal(f.app.strudelEngine,null);
  const detached=new StrudelAIDAW({swissknife:{}});const root=document.createElement('div');root.innerHTML=detached.getContentHTML();
  await detached.mount(root);assert.equal(detached._closed,true);assert.equal(detached.audioContext,null);
});

test('complete SDK live parameter evaluation has a bounded visible failure',async t=>{
  const f=fixture(t);f.app._transportTimeoutMs=20;f.app.strudelEngine=sdk({evaluate:()=>new Promise(()=>{})});await f.mount();
  await f.app.updateLiveAudio(f.root);assert.match(f.root.querySelector('#console-output').textContent,/Code evaluation failed:.*transport timed out/);
});

test('autoplay-suspended mount finishes without loading a worklet, and real Play resumes before its module load',async t=>{
  const f=fixture(t,{requireRunningWorklet:true});await f.mount();
  assert.equal(f.app.audioContext.state,'suspended');assert.equal(f.app.audioContext.workletUrl,undefined);
  assert.equal(f.app.playbackMode,'local-preview');assert.equal(f.frames.size,1);
  await f.app.play(f.root);assert.equal(f.app.audioContext.moduleState,'running');assert.ok(energy(f.nodes[0].output())>0);
});

test('native reference fallback starts actual 220Hz source and timed 1000Hz BPM clicks after bounded module failure',async t=>{
  const f=fixture(t,{nativeFallback:true,moduleWait:deferred()});f.app._workletLoadTimeoutMs=20;
  await f.mount();await f.app.play(f.root);
  assert.equal(f.app.isPlaying,true);assert.equal(f.app.isUsingWorklet,undefined);assert.equal(f.app._transportFaulted,false);
  assert.equal(f.app.audioBackend,'web-audio-reference');assert.equal(f.app._referenceOscillator.frequency.value,220);
  assert.equal(f.app._referenceOscillator.startTime,1);assert.equal(f.app._previewBeatHistory[0].frequency,1000);
  assert.equal(f.app._previewBeatHistory[0].bpm,120);assert.ok(Math.abs(f.app._previewBeatHistory[0].time-1.01)<1e-9);
  const click=f.app.audioContext.oscillators.find(node=>node.frequency.value===1000);assert.equal(click.stopTime,1.05);
  assert.ok(f.app._metronomeTimer);assert.match(status(f.root),/native WebAudio fallback/);
  await f.app.stop(f.root);assert.equal(f.app._previewOscillators.size,0);assert.equal(f.app._previewGains.size,0);assert.equal(f.app._metronomeTimer,null);
  assert.ok(f.app.audioContext.oscillators.every(node=>node.stopped&&node.disconnected));
});

test('native fallback without AudioWorklet honors actual master gain, tempo scheduling, pause and restart',async t=>{
  const f=fixture(t,{nativeFallback:true,noWorklet:true});await f.mount();await f.app.play(f.root);
  f.app.setBPM(f.root,'150');f.app.setMasterVolume(f.root,'0.35');assert.equal(f.app.masterGain.gain.value,0.35);
  assert.ok(Math.abs(f.app._nextPreviewBeat-(1+60/150))<1e-9);
  f.app.audioContext.currentTime=1.4;await new Promise(resolve=>setTimeout(resolve,35));
  assert.equal(f.app._previewBeatHistory.at(-1).bpm,150);assert.equal(f.app._previewBeatHistory.at(-1).frequency,1000);
  await f.app.pause(f.root);assert.equal(f.app._metronomeTimer,null);assert.equal(f.app.isPlaying,false);
  await f.app.play(f.root);assert.equal(f.app.isPlaying,true);assert.ok(f.app._metronomeTimer);await f.app.onDestroy();
  assert.equal(f.app.audioContext.state,'closed');assert.equal(f.app._previewOscillators.size,0);assert.equal(f.app._previewGains.size,0);assert.equal(f.app._metronomeTimer,null);
});

test('Stop during bounded worklet startup prevents fallback and late modules from starting a second graph',async t=>{
  const pending=deferred(),f=fixture(t,{nativeFallback:true,moduleWait:pending});f.app._workletLoadTimeoutMs=20;
  await f.mount();const play=f.app.play(f.root);await tick();await f.app.play(f.root);assert.equal(f.app.audioContext.resumes,1);
  await f.app.stop(f.root);await play;pending.resolve();await tick();
  assert.equal(f.app.isPlaying,false);assert.equal(f.nodes.length,0);assert.equal(f.app.audioContext.oscillators.length,0);assert.equal(f.app._metronomeTimer,null);
});

test('a late successful module after fallback began cannot replace or duplicate real native output',async t=>{
  const pending=deferred(),f=fixture(t,{nativeFallback:true,moduleWait:pending});f.app._workletLoadTimeoutMs=20;
  await f.mount();await f.app.play(f.root);const reference=f.app._referenceOscillator;
  pending.resolve();await tick();assert.equal(f.app.audioBackend,'web-audio-reference');assert.equal(f.app._referenceOscillator,reference);assert.equal(f.nodes.length,0);
  assert.equal(f.app.audioContext.oscillators.filter(node=>node.frequency.value===220).length,1);
  f.root.remove();await tick();await f.app.onDestroy();assert.equal(f.app._metronomeTimer,null);assert.equal(f.app._previewOscillators.size,0);
});

test('native scheduled beat end releases only its own oscillator and gain while keeping reference playback',async t=>{
  const f=fixture(t,{nativeFallback:true,noWorklet:true});await f.mount();await f.app.play(f.root);
  const reference=f.app._referenceOscillator,click=f.app.audioContext.oscillators.find(node=>node.frequency.value===1000);
  click.onended();assert.equal(f.app._previewOscillators.has(click),false);assert.equal(click.disconnected,true);
  assert.equal(f.app._previewOscillators.has(reference),true);assert.equal(f.app.isPlaying,true);
});

test('Pause during initial bounded worklet wait cancels startup before native reference output can begin',async t=>{
  const pending=deferred(),f=fixture(t,{nativeFallback:true,moduleWait:pending});f.app._workletLoadTimeoutMs=20;
  await f.mount();const play=f.app.play(f.root);await tick();await f.app.pause(f.root);await play;
  pending.resolve();await tick();assert.equal(f.app.isPlaying,false);assert.equal(f.app._metronomeTimer,null);
  assert.equal(f.nodes.length,0);assert.equal(f.app._previewOscillators.size,0);assert.equal(f.app.audioContext.oscillators.length,0);
});

test('an unresolved native resume has a bounded visible failure and cannot leave Play pending forever',async t=>{
  const pending=deferred(),f=fixture(t,{nativeFallback:true,resumeWait:pending});f.app._transportTimeoutMs=20;
  await f.mount();await f.app.play(f.root);assert.equal(f.app._playPending,false);assert.equal(f.app.isPlaying,false);
  assert.equal(f.app._transportFaulted,true);assert.match(status(f.root),/Playback failed/);
  assert.equal(f.nodes.length,0);assert.equal(f.app._previewOscillators.size,0);assert.equal(f.app._metronomeTimer,null);
});

test('Stop during unresolved resume is bounded and its late resolution cannot create playback or nodes',async t=>{
  const pending=deferred(),f=fixture(t,{nativeFallback:true,resumeWait:pending});f.app._transportTimeoutMs=20;
  await f.mount();const play=f.app.play(f.root);await tick();await f.app.stop(f.root);await play;
  assert.equal(f.app._playPending,false);pending.resolve();await tick();
  assert.equal(f.app.isPlaying,false);assert.equal(f.nodes.length,0);assert.equal(f.app._previewOscillators.size,0);assert.equal(f.app._metronomeTimer,null);
});

test('Close during unresolved resume immediately disposes the graph and late completion cannot reopen it',async t=>{
  const pending=deferred(),f=fixture(t,{nativeFallback:true,resumeWait:pending});f.app._transportTimeoutMs=20;
  await f.mount();const play=f.app.play(f.root);await tick();await f.app.onDestroy();
  assert.equal(f.app.audioContext.state,'closed');assert.equal(f.frames.size,0);await play;
  pending.resolve();await tick();assert.equal(f.app._playPending,false);assert.equal(f.app.isPlaying,false);
  assert.equal(f.app.audioContext.state,'closed');assert.equal(f.nodes.length,0);assert.equal(f.app._previewOscillators.size,0);assert.equal(f.app._metronomeTimer,null);
});

test('an unresolved native suspend after SDK stop failure is bounded without masking the original error',async t=>{
  const pending=deferred(),f=fixture(t,{suspendWait:pending});f.app._transportTimeoutMs=20;
  f.app.strudelEngine=sdk({stop:async()=>{throw new Error('original SDK stop failed');}});
  await f.mount();await f.app.play(f.root);await f.app.stop(f.root);
  assert.equal(f.app.isPlaying,false);assert.equal(f.app._transportFaulted,false);
  assert.match(f.root.querySelector('#console-output').textContent,/original SDK stop failed/);
  assert.ok(f.app.audioCleanupErrors.some(error=>/cleanup timed out/.test(error)));
  assert.equal(f.app.audioContext.state,'running','A timed-out suspend must not be reported as suspended');
  pending.resolve();await tick();assert.equal(f.app.audioContext.state,'suspended');
});

test('unresolved native close is bounded after immediate graph disposal and never claims a closed context',async t=>{
  const pending=deferred(),f=fixture(t,{nativeFallback:true,noWorklet:true,closeWait:pending});f.app._transportTimeoutMs=20;
  await f.mount();await f.app.play(f.root);const cleanup=f.app.onDestroy();
  assert.equal(f.app.isPlaying,false);assert.equal(f.app._previewOscillators.size,0);assert.equal(f.app._previewGains.size,0);assert.equal(f.app._metronomeTimer,null);assert.equal(f.frames.size,0);
  await cleanup;assert.equal(f.app.audioContext.state,'running','Returning from cleanup is not proof a pending context close completed');
  assert.equal(f.app._transportFaulted,false);assert.ok(f.app.audioCleanupErrors.some(error=>/cleanup timed out/.test(error)));
  pending.resolve();await tick();assert.equal(f.app.audioContext.state,'closed');assert.equal(f.app.isPlaying,false);assert.equal(f.app._previewOscillators.size,0);
});

test('initialize preserves a pre-existing complete lowercase Strudel transport without importing an unrelated SDK',async t=>{
  const f=fixture(t),engine=sdk();let imports=0;f.window.strudel=engine;
  f.app.importStrudelSDK=async()=>{imports++;throw new Error('Existing genuine transport must bypass import');};
  await f.app.initialize();await f.mount();await f.app.play(f.root);
  assert.equal(imports,0);assert.equal(f.app.strudelEngine,engine);assert.equal(f.app.playbackMode,'strudel');assert.equal(f.app.audioBackend,'strudel-sdk');
  assert.deepEqual(engine.calls,[['evaluate',f.app.currentCode],['start']]);assert.equal(f.nodes.length,0);assert.equal(f.app._previewOscillators.size,0);
});
