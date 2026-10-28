import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import test from 'node:test';
import {Window} from 'happy-dom';
import {AIChatApp,parseStoredChatReference,buildStoredReferencePrompt,buildChatInferenceRequest} from '../../web/js/apps/ai-chat.js';
const snapshot='a'.repeat(40);
const rows=[{id:'unit-model',model_id:'unit-model',snapshot,task:'text-generation',device:'cpu'}];
function fixture(records=rows){
 const content=JSON.stringify(records),bytes=Buffer.from(content),digest=createHash('sha256').update(bytes).digest();
 const alphabet='abcdefghijklmnopqrstuvwxyz234567';let cid='b',bits=0,buffer=0;
 for(const byte of Buffer.concat([Buffer.from([1,85,18,32]),digest])){buffer=(buffer<<8)|byte;bits+=8;while(bits>=5){bits-=5;cid+=alphabet[(buffer>>>bits)&31];}}
 if(bits)cid+=alphabet[(buffer<<(5-bits))&31];
 return{cid,response:{ok:true,outcome:'executed',result:{content:[{type:'json',json:{status:'success',cid,content}}]}}};
}
function environment(t){
 const window=new Window({url:'http://localhost'});const names=['window','document','localStorage','fetch','CustomEvent','__SWISSKNIFE_GATEWAY_FORCE_DRY_RUN__'];const old=Object.fromEntries(names.map(k=>[k,globalThis[k]]));
 Object.assign(globalThis,{window,document:window.document,localStorage:window.localStorage,CustomEvent:window.CustomEvent,__SWISSKNIFE_GATEWAY_FORCE_DRY_RUN__:false});
 t.after(()=>{window.happyDOM.abort();for(const key of names){if(old[key]===undefined)delete globalThis[key];else globalThis[key]=old[key];}});
 return window;
}
async function appRoot(){const app=new AIChatApp({windows:new Map()});app.selectedModel='unit-model';const host=document.createElement('section');host.innerHTML=await app.render();document.body.append(host);return{app,host};}

test('default model selection truthfully names local CPU and cloud choices remain unconfigured presets',async t=>{
 environment(t);const app=new AIChatApp({windows:new Map()});const host=document.createElement('section');host.innerHTML=await app.render();document.body.append(host);
 assert.equal(app.selectedProvider,'local');assert.equal(app.selectedModel,'gpt2');
 assert.equal(host.querySelector('#ai-chat-model-select').value,'gpt2');
 assert.equal(host.querySelector('#ai-chat-model-select option[value="gpt2"]').textContent,'GPT-2 (local CPU)');
 assert.doesNotMatch(host.querySelector('.status-text').textContent,/Connected/);app.selectProvider('openai');
 assert.match(host.querySelector('.status-text').textContent,/unconfigured preset/);assert.match(host.querySelector('option').textContent,/unconfigured preset/);
});

