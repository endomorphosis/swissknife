/** Real Vite module/HTTP persistence tests using authored unit evidence only. */
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createRequire } from 'node:module';
import { gatewayArtifactEndpoint, persistGatewayArtifacts } from '../../build-tools/configs/vite.web.config.ts';
import { gatewayArtifactCanonicalJson } from '../../src/services/mcp/all-app-tool-mediator.ts';
const { cidForBytes } = createRequire(import.meta.url)('../../scripts/mcpplusplus-profile-a.cjs');
const call={ owner:'ipfs_accelerate_py', tool_id:'run_inference_job', app_id:'unit-only', route:'/mcp/tools/call',
 transport:'http', correlation_id:'authored-unit-fixture', input:{ value:'bounded unit bytes' } };
const payload={ result:{ output:'Authored HTTP test evidence, not an actual model result.' } };
function fixture(){
 const receipt=cidForBytes(Buffer.from(gatewayArtifactCanonicalJson('receipt',call,payload)));
 const event=cidForBytes(Buffer.from(gatewayArtifactCanonicalJson('event',call,payload)));
 return {ok:true,outcome:'executed',result:structuredClone(payload),receipt:{receipt_id:receipt,event_dag_refs:[event],outcome:'executed'}};
}
async function owner(t,{wrongCid=false,verified=true}={}){
 const requests=[];const server=http.createServer(async(req,res)=>{
  const chunks=[];for await(const chunk of req)chunks.push(chunk);
  const body=JSON.parse(Buffer.concat(chunks));requests.push({path:req.url,body});
  assert.equal(req.method,'POST');assert.equal(req.url,'/mcp/artifacts/put');
  assert.equal(cidForBytes(Buffer.from(body.bytes_base64,'base64')),body.cid);
  res.writeHead(200,{'content-type':'application/json'});
  res.end(JSON.stringify({persisted:true,verified,cid:wrongCid?'wrong-cid':body.cid,backend:'authored-local-http-fixture'}));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
 return {origin:`http://127.0.0.1:${server.address().port}`,requests};
}
test('canonical artifact URL handles origin, /mcp, and /mcp/ identically',()=>{
 for(const suffix of ['', '/mcp', '/mcp/'])assert.equal(gatewayArtifactEndpoint(`http://127.0.0.1:18316${suffix}`),'http://127.0.0.1:18316/mcp/artifacts/put');
});
test('actual Vite persistence posts unchanged CID-bound receipt/event bytes for every URL form',async t=>{
 const {origin,requests}=await owner(t);
 for(const suffix of ['', '/mcp', '/mcp/']){
  const result=fixture();await persistGatewayArtifacts(call,result,origin+suffix);
  assert.equal(result.ok,true);assert.equal(result.receipt.persistence.status,'persisted');
 }
 assert.equal(requests.length,6);
 for(const kind of ['receipt','event']){
  const matching=requests.filter(row=>row.body.kind===`swissknife_gateway_${kind}`);assert.equal(matching.length,3);
  const expected=Buffer.from(gatewayArtifactCanonicalJson(kind,call,payload)).toString('base64');
  for(const row of matching)assert.equal(row.body.bytes_base64,expected);
 }
});
test('wrong returned CID still fails closed without a persistence fallback',async t=>{
 const {origin}=await owner(t,{wrongCid:true});const result=fixture();await persistGatewayArtifacts(call,result,origin);
 assert.equal(result.ok,false);assert.equal(result.outcome,'failed');assert.equal(result.result.error,'receipt_persistence_failed');assert.equal(result.receipt.persistence.status,'failed');
});
test('unverified persistence still fails closed',async t=>{
 const {origin}=await owner(t,{verified:false});const result=fixture();await persistGatewayArtifacts(call,result,origin+'/mcp/');
 assert.equal(result.ok,false);assert.equal(result.receipt.persistence.status,'failed');
});
