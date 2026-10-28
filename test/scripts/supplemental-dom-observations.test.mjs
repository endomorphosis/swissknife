// Authored DOM/PNG records exercise native collection; no browser/owner acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash,randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {Window} from 'happy-dom';
const r=await import(process.env.SVF_PHASE_RUNNER_CANDIDATE?pathToFileURL(process.env.SVF_PHASE_RUNNER_CANDIDATE).href:new URL('../../scripts/run-visual-functional-workflow.mjs',import.meta.url).href);
const app={app_id:'supplement-unit',disposition:'browser_local',backend_roles:[],primary_workflow:{expected_results:['Actual result'],persist_reopen:'Restored result',error:'Actual failure',recovery:'Actual retry'}};
const extra=(selector='#extra',expected='safe')=>({op:'assert',probe:{kind:'text',selector},operator:'contains',expected});
const scenario=()=>({schema:r.SCENARIO_SCHEMA,app_id:app.app_id,fixture_scope:'svf-supplement-unit',backend_bindings:[],phases:{
 primary_result:[{op:'press',selector:'#run',key:'Enter'},{op:'assert',requirement_id:'result_1',probe:{kind:'text',selector:'#result'},operator:'equals',expected:'ready'}],
 persist_reopen:[{op:'reopen_app'},{op:'assert',requirement_id:'persist_reopen',probe:{kind:'text',selector:'#result'},operator:'equals',expected:'ready'},extra()],
 failure_recovery:[{op:'assert',checkpoint_id:'error_observed',probe:{kind:'text',selector:'#error'},operator:'equals',expected:'failed'},
  {op:'click',selector:'#retry'},{op:'assert',requirement_id:'failure_recovery',probe:{kind:'text',selector:'#result'},operator:'equals',expected:'ready'},extra('#after','safe')]}});
const sha=raw=>createHash('sha256').update(raw).digest('hex');
function observations(s){return r.supplementalScenarioObservations(s).map(row=>({phase:row.phase,step_index:row.step_index,probe:{...row.probe},observed:{operator:row.operator,actual:'safe retained',expected:row.expected}}));}

