// Authored native-protocol vectors test joins; they are not real delivery/GO.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const runner = await import(process.env.SVF_PHASE_RUNNER_CANDIDATE
  ? pathToFileURL(process.env.SVF_PHASE_RUNNER_CANDIDATE).href
  : new URL('../../scripts/run-visual-functional-workflow.mjs', import.meta.url).href);
const {canonicalJSON, collectBackendProof, collectPhaseBackendProofs, validateBackendRequestPhases} = runner;
const require = createRequire(import.meta.url);
const {cidForBytes} = require('../../scripts/mcpplusplus-profile-a.cjs');
const sha = value => createHash('sha256').update(canonicalJSON(value)).digest('hex');

function fixture(t) {
  const contracts = JSON.parse(fs.readFileSync(new URL('../../config/visual-functional-app-contracts.json', import.meta.url)));
  const app = contracts.apps.find(item => item.app_id === 'ai-chat');
  const role = app.backend_roles.find(item => item.bindings.some(binding => !binding.mutates_remote_state));
  const binding = role.bindings.find(item => !item.mutates_remote_state);
  const assertion = {pointer:'/result/result/content/0/json/answer',operator:'equals',expected:50};
  const scenario = {fixture_scope:'svf-authored-phase-proof',backend_bindings:[{binding_id:binding.binding_id,mode:'read',consent:'not_required',max_duration_seconds:1,max_output_bytes:65536,result_assertion:assertion}],
    phases:{primary_result:[{}],persist_reopen:[{}],failure_recovery:[{}]}};
  const blocks = new Map();
  const record = (phase,index) => {
    const id = 'authored-phase-'+index;
    const call = {protocol:'swissknife.all-app-tool-gateway.v1',route:'/mcp/tools/call',app_id:app.app_id,binding_id:binding.binding_id,intent_id:binding.operation,
      owner:role.owner,tool_id:binding.exact_tool_candidates[0],transport:binding.transports[0],correlation_id:id,receipt_required:true,
      input:{correlation_id:id,payload:{fixture_scope:scenario.fixture_scope,limit:1},policy:{decision_id:'authored-unit',outcome:'allow',reason:'Authored unit only',consent:'not_required',dry_run:false}}};
    const result = {result:{receipt:{tool:call.tool_id,status:'executed',dry_run:false},content:[{json:{answer:50}}]},application_transport_observation:{transport:call.transport,correlation_id:id,
      ucan_did_verified:true,remote_did:'did:key:authored-unit',descriptor_cid:cidForBytes(Buffer.from('descriptor')),identity_proof_cid:cidForBytes(Buffer.from('identity'))}};
    const receipt=Buffer.from(canonicalJSON({kind:'receipt',call,result})),event=Buffer.from(canonicalJSON({kind:'event',call,result}));
    const rcid=cidForBytes(receipt),ecid=cidForBytes(event);blocks.set(rcid,receipt);blocks.set(ecid,event);
    return {call,response:{ok:true,outcome:'executed',owner:call.owner,tool_id:call.tool_id,transport:call.transport,correlation_id:id,result,
      receipt:{owner:call.owner,tool_id:call.tool_id,transport:call.transport,correlation_id:id,policy_outcome:'allow',outcome:'executed',receipt_id:rcid,event_dag_refs:[ecid],persistence:{status:'persisted',receipt_cid:rcid,event_cid:ecid}}},
      finished:true,http_status:200,actual_desktop:false,dispatch_observation_phase:phase,
      request_phase:{request_index:index,phase,step_index:0,generation:phase==='primary_result'?1:2,binding_id:binding.binding_id,correlation_id:id,call_sha256:sha(call)}};
  };
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'svf-request-phases-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  const records=[record('primary_result',0),record('failure_recovery',1)];
  const session={app,scenario,phase_evidence:{phases:[]},backend_enabled:true,backend_records:records,backend_observations:[],backend_artifacts:new Map(),
    outputDir:directory,assertActive:async()=>{},failure_context:{phase:'backend_proof',step:null}};
  const options={session,evidenceRoot:directory,artifactReader:async cid=>{assert.ok(blocks.has(cid),'only exact authored CID blocks may be read');return blocks.get(cid);}};
  const report=()=>({backend_call_count:records.length,backend_call_phases:{primary_result:1,persist_reopen:0,failure_recovery:1,backend_proof:0,unknown:0},
    backend_request_phases:{schema:runner.BACKEND_REQUEST_PHASE_SCHEMA,requests:records.map(row=>row.request_phase)},backend_observations:session.backend_observations});
  return {session,options,records,assertion,report,record,blocks,callMap:new Map(records.map(row=>[row.call.correlation_id,row.call]))};
}