test('reference facts come from actual returned catalogue bytes and verified CID, not selected hardcoded answer',async()=>{
 const{cid,response}=fixture();const reference=await parseStoredChatReference(response,cid,'unit-model');
 assert.equal(reference.model_id,'unit-model');assert.equal(reference.snapshot,snapshot);assert.equal(reference.content,response.result.content[0].json.content);
 const other=fixture([{id:'different-model',snapshot:'b'.repeat(40),task:'classification',device:'gpu'}]);
 assert.equal((await parseStoredChatReference(other.response,other.cid,'different-model')).device,'gpu');
});
test('preview, mismatched bytes, missing model and failed owner cannot establish a reference',async()=>{
 const{cid,response}=fixture();
 for(const[value,id,model]of[[{...response,outcome:'preview'},cid,'unit-model'],[response,cid,'absent'],[{...response,ok:false},cid,'unit-model']])await assert.rejects(parseStoredChatReference(value,id,model));
 const changed=structuredClone(response);changed.result.content[0].json.content+=' ';await assert.rejects(parseStoredChatReference(changed,cid,'unit-model'),/bytes do not match/);
 const failure=structuredClone(response);failure.result.isError=true;await assert.rejects(parseStoredChatReference(failure,cid,'unit-model'),/owner returned an error/);
});
test('factual reference and actual model continuation stay separately labelled and citation links are escaped',async t=>{
 environment(t);const{app}=await appRoot();const{cid,response}=fixture();const reference=await parseStoredChatReference(response,cid,'unit-model');
 const text=app.appendCitations('<script>not markup</script>',{reference});
 assert.match(text,/Stored reference facts/);assert.match(text,/Model: unit-model; snapshot: a{40}/);assert.match(text,/Model continuation \(unit-model; separate from retrieved facts\)/);
 const rendered=document.createElement('div');rendered.innerHTML=app.formatMessage(text);
 assert.equal(rendered.querySelector('script'),null);assert.equal(rendered.querySelector('.chat-reference-link').getAttribute('href'),'ipfs://'+cid);
});
test('send, reopen and failed retrieval/retry preserve assistant facts, citation target and a single user turn',async t=>{
 environment(t);const{app,host}=await appRoot();const{cid,response}=fixture();const reference=await parseStoredChatReference(response,cid,'unit-model');
 const question='Which model and snapshot are in this reference?';let attempts=0,fail=false;
 app.retrieveStoredReference=async()=>{if(fail)throw new Error('actual retrieval unavailable');return reference;};
 app.sendToAI=async(message,context)=>{attempts++;assert.equal(message,question);assert.equal(context.reference.cid,cid);return 'Unit-only short continuation';};
 const input=host.querySelector('#ai-chat-input');host.querySelector('#ai-chat-reference-enabled').checked=true;input.value=question;
 await app.sendMessage();assert.equal(attempts,1);assert.equal(host.querySelectorAll('.message.user').length,1);assert.equal(host.querySelectorAll('.message.assistant').length,1);
 const reopened=new AIChatApp({windows:new Map()});const transcript=reopened.renderTranscriptHtml();assert.match(transcript,/snapshot: a{40}/);assert.ok(transcript.includes('ipfs://'+cid));
 assert.match(transcript,/Saved reference facts \(not reverified\)/);
 const saved=JSON.parse(localStorage.getItem('swissknife-ai-conversations'));delete saved[0].messages[1].reference;
 localStorage.setItem('swissknife-ai-conversations',JSON.stringify(saved));assert.match(reopened.renderTranscriptHtml(),/reference not reverified/);
 fail=true;input.value=question;await app.sendMessage();assert.equal(input.value,question);assert.equal(attempts,1);assert.match(host.querySelector('.message.error').textContent,/retrieval unavailable/);
 fail=false;await app.sendMessage();assert.equal(attempts,2);assert.equal(host.querySelectorAll('.message.user').length,1);assert.equal(host.querySelectorAll('.message.assistant').length,2);assert.equal(host.querySelectorAll('.message.error').length,0);
});
test('grounded native prompt keeps exact facts and question within CPU512 byte cap without receipt dumps',async()=>{
 const{cid,response}=fixture();const reference=await parseStoredChatReference(response,cid,'unit-model');
 const prompt=buildStoredReferencePrompt('Which model and snapshot are stored?',{...reference,receipt:'DO NOT INLINE',desktop:{windows:'DO NOT INLINE'}});
 assert.ok(Buffer.byteLength(prompt)<=512);assert.ok(prompt.includes(cid));assert.ok(prompt.includes(snapshot));assert.ok(prompt.includes('Which model and snapshot'));
 assert.doesNotMatch(prompt,/DO NOT INLINE|receipt|windows/);assert.throws(()=>buildStoredReferencePrompt('x'.repeat(512),reference),/shorten the question/);
});
test('actual Python submit_task normalization receives final context once and no hidden reference expansion',async()=>{
 const{cid,response}=fixture([{...rows[0],id:'gpt2',model_id:'gpt2'}]);const reference=await parseStoredChatReference(response,cid,'gpt2');
 const desktop={type:'desktop',status:'available',openApps:[{id:'ai-chat',title:'AI Chat'}],activeApp:'ai-chat',observed_at:'2026-10-27T00:25:46Z'};
 const context={reference,desktop};const request=buildChatInferenceRequest('gpt2','Which model and snapshot are in the stored reference?',context);
 assert.equal(request.payload,undefined);assert.equal(request.context,undefined);assert.ok(Buffer.byteLength(request.prompt)<=512);
 assert.ok(request.prompt.includes(JSON.stringify(desktop)));assert.equal(request.prompt.split(cid).length-1,1);assert.ok(!request.prompt.includes(reference.content));
 const normalized=spawnSync('python3',['-c',"import sys,json,os;sys.path.insert(0,os.path.abspath('../scripts/svf_backends'));from native_accelerate_service import inference_arguments;print(json.dumps(inference_arguments(json.load(sys.stdin),submission=True)))"],
  {input:JSON.stringify(request),encoding:'utf8',timeout:3000,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});
 assert.equal(normalized.status,0,normalized.stderr);assert.equal(JSON.parse(normalized.stdout).input,request.prompt);
 assert.throws(()=>buildChatInferenceRequest('gpt2','Question',{reference,files:{content:'x'.repeat(512)}}),/deselect context/);
});
test('reference read uses the actual native gateway API and exact configured CID/gateway payload',async t=>{
 environment(t);const{app}=await appRoot();const{cid,response}=fixture();const calls=[];
 const binding={app_id:'ai-chat',binding_id:'ai-chat.ipfs_datasets_py.query_catalog',owner:'ipfs_datasets_py',intent_id:'unit-read',
  selected_tool_id:'load_dataset',preferred_tool_ids:['load_dataset','get_from_ipfs'],mutates_remote_state:false,confirmation_required:false,
  transport:'http',transports:['http'],safe_payloads:{get_from_ipfs:{cid,gateway:'http://127.0.0.1:8091'}}};
 globalThis.fetch=async(url,options={})=>{
  if(String(url).startsWith('/mcp/tools/bindings'))return{ok:true,json:async()=>({controls:[binding]})};
  if(url==='/mcp/tools/dispositions')return{ok:true,json:async()=>({entries:[]})};
  assert.equal(url,'/mcp/tools/call');const call=JSON.parse(options.body);calls.push(call);
  return{ok:true,status:200,json:async()=>({...response,correlation_id:call.correlation_id,receipt:{receipt_id:'authored-unit-receipt'}})};
 };
 const reference=await app.retrieveStoredReference();assert.equal(reference.snapshot,snapshot);assert.equal(calls.length,1);
 assert.equal(calls[0].binding_id,binding.binding_id);assert.equal(calls[0].tool_id,'get_from_ipfs');
 assert.deepEqual(calls[0].input.payload,{cid,gateway:'http://127.0.0.1:8091',fixture_scope:'svf-ai-chat-grounded-answer'});
 assert.equal(document.querySelector('[data-gateway-confirm]'),null);
});
test('question echo is not accepted as the assistant continuation',async t=>{
 environment(t);const{app,host}=await appRoot();const input=host.querySelector('#ai-chat-input');input.value='Question to answer';app.sendToAI=async message=>message;
 await app.sendMessage();assert.equal(host.querySelectorAll('.message.assistant').length,0);assert.equal(input.value,'Question to answer');assert.match(host.querySelector('.message.error').textContent,/question instead/);
});
test('scenario primary observes assistant facts, not the user input, and preserves both real owner result assertions',()=>{
 const scenario=JSON.parse(fs.readFileSync(new URL('../e2e/functional-workflows/ai-chat.json',import.meta.url)));
 const primary=scenario.phases.primary_result.find(step=>step.requirement_id==='result_1');assert.equal(primary.probe.selector,'.message.assistant .message-text');assert.match(primary.expected,/Model: gpt2; snapshot: [a-f0-9]{40}/);
 assert.deepEqual(scenario.backend_bindings.map(v=>v.binding_id),['ai-chat.ipfs_datasets_py.query_catalog','ai-chat.ipfs_accelerate_py.submit_inference']);
 assert.equal(scenario.backend_bindings[1].result_assertion.pointer,'/result/result/result/output');assert.equal(scenario.backend_bindings[1].result_assertion.operator,'not_equals');
});
