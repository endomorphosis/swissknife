// Authored PNG/DOM boundary vectors only; no browser, owner call or acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash, randomUUID} from 'node:crypto';
import {deflateSync} from 'node:zlib';
import {pathToFileURL} from 'node:url';
const root=process.env.SVF_FOUNDATION_REPOSITORY_ROOT||path.resolve(import.meta.dirname,'../../..');
const r=await import(process.env.SVF_PHASE_RUNNER_CANDIDATE?pathToFileURL(process.env.SVF_PHASE_RUNNER_CANDIDATE).href:new URL('../../scripts/run-visual-functional-workflow.mjs',import.meta.url).href);
const scenarioPath=process.env.SVF_NEURAL_SCENARIO_CANDIDATE||path.resolve(import.meta.dirname,'../e2e/functional-workflows/neural-photoshop.json');
// Keep the original E checkpoint fixtures historical; full opt-in tests follow below.
const scenario=()=>{const value=JSON.parse(fs.readFileSync(scenarioPath));value.phases.failure_recovery=value.phases.failure_recovery.filter(step=>step.checkpoint_id!=='recovery_image_retained');return value;};
const app=JSON.parse(fs.readFileSync(path.join(root,'swissknife/config/visual-functional-app-contracts.json'))).apps.find(x=>x.app_id==='neural-photoshop');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function png(red=41,width=64,height=48){
 function crc(bytes){let x=0xffffffff;for(const b of bytes){x^=b;for(let i=0;i<8;i++)x=(x>>>1)^((x&1)?0xedb88320:0);}return(x^0xffffffff)>>>0;}
 function chunk(tag,data){const type=Buffer.from(tag),size=Buffer.alloc(4),sum=Buffer.alloc(4);size.writeUInt32BE(data.length);sum.writeUInt32BE(crc(Buffer.concat([type,data])));return Buffer.concat([size,type,data,sum]);}
 const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(width);ihdr.writeUInt32BE(height,4);ihdr[8]=8;ihdr[9]=6;
 const raw=Buffer.alloc(height*(width*4+1));for(let y=0;y<height;y++)for(let x=0;x<width;x++){let at=y*(width*4+1)+1+x*4;raw[at]=red;raw[at+3]=255;}
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
}
function fixture(){
 const s=scenario(),bytes=png(),ref={path:'authored/decoded.png',sha256:sha(bytes),bytes:bytes.length};
 const entries=[['primary_result',11],['persist_reopen',6],['failure_recovery',5]];
 const rows=entries.map(([phase,index])=>({phase,step_index:index,selector:s.phases[phase][index].probe.selector,
  decoded:true,natural_width:64,natural_height:48,visible_area:3072,content_sha256:sha(bytes),
  source_sha256:sha('data:image/png;base64,'+bytes.toString('base64')),image_artifact:ref}));
 const record=(phase,index)=>{const step=s.phases[phase][index];return{phase,step_index:index,probe:step.probe,
  ...(step.checkpoint_id?{checkpoint_id:step.checkpoint_id}:{requirement_id:step.requirement_id}),
  observed:{operator:step.operator,actual:step.expected,expected:step.expected}};};
 const report={artifacts:[ref],image_observations:rows,semantic_assertions:[record('primary_result',11),record('persist_reopen',6)],
  error_observations:[record('failure_recovery',4),record('failure_recovery',5)]};
 return{s,bytes,report,read:record=>{assert.equal(record.path,ref.path);return bytes;}};
}