test('two supplemental text observations preserve the complete original three semantic requirements',()=>{
 const s=scenario();r.validateScenario(s,app);const rows=r.supplementalScenarioObservations(s);
 assert.deepEqual(rows.map(row=>[row.phase,row.step_index]),[['persist_reopen',2],['failure_recovery',3]]);
 assert.deepEqual(Object.values(s.phases).flat().filter(step=>Object.hasOwn(step,'requirement_id')).map(step=>step.requirement_id),['result_1','persist_reopen','failure_recovery']);
 r.validateSupplementalObservations({supplemental_observations:observations(s)},s);
});
test('physical null empty unknown or both identity fields never become supplemental observations',()=>{
 for(const field of ['requirement_id','checkpoint_id'])for(const value of [null,'','unknown',0,false]){
  const s=scenario();s.phases.persist_reopen[2][field]=value;assert.throws(()=>r.validateScenario(s,app));
 }
 const s=scenario();Object.assign(s.phases.persist_reopen[2],{requirement_id:'persist_reopen',checkpoint_id:'error_observed'});assert.throws(()=>r.validateScenario(s,app));
});
test('supplemental rows cannot replace semantics or the mandatory error checkpoint',()=>{
 for(const mutate of [s=>s.phases.persist_reopen.splice(1,1),s=>s.phases.failure_recovery.splice(0,1),
  s=>s.phases.persist_reopen.push(structuredClone(s.phases.persist_reopen[1])),s=>s.phases.persist_reopen[1].requirement_id='unknown']){
  const s=scenario();mutate(s);assert.throws(()=>r.validateScenario(s,app));
 }
});
test('only existing text value and scalar JSON-attribute probes are admitted',()=>{
 for(const probe of [{kind:'value',selector:'#input'},{kind:'json_attribute',selector:'#json',attribute:'data-value',pointer:'/answer'}]){
  const s=scenario();s.phases.persist_reopen[2]={op:'assert',probe,operator:'equals',expected:1};r.validateScenario(s,app);
 }
 for(const mutate of [step=>step.probe.kind='backend_result',step=>step.probe.kind='image_state',step=>step.probe.kind='media_state',
  step=>step.probe.kind='dom_property',step=>step.probe.temporal_ms=100,step=>step.retained_from=null,
  step=>step.expected={},step=>step.expected=[],step=>step.expected=NaN]){
  const s=scenario();mutate(s.phases.persist_reopen[2]);assert.throws(()=>r.validateScenario(s,app));
 }
});
test('eight-row scalar and exact descriptor bounds refuse overflow without truncating',()=>{
 const s=scenario();s.phases.persist_reopen.splice(2);s.phases.failure_recovery.splice(3);
 for(let i=0;i<8;i++)s.phases.primary_result.push(extra());r.validateScenario(s,app);
 s.phases.primary_result.push(extra());assert.throws(()=>r.validateScenario(s,app));s.phases.primary_result.pop();
 const last=s.phases.primary_result.at(-1);last.expected='x'.repeat(510);r.validateScenario(s,app);
 last.expected+='x';assert.throws(()=>r.validateScenario(s,app));
 const exact=scenario();const target=exact.phases.persist_reopen[2];
 for(let i=0;i<5;i++)exact.phases.primary_result.push(extra('#extra','x'.repeat(160)));
 target.expected='';let size=Buffer.byteLength(r.canonicalJSON(r.supplementalScenarioObservations(exact)));
 assert.ok(size<2048);target.expected='x'.repeat(2048-size);assert.equal(Buffer.byteLength(r.canonicalJSON(r.supplementalScenarioObservations(exact))),2048);
 target.expected+='x';assert.throws(()=>r.validateScenario(exact,app));
});
test('actual rows require exact count order source pointer typed expected and passing predicates',()=>{
 const s=scenario();for(const mutate of [rows=>rows.pop(),rows=>rows.reverse(),rows=>rows.push(structuredClone(rows[0])),
  rows=>rows[0].step_index=1,rows=>rows[0].phase='primary_result',rows=>rows[0].probe.selector='#other',
  rows=>rows[0].observed.expected=true,rows=>rows[0].observed.actual='not retained',rows=>rows[0].passed=true,
  rows=>rows[0].observed.actual='x'.repeat(511),rows=>rows[0].observed.actual={}]){
  const rows=observations(s);mutate(rows);assert.throws(()=>r.validateSupplementalObservations({supplemental_observations:rows},s));
 }
 const large=scenario();large.phases.persist_reopen.splice(2);large.phases.failure_recovery.splice(3);
 for(let i=0;i<8;i++)large.phases.primary_result.push(extra('#extra','s'));
 const rows=observations(large).map(row=>({...row,observed:{...row.observed,actual:'s'.repeat(510)}}));
 assert.ok(Buffer.byteLength(r.canonicalJSON(rows))>4096);assert.throws(()=>r.validateSupplementalObservations({supplemental_observations:rows},large));
});
test('scalar JSON types and ECMAScript number byte spelling remain exact',()=>{
 for(const value of [null,true,false,1,1.0,-0,1e-7,1e20,'1']){
  const s=scenario();s.phases.persist_reopen[2]={op:'assert',probe:{kind:'value',selector:'#input'},operator:'equals',expected:value};
  const rows=observations(s);rows[0].observed={operator:'equals',actual:value,expected:value};r.validateScenario(s,app);r.validateSupplementalObservations({supplemental_observations:rows},s);
 }
 const s=scenario();s.phases.persist_reopen[2].expected=1;const rows=observations(s);rows[0].observed.expected='1';assert.throws(()=>r.validateSupplementalObservations({supplemental_observations:rows},s));
});