test('retain distinct primary and recovery receipts rather than only the final binding result', async t=>{
  const f=fixture(t);
  await collectBackendProof({...f.options,probe:{kind:'backend_result',binding_id:f.records[0].call.binding_id,pointer:f.assertion.pointer},operator:'equals',expected:50});
  assert.equal(f.session.backend_observations.length,1);
  await collectPhaseBackendProofs(f.options);
  assert.deepEqual(f.session.backend_observations.map(row=>row.request_phase_index).sort(),[0,1]);
  assert.equal(f.session.backend_artifacts.size,4);
  assert.ok(f.session.backend_observations.every(row=>row.actual_desktop===false));
  assert.ok(validateBackendRequestPhases(f.report(),f.session.scenario,f.callMap));
  await collectPhaseBackendProofs(f.options);assert.equal(f.session.backend_observations.length,2,'supplemental collection is idempotent');
});

test('semantic backend probe cannot borrow the earlier primary receipt for recovery', async t=>{
  const f=fixture(t);f.session.backend_records=f.records.slice(0,1);f.session.failure_context={phase:'failure_recovery',step:0};
  await assert.rejects(collectBackendProof({...f.options,probe:{kind:'backend_result',binding_id:f.records[0].call.binding_id,pointer:f.assertion.pointer},operator:'equals',expected:50}),/different scenario phase/);
  assert.equal(f.session.backend_observations.length,0);
});

test('phase witness refuses changed ordinal, correlation, call hash, generation, step, counts or missing envelope', async t=>{
  const f=fixture(t);await collectPhaseBackendProofs(f.options);
  for(const mutate of [
    d=>{d.backend_request_phases.requests[0].request_index=1;},d=>{d.backend_request_phases.requests[0].correlation_id='foreign';},
    d=>{d.backend_request_phases.requests[0].call_sha256='0'.repeat(64);},d=>{d.backend_request_phases.requests[0].generation=true;},
    d=>{d.backend_request_phases.requests[0].step_index=9;},d=>{d.backend_call_phases.primary_result=0;},
    d=>{d.backend_observations[0].request_phase_index=99;},d=>{delete d.backend_request_phases;},
  ]){const changed=structuredClone(f.report());mutate(changed);assert.throws(()=>validateBackendRequestPhases(changed,f.session.scenario,f.callMap));}
});

test('historical unphased records remain explicitly unphased', ()=>{
  const data={backend_observations:[{correlation_id:'historical'}]};
  assert.equal(validateBackendRequestPhases(data,{}),null);
});

test('failed supplemental owner receipt cannot masquerade as successful native proof', async t=>{
  const f=fixture(t);f.records[0].response.result.result.content[0].json.answer=49;
  await assert.rejects(collectPhaseBackendProofs(f.options),/differ from browser evidence/);
});


// Raw fetched-artifact rows are independent of, and confer no credit to,
// the legacy selected semantic owner observations above.
const {collectBackendRequestArtifacts,validateBackendRequestArtifacts}=runner;
function rawReport(f) {
  return {...f.report(),backend_call_phases:Object.fromEntries(runner.BACKEND_OBSERVATION_PHASES.map(phase=>[phase,
    f.records.filter(row=>row.request_phase.phase===phase).length])),
    artifacts:[...f.session.backend_artifacts.values()],backend_request_artifacts:f.session.backend_request_artifacts};
}
function readRaw(f,reference) {
  assert.equal(reference.path.startsWith('backend/'),true);
  const file=path.join(f.session.outputDir,reference.path),bytes=fs.readFileSync(file);
  assert.equal(bytes.length,reference.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),reference.sha256);
  return bytes;
}
function replaceResult(f,index,mutate) {
  const record=f.records[index];mutate(record.response);
  const receipt=Buffer.from(canonicalJSON({kind:'receipt',call:record.call,result:record.response.result}));
  const event=Buffer.from(canonicalJSON({kind:'event',call:record.call,result:record.response.result}));
  const rcid=cidForBytes(receipt),ecid=cidForBytes(event);f.blocks.set(rcid,receipt);f.blocks.set(ecid,event);
  Object.assign(record.response.receipt,{receipt_id:rcid,event_dag_refs:[ecid],persistence:{status:'persisted',receipt_cid:rcid,event_cid:ecid}});
}

