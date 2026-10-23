#!/usr/bin/env node
/** Actual registered desktop factory. No family evidence or provider jobs. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {chromium} from '@playwright/test';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const expectedSource='9ecb8b8864f18ea880b5f5ede05405c379c119ed7aa18051b1a56b2d993fa731';
const options={project:path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..'),candidate:null,precondition:null};
const seen=new Set();
for(let index=2;index<process.argv.length;index++){
  const token=process.argv[index];assert.ok(['--project-root','--candidate-source','--precondition-json'].includes(token),`Unknown ${token}`);
  assert.ok(!seen.has(token),`Duplicate ${token}`);seen.add(token);
  assert.ok(process.argv[index+1]&&!process.argv[index+1].startsWith('--'),`Missing ${token}`);
  options[token==='--project-root'?'project':token==='--candidate-source'?'candidate':'precondition']=path.resolve(process.argv[++index]);
}
assert.ok(options.precondition,'An explicit archived diagnostic precondition is required');
const inputs=JSON.parse(fs.readFileSync(options.precondition));
assert.equal(inputs.diagnostic_only,true);assert.equal(inputs.seed_favorite_ids.length,61);
assert.equal(new Set(inputs.seed_favorite_ids).size,61);
const project=options.project;
const canonical=path.join(project,'web/js/apps/openrouter.js');
const source=options.candidate||canonical;
assert.equal(hash(fs.readFileSync(source)),expectedSource,'Reviewed app source changed');
const canonicalBefore=hash(fs.readFileSync(canonical));
const {closeLaunched,waitForRowCalls,screenshotAppWindow}=await import(pathToFileURL(path.join(project,'test/e2e/helpers/live-click-session.ts')).href);
const matrix=JSON.parse(fs.readFileSync(path.join(project,'test-results/virtual-desktop-ipfs-mcp-orb/control-tool-matrix.json'))).rows.filter(row=>row.app_id==='openrouter');
assert.equal(matrix.length,1881,'Full existing OpenRouter obligation count changed');
const port=Number(process.env.SWISSKNIFE_VDG_OPENROUTER_DEFAULT_SMOKE_PORT);
assert.ok(Number.isInteger(port)&&port>1023&&port<65536,'An owned smoke port is required');
const base=`http://127.0.0.1:${port}`;
const output=fs.mkdtempSync(path.join(os.tmpdir(),'vdg-openrouter-default-action-'));
const report={schema:'swissknife.openrouter-default-action-smoke.v1',passed:false,work_complete:false,
  gui_acceptance:false,completion_authority:false,candidate_module_override:source!==canonical,
  source_sha256:expectedSource,canonical_source_sha256:canonicalBefore,
  precondition:{sha256:hash(fs.readFileSync(options.precondition)),reconstructed_prior_favorite_actions:true,raw_historical_storage_snapshot:false,seed_favorite_ids:inputs.seed_favorite_ids,default_model:inputs.seed_default_model},
  original_timeout_reproduced:false,original_timeout_causality_established:false,
  source_hashes:{},profiles:[],posts_attempted:[],posts_blocked:[],page_errors:[],module_responses:[],catalog_responses:[],resources:{},
  driver_limitation:'Focused custom driver uses actual registered factory, screenshots, normal8000ms clicks,800/400ms quiet and titlebar close. It does not produce family acceptance.'};
for(const relative of ['web/js/apps/openrouter.js','test/scripts/vdg-openrouter-default-action.test.mjs','test/e2e/smoke/vdg-openrouter-default-action-smoke.mjs','web/js/main-simple.js','test/e2e/helpers/live-click-session.ts','test/scripts/vdg-openrouter-catalog.test.mjs','test/scripts/vdg-local-modal-ownership.test.mjs']){
  const selected=relative==='web/js/apps/openrouter.js'?source:relative==='test/e2e/smoke/vdg-openrouter-default-action-smoke.mjs'?fileURLToPath(import.meta.url):relative==='test/scripts/vdg-openrouter-default-action.test.mjs'?path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../scripts/vdg-openrouter-default-action.test.mjs'):path.join(project,relative);
  report.source_hashes[`swissknife/${relative}`]=hash(fs.readFileSync(selected));
}
let server,browserServer,browser,activeContext,page,interrupted=false;
const log=fs.createWriteStream(path.join(output,'vite.log'),{mode:0o600});
const onSignal=()=>{interrupted=true;void browser?.close();};
process.once('SIGTERM',onSignal);process.once('SIGINT',onSignal);
const ceiling=setTimeout(onSignal,300000);
const persist=()=>fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});
function selector(id,action){return`[data-openrouter-model="${id}"][data-openrouter-provider="google"][data-openrouter-placement="catalog"][data-openrouter-action="${action}"]`;}
async function state(){return page.evaluate(()=>{
  const app=window.openRouterApp,root=app?.getContainer(),d=window.__orDefaultProof;
  const currentControls=[...root?.querySelectorAll('[data-openrouter-action]')||[]];
  return {model_count:app?.models.size,favorite_count:app?.favoriteModels.size,current_tab:app?.currentTab,
    default_model:app?.settings.defaultModel,persisted_default:JSON.parse(localStorage.getItem('openrouter_settings')||'null')?.defaultModel,
    api_key_present:!!localStorage.getItem('openrouter_api_key'),favorites:[...(app?.favoriteModels||[])],
    catalog_controls:root?.querySelectorAll('[data-openrouter-placement="catalog"]').length||0,
    favorite_controls:root?.querySelectorAll('[data-openrouter-placement="favorites"]').length||0,
    controls:[...root?.querySelectorAll('[data-openrouter-action="default"]')||[]].map(button=>({model:button.dataset.openrouterModel,placement:button.dataset.openrouterPlacement,text:button.textContent.trim(),pressed:button.getAttribute('aria-pressed'),card_default:button.closest('.model-card').classList.contains('default-model')})),
    storage:Object.fromEntries(['openrouter_settings','openrouter_favorites','openrouter_conversations','openrouter_history'].map(key=>[key,localStorage.getItem(key)])),
    writes:[...d.writes],events:[...d.events],dialogs:[...d.dialogs],root_same:root===d.root,
    target_same:!!d.target&&root?.contains(d.target),target_focused:document.activeElement===d.target,
    all_model_control_nodes_same:!!d.controls&&d.controls.length===currentControls.length&&d.controls.every((node,index)=>node===currentControls[index]),
    scroll:d.scrollNodes?.map(node=>({connected:node.isConnected,top:node.scrollTop,left:node.scrollLeft}))||[]};
});}
function verifySelected(observation,id){
  const copies=observation.controls.filter(button=>button.model===id);assert.equal(copies.length,1+Number(observation.favorites.includes(id)),'Selected model must retain its actual catalog and any favorite copy');
  for(const button of observation.controls){const selected=button.model===id;assert.equal(button.text,selected?'✓ Default':'Set Default');assert.equal(button.pressed,String(selected));assert.equal(button.card_default,selected);}
}
try{
  console.log(JSON.stringify({output,stage:'startup',port}));
  let config=path.join(project,'vite.web.config.ts');
  if(source!==canonical){
    config=path.join(output,'reviewed-openrouter-candidate.config.mjs');
    fs.writeFileSync(config,[`import original from ${JSON.stringify(path.join(project,'vite.web.config.ts'))};`,
      `import {mergeConfig} from ${JSON.stringify(pathToFileURL(path.join(project,'node_modules/vite/dist/node/index.js')).href)};`,
      'import {readFileSync,realpathSync} from "node:fs";',
      `const app=${JSON.stringify(canonical)},candidate=${JSON.stringify(source)};`,
      'export default mergeConfig(original,{plugins:[{name:"reviewed-openrouter-default-candidate",enforce:"pre",load(id){const file=id.split("?")[0];if(file===app||file===realpathSync(app))return readFileSync(candidate,"utf8");}}]});'].join('\n'));
  }
  server=spawn(process.execPath,[path.join(project,'node_modules/vite/bin/vite.js'),'--config',config,'--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:project,env:process.env,detached:true,stdio:['ignore','pipe','pipe']});
  report.resources.vite_pid=server.pid;server.stdout.pipe(log,{end:false});server.stderr.pipe(log,{end:false});
  const deadline=Date.now()+60000;
  while(true){if(interrupted||server.exitCode!==null||server.signalCode!==null)throw Error('Owned Vite stopped before readiness');try{if((await fetch(base,{signal:AbortSignal.timeout(1000)})).ok)break;}catch{}if(Date.now()>deadline)throw Error('Vite readiness timeout60s');await delay(100);}
  browserServer=await chromium.launchServer({channel:'chrome',headless:true,timeout:30000});report.resources.chrome_pid=browserServer.process().pid;
  browser=await chromium.connect(browserServer.wsEndpoint());
  const targetId='google/gemini-4-argon:batch',previousId='google/gemini-4-argon',neighborId='google/gemini-nano-banana-2.1';
  for(const transport of ['http','libp2p']){
    if(interrupted)throw Error('Smoke deadline/interruption');
    const profile={transport,cases:[],passed:false};report.profiles.push(profile);
    activeContext=await browser.newContext({viewport:{width:1440,height:900}});
    await activeContext.tracing.start({screenshots:true,snapshots:true,sources:true});
    await activeContext.route('**/*',route=>{
      const request=route.request(),url=new URL(request.url());
      if(!['GET','HEAD','OPTIONS'].includes(request.method())){const entry={transport,method:request.method(),url:request.url()};report.posts_attempted.push(entry);report.posts_blocked.push(entry);return route.abort('blockedbyclient');}
      if(url.origin!==base&&!(url.origin==='https://openrouter.ai'&&url.pathname==='/api/v1/models'))return route.abort('blockedbyclient');
      return route.continue();
    });
    await activeContext.addInitScript(({transport,favorites,defaultModel})=>{
      globalThis.__SWISSKNIFE_GATEWAY_TRANSPORT_OVERRIDE__=transport;globalThis.__SWISSKNIFE_GATEWAY_FORCE_DRY_RUN__=true;
      localStorage.setItem('openrouter_favorites',JSON.stringify(favorites));localStorage.setItem('openrouter_settings',JSON.stringify({defaultModel}));localStorage.removeItem('openrouter_api_key');
      const d=window.__orDefaultProof={events:[],writes:[],dialogs:[]};const original=Storage.prototype.setItem;
      Storage.prototype.setItem=function(key,value){const result=Reflect.apply(original,this,[key,value]);if(String(key).startsWith('openrouter_'))d.writes.push({key:String(key),length:String(value).length,time:performance.now()});return result;};
      document.addEventListener('click',event=>{const element=event.target.closest?.('[data-openrouter-action],.tab-item');if(element)d.events.push({trusted:event.isTrusted,model:element.dataset.openrouterModel||null,action:element.dataset.openrouterAction||null,placement:element.dataset.openrouterPlacement||null,tab:element.dataset.tab||null,time:performance.now(),root_same_before_handler:window.openRouterApp?.getContainer()===d.root,target_same_before_handler:element===d.target,scroll_before_handler:d.scrollNodes?.map(node=>({connected:node.isConnected,top:node.scrollTop,left:node.scrollLeft}))||[]});},true);
    },{transport,favorites:inputs.seed_favorite_ids,defaultModel:inputs.seed_default_model});
    page=await activeContext.newPage();page.setDefaultTimeout(20000);
    page.on('pageerror',error=>report.page_errors.push({transport,message:error.message}));
    page.on('dialog',async dialog=>{const message=dialog.message();await dialog.dismiss();await page.evaluate(message=>window.__orDefaultProof.dialogs.push(message),message).catch(()=>{});});
    page.on('response',async response=>{const url=new URL(response.url());if(url.pathname==='/js/apps/openrouter.js')report.module_responses.push({transport,status:response.status(),path:url.pathname});if(url.origin==='https://openrouter.ai'&&url.pathname==='/api/v1/models'){const bytes=await response.body().catch(()=>null);if(bytes){const file=`${transport}-actual-catalog.json`;fs.writeFileSync(path.join(output,file),bytes);report.catalog_responses.push({transport,status:response.status(),sha256:hash(bytes),file});}}});
    await page.goto(base,{waitUntil:'domcontentloaded',timeout:30000});await page.waitForFunction(()=>typeof window.swissknifeDesktop?.launchApp==='function');
    const launch=async()=>{await page.evaluate(()=>window.swissknifeDesktop.launchApp('openrouter'));const app=page.locator('.window[data-app-id="openrouter"]').last();await app.locator(selector(targetId,'default')).waitFor({state:'visible'});return app;};
    let appWindow=await launch();
    profile.initial=await state();assert.equal(profile.initial.model_count,468);assert.equal(profile.initial.favorite_count,61);assert.equal(profile.initial.api_key_present,false);
    profile.original_control_count=matrix.length;
    profile.unresolved_original_selectors=await appWindow.evaluate((root,selectors)=>selectors.filter(selector=>root.querySelectorAll(selector).length!==1),matrix.map(row=>row.selector));
    assert.deepEqual(profile.unresolved_original_selectors,[],'All1881 original controls must remain unique');
    await closeLaunched(page,appWindow);
    const cases=[['default',targetId],['default',targetId],['default',previousId],['default',neighborId],['favorite',targetId],['favorite',targetId],['info',targetId],['try',targetId],['default',targetId],['default',targetId]];
    for(const[index,[action,id]]of cases.entries()){
      if(interrupted)throw Error('Smoke deadline/interruption');
      report.stage=`${transport}:${index}:${action}`;persist();
      if(index!==8)appWindow=await launch();
      const target=appWindow.locator(selector(id,action));assert.equal(await target.count(),1);
      const row={index,action,model:id,selector:selector(id,action)};profile.cases.push(row);
      row.before=await state();assert.equal(row.before.model_count,468);assert.equal(row.before.api_key_present,false);
      row.screenshot_before=`${transport}-${index}-before.png`;await screenshotAppWindow(page,appWindow,{path:path.join(output,row.screenshot_before),timeout:15000,animations:'disabled'});
      await target.scrollIntoViewIfNeeded({timeout:2000});
      await target.evaluate(element=>{const d=window.__orDefaultProof,root=window.openRouterApp.getContainer();d.root=root;d.target=element;d.controls=[...root.querySelectorAll('[data-openrouter-action]')];d.scrollNodes=[];for(let node=element.parentElement;node;node=node.parentElement){if(node.scrollHeight>node.clientHeight||node.scrollWidth>node.clientWidth)d.scrollNodes.push(node);}});
      row.before_action=await state();
      const started=Date.now();await target.click({timeout:8000});row.click_ms=Date.now()-started;
      await waitForRowCalls(page,[],0,{appearMs:800,quietMs:400,timeoutMs:15000});
      row.after=await state();
      row.trusted_events=row.after.events.slice(row.before_action.events.length);assert.ok(row.trusted_events.some(event=>event.trusted&&event.model===id&&event.action===action&&event.placement==='catalog'));
      row.write_events=row.after.writes.slice(row.before_action.writes.length);
      if(action==='default'){
        assert.equal(row.after.default_model,id);assert.equal(row.after.persisted_default,id);verifySelected(row.after,id);
        assert.equal(row.after.root_same,true);assert.equal(row.after.target_same,true);assert.equal(row.after.target_focused,true);assert.equal(row.after.all_model_control_nodes_same,true);
        row.trusted_scroll_before_handler=row.trusted_events.find(event=>event.trusted&&event.model===id&&event.action===action&&event.placement==='catalog').scroll_before_handler;
        assert.ok(row.trusted_events.some(event=>event.trusted&&event.root_same_before_handler&&event.target_same_before_handler&&event.model===id&&event.action===action&&event.placement==='catalog'));
        assert.deepEqual(row.after.scroll,row.trusted_scroll_before_handler,'Default selection must retain scroll from trusted click through settled handler');
        assert.equal(row.after.catalog_controls,468*4);assert.equal(row.after.favorite_controls,61*4);
        if(index===1||index===9)assert.deepEqual(row.after.storage,row.before_action.storage,'Repeated selection retains exactly the saved values');
        for(const key of ['openrouter_settings','openrouter_favorites','openrouter_conversations','openrouter_history'])assert.ok(row.write_events.some(event=>event.key===key));
      }else if(action==='favorite'){
        assert.equal(row.after.favorite_count,index===4?60:61);assert.equal(JSON.parse(row.after.storage.openrouter_favorites).includes(id),index===5);
      }else if(action==='info'){
        assert.ok(row.after.dialogs.slice(row.before_action.dialogs.length).some(message=>message.includes(id)),'Actual model info dialog must show the real id');
      }else{
        assert.equal(row.after.current_tab,'playground');assert.equal(row.after.default_model,id);assert.equal(row.after.persisted_default,neighborId);assert.deepEqual(row.after.storage,row.before_action.storage,'Try remains unsaved');
      }
      row.screenshot_after=`${transport}-${index}-after.png`;await screenshotAppWindow(page,appWindow,{path:path.join(output,row.screenshot_after),timeout:15000,animations:'disabled'});
      if(index===7){
        await appWindow.locator('.tab-item[data-tab="models"]').click({timeout:8000});
        assert.equal((await state()).current_tab,'models'); // Keep the same genuine Try-selected unsaved app for default case8.
      }else{
        await closeLaunched(page,appWindow);assert.equal(await page.locator('.window[data-app-id="openrouter"]').count(),0);
        row.persisted_after_close=await page.evaluate(()=>({default_model:JSON.parse(localStorage.getItem('openrouter_settings')||'null')?.defaultModel,favorite_count:JSON.parse(localStorage.getItem('openrouter_favorites')||'[]').length}));
        assert.equal(row.persisted_after_close.default_model,row.after.persisted_default);assert.equal(row.persisted_after_close.favorite_count,row.after.favorite_count);
      }
      console.log(JSON.stringify({transport,index,action,model:id,click_ms:row.click_ms,default:row.after.default_model,favorites:row.after.favorite_count,root_same:row.after.root_same}));persist();
    }
    assert.deepEqual(report.posts_attempted,[]);assert.deepEqual(report.page_errors,[]);
    profile.passed=true;profile.no_case_storage_reset=true;
    await activeContext.tracing.stop({path:path.join(output,`${transport}-trace.zip`)});await activeContext.close();activeContext=null;
  }
  assert.ok(report.module_responses.length===2&&report.module_responses.every(row=>row.status===200));
  report.passed=true;
}catch(error){report.error=error.stack||error.message;process.exitCode=1;if(page)await page.screenshot({path:path.join(output,'failure.png'),timeout:5000}).catch(()=>{});
}finally{
  clearTimeout(ceiling);process.removeListener('SIGTERM',onSignal);process.removeListener('SIGINT',onSignal);
  if(activeContext)await activeContext.tracing.stop({path:path.join(output,'failed-trace.zip')}).catch(()=>{});
  await browser?.close().catch(()=>{});await browserServer?.kill().catch(()=>{});
  if(server){try{process.kill(-server.pid,'SIGTERM');}catch{}if(server.exitCode===null&&server.signalCode===null)await Promise.race([new Promise(resolve=>server.once('exit',resolve)),delay(5000)]);try{process.kill(-server.pid,'SIGKILL');}catch{}}
  log.end();for(const[key,pid]of Object.entries(report.resources))try{process.kill(pid,0);report.resources[`${key}_absent`]=false;}catch{report.resources[`${key}_absent`]=true;}
  report.canonical_source_sha256_after=hash(fs.readFileSync(canonical));report.canonical_source_unchanged=report.canonical_source_sha256_after===canonicalBefore;
  report.screenshot_sha256=Object.fromEntries(fs.readdirSync(output).filter(name=>name.endsWith('.png')).map(name=>[name,hash(fs.readFileSync(path.join(output,name)))]));
  report.owned_resources_closed=report.resources.vite_pid_absent===true&&report.resources.chrome_pid_absent===true;
  report.finished_at=new Date().toISOString();persist();console.log(JSON.stringify({output,passed:report.passed,error:report.error,owned_resources_closed:report.owned_resources_closed}));
}