function domSession(s=scenario()){
 const window=new Window();let root=window.document.createElement('div');window.document.body.append(root);
 root.innerHTML='<button id="run">Run</button><div id="result">ready</div><div id="error">failed</div><button id="retry">Retry</button><div id="extra">safe retained</div><div id="after">safe retried</div><input id="input" value="real input"><div id="json" data-value=\'{"answer":1}\'></div>';
 const handle=node=>({evaluate:async(fn,arg)=>fn(node,arg),dispose:async()=>{}});
 const locator=selector=>({count:async()=>root.querySelectorAll(selector).length,elementHandle:async()=>handle(root.querySelector(selector)),
  evaluate:async(fn,arg)=>fn(root.querySelector(selector),arg),scrollIntoViewIfNeeded:async()=>{},focus:async()=>root.querySelector(selector).focus(),press:async()=>{},click:async()=>{}});
 const session={app,scenario:s,generation:1,actual_desktop:false,phase_evidence:{schema:r.PHASE_EVIDENCE_SCHEMA,phases:[]},phase_evidence_started:performance.now(),
  primary:{locator},window:{elementHandle:async()=>handle(root)},assertActive:async()=>{},semantic_assertions:[],checkpoints:[],supplemental_observations:[],
  keyboard_focus_observations:[],temporal_observations:[],backend_records:[],backend_observations:[],backend_policy_errors:[],unexpected_backend_calls:0,
  reopen:async()=>{const next=root.cloneNode(true);root.replaceWith(next);root=next;session.generation++;}};
 return{session,window,root:()=>root};
}
test('real phase executor captures separate native DOM rows and grants no semantic/error/owner credit',async()=>{
 const f=domSession();for(const phase of r.PHASES)await r.executeScenarioPhase(f.session,phase,f.session.scenario.phases[phase]);
 assert.equal(f.session.supplemental_observations.length,2);assert.equal(f.session.semantic_assertions.length,3);assert.equal(f.session.checkpoints.length,1);
 assert.equal(f.session.backend_observations.length,0);assert.equal(f.session.keyboard_focus_observations.filter(row=>row.semantic_requirement_id).length,1);
 r.validateSupplementalObservations(f.session,f.session.scenario);
 r.validatePhaseEvidence({semantic_assertions:f.session.semantic_assertions,error_observations:f.session.checkpoints,
  supplemental_observations:f.session.supplemental_observations,temporal_observations:[],phase_evidence:f.session.phase_evidence},f.session.scenario);
});
test('real collector reads native input values and scalar JSON attributes through existing probes',async()=>{
 const s=scenario();s.phases.primary_result.push(
  {op:'assert',probe:{kind:'value',selector:'#input'},operator:'equals',expected:'real input'},
  {op:'assert',probe:{kind:'json_attribute',selector:'#json',attribute:'data-value',pointer:'/answer'},operator:'equals',expected:1});
 const f=domSession(s);for(const phase of r.PHASES)await r.executeScenarioPhase(f.session,phase,s.phases[phase]);
 assert.deepEqual(f.session.supplemental_observations.slice(0,2).map(row=>row.observed.actual),['real input',1]);
 assert.equal(f.session.semantic_assertions.length,3);assert.equal(f.session.checkpoints.length,1);r.validateSupplementalObservations(f.session,s);
});
test('supplemental error text does not establish errorObserved or satisfy recovery',async()=>{
 const s=scenario();s.phases.persist_reopen.splice(2);s.phases.failure_recovery=[extra('#error','failed'),{op:'click',selector:'#retry'},s.phases.failure_recovery[2]];
 const f=domSession(s);await assert.rejects(()=>r.executeScenarioPhase(f.session,'failure_recovery',s.phases.failure_recovery),/recovery needs an observed error/);
 assert.equal(f.session.checkpoints.length,0);assert.equal(f.session.semantic_assertions.length,0);assert.equal(f.session.supplemental_observations.length,1);
});
test('actual oversized or composite native DOM values refuse before any successful extra row',async()=>{
 for(const value of ['x'.repeat(511),{answer:1}]){
  const s=scenario();s.phases.persist_reopen.splice(2);s.phases.failure_recovery.splice(3);
  s.phases.primary_result.unshift({op:'assert',probe:value&&typeof value==='object'?{kind:'json_attribute',selector:'#json',attribute:'data-value'}:{kind:'text',selector:'#extra'},operator:'not_equals',expected:'different'});
  const f=domSession(s);if(typeof value==='string')f.root().querySelector('#extra').textContent=value;
  await assert.rejects(()=>r.executeScenarioPhase(f.session,'primary_result',s.phases.primary_result),/scalar/);assert.equal(f.session.supplemental_observations.length,0);
 }
});
test('V1 entry rejects supplements before output directories drivers or browser resources',async()=>{
 const s=scenario(),launch={runtime_app_id:app.app_id,canonical_launcher:'.desktop-icons .icon[data-app="supplement-unit"]',window_selector:'.window[data-app-id="supplement-unit"]',primary_content_selector:'.window-app-content'};
 await assert.rejects(()=>r.openRealDesktopSession({app:{...app,launch},scenario:s,outputDir:'/must-not-be-created'}, {kind:'explicit-dom-unit-driver'}),/before resource acquisition/);
 assert.equal(fs.existsSync('/must-not-be-created'),false);
 const f=domSession(s);delete f.session.phase_evidence;await assert.rejects(()=>r.executeScenarioPhase(f.session,'primary_result',s.phases.primary_result),/V2/);assert.equal(f.session.semantic_assertions.length,0);
});