test('canonical scenario retains old semantics and has one source-bound pre-retry image checkpoint',()=>{
 const s=scenario();r.validateScenario(s,app);const cp=r.errorImageRetentionCheckpoint(s);
 assert.equal(cp.index,5);assert.deepEqual(cp.step.retained_from,{primary_result:11,persist_reopen:6});
 assert.equal(s.phases.failure_recovery[4].checkpoint_id,'error_observed');
 assert.equal(s.phases.failure_recovery[6].op,'fill');assert.equal(s.phases.failure_recovery[6].value,'bafkreiefsedovka56qbpo5s4o2mpfq2zbhdknta7rqarqjljugxdmpriue');
 const ids=Object.values(s.phases).flat().filter(x=>x.requirement_id).map(x=>x.requirement_id);assert.deepEqual(ids,['result_1','persist_reopen','failure_recovery']);
 assert.equal(s.phases.failure_recovery.at(-1).expected,'859106eaa81df402f7765c7698f2c35909c6a6cc1f8c01182569a1ae363e28a1');
});
test('legacy single error checkpoint remains admitted',()=>{const s=scenario();s.phases.failure_recovery.splice(5,1);r.validateScenario(s,app);assert.equal(r.errorImageRetentionCheckpoint(s),null);});
test('unknown duplicate misplaced post-retry and non-image checkpoints refuse',()=>{
 for(const mutate of [s=>s.phases.failure_recovery[5].checkpoint_id='unknown',s=>s.phases.failure_recovery.push(structuredClone(s.phases.failure_recovery[5])),
  s=>s.phases.failure_recovery.unshift(s.phases.failure_recovery.splice(5,1)[0]),s=>s.phases.failure_recovery.splice(7,0,s.phases.failure_recovery.splice(5,1)[0]),
  s=>s.phases.failure_recovery[5].probe.kind='text',s=>s.phases.failure_recovery[5].retained_from.primary_result=0,
  s=>s.phases.failure_recovery[5].retained_from.extra=11,s=>s.phases.failure_recovery[5].retained_from.persist_reopen=true]){
   const s=scenario();mutate(s);assert.throws(()=>r.validateScenario(s,app));
 }
});
test('all three real encoded-PNG artifacts join to exact original image assertions',()=>{const f=fixture();r.validateDecodedImageObservations(f.report,f.s,f.read);r.validateErrorImageCheckpointObservations(f.report,f.s);});
test('self-consistent changed error PNG refuses even with matching dimensions and refreshed hashes',()=>{
 const f=fixture(),other=png(92),row=f.report.image_observations[2],ref={path:'authored/changed.png',sha256:sha(other),bytes:other.length};
 row.content_sha256=sha(other);row.source_sha256=sha('data:image/png;base64,'+other.toString('base64'));row.image_artifact=ref;f.report.artifacts.push(ref);
 assert.throws(()=>r.validateDecodedImageObservations(f.report,f.s,ref=>ref.path==='authored/changed.png'?other:f.bytes),/saved PNG bytes\/source\/dimensions changed/);
});
test('missing duplicate wrong-step or selector-detached native baseline/error rows refuse',()=>{
 for(const mutate of [f=>f.report.image_observations.pop(),f=>f.report.image_observations.push(structuredClone(f.report.image_observations[0])),
  f=>f.report.image_observations[2].step_index=11,f=>f.report.image_observations[0].selector='#unrelated-image',f=>f.report.image_observations[2].source_sha256='0'.repeat(64)]){
  const f=fixture();mutate(f);assert.throws(()=>r.validateDecodedImageObservations(f.report,f.s,f.read));
 }
});
test('child checkpoint joins refuse missing reordered altered or detached assertion records',()=>{
 for(const mutate of [f=>f.report.error_observations.pop(),f=>f.report.error_observations.reverse(),f=>f.report.error_observations[1].step_index=6,
  f=>f.report.error_observations[1].observed.actual=63,f=>f.report.error_observations[0].probe={kind:'text',selector:'#fake'},
  f=>f.report.error_observations[1].checkpoint_id='error_observed']){
  const f=fixture();mutate(f);assert.throws(()=>r.validateErrorImageCheckpointObservations(f.report,f.s));
 }
});