test('all requests fetch raw persisted artifacts including a superseded same-phase call, without extra dispatch or semantic credit',async t=>{
  const f=fixture(t);f.records.push(f.record('failure_recovery',2));
  await collectPhaseBackendProofs(f.options);
  assert.deepEqual(f.session.backend_observations.map(r=>r.request_phase_index),[0,2]);
  const original=canonicalJSON(f.session.backend_observations),calls=canonicalJSON(f.records.map(r=>r.call)),reads=[];
  const rows=await collectBackendRequestArtifacts({...f.options,artifactReader:async cid=>{reads.push(cid);return f.blocks.get(cid);}});
  assert.equal(rows.schema,runner.BACKEND_REQUEST_ARTIFACT_SCHEMA);assert.equal(rows.requests.length,3);
  assert.equal(reads.length,6,'the existing persisted-artifact reader is called for each pair');
  assert.equal(canonicalJSON(f.session.backend_observations),original);assert.equal(canonicalJSON(f.records.map(r=>r.call)),calls);
  assert.deepEqual(rows.requests.map(r=>r.request_index),[0,1,2]);assert.equal(f.session.backend_artifacts.size,6);
  assert.ok(rows.requests.every(r=>!Object.hasOwn(r,'passed')&&!Object.hasOwn(r,'semantic_result_verified')));
  assert.equal(validateBackendRequestArtifacts(rawReport(f),f.session.scenario,{app:f.session.app,readArtifact:r=>readRaw(f,r)}).length,3);
  const inodes=rows.requests.flatMap(r=>['receipt','event'].map(k=>fs.statSync(path.join(f.session.outputDir,r[k+'_artifact'].path)).ino));
  await collectBackendRequestArtifacts(f.options);
  assert.deepEqual(f.session.backend_request_artifacts.requests.flatMap(r=>['receipt','event'].map(k=>fs.statSync(path.join(f.session.outputDir,r[k+'_artifact'].path)).ino)),inodes,'idempotent retention never replaces existing files');
});

test('failed governed request retains fetched canonical bytes but cannot become a successful semantic observation',async t=>{
  const f=fixture(t);replaceResult(f,1,response=>{response.ok=false;response.outcome='failed';response.receipt.outcome='failed';response.result.result.receipt.status='failed';response.result.result.content=[{json:{error:'task is not ready'}}];});
  await collectBackendRequestArtifacts(f.options);assert.equal(f.session.backend_observations.length,0);
  assert.equal(validateBackendRequestArtifacts(rawReport(f),f.session.scenario,{app:f.session.app,readArtifact:r=>readRaw(f,r)}).length,2);
});

test('fetched-artifact consumer rejects reordered, missing, duplicate, foreign, mistyped or source-detached rows',async t=>{
  const f=fixture(t);await collectBackendRequestArtifacts(f.options);
  const original=rawReport(f);
  for(const mutate of [
    d=>d.backend_request_artifacts.requests.reverse(),d=>d.backend_request_artifacts.requests.pop(),
    d=>{d.backend_request_artifacts.requests[0].request_index=true;},d=>{d.backend_request_artifacts.requests[0].phase='persist_reopen';},
    d=>{d.backend_request_artifacts.requests[0].step_index=1;},d=>{d.backend_request_artifacts.requests[0].correlation_id='foreign';},
    d=>{d.backend_request_artifacts.requests[0].call_sha256='0'.repeat(64);},d=>{d.backend_request_artifacts.requests[0].binding_id='foreign';},
    d=>{d.backend_request_artifacts.requests[0].receipt_id=d.backend_request_artifacts.requests[1].receipt_id;},
    d=>{d.backend_request_artifacts.requests[0].receipt_artifact.path='foreign/receipt.json';},
    d=>{d.backend_request_artifacts.requests[0].receipt_artifact.sha256='0'.repeat(64);},
    d=>{d.backend_request_artifacts.requests[0].event_artifact.bytes+=1;},
    d=>{d.artifacts=d.artifacts.filter(r=>r.path!==d.backend_request_artifacts.requests[0].receipt_artifact.path);},
    d=>{d.backend_request_artifacts.requests[0].passed=true;},d=>{delete d.backend_request_phases;},
  ]){const changed=structuredClone(original);mutate(changed);assert.throws(()=>validateBackendRequestArtifacts(changed,f.session.scenario,{app:f.session.app,readArtifact:r=>readRaw(f,r)}));}
});