async function childFixture(t){
 const f=domSession();for(const phase of r.PHASES)await r.executeScenarioPhase(f.session,phase,f.session.scenario.phases[phase]);
 const workspaceRoot=fs.mkdtempSync(path.join(os.tmpdir(),'svf-supplement-child-'));t.after(()=>fs.rmSync(workspaceRoot,{recursive:true,force:true}));
 const viewport=r.VIEWPORTS[0],outputDir=path.join(workspaceRoot,'run'),prefix='run/desktop';
 const write=(name,bytes)=>{const p=path.join(workspaceRoot,prefix,name);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,bytes);return{path:path.relative(workspaceRoot,p),sha256:sha(bytes),bytes:bytes.length};};
 const png=Buffer.alloc(129);png.write('89504e470d0a1a0a',0,'hex');png.write('IHDR',12);png.writeUInt32BE(viewport.width,16);png.writeUInt32BE(viewport.height,20);
 const layout={viewport:{width:viewport.width,height:viewport.height},window:{left:0,top:0,right:viewport.width,bottom:viewport.height},primary:{left:10,top:10,width:800,height:600},text_length:12,control_count:2,media_count:0,violations:[]};
 const artifacts=[write('desktop.png',png),write('desktop-layout.json',Buffer.from(JSON.stringify(layout))),write('trace.zip',Buffer.from('authored trace'))];
 const sources={contract_sha256:'1'.repeat(64),scenario_sha256:'2'.repeat(64),source_sha256:{'authored/source.js':'3'.repeat(64)}};
 Object.assign(f.session,{viewport,initial_viewport:viewport,session_id:randomUUID()});
 const built=r.buildViewportWorkflowEvidence({app,scenario:f.session.scenario,sources,session:f.session,viewports:[{name:'desktop',layout}],artifacts});
 assert.equal(built.passed,false);assert.equal(built.actual_desktop,false);
 const report=JSON.parse(JSON.stringify({...built,passed:true,actual_desktop:true}));const options={app,scenario:f.session.scenario,sources,viewport,outputDir,workspaceRoot,reference:null};
 const save=()=>{options.reference=write('workflow.json',Buffer.from(JSON.stringify(report,null,2)+'\n'));};save();return{report,options,save};
}
test('complete V2 parent validation retains supplemental rows through child rebuild and phase joins',async t=>{
 const f=await childFixture(t);r.validateViewportWorkflowReport(f.report,f.options);assert.equal(f.report.supplemental_observations.length,2);
});
test('complete parent refuses row forgery missing phase evidence and detached phase observed values',async t=>{
 for(const mutate of [f=>f.report.supplemental_observations.pop(),f=>f.report.supplemental_observations.reverse(),
  f=>delete f.report.phase_evidence,f=>f.report.supplemental_observations[0].observed.actual='safe fabricated',
  f=>f.report.phase_evidence.phases[1].steps[2].observed.actual='safe fabricated']){
  const f=await childFixture(t);mutate(f);f.save();assert.throws(()=>r.validateViewportWorkflowReport(f.report,f.options));
 }
});
test('legacy no-extra V2 field absence remains unchanged',async t=>{
 const s=scenario();s.phases.persist_reopen.splice(2);s.phases.failure_recovery.splice(3);r.validateScenario(s,app);
 assert.deepEqual(r.validateSupplementalObservations({},s),[]);
 assert.throws(()=>r.validateSupplementalObservations({supplemental_observations:observations(scenario())},s));
});