test('real phase executor reads session scenario and refuses an authored error image without owned capture',async()=>{
 const image={kind:'image_state',selector:'#saved',pointer:'/natural_width'};
 const scenario={phases:{primary_result:[{op:'assert',requirement_id:'result_1',probe:image,operator:'equals',expected:64}],
  persist_reopen:[{op:'reopen_app'},{op:'assert',requirement_id:'persist_reopen',probe:image,operator:'equals',expected:64}],
  failure_recovery:[{op:'assert',checkpoint_id:'error_observed',probe:{kind:'text',selector:'#error'},operator:'equals',expected:'bad read'},
   {op:'assert',checkpoint_id:'error_image_retained',retained_from:{primary_result:0,persist_reopen:1},probe:image,operator:'equals',expected:64},
   {op:'click',selector:'#retry'},{op:'assert',requirement_id:'failure_recovery',probe:{kind:'text',selector:'#result'},operator:'equals',expected:'okay'}]}};
 const bytes=png(),source='data:image/png;base64,'+bytes.toString('base64');let retry=0,reads=0;
 const native={decoded:true,natural_width:64,natural_height:48,visible_area:3072,native_source:source};
 function locator(selector){return{count:async()=>selector==='#retry'?0:1,evaluate:async()=>false,
  elementHandle:async()=>({evaluate:async(fn,arg)=>{if(fn.name==='readElementObservation'){if(arg.kind==='text')return'bad read';reads++;return{...native};}throw new Error('unexpected authored DOM boundary');},dispose:async()=>{}}),
  scrollIntoViewIfNeeded:async()=>{},click:async()=>{retry++;}};}
 const prior=(phase,step_index)=>({phase,step_index,selector:'#saved',...r.encodedPNGObservation(native).state,image_artifact:{path:'authored/prior.png',sha256:sha(bytes),bytes:bytes.length}});
 const session={app:{primary_workflow:{expected_results:['saved image'],persist_reopen:'reopen',error:'bad read',recovery:'retry'}},scenario,
  primary:{locator},generation:2,phase_evidence:{},phase_evidence_started:performance.now(),actual_desktop:true,
  image_observations:[prior('primary_result',0),prior('persist_reopen',1)],semantic_assertions:[],checkpoints:[],temporal_observations:[],
  assertActive:async()=>{}};
 await assert.rejects(()=>r.executeScenarioPhase(session,'failure_recovery',scenario.phases.failure_recovery),/real encoded PNG artifacts/);
 assert.equal(reads,1);assert.equal(retry,0);assert.equal(session.image_observations.at(-1).phase,'failure_recovery');
 assert.equal(session.image_observations.at(-1).step_index,1);assert.equal(session.image_observations.at(-1).image_artifact,null);
});

