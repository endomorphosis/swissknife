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
  return {session,options,records,assertion,report,callMap:new Map(records.map(row=>[row.call.correlation_id,row.call]))};
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
