#!/usr/bin/env node
/** Real registered desktop/Chrome diagnostic. Does not write capture evidence.
 * Run with run-with-owned-port.mjs --env-var SWISSKNIFE_VDG_STRUDEL_AI_SMOKE_PORT
 * --preferred3087 -- node <this file> [--project-root DIR] [--candidate-source FILE]
 * A candidate override is explicit in the report and has no canonical authority.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {chromium} from '@playwright/test';
const REVIEWED_SOURCE_SHA256='71d6ee4eccfcbea029ae9ad56cd450c9603067779e8984d7ea760ed501b6608c';
const defaultProject=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
async function bounded(promise,ms,label){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(label)),ms);})]);}finally{clearTimeout(timer);}}
function settings(argv){const out={project:defaultProject,candidate:null};const seen=new Set();for(let i=0;i<argv.length;i++){
 const key={'--project-root':'project','--candidate-source':'candidate'}[argv[i]];assert.ok(key,`Unknown argument ${argv[i]}`);assert.ok(!seen.has(key),'Duplicate argument');seen.add(key);
 assert.ok(argv[i+1]&&!argv[i+1].startsWith('--'),'Missing argument value');out[key]=path.resolve(argv[++i]);}return out;}
async function stopServer(server){if(!server)return;try{process.kill(-server.pid,'SIGTERM');}catch(e){if(e.code!=='ESRCH')throw e;}
 if(server.exitCode===null&&server.signalCode===null)await bounded(new Promise(resolve=>server.once('exit',resolve)),5000,'Owned Vite TERM timeout').catch(()=>{});
 try{process.kill(-server.pid,'SIGKILL');}catch(e){if(e.code!=='ESRCH')throw e;}}
function alive(pid){try{process.kill(pid,0);return true;}catch(e){if(e.code==='ESRCH')return false;throw e;}}
export async function runStrudelAIPlaybackSmoke(argv=process.argv.slice(2)){
 const options=settings(argv),project=options.project,canonical=path.join(project,'web/js/apps/strudel-ai-daw.js');
 const source=options.candidate||canonical,sourceSha=hash(source),canonicalSha=hash(canonical);
 assert.equal(sourceSha,REVIEWED_SOURCE_SHA256,'Unreviewed playback source');
 const port=Number(process.env.SWISSKNIFE_VDG_STRUDEL_AI_SMOKE_PORT);assert.ok(Number.isInteger(port)&&port>1023&&port<65536,'An owned smoke port is required');
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'vdg-strudel-ai-playback-')),base=`http://127.0.0.1:${port}`;
 const log=fs.createWriteStream(path.join(directory,'vite.log'),{mode:0o600});
 let server,browserServer,browser,context,page,browserPid,stage='startup',summary;
 try{
  let config=path.join(project,'vite.web.config.ts');
  if(source!==canonical){
   config=path.join(directory,'reviewed-strudel-ai-candidate.config.mjs');
   fs.writeFileSync(config,[
    `import original from ${JSON.stringify(path.join(project,'vite.web.config.ts'))};`,
    `import {mergeConfig} from ${JSON.stringify(pathToFileURL(path.join(project,'node_modules/vite/dist/node/index.js')).href)};`,
    'import {readFileSync,realpathSync} from "node:fs";',
    `const app=${JSON.stringify(canonical)},candidate=${JSON.stringify(source)};`,
    'export default mergeConfig(original,{plugins:[{name:"reviewed-strudel-ai-candidate",enforce:"pre",load(id){const file=id.split("?")[0];if(file===app||file===realpathSync(app))return readFileSync(candidate,"utf8");}}]});'
   ].join('\n'));
  }
  server=spawn(process.execPath,[path.join(project,'node_modules/vite/bin/vite.js'),'--config',config,'--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:project,env:process.env,detached:true,stdio:['ignore','pipe','pipe']});
  server.stdout.pipe(log,{end:false});server.stderr.pipe(log,{end:false});
  const deadline=Date.now()+60000;
  while(true){if(server.exitCode!==null||server.signalCode!==null)throw new Error('Owned Vite exited before readiness');try{if((await fetch(base,{signal:AbortSignal.timeout(1000)})).ok)break;}catch{}if(Date.now()>deadline)throw new Error('Owned Vite readiness timeout');await delay(200);}
  browserServer=await chromium.launchServer({channel:'chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});browserPid=browserServer.process().pid;
  browser=await chromium.connect(browserServer.wsEndpoint());const profiles=[];
  for(const transport of ['http','libp2p']){
   context=await browser.newContext({viewport:{width:1440,height:1000}});
   await context.addInitScript(transport=>{
    globalThis.__SWISSKNIFE_GATEWAY_TRANSPORT_OVERRIDE__=transport;
    globalThis.__SWISSKNIFE_GATEWAY_FORCE_DRY_RUN__=true;
    globalThis.__strudelAITrusted=[];
    document.addEventListener('click',event=>{if(event.target.closest?.('.window[data-app-id="strudel-ai-daw"]'))globalThis.__strudelAITrusted.push({type:'click',trusted:event.isTrusted,id:event.target.closest('button,input,textarea')?.id});},true);
    document.addEventListener('input',event=>{if(event.target.closest?.('.window[data-app-id="strudel-ai-daw"]'))globalThis.__strudelAITrusted.push({type:'input',trusted:event.isTrusted,id:event.target.id});},true);
   },transport);
   page=await context.newPage();page.setDefaultTimeout(15000);const posts=[],errors=[],dialogs=[],moduleResponses=[];
   page.on('request',request=>{if(!['GET','HEAD','OPTIONS'].includes(request.method()))posts.push({method:request.method(),url:request.url()});});
   page.on('console',message=>{if(/strudel|SDK|audio engine|samples|processing|worklet/i.test(message.text()))fs.appendFileSync(path.join(directory,'browser-console.jsonl'),JSON.stringify({stage,message:message.text()})+'\n');});
   page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>{dialogs.push({type:dialog.type(),dismissed:true});return dialog.dismiss();});
   page.on('response',response=>{const name=new URL(response.url()).pathname;if(name==='/js/apps/strudel-ai-daw.js')moduleResponses.push({status:response.status()});if(name.includes('strudel-processor'))fs.appendFileSync(path.join(directory,'worklet-network.jsonl'),JSON.stringify({url:response.url(),status:response.status()})+'\n');});
   await page.goto(base,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>typeof window.desktop?.createStrudelAIDAWApp==='function');
   await page.locator('#loading-screen').waitFor({state:'hidden'});
   // Observe the real registered factory's result without replacing any app,
   // AudioContext, worklet or network implementation.
   await page.evaluate(()=>{const desktop=window.desktop,original=desktop.createStrudelAIDAWApp;window.__strudelAIInstances=[];
    desktop.createStrudelAIDAWApp=async function(...args){const app=await original.apply(this,args);window.__strudelAIInstances.push(app);return app;};});
   const state=()=>page.evaluate(()=>{const app=window.__strudelAIInstances.at(-1),data=new Float32Array(1024);app.analyser?.getFloatTimeDomainData(data);
    return {playing:app.isPlaying,mode:app.playbackMode,audio_state:app.audioContext?.state,bpm:app.bpm,gain:app.masterGain?.gain.value,
     rms:Math.sqrt(data.reduce((sum,value)=>sum+value*value,0)/data.length),worklet:Boolean(app.isUsingWorklet),
     audio_backend:app.audioBackend,reference_frequency:app._referenceOscillator?.frequency.value??null,
     native_oscillator_count:app._previewOscillators.size,native_gain_count:app._previewGains.size,scheduler_active:app._metronomeTimer!==null,
     scheduled_beats:app._previewBeatHistory.slice(-16),audio_cleanup_errors:app.audioCleanupErrors.slice(),
     status:app._container?.querySelector('#audio-playback-status')?.textContent,closed:app._closed,frame:app.animationFrame};});
   const launch=async()=>{stage=`${transport}:actual factory launch`;const n=await page.evaluate(()=>window.__strudelAIInstances.length);
    await bounded(page.evaluate(()=>window.desktop.launchApp('strudel-ai-daw')),15000,'Actual registered factory launch exceeded15seconds');await page.waitForFunction(n=>window.__strudelAIInstances.length>n,n);
    const app=page.locator('.window[data-app-id="strudel-ai-daw"]').last();await app.locator('#audio-playback-status').waitFor();
    await app.evaluate(node=>Object.assign(node.style,{width:'1100px',height:'820px',left:'20px',top:'50px'}));return app;};
   const close=async app=>{await app.locator('.window-control.close').click();await page.waitForFunction(()=>{const app=window.__strudelAIInstances.at(-1);return app._closed&&!app.isPlaying&&app.audioContext?.state==='closed'&&app.animationFrame===null&&app._previewOscillators.size===0&&app._previewGains.size===0&&app._metronomeTimer===null;},undefined,{timeout:10000});};
   const app=await launch(),cases=[];const mountedBeforeGesture=await state();const mountTrustedCount=await page.evaluate(()=>window.__strudelAITrusted.length);assert.equal(mountTrustedCount,0);assert.equal(mountedBeforeGesture.playing,false);assert.ok(['suspended','running'].includes(mountedBeforeGesture.audio_state));assert.ok(mountedBeforeGesture.rms<0.000001);
   assert.equal((await state()).mode,'local-preview','Actual browser path must prove real fallback, not a mocked SDK');
   assert.match((await state()).status,/metronome\/reference tone.*compilation unavailable/);
   const quiet=async playing=>{await page.waitForFunction(playing=>{const app=window.__strudelAIInstances.at(-1),data=new Float32Array(1024);app.analyser.getFloatTimeDomainData(data);const rms=Math.sqrt(data.reduce((s,v)=>s+v*v,0)/data.length);return app.isPlaying===playing&&(playing?rms>0.0001:rms<0.000001);},playing,{timeout:8000});await page.waitForTimeout(400);};
   const action=async(label,selector,perform,verify)=>{stage=`${transport}:${label}`;const start=await page.evaluate(()=>window.__strudelAITrusted.length);const control=app.locator(selector);await control.scrollIntoViewIfNeeded();
    await app.screenshot({path:path.join(directory,`${transport}-${label}-before.png`)});await perform(control);const evidence=await verify();
    const events=await page.evaluate(start=>window.__strudelAITrusted.slice(start),start);assert.ok(events.some(event=>event.trusted===true),`Actual trusted event missing for ${label}`);
    await app.screenshot({path:path.join(directory,`${transport}-${label}-after.png`)});assert.deepEqual(errors,[]);assert.deepEqual(posts,[]);
    cases.push({label,selector,trusted_events:events,state:await state(),evidence:evidence??null,passed:true});};
   await action('play','#play-btn',control=>control.click(),()=>quiet(true));
   await action('pause','#pause-btn',control=>control.click(),()=>quiet(false));
   await action('resume','#play-btn',control=>control.click(),()=>quiet(true));
   await action('stop','#stop-btn',control=>control.click(),()=>quiet(false));
   await action('tempo','#bpm-input',async control=>{await control.fill('162');await control.press('Tab');},async()=>{
    assert.equal((await state()).bpm,162);await app.locator('#play-btn').click();await quiet(true);
    const measured=await state();if(measured.audio_backend==='web-audio-reference')assert.ok(measured.scheduled_beats.some(beat=>beat.bpm===162&&beat.frequency===1000));
    await app.locator('#stop-btn').click();await quiet(false);return {live_tempo_state:measured};
   });
   await action('volume','#master-volume',async control=>{await control.press('End');await control.press('ArrowLeft');},async()=>{assert.ok(Math.abs((await state()).gain-0.99)<0.00001);});
   await action('tap','#tap-tempo',async control=>{await control.click();await page.waitForTimeout(500);await control.click();},async()=>{const bpm=(await state()).bpm;assert.ok(bpm>=60&&bpm<=200);});
   await action('play-for-edit','#play-btn',control=>control.click(),()=>quiet(true));
   await action('live-parameter','#dynamic-controls input[data-param="gain"]',control=>control.press('End'),async()=>{
    await page.waitForFunction(()=>window.__strudelAIInstances.at(-1)._container.querySelector('#console-output').textContent.includes('does not compile edited Strudel code'));
    await quiet(true);
   });
   await action('editor','#strudel-code-editor',control=>control.fill('note("c4 eb4 g4").sound("sine").gain(0.25).cpm(162)'),async()=>{
    assert.equal(await page.evaluate(()=>window.__strudelAIInstances.at(-1).currentCode),'note("c4 eb4 g4").sound("sine").gain(0.25).cpm(162)');await quiet(true);
    assert.match((await state()).status,/metronome\/reference tone.*compilation unavailable/);
   });
   stage=`${transport}:close playing app with editor timers pending`;await close(app);
   const closed=await state();assert.equal(closed.audio_state,'closed');assert.equal(closed.playing,false);assert.equal(closed.frame,null);
   const reopened=await launch();assert.equal((await state()).playing,false);assert.equal((await state()).mode,'local-preview');
   await reopened.locator('#play-btn').click();await quiet(true);await close(reopened);
   assert.deepEqual(posts,[]);assert.deepEqual(errors,[]);assert.ok(moduleResponses.length>0&&moduleResponses.every(row=>row.status===200));
   profiles.push({transport_profile:transport,mounted_without_gesture:true,mount_trusted_event_count:mountTrustedCount,pre_play_state:mountedBeforeGesture,cases,closed_while_playing:closed,reopened_play_and_cleanup:true,
    actual_factory:true,audio_platform_mocked:false,actual_signal_and_silence:true,module_responses:moduleResponses,
    page_errors:errors,posts,dialogs,owned_app_resources_closed:true});
   await context.close();context=null;
  }
  summary={schema:'swissknife.vdg-strudel-ai-playback-smoke.v1',passed:true,source_sha256:sourceSha,canonical_source_sha256:canonicalSha,
   candidate_module_override:source!==canonical,source_path:source,project_root:project,profiles,
   route_interception:false,gui_acceptance:false,completion_authority:false,work_complete:false};
 }catch(error){if(page)await bounded(page.evaluate(()=>{const app=window.__strudelAIInstances?.at(-1);return app?{playing:app.isPlaying,mode:app.playbackMode,context:app.audioContext?.state,context_time:app.audioContext?.currentTime,worklet:app.isUsingWorklet,worklet_module_url:app.workletModuleUrl,faulted:app._transportFaulted,status:app._container?.querySelector('#audio-playback-status')?.textContent,console:app._container?.querySelector('#console-output')?.textContent}:null;}),2000,'State diagnostic timeout').then(value=>fs.writeFileSync(path.join(directory,'failed-state.json'),JSON.stringify(value,null,2))).catch(()=>{});if(page)await bounded(page.evaluate(async()=>{const app=window.__strudelAIInstances?.at(-1);if(!app?.workletModuleUrl)return null;const response=await fetch(app.workletModuleUrl);return {url:app.workletModuleUrl,status:response.status,type:response.headers.get('content-type'),source:await response.text()};}),3000,'Module GET diagnostic timeout').then(value=>fs.writeFileSync(path.join(directory,'worklet-delivery.json'),JSON.stringify(value,null,2))).catch(()=>{});if(page)await bounded(page.evaluate(async()=>{
 const url=window.__strudelAIInstances?.at(-1)?.workletModuleUrl;if(!url)return null;
 const source=await(await fetch(url)).text(),rows=[];
 for(const kind of ['url-string','blob']){
  const ctx=new AudioContext(),row={kind,initial_state:ctx.state};let blob;
  try{const module=kind==='blob'?(blob=URL.createObjectURL(new Blob([source],{type:'text/javascript'}))):url;
   await Promise.race([Promise.all([ctx.resume(),ctx.audioWorklet.addModule(module)]),new Promise((_,reject)=>setTimeout(()=>reject(new Error('native module timeout')),2500))]);row.loaded=true;
  }catch(error){row.loaded=false;row.error=error.message;}finally{await Promise.race([ctx.close(),new Promise(resolve=>setTimeout(resolve,1000))]);if(blob)URL.revokeObjectURL(blob);row.closed_state=ctx.state;}
  rows.push(row);
 }return {rows,source_length:source.length};
}),10000,'Native worklet comparison timeout').then(value=>fs.writeFileSync(path.join(directory,'native-worklet-comparison.json'),JSON.stringify(value,null,2))).catch(()=>{});if(page)await bounded(page.screenshot({path:path.join(directory,'failure.png'),fullPage:true}),5000,'Failure screenshot timeout').catch(()=>{});
  fs.writeFileSync(path.join(directory,'failure.json'),JSON.stringify({passed:false,stage,error:error.message,gui_acceptance:false},null,2)+'\n');throw Object.assign(error,{diagnostic_directory:directory,stage});
 }finally{
  if(context)await context.close().catch(()=>{});
  if(browser)await bounded(browser.close(),10000,'Browser close timeout').catch(()=>{});
  if(browserServer)await bounded(browserServer.close(),10000,'Chrome close timeout').catch(()=>browserServer.kill());
  await stopServer(server);log.end();
 }
 assert.equal(hash(source),sourceSha,'Reviewed source changed during smoke');assert.equal(hash(canonical),canonicalSha,'Canonical source changed during smoke');
 assert.equal(alive(server.pid),false);assert.equal(alive(browserPid),false);
 summary.owned_resources={server_pid:server.pid,browser_pid:browserPid,server_alive_after_cleanup:false,browser_alive_after_cleanup:false};summary.owned_resources_closed=true;
 summary.screenshot_sha256=Object.fromEntries(fs.readdirSync(directory).filter(name=>name.endsWith('.png')).map(name=>[name,hash(path.join(directory,name))]));
 fs.writeFileSync(path.join(directory,'result.json'),JSON.stringify(summary,null,2)+'\n',{mode:0o600});return {...summary,diagnostic_directory:directory};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 runStrudelAIPlaybackSmoke().then(result=>console.log(JSON.stringify(result))).catch(error=>{console.error(JSON.stringify({passed:false,error:error.message,stage:error.stage,diagnostic_directory:error.diagnostic_directory,gui_acceptance:false}));process.exitCode=1;});
}