// This complete public child-validator fixture is authored and cannot pass the
// private actual-session promotion gate. It exercises parent aggregation itself.
function fullChildFixture(t,{retained=true,temporal=false}={}){
 const workspaceRoot=fs.mkdtempSync(path.join(os.tmpdir(),'svf-parent-image-'));
 t.after(()=>fs.rmSync(workspaceRoot,{recursive:true,force:true}));
 const outputDir=path.join(workspaceRoot,'run'),viewport=r.VIEWPORTS[0],prefix='run/desktop';
 const app={app_id:'authored-image',disposition:'browser_local',backend_roles:[],primary_workflow:{expected_results:['Saved image'],persist_reopen:'Saved image reopens',error:'Failed read',recovery:'Retry'}};
 const image=retained?{kind:'image_state',selector:'#saved',pointer:'/natural_width'}:{kind:'text',selector:'#saved'};
 const savedValue=retained?64:'saved';
 const scenario={schema:r.SCENARIO_SCHEMA,app_id:app.app_id,fixture_scope:'svf-authored-parent-image',backend_bindings:[],phases:{
  primary_result:[{op:'press',selector:'#save',key:'Enter'},{op:'assert',requirement_id:'result_1',probe:image,operator:'equals',expected:savedValue}],
  persist_reopen:[{op:'reopen_app'},{op:'assert',requirement_id:'persist_reopen',probe:image,operator:'equals',expected:savedValue}],
  failure_recovery:[{op:'assert',checkpoint_id:'error_observed',probe:temporal?{kind:'dom_property',selector:'#error',property:'scrollTop',temporal_ms:100}:{kind:'text',selector:'#error'},operator:'equals',expected:temporal?0:'bad read'},
   ...(retained?[{op:'assert',checkpoint_id:'error_image_retained',retained_from:{primary_result:1,persist_reopen:1},probe:image,operator:'equals',expected:64}]:[]),
   {op:'click',selector:'#retry'},{op:'assert',requirement_id:'failure_recovery',probe:{kind:'text',selector:'#result'},operator:'equals',expected:'recovered'}]}};
 const semantics=r.requiredSemantics(app),observed=(phase,index)=>{const step=scenario.phases[phase][index];return{phase,step_index:index,probe:step.probe,
  ...(step.requirement_id?{requirement_id:step.requirement_id,requirement_text:semantics[step.requirement_id]}:{checkpoint_id:step.checkpoint_id}),
  observed:{operator:step.operator,actual:step.expected,expected:step.expected}};};
 const sources={contract_sha256:'1'.repeat(64),scenario_sha256:'2'.repeat(64),source_sha256:{'authored/source.js':'3'.repeat(64)}};
 const layout={viewport:{width:viewport.width,height:viewport.height},primary:{left:20,top:20,width:800,height:600},window:{left:0,top:0,right:viewport.width,bottom:viewport.height},text_length:12,control_count:2,media_count:1,violations:[]};
 function write(name,bytes){const target=path.join(workspaceRoot,prefix,name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes);return{path:path.relative(workspaceRoot,target),sha256:sha(bytes),bytes:bytes.length};}
 const saved=png(),imageArtifact=write('decoded-images/saved.png',saved),screen=write('desktop.png',png(12,viewport.width,viewport.height)),layoutArtifact=write('desktop-layout.json',Buffer.from(JSON.stringify(layout))),trace=write('trace.zip',Buffer.from('authored trace; no Chrome execution'));
 const row=(phase,index)=>({phase,step_index:index,selector:'#saved',...r.encodedPNGObservation({decoded:true,natural_width:64,natural_height:48,visible_area:3072,native_source:'data:image/png;base64,'+saved.toString('base64')}).state,image_artifact:imageArtifact});
 const session={viewport,initial_viewport:viewport,session_id:randomUUID(),actual_desktop:true,unexpected_backend_calls:0,backend_policy_errors:[],backend_records:[],backend_observations:[],
  semantic_assertions:[observed('primary_result',1),observed('persist_reopen',1),observed('failure_recovery',scenario.phases.failure_recovery.length-1)],
  checkpoints:[observed('failure_recovery',0),...(retained?[observed('failure_recovery',1)]:[])],
  keyboard_focus_observations:[{phase:'primary_result',step_index:0,key:'Enter',focused:true,inside_app:true,semantic_requirement_id:'result_1'}],
  temporal_observations:temporal?[{before:3,after:3,sample_ms:100}]:[],image_observations:retained?[row('primary_result',1),row('persist_reopen',1),row('failure_recovery',1)]:[]};
 const built=r.buildViewportWorkflowEvidence({app,scenario,sources,session,viewports:[{name:'desktop',layout}],artifacts:[screen,layoutArtifact,trace,imageArtifact]});
 assert.equal(built.passed,false);assert.equal(built.actual_desktop,false);
 const report={...built,passed:true,actual_desktop:true};
 const options={app,scenario,sources,viewport,outputDir,workspaceRoot,reference:null};
 const save=()=>{options.reference=write('workflow.json',Buffer.from(JSON.stringify(report,null,2)+'\n'));};save();
 return{report,options,save};
}

test('complete parent validator accepts exact optional two-checkpoint native PNG child',t=>{const f=fullChildFixture(t);assert.equal(r.validateViewportWorkflowReport(f.report,f.options),f.report);});
test('complete parent validator preserves historical single-checkpoint without image facts and actual error temporal joins',t=>{
 const f=fullChildFixture(t,{retained:false,temporal:true});r.validateViewportWorkflowReport(f.report,f.options);
 f.report.temporal_observations[0].after=4;f.save();assert.throws(()=>r.validateViewportWorkflowReport(f.report,f.options),/temporal delta/);
});
test('complete parent validator refuses missing extra or unknown optional error records',t=>{
 for(const mutate of [f=>f.report.error_observations.pop(),f=>f.report.error_observations.push(structuredClone(f.report.error_observations[1])),f=>f.report.error_observations[1].checkpoint_id='unknown']){
  const f=fullChildFixture(t);mutate(f);f.save();assert.throws(()=>r.validateViewportWorkflowReport(f.report,f.options));
 }
});
test('captured actual desktop/mobile child bodies replay through complete parent validator without browser',
 {skip:!process.env.SVF_ERROR_IMAGE_CAPTURED_ATTEMPT},()=>{
 const outputDir=process.env.SVF_ERROR_IMAGE_CAPTURED_ATTEMPT;
 for(const viewport of r.VIEWPORTS){const file=path.join(outputDir,viewport.name,'workflow.json'),raw=fs.readFileSync(file),report=JSON.parse(raw);
  const options={app,scenario:scenario(),sources:Object.fromEntries(['contract_sha256','scenario_sha256','source_sha256'].map(key=>[key,report[key]])),viewport,
   reference:{path:path.relative(root,file).split(path.sep).join('/'),sha256:sha(raw),bytes:raw.length},outputDir,workspaceRoot:root};
  assert.equal(r.validateViewportWorkflowReport(report,options),report);
 }
});

