// Authored DOM/gateway/SDK-response unit fixtures, never browser/native qualification.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {Window} from 'happy-dom';
const sourceRoot=process.env.SVF_SUPERVISOR_SOURCE_ROOT||fileURLToPath(new URL('../../../',import.meta.url));
const {AgentSupervisorApp}=await import(pathToFileURL(path.join(sourceRoot,'swissknife/web/js/apps/agent-supervisor.js')));
const BINDING='agent-supervisor.ipfs_accelerate_py.supervise_agent_work';
const sha=value=>createHash('sha256').update(String(value)).digest('hex');
const cid=seed=>'b'+String.fromCharCode(97+(seed%20)).repeat(58);
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
async function until(predicate){for(let i=0;i<100;i++){if(predicate())return;await tick();}throw Error('authored unit fixture did not settle');}

function fixture(t){
 const names=['window','document','sessionStorage','localStorage','CustomEvent','fetch','__SWISSKNIFE_GATEWAY_FORCE_DRY_RUN__'];
 const old=new Map(names.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
 const window=new Window({url:'http://authored.invalid'});const calls=[],runs=new Map();let sequence=0,override=null,nextReply=null;
 Object.assign(globalThis,{window,document:window.document,sessionStorage:window.sessionStorage,localStorage:window.localStorage,
  CustomEvent:window.CustomEvent,__SWISSKNIFE_GATEWAY_FORCE_DRY_RUN__:false});
 const mount=()=>{
  const root=document.createElement('div');document.body.append(root);
  const app=new AgentSupervisorApp();app.state.status='ready';app.state.activeTab='dispatch';root.innerHTML=app.renderShell();app.bind(root);
  return{app,root};
 };
 let current=mount();
 globalThis.fetch=async(url,options={})=>{
  if(String(url).startsWith('/mcp/tools/bindings'))return{ok:true,json:async()=>({controls:[{app_id:'agent-supervisor',binding_id:BINDING,
   owner:'ipfs_accelerate_py',intent_id:'authored-native-lifecycle',selected_tool_id:'WorkflowCoordinator.submit_task',
   preferred_tool_ids:['WorkflowCoordinator.submit_task','get_task'],transports:['http'],transport:'http',status:'available',mutates_remote_state:true}]})};
  if(url==='/mcp/tools/dispositions')return{ok:true,json:async()=>({entries:[]})};
  assert.equal(url,'/mcp/tools/call');const call=JSON.parse(options.body);calls.push(call);
  assert.equal(call.binding_id,BINDING);assert.equal(call.owner,'ipfs_accelerate_py');assert.equal(call.input.policy.consent,'granted');assert.equal(call.input.policy.dry_run,false);
  const args=call.input.payload;assert.equal(args.fixture_mode,'svf-goal-worker-v1');assert.equal(args.fixture_scope,'svf-agent-supervisor-552');
  let body,error;
  if(args.action==='create'){
   const run={run_id:randomUUID(),root_goal_cid:randomUUID(),child_goal_cid:randomUUID(),task_ids:{a:randomUUID(),b:randomUUID()},stages:{},spawns:{a:0,b:0}};
   runs.set(run.run_id,run);body={run_id:run.run_id,root_goal_cid:run.root_goal_cid,child_goal_cid:run.child_goal_cid,task_ids:run.task_ids};
  }else{
   const run=runs.get(args.run_id);assert.ok(run,'only a returned native run may be used');assert.ok(['a','b'].includes(args.task_key));
   if(call.tool_id==='get_task'){
    assert.equal(args.action,undefined);assert.equal(args.dry_run,undefined);
    body={run_id:run.run_id,task_key:args.task_key,task_id:run.task_ids[args.task_key],status:run.stages[args.task_key]?'completed':'ready',output_sha256:run.stages[args.task_key]?.output_sha256};
   }else if(args.task_key==='b'&&!run.stages.a){error='JSON-RPC Error -32603: task is not ready';}
   else{
    assert.ok(['dispatch','retry'].includes(args.action));
    let stage=run.stages[args.task_key];
    if(!stage){
     run.spawns[args.task_key]++;
     const ref=()=>({path:`/authored-root/data/agent_supervisor/swissknife_visual_functional/backends/supervisor-fixtures/${run.run_id}/attempts/${randomUUID()}/result.json`,sha256:sha(randomUUID())});
     stage=run.stages[args.task_key]={output_sha256:sha(run.run_id+args.task_key),execution:{producer:ref(),validator:ref()}};
    }
    body={run_id:run.run_id,task_key:args.task_key,task_id:run.task_ids[args.task_key],status:'completed',...stage};
   }
  }
  sequence++;const receipt=cid(sequence),event=cid(sequence+1),outcome=error?'failed':'executed';
  let envelope={ok:!error,owner:call.owner,tool_id:call.tool_id,transport:call.transport,correlation_id:call.correlation_id,outcome,
   result:error?{error}:{result:{isError:false,content:[{type:'json',json:{...body,success:true,fixture_mode:'svf-goal-worker-v1',native_provenance:{schema:'swissknife.native-supervisor-execution.v1',owner:'ipfs_accelerate_py',simulated:false,cache_fallback:false}}}],receipt:{owner:call.owner,tool:call.tool_id,status:'ok'}}},
   receipt:{receipt_id:receipt,event_dag_refs:[event],owner:call.owner,tool_id:call.tool_id,transport:call.transport,
    correlation_id:call.correlation_id,outcome,policy_outcome:'require_confirmation',persistence:{status:'persisted',receipt_cid:receipt,event_cid:event}}};
  if(override)envelope=override(envelope,call);
  const pending=nextReply;nextReply=null;
  if(pending)await pending;
  return{ok:true,json:async()=>envelope};
 };
 async function approve(pending,root=current.root){
  await until(()=>root.querySelector('[data-gateway-confirm]'));
  const event=new window.MouseEvent('click',{bubbles:true});
  Object.defineProperty(event,'isTrusted',{value:true}); // Authored test sentinel; never real UI/owner evidence.
  root.querySelector('[data-gateway-confirm]').dispatchEvent(event);return pending;
 }
 async function act(method,...args){current.app.state.dispatch.confirm=true;current.app.update();return approve(current.app[method](...args));}
 t.after(async()=>{await window.happyDOM.abort();for(const name of names){const v=old.get(name);if(v)Object.defineProperty(globalThis,name,v);else delete globalThis[name];}});
 return{window,calls,runs,get app(){return current.app;},get root(){return current.root;},act,approve,
  setOverride(value){override=value;},delayNextReply(){let release;nextReply=new Promise(resolve=>{release=resolve;});return release;},reopen(){current.root.remove();current=mount();return current;}};
}

test('creation is not completion; each action requires confirmation and real gateway consent',async t=>{
 const f=fixture(t);assert.equal(await f.app.createNativeRun(),false);assert.equal(f.calls.length,0);
 f.app.state.dispatch.confirm=true;const pending=f.app.createNativeRun();await until(()=>f.root.querySelector('[data-gateway-confirm]'));
 f.root.querySelector('[data-gateway-confirm]').click();await tick();assert.equal(f.calls.length,0,'synthetic click cannot grant execution');
 assert.equal(await f.approve(pending),true);assert.equal(f.calls.length,1);
 assert.equal(f.app.state.fixtureRun.stages.a.status,'not_run');assert.equal(f.app.state.dispatch.result.accepted,false);
 assert.equal(f.app.state.dispatch.confirm,false);assert.equal(await f.app.submitTaskDispatch(),false);assert.equal(f.calls.length,1);
});

test('actual output/producer/validator and receipt/event identities survive owner re-read and reopen',async t=>{
 const f=fixture(t);await f.act('createNativeRun');await f.act('submitTaskDispatch');
 const before=JSON.parse(JSON.stringify(f.app.state.fixtureRun));assert.equal(before.stages.a.status,'completed');
 assert.match(before.stages.a.output_sha256,/^[0-9a-f]{64}$/);assert.ok(before.stages.a.execution.validator.sha256);
 const spawned=f.runs.get(before.run_id).spawns.a;f.reopen();assert.equal(f.app.state.nativeReadback,null);
 assert.equal(f.app.state.fixtureRun.run_id,before.run_id);assert.equal(f.app.state.fixtureRun.stages.a.output_sha256,before.stages.a.output_sha256);
 await f.act('readNativeRun');assert.equal(f.app.state.nativeReadback.matched,true);
 assert.equal(f.app.state.fixtureRun.stages.a.output_sha256,before.stages.a.output_sha256);
 assert.deepEqual(f.app.state.fixtureRun.stages.a.execution,before.stages.a.execution);
 assert.notEqual(f.app.state.fixtureRun.stages.a.receipt_id,before.stages.a.receipt_id,'owner readback has its own actual request receipt');
 assert.equal(f.runs.get(before.run_id).spawns.a,spawned,'get_task cannot spawn another worker');
 assert.notEqual(f.app.state.fixtureRun.status,'completed','a single task output cannot claim the whole run completed');
 assert.equal(f.app.state.fixtureRun.stages.b.status,'not_run');
 assert.doesNotMatch(f.root.querySelector('[data-native-summary]').textContent,/Goal (?:is )?completed/i);
});

test('dependency refusal is real, repair executes A and retry executes B once without fake SWR completion',async t=>{
 const f=fixture(t);await f.act('createNativeRun');const run=f.app.state.fixtureRun.run_id;f.app.selectNativeTask('b');
 assert.equal(await f.act('submitTaskDispatch'),false);assert.equal(f.app.state.dispatch.error.reason,'dependency_blocked');
 assert.match(f.app.state.dispatch.error.message,/task is not ready/);assert.deepEqual(f.runs.get(run).spawns,{a:0,b:0});
 assert.equal(await f.act('repairNamedBlocker'),true);assert.equal(f.app.state.fixtureRun.stages.a.status,'completed');
 assert.equal(f.app.state.fixtureRun.stages.b.status,'blocked');assert.deepEqual(f.runs.get(run).spawns,{a:1,b:0});
 assert.equal(await f.act('retryNativeTask'),true);assert.equal(f.app.state.fixtureRun.stages.b.status,'completed');
 assert.deepEqual(f.runs.get(run).spawns,{a:1,b:1});assert.match(f.app.state.dispatch.recoveryNote,/without a duplicate dispatch/);
 f.app.state.dispatch.confirm=true;assert.equal(await f.app.retryNativeTask(),false);assert.equal(f.calls.length,4);assert.deepEqual(f.runs.get(run).spawns,{a:1,b:1});
 assert.equal(f.app.state.snapshot.queue.find(row=>row.task_id==='SWR-105-1').status,'running');
 assert.equal(f.app.state.snapshot.queue.find(row=>row.task_id==='SWR-106-1').status,'blocked');
});

test('cancellation and duplicate pending actions create no owner work and retain the last good run',async t=>{
 const f=fixture(t);await f.act('createNativeRun');await f.act('submitTaskDispatch');const before=JSON.stringify(f.app.state.fixtureRun);
 f.app.state.dispatch.confirm=true;const pending=f.app.createNativeRun();await until(()=>f.root.querySelector('[data-gateway-cancel]'));
 assert.equal(await f.app.createNativeRun(),false);f.root.querySelector('[data-gateway-cancel]').click();assert.equal(await pending,false);
 assert.equal(JSON.stringify(f.app.state.fixtureRun),before);assert.equal(f.calls.length,2);
});

test('wrong owner/run/task/output, preview, or missing independent validation cannot publish success',async t=>{
 for(const corrupt of[
  v=>({...v,owner:'different'}),v=>({...v,outcome:'preview'}),
  v=>{v.result.result.content[0].json.run_id=randomUUID();return v;},
  v=>{v.result.result.content[0].json.task_id=randomUUID();return v;},
  v=>{v.result.result.content[0].json.status='running';return v;},
  v=>{delete v.result.result.content[0].json.execution.validator;return v;},
  v=>{v.result.result.content[0].json.native_provenance.simulated=true;return v;},
  v=>{v.receipt.persistence.event_cid=cid(19);return v;},
  v=>{v.result.result.content[0].json.task_key='b';return v;},
  v=>{v.result.result.content[0].json.output_sha256='';return v;},
  v=>{v.result.result.content[0].json.execution.producer.path=v.result.result.content[0].json.execution.producer.path.replace(v.result.result.content[0].json.run_id,randomUUID());return v;},
  v=>{v.result.result.content[0].json.execution.validator={...v.result.result.content[0].json.execution.producer};return v;},
  v=>{delete v.result.result.content[0].json.native_provenance.schema;return v;},
  v=>{v.result.result.content[0].json.native_provenance.cache_fallback=true;return v;},
  v=>{v.receipt.correlation_id='different-request';return v;},
  v=>{v.receipt.tool_id='different-tool';return v;},
  v=>{v.receipt.receipt_id='not-a-cid';return v;},
 ]){
  const f=fixture(t);await f.act('createNativeRun');f.setOverride(corrupt);
  assert.equal(await f.act('submitTaskDispatch'),false);assert.equal(f.app.state.fixtureRun.stages.a.status,'not_run');
 }
});

test('mismatching owner readback cannot bless cached identity or change validated output',async t=>{
 const f=fixture(t);await f.act('createNativeRun');await f.act('submitTaskDispatch');const before=f.app.state.fixtureRun.stages.a.output_sha256;
 f.setOverride(v=>{v.result.result.content[0].json.output_sha256='f'.repeat(64);return v;});
 assert.equal(await f.act('readNativeRun'),false);assert.equal(f.app.state.nativeReadback,null);
 assert.equal(f.app.state.fixtureRun.stages.a.output_sha256,before);
});


test('new owner creation requires canonical distinct task UUIDs and real goal UUIDs, not cached SWR IDs',async t=>{
 for(const corrupt of [
  body=>{body.run_id='SWR-105';},
  body=>{body.task_ids.a='SWR-105-1';},
  body=>{body.task_ids.b=body.task_ids.a;},
  body=>{body.root_goal_cid='goal:pretend';},
  body=>{delete body.child_goal_cid;},
 ]){
  const f=fixture(t);f.setOverride(v=>{corrupt(v.result.result.content[0].json);return v;});
  assert.equal(await f.act('createNativeRun'),false);
  assert.equal(f.app.state.fixtureRun,null);assert.equal(f.root.querySelector('[data-native-run-id]').value,'');
  assert.equal(f.app.state.snapshot.queue.find(row=>row.task_id==='SWR-105-1').status,'running');
 }
});

test('owner errors preserve last validated run/task/output and publish no new success',async t=>{
 const f=fixture(t);await f.act('createNativeRun');await f.act('submitTaskDispatch');
 const before=structuredClone(f.app.state.fixtureRun);const calls=f.calls.length;
 f.setOverride(()=>{throw Error('authored owner unavailable');});
 assert.equal(await f.act('createNativeRun'),false);assert.equal(f.calls.length,calls+1);
 assert.equal(f.app.state.fixtureRun.run_id,before.run_id);
 assert.deepEqual(f.app.state.fixtureRun.stages,before.stages);assert.equal(f.app.state.dispatch.result,null);
 assert.match(f.app.state.dispatch.error.message,/authored owner unavailable/);
 assert.equal(f.app.state.dispatch.submitting,false);assert.equal(f.app.state.dispatch.confirm,false);
 const saved=JSON.parse(sessionStorage.getItem('agent-supervisor-board'));
 assert.equal(saved.fixtureRun.run_id,before.run_id);assert.deepEqual(saved.fixtureRun.stages,before.stages);
});

test('late owner response after native close cannot overwrite the reopened run or its pending state',async t=>{
 const f=fixture(t);await f.act('createNativeRun');await f.act('submitTaskDispatch');
 const savedRun=f.app.state.fixtureRun.run_id,closed=f.app,oldRelease=f.delayNextReply();
 closed.state.dispatch.confirm=true;const oldPending=closed.createNativeRun();const oldApproval=f.approve(oldPending);
 await until(()=>f.calls.length===3);f.reopen();
 assert.equal(f.app.state.fixtureRun.run_id,savedRun);const before=sessionStorage.getItem('agent-supervisor-board');
 const newRelease=f.delayNextReply();f.app.state.dispatch.confirm=true;const newPending=f.app.createNativeRun();const newApproval=f.approve(newPending);
 await until(()=>f.calls.length===4);assert.equal(f.app.state.dispatch.submitting,true);
 oldRelease();assert.equal(await oldApproval,false);
 assert.equal(f.app.state.dispatch.submitting,true,'closed promise cannot clear the newer busy flag');
 assert.equal(f.app.state.fixtureRun.run_id,savedRun);
 assert.equal(JSON.parse(sessionStorage.getItem('agent-supervisor-board')).fixtureRun.run_id,JSON.parse(before).fixtureRun.run_id);
 newRelease();assert.equal(await newApproval,true);assert.notEqual(f.app.state.fixtureRun.run_id,savedRun);
 assert.equal(f.app.state.dispatch.submitting,false);
 assert.equal(JSON.parse(sessionStorage.getItem('agent-supervisor-board')).fixtureRun.run_id,f.app.state.fixtureRun.run_id);
});

test('mobile Dispatch reserves the scrollport while cached panes remain reachable through Active navigation',t=>{
 const f=fixture(t);f.window.happyDOM.setWindowSize({width:390,height:844});f.app.update();
 const style=node=>f.window.getComputedStyle(node);
 assert.equal(f.root.querySelector('[data-agent-supervisor-root]').dataset.activeTab,'dispatch');
 assert.equal(style(f.root.querySelector('.as-pane.as-goals')).display,'none');
 assert.equal(style(f.root.querySelector('.as-pane.as-queue')).display,'none');
 assert.equal(parseFloat(style(f.root.querySelector('.as-pane.as-detail')).flexBasis),0);
 assert.equal(style(f.root.querySelector('[data-testid="dispatch-panel"]')).overflow,'auto');
 for(const selector of ['[data-native-create]','[data-native-read]','[data-native-retry]','[data-testid="dispatch-confirm"]','[data-testid="dispatch-submit"]'])assert.ok(f.root.querySelector(selector),selector);
 f.root.querySelector('[data-tab="active"]').click();
 assert.equal(f.app.state.activeTab,'active');
 assert.notEqual(style(f.root.querySelector('.as-pane.as-goals')).display,'none');
 assert.notEqual(style(f.root.querySelector('.as-pane.as-queue')).display,'none');
 assert.ok(f.root.querySelector('[data-goal-id="SWR-105"]'));assert.ok(f.root.querySelector('[data-task-id="SWR-106-1"]'));
 f.root.querySelector('[data-tab="dispatch"]').click();
 assert.equal(style(f.root.querySelector('.as-pane.as-goals')).display,'none');
 f.window.happyDOM.setWindowSize({width:1440,height:900});f.app.update();
 assert.notEqual(style(f.root.querySelector('.as-pane.as-goals')).display,'none');
 assert.notEqual(style(f.root.querySelector('.as-pane.as-queue')).display,'none');
});


test('canonical cached-task selection navigates through Active while mobile Dispatch reserves its native scrollport',async t=>{
 const f=fixture(t);f.window.happyDOM.setWindowSize({width:390,height:844});f.app.update();
 const {readFile}=await import('node:fs/promises');
 const scenario=JSON.parse(await readFile(new URL('../e2e/functional-workflows/agent-supervisor.json',import.meta.url),'utf8'));
 const steps=scenario.phases.primary_result;
 const selected=steps.findIndex(step=>step.op==='click'&&step.selector==='[data-task-id="SWR-106-1"]');
 assert.ok(selected>0);assert.deepEqual(steps[selected-1],{op:'click',selector:'[data-tab="active"]'},'cached panes require the visible Active navigation before selection');
 assert.equal(f.window.getComputedStyle(f.root.querySelector('.as-pane.as-queue')).display,'none');
 for(const step of steps.slice(selected-1)){
  if(step.op==='assert'){
   assert.equal(step.requirement_id,'result_1');assert.ok(f.root.querySelector(step.probe.selector).textContent.includes(step.expected));continue;
  }
  assert.ok(step.op==='click'||(step.op==='press'&&step.key==='Enter'));
  const node=f.root.querySelector(step.selector);assert.ok(node);
  if(node.closest('.as-pane.as-queue'))assert.notEqual(f.window.getComputedStyle(node.closest('.as-pane.as-queue')).display,'none');
  node.click(); // Authored DOM default-button activation; never native browser evidence.
 }
 assert.equal(f.app.state.activeTab,'active');assert.equal(f.app.state.selectedTaskId,'SWR-106-1');
 assert.equal(f.calls.length,0,'cached navigation introduces no owner dispatch');
});

// R33: authored DOM/computed-style regressions for the actual clipped run ID and
// off-scrollport recovery controls. These do not claim real browser geometry.
test('completed native runs keep a full selectable ID ahead of output and collapse secondary actions',async t=>{
 for(const width of [1440,390]){
  const f=fixture(t);f.window.happyDOM.setWindowSize({width,height:width===390?844:900});
  await f.act('createNativeRun');f.app.selectNativeTask('b');await f.act('submitTaskDispatch');
  await f.act('repairNamedBlocker');await f.act('retryNativeTask');
  const run=f.app.state.fixtureRun,id=f.root.querySelector('[data-native-run-id]'),content=f.root.querySelector('.as-dispatch-content');
  assert.equal(id.value,run.run_id);assert.equal(id.readOnly,true);assert.match(id.value,/^[0-9a-f-]{36}$/);
  const style=f.window.getComputedStyle(id);assert.equal(style.height,'32px');assert.equal(style.userSelect,'all');
  assert.notEqual(style.color,style.backgroundColor);assert.equal(parseFloat(style.minWidth),0);
  assert.ok(id.compareDocumentPosition(f.root.querySelector('[data-native-a-complete]'))&4,'full identity precedes statuses');
  assert.ok(id.compareDocumentPosition(f.root.querySelector('[data-native-output-sha]'))&4,'full identity precedes output');
  assert.equal(f.root.querySelector('[data-native-output-sha]').textContent,run.stages.b.output_sha256);
  const dock=f.root.querySelector('.as-dispatch-controls');assert.equal(dock.tagName,'DETAILS');assert.equal(dock.open,false);
  assert.equal(dock.querySelector('summary').textContent,'More native task actions');
  assert.equal(f.window.getComputedStyle(dock).flexShrink,'0');
  assert.equal(f.window.getComputedStyle(content).overflow,'auto');assert.equal(parseFloat(f.window.getComputedStyle(content).minHeight),0);
  assert.equal(content.contains(dock),false,'secondary scrolling cannot move the action dock out of view');
  id.focus();assert.equal(f.window.document.activeElement,id);id.select();assert.equal(id.selectionEnd-id.selectionStart,36);
  dock.open=true;assert.ok(dock.querySelector('[data-native-retry]'));
  const confirm=dock.querySelector('[data-dispatch-confirm]');confirm.checked=true;confirm.dispatchEvent(new f.window.Event('change',{bubbles:true}));
  assert.equal(f.root.querySelector('.as-dispatch-controls').open,true,'confirming a new action cannot collapse its buttons');
  assert.match(f.root.querySelector('[data-testid="dispatch-recovery-note"]').parentElement.textContent,/Retained UI action history/);
  assert.deepEqual(f.runs.get(run.run_id).spawns,{a:1,b:1});assert.equal(f.calls.length,4);
 }
});

test('real dependency refusal keeps its error and usable recovery controls outside the content scrollport',async t=>{
 for(const width of [1440,390]){
  const f=fixture(t);f.window.happyDOM.setWindowSize({width,height:width===390?844:900});
  await f.act('createNativeRun');f.app.selectNativeTask('b');assert.equal(await f.act('submitTaskDispatch'),false);
  const dock=f.root.querySelector('.as-dispatch-controls'),content=f.root.querySelector('.as-dispatch-content');
  assert.ok(dock,'recovery has an owned action region');assert.equal(dock.tagName,'SECTION');
  assert.equal(content.contains(dock),false);assert.equal(f.window.getComputedStyle(dock).flexShrink,'0');
  for(const selector of ['[data-testid="dispatch-error"]','[data-testid="dispatch-confirm"]','[data-testid="dispatch-repair"]','[data-testid="dispatch-submit"]','[data-native-retry]']){
   const node=dock.querySelector(selector);assert.ok(node,selector);assert.equal(content.contains(node),false,selector);
   assert.equal(node.closest('details'),null,selector+' is not collapsed while blocked');
  }
  assert.match(dock.querySelector('[data-testid="dispatch-error"]').textContent,/task is not ready/);
  const checkbox=dock.querySelector('[data-testid="dispatch-confirm"]');checkbox.focus();assert.equal(document.activeElement,checkbox);
  dock.querySelector('[data-testid="dispatch-repair"]').focus();assert.equal(document.activeElement,dock.querySelector('[data-testid="dispatch-repair"]'));
  content.scrollTop=1000;assert.equal(dock.parentElement,content.parentElement);
  assert.equal(f.calls.length,2);assert.deepEqual(f.runs.get(f.app.state.fixtureRun.run_id).spawns,{a:0,b:0});
  assert.equal(await f.act('repairNamedBlocker'),true);assert.equal(await f.act('retryNativeTask'),true);
  assert.equal(f.calls.length,4);assert.deepEqual(f.runs.get(f.app.state.fixtureRun.run_id).spawns,{a:1,b:1});
 }
});

test('mobile tabs form two balanced rows and explicit owner readback remains outside a collapsed disclosure',async t=>{
 const f=fixture(t);f.window.happyDOM.setWindowSize({width:390,height:844});f.app.update();
 const tabs=f.root.querySelector('.as-tabs');assert.equal(f.window.getComputedStyle(tabs).display,'grid');
 assert.equal(f.window.getComputedStyle(tabs).gridTemplateColumns,'repeat(3, minmax(0, 1fr))');
 assert.deepEqual([...tabs.querySelectorAll('button')].map(node=>node.dataset.tab),['active','dispatch','steering','receipts','health','contract']);
 await f.act('createNativeRun');await f.act('submitTaskDispatch');const run=f.app.state.fixtureRun.run_id;
 f.reopen();await f.act('readNativeRun');
 const read=f.root.querySelector('[data-native-readback="matched"]');assert.ok(read);assert.equal(read.closest('details'),null);
 assert.equal(f.root.querySelector('[data-native-run-id]').value,run);
 assert.equal(f.calls.length,3,'layout and readback presentation add no owner request');
});