test('producer refuses missing/CID-mismatched/swapped persisted blocks and incomplete or misjoined requests',async t=>{
  for(const fault of ['missing','wrong-cid','swapped','unfinished','source-hash','ordinal']) {
    const f=fixture(t);
    if(fault==='unfinished')f.records[0].finished=false;
    if(fault==='source-hash')f.records[0].request_phase.call_sha256='0'.repeat(64);
    if(fault==='ordinal')f.records[0].request_phase.request_index=1;
    const reader=async cid=>fault==='missing'?undefined:fault==='wrong-cid'?Buffer.from('{}'):
      fault==='swapped'?f.blocks.get(f.records[0].response.receipt.receipt_id):f.blocks.get(cid);
    await assert.rejects(collectBackendRequestArtifacts({...f.options,artifactReader:reader}));
    assert.equal(f.session.backend_request_artifacts,undefined);assert.equal(f.session.backend_observations.length,0);
  }
});

test('consumer refuses rehashed artifact/result or kind forgery even when the changed artifact is retained',async t=>{
  const f=fixture(t);await collectBackendRequestArtifacts(f.options);
  for(const fault of ['result','kind','call']) {
    const report=structuredClone(rawReport(f)),row=report.backend_request_artifacts.requests[0],reference=row.receipt_artifact;
    const payload=JSON.parse(readRaw(f,reference));
    if(fault==='result')payload.result.result.content[0].json.answer=51;
    if(fault==='kind')payload.kind='event';
    if(fault==='call')payload.call.input.payload.limit=2;
    const bytes=Buffer.from(canonicalJSON(payload)),cid=cidForBytes(bytes),file=path.join(f.session.outputDir,'backend',`receipt-${cid}.json`);fs.writeFileSync(file,bytes);
    const fresh={path:'backend/'+path.basename(file),sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length};
    report.artifacts=report.artifacts.filter(r=>r.path!==reference.path);report.artifacts.push(fresh);row.receipt_artifact=fresh;row.receipt_id=cid;
    assert.throws(()=>validateBackendRequestArtifacts(report,f.session.scenario,{app:f.session.app,readArtifact:r=>readRaw(f,r)}));
  }
});

test('historical absent wire stays absent and local empty request coverage grants no semantics',async()=>{
  assert.equal(validateBackendRequestArtifacts({backend_call_count:0},{},{}),null);
  const report={backend_call_count:0,backend_observations:[],backend_call_phases:Object.fromEntries(runner.BACKEND_OBSERVATION_PHASES.map(p=>[p,0])),backend_request_phases:{schema:runner.BACKEND_REQUEST_PHASE_SCHEMA,requests:[]},backend_request_artifacts:{schema:runner.BACKEND_REQUEST_ARTIFACT_SCHEMA,requests:[]},artifacts:[]};
  assert.deepEqual(validateBackendRequestArtifacts(report,{phases:Object.fromEntries(runner.PHASES.map(p=>[p,[]]))},{}),[]);
});


test('producer and consumer reject CID-rehashed malformed UTF8 instead of accepting replacement characters',async t=>{
  const f=fixture(t);replaceResult(f,0,r=>{r.result.result.content[0].json.note='\ufffd';});
  const good=f.records[0].response.receipt.receipt_id,valid=f.blocks.get(good),marker=Buffer.from('\ufffd','utf8'),offset=valid.indexOf(marker);
  assert.ok(offset>=0);const malformed=Buffer.concat([valid.subarray(0,offset),Buffer.from([0xff]),valid.subarray(offset+marker.length)]);
  assert.equal(malformed.toString('utf8'),valid.toString('utf8'),'replacement decoding is an insufficient canonicality check');
  const cid=cidForBytes(malformed);f.blocks.set(cid,malformed);const header=f.records[0].response.receipt;
  header.receipt_id=header.persistence.receipt_cid=cid;
  await assert.rejects(collectBackendRequestArtifacts(f.options),/canonical call\/result differs/);
  header.receipt_id=header.persistence.receipt_cid=good;await collectBackendRequestArtifacts(f.options);
  const report=structuredClone(rawReport(f)),row=report.backend_request_artifacts.requests[0],file=path.join(f.session.outputDir,'backend',`receipt-${cid}.json`);fs.writeFileSync(file,malformed);
  const fresh={path:'backend/'+path.basename(file),sha256:createHash('sha256').update(malformed).digest('hex'),bytes:malformed.length};
  report.artifacts=report.artifacts.filter(r=>r.path!==row.receipt_artifact.path);report.artifacts.push(fresh);row.receipt_artifact=fresh;row.receipt_id=cid;
  assert.throws(()=>validateBackendRequestArtifacts(report,f.session.scenario,{app:f.session.app,readArtifact:r=>readRaw(f,r)}),/raw bytes\/CID\/kind differ/);
});