// Additive post-retry PNG checkpoint; full canonical scenario, no browser acceptance.
{
const scenario=()=>JSON.parse(fs.readFileSync(scenarioPath));
const sourceSha='859106eaa81df402f7765c7698f2c35909c6a6cc1f8c01182569a1ae363e28a1';
test('known original source SHA strengthens fallback and all original scenario fields remain exact',()=>{
 const s=scenario();r.validateScenario(s,app);
 assert.deepEqual(s.backend_bindings[0].result_assertion,{pointer:'/result/result/content/0/json/sha256',operator:'equals',expected:sourceSha});
 assert.equal(s.phases.failure_recovery[11].requirement_id,'failure_recovery');
 assert.equal(s.phases.failure_recovery[11].expected,sourceSha);
 const post=s.phases.failure_recovery.pop();assert.equal(post.checkpoint_id,'recovery_image_retained');
 assert.deepEqual(post.retained_from,{primary_result:11,persist_reopen:6});
 s.backend_bindings[0].result_assertion={pointer:'/result/result/content/0/json/cid',operator:'equals',expected:s.phases.primary_result[0].value};
 assert.equal(sha(JSON.stringify(s,null,2)+'\n'),'64503bf914a91f2ed5a0d2d902d6b8d3eb3779ce8e4e7ccdfe44508a0933aec8');
});
test('legacy one/two-checkpoint grammar remains admitted and post-only opt-in is bounded',()=>{
 const s=scenario();assert.equal(r.recoveryImageRetentionCheckpoint(s).index,12);
 s.phases.failure_recovery.pop();r.validateScenario(s,app);assert.equal(r.recoveryImageRetentionCheckpoint(s),null);
 s.phases.failure_recovery.splice(5,1);r.validateScenario(s,app);assert.equal(r.errorImageRetentionCheckpoint(s),null);
 const post=scenario();post.phases.failure_recovery.splice(5,1);r.validateScenario(post,app);assert.equal(r.recoveryImageRetentionCheckpoint(post).index,11);
});
test('unknown duplicate wrong-type reordered unbound and action-detached post-checkpoints refuse',()=>{
 const mutations=[s=>s.phases.failure_recovery.at(-1).checkpoint_id='unknown',s=>s.phases.failure_recovery.push(structuredClone(s.phases.failure_recovery.at(-1))),
  s=>s.phases.failure_recovery.splice(11,0,s.phases.failure_recovery.pop()),s=>s.phases.failure_recovery.splice(5,0,s.phases.failure_recovery.pop()),
  s=>s.phases.failure_recovery.at(-1).probe.kind='text',s=>s.phases.failure_recovery.at(-1).probe.temporal_ms=100,
  s=>s.phases.failure_recovery.at(-1).retained_from.primary_result=0,s=>s.phases.failure_recovery.at(-1).retained_from.persist_reopen=true,
  s=>s.phases.failure_recovery.at(-1).retained_from.extra=0,s=>delete s.phases.failure_recovery.at(-1).retained_from,
  s=>s.phases.failure_recovery.push({op:'click',selector:'#new-owner-action'}),s=>s.phases.failure_recovery.splice(12,0,{op:'click',selector:'#changed-image'}),
  s=>s.phases.failure_recovery.at(-1).requirement_id='failure_recovery',s=>s.phases.failure_recovery.splice(6,3),
  s=>s.phases.primary_result.push(s.phases.failure_recovery.pop())];
 for(const mutate of mutations){const s=scenario();mutate(s);assert.throws(()=>r.validateScenario(s,app));}
});
function fixture(){
 const s=scenario(),bytes=png(),ref={path:'authored/saved.png',sha256:sha(bytes),bytes:bytes.length};
 const entries=[['primary_result',11],['persist_reopen',6],['failure_recovery',5],['failure_recovery',12]];
 const rows=entries.map(([phase,index])=>({phase,step_index:index,selector:s.phases[phase][index].probe.selector,
  ...r.encodedPNGObservation({decoded:true,natural_width:64,natural_height:48,visible_area:3072,native_source:'data:image/png;base64,'+bytes.toString('base64')}).state,image_artifact:ref}));
 const record=(phase,index)=>{const step=s.phases[phase][index];return{phase,step_index:index,probe:step.probe,
  ...(step.checkpoint_id?{checkpoint_id:step.checkpoint_id}:{requirement_id:step.requirement_id}),
  observed:{operator:step.operator,actual:step.expected,expected:step.expected}};};
 const report={artifacts:[ref],image_observations:rows,semantic_assertions:[record('primary_result',11),record('persist_reopen',6),record('failure_recovery',11)],
  error_observations:[record('failure_recovery',4),record('failure_recovery',5),record('failure_recovery',12)]};
 return{s,bytes,report,read:record=>{assert.equal(record.path,ref.path);return bytes;}};
}
test('four encoded PNG snapshots and three exact checkpoint observations join to the original sources',()=>{
 const f=fixture();r.validateDecodedImageObservations(f.report,f.s,f.read);r.validateErrorImageCheckpointObservations(f.report,f.s);
});
test('pre-retry execution does not demand a future snapshot while final validation still requires it',()=>{
 const f=fixture();f.report.image_observations.pop();
 r.validateErrorImageRetention(f.report,f.s,{beforeRecovery:true});
 assert.throws(()=>r.validateErrorImageRetention(f.report,f.s),/unique source-bound native observation/);
});
test('self-consistent different PNG after retry refuses despite same dimensions and refreshed artifact hashes',()=>{
 const f=fixture(),other=png(99),post=f.report.image_observations.at(-1),ref={path:'authored/other.png',sha256:sha(other),bytes:other.length};
 Object.assign(post,{content_sha256:sha(other),source_sha256:sha('data:image/png;base64,'+other.toString('base64')),image_artifact:ref});f.report.artifacts.push(ref);
 assert.throws(()=>r.validateDecodedImageObservations(f.report,f.s,ref=>ref.path==='authored/other.png'?other:f.bytes),/saved PNG bytes\/source\/dimensions changed/);
});
test('missing duplicate detached post-PNG and missing reordered changed checkpoint observations refuse',()=>{
 for(const mutate of [f=>f.report.image_observations.pop(),f=>f.report.image_observations.push(structuredClone(f.report.image_observations.at(-1))),
  f=>f.report.image_observations.at(-1).step_index=11,f=>f.report.image_observations.at(-1).source_sha256='0'.repeat(64),
  f=>f.report.error_observations.pop(),f=>f.report.error_observations.reverse(),f=>f.report.error_observations.at(-1).observed.actual=63]){
  const f=fixture();mutate(f);assert.throws(()=>{r.validateDecodedImageObservations(f.report,f.s,f.read);r.validateErrorImageCheckpointObservations(f.report,f.s);});
 }
});

function fullChild(t,{pre=true,post=true}={}){
 const workspaceRoot=fs.mkdtempSync(path.join(os.tmpdir(),'svf-recovery-image-'));t.after(()=>fs.rmSync(workspaceRoot,{recursive:true,force:true}));
 const outputDir=path.join(workspaceRoot,'run'),viewport=r.VIEWPORTS[0],prefix='run/desktop';
 const app={app_id:'authored-image',disposition:'browser_local',backend_roles:[],primary_workflow:{expected_results:['Saved image'],persist_reopen:'Saved image reopens',error:'Failed read',recovery:'Retry'}};
 const image={kind:'image_state',selector:'#saved',pointer:'/natural_width'},retained_from={primary_result:1,persist_reopen:1};
 const scenario={schema:r.SCENARIO_SCHEMA,app_id:app.app_id,fixture_scope:'svf-authored-recovery-image',backend_bindings:[],phases:{
  primary_result:[{op:'press',selector:'#save',key:'Enter'},{op:'assert',requirement_id:'result_1',probe:image,operator:'equals',expected:64}],
  persist_reopen:[{op:'reopen_app'},{op:'assert',requirement_id:'persist_reopen',probe:image,operator:'equals',expected:64}],
  failure_recovery:[{op:'assert',checkpoint_id:'error_observed',probe:{kind:'text',selector:'#error'},operator:'equals',expected:'bad read'},
   ...(pre?[{op:'assert',checkpoint_id:'error_image_retained',retained_from,probe:image,operator:'equals',expected:64}]:[]),
   {op:'click',selector:'#retry'},{op:'assert',requirement_id:'failure_recovery',probe:{kind:'text',selector:'#result'},operator:'equals',expected:'recovered'},
   ...(post?[{op:'assert',checkpoint_id:'recovery_image_retained',retained_from,probe:image,operator:'equals',expected:64}]:[])]}};
 const semantics=r.requiredSemantics(app),records=Object.entries(scenario.phases).flatMap(([phase,steps])=>steps.flatMap((step,step_index)=>step.op==='assert'?[{phase,step_index,probe:step.probe,
  ...(step.requirement_id?{requirement_id:step.requirement_id,requirement_text:semantics[step.requirement_id]}:{checkpoint_id:step.checkpoint_id}),
  observed:{operator:step.operator,actual:step.expected,expected:step.expected}}]:[]));
 const sources={contract_sha256:'1'.repeat(64),scenario_sha256:'2'.repeat(64),source_sha256:{'authored/source.js':'3'.repeat(64)}};
 const layout={viewport:{width:viewport.width,height:viewport.height},primary:{left:20,top:20,width:800,height:600},window:{left:0,top:0,right:viewport.width,bottom:viewport.height},text_length:12,control_count:2,media_count:1,violations:[]};
 function write(name,bytes){const target=path.join(workspaceRoot,prefix,name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes);return{path:path.relative(workspaceRoot,target),sha256:sha(bytes),bytes:bytes.length};}
 const bytes=png(),imageArtifact=write('decoded-images/saved.png',bytes),screen=write('desktop.png',png(12,viewport.width,viewport.height)),layoutArtifact=write('desktop-layout.json',Buffer.from(JSON.stringify(layout))),trace=write('trace.zip',Buffer.from('authored trace; no browser'));
 const session={viewport,initial_viewport:viewport,session_id:randomUUID(),actual_desktop:true,unexpected_backend_calls:0,backend_policy_errors:[],backend_records:[],backend_observations:[],
  semantic_assertions:records.filter(row=>row.requirement_id),checkpoints:records.filter(row=>row.checkpoint_id),
  keyboard_focus_observations:[{phase:'primary_result',step_index:0,key:'Enter',focused:true,inside_app:true,semantic_requirement_id:'result_1'}],temporal_observations:[],
  image_observations:records.filter(row=>row.probe.kind==='image_state').map(row=>({phase:row.phase,step_index:row.step_index,selector:row.probe.selector,
   ...r.encodedPNGObservation({decoded:true,natural_width:64,natural_height:48,visible_area:3072,native_source:'data:image/png;base64,'+bytes.toString('base64')}).state,image_artifact:imageArtifact}))};
 const built=r.buildViewportWorkflowEvidence({app,scenario,sources,session,viewports:[{name:'desktop',layout}],artifacts:[screen,layoutArtifact,trace,imageArtifact]});
 assert.equal(built.passed,false);assert.equal(built.actual_desktop,false);const report={...built,passed:true,actual_desktop:true};
 const options={app,scenario,sources,viewport,outputDir,workspaceRoot,reference:null};
 const save=()=>{options.reference=write('workflow.json',Buffer.from(JSON.stringify(report,null,2)+'\n'));};save();return{report,options,save,write,bytes};
}
test('complete public parent validator accepts four native IMG facts and exact three-checkpoint body',t=>{
 const f=fullChild(t);assert.equal(f.report.image_observations.length,4);assert.equal(f.report.error_observations.length,3);r.validateViewportWorkflowReport(f.report,f.options);
});
test('complete parent preserves one/two old checkpoints and post-only optional branch',t=>{
 for(const settings of [{pre:false,post:false},{pre:true,post:false},{pre:false,post:true}]){const f=fullChild(t,settings);r.validateViewportWorkflowReport(f.report,f.options);}
});
test('complete parent refuses a removed post-checkpoint, failed recovery or independently changed post-PNG',t=>{
 for(const mutate of [f=>f.report.error_observations.pop(),f=>f.report.semantic_assertions.at(-1).observed.actual='not recovered',f=>{
  const other=png(77),ref=f.write('decoded-images/other.png',other),row=f.report.image_observations.at(-1);f.report.artifacts.push(ref);
  Object.assign(row,{content_sha256:sha(other),source_sha256:sha('data:image/png;base64,'+other.toString('base64')),image_artifact:ref});
 }]){const f=fullChild(t);mutate(f);f.save();assert.throws(()=>r.validateViewportWorkflowReport(f.report,f.options));}
});

test('real phase executor captures post-image only after a passing original recovery result',async()=>{
 for(const succeeds of [false,true]){
  const image={kind:'image_state',selector:'#saved',pointer:'/natural_width'},bytes=png(),source='data:image/png;base64,'+bytes.toString('base64');
  const scenario={phases:{primary_result:[{op:'assert',requirement_id:'result_1',probe:image,operator:'equals',expected:64}],persist_reopen:[{op:'reopen_app'},{op:'assert',requirement_id:'persist_reopen',probe:image,operator:'equals',expected:64}],
   failure_recovery:[{op:'assert',checkpoint_id:'error_observed',probe:{kind:'text',selector:'#error'},operator:'equals',expected:'bad read'},
    {op:'click',selector:'#retry'},{op:'assert',requirement_id:'failure_recovery',probe:{kind:'text',selector:'#result'},operator:'equals',expected:'recovered'},
    {op:'assert',checkpoint_id:'recovery_image_retained',retained_from:{primary_result:0,persist_reopen:1},probe:image,operator:'equals',expected:64}]}};
  let retries=0,reads=0,checked=0;
  const locator=selector=>({count:async()=>1,scrollIntoViewIfNeeded:async()=>{},click:async()=>{retries++;},evaluate:async()=>false,
   elementHandle:async()=>({evaluate:async(fn,arg)=>{if(fn.name==='readPhaseElement')return{present:true,tag:'BUTTON',type:null,visible:true,enabled:true,value:null,value_as_number:null,min:null,max:null,step:null};if(fn.name==='readElementObservation'){
    if(arg.kind==='text'){if(selector==='#result'){checked++;return succeeds?'recovered':'failed';}return'bad read';}
    assert.equal(retries,1);assert.equal(checked,1);reads++;return{decoded:true,natural_width:64,natural_height:48,visible_area:3072,native_source:source};}throw new Error('unexpected DOM boundary');},dispose:async()=>{}})});
  const prior=(phase,step_index)=>({phase,step_index,selector:'#saved',...r.encodedPNGObservation({decoded:true,natural_width:64,natural_height:48,visible_area:3072,native_source:source}).state,image_artifact:{path:'authored/prior.png',sha256:sha(bytes),bytes:bytes.length}});
  const session={app:{primary_workflow:{expected_results:['saved image'],persist_reopen:'reopen',error:'bad read',recovery:'retry'}},scenario,primary:{locator},generation:2,phase_evidence:{},phase_evidence_started:performance.now(),actual_desktop:true,
   image_observations:[prior('primary_result',0),prior('persist_reopen',1)],semantic_assertions:[],checkpoints:[],keyboard_focus_observations:[],temporal_observations:[],assertActive:async()=>{}};
  await assert.rejects(()=>r.executeScenarioPhase(session,'failure_recovery',scenario.phases.failure_recovery),succeeds?/real encoded PNG artifacts/:/contradict/);
  assert.equal(retries,1);assert.equal(reads,succeeds?1:0);assert.equal(session.image_observations.length,succeeds?3:2);
 }
});

}
