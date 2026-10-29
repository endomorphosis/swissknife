// Real PNG bytes + authored decoder state; not a real Chrome/GO receipt.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {deflateSync} from 'node:zlib';
import {pathToFileURL} from 'node:url';
const r=await import(process.env.SVF_PHASE_RUNNER_CANDIDATE?pathToFileURL(process.env.SVF_PHASE_RUNNER_CANDIDATE).href:new URL('../../scripts/run-visual-functional-workflow.mjs',import.meta.url).href);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function crc(bytes){let value=0xffffffff;for(const byte of bytes){value^=byte;for(let i=0;i<8;i++)value=(value>>>1)^((value&1)?0xedb88320:0);}return(value^0xffffffff)>>>0;}
function chunk(tag,data){const type=Buffer.from(tag),size=Buffer.alloc(4),sum=Buffer.alloc(4);size.writeUInt32BE(data.length);sum.writeUInt32BE(crc(Buffer.concat([type,data])));return Buffer.concat([size,type,data,sum]);}
function fixture(){const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(2,0);ihdr.writeUInt32BE(2,4);ihdr[8]=8;ihdr[9]=6;
 const pixels=Buffer.from([0,255,0,0,255,0,255,0,255,0,0,0,255,255,255,255,255,255]);
 const bytes=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]);
 const source='data:image/png;base64,'+bytes.toString('base64');const state={decoded:true,natural_width:2,natural_height:2,visible_area:64,native_source:source};
 const observed=r.encodedPNGObservation(state),artifact={path:'authored/decoded.png',sha256:sha(bytes),bytes:bytes.length};
 const row={phase:'primary_result',step_index:0,selector:'#saved-output',...observed.state,image_artifact:artifact};
 const scenario={phases:{primary_result:[{op:'assert',probe:{kind:'image_state',selector:'#saved-output',pointer:'/decoded'}}]}};
 const report={artifacts:[artifact],image_observations:[row],semantic_assertions:[{phase:'primary_result',step_index:0,observed:{actual:true}}],error_observations:[]};
 return{bytes,source,state,row,scenario,report};}

test('native PNG evidence hashes exact encoded bytes and decoder dimensions',()=>{const f=fixture();assert.equal(f.row.content_sha256,sha(f.bytes));assert.equal(f.row.source_sha256,sha(f.source));assert.ok(!('native_source'in f.row));r.validateDecodedImageObservations(f.report,f.scenario,()=>f.bytes);});
test('decoder dimension disagreement, malformed base64 and fake image bytes refuse',()=>{const f=fixture();for(const change of [s=>s.natural_width=3,s=>s.native_source+='!',s=>s.native_source='data:image/png;base64,'+Buffer.alloc(80).toString('base64')]){const s={...f.state};change(s);assert.throws(()=>r.encodedPNGObservation(s));}});
test('PNG bytes, source identity, semantic probe, phase and artifact closure are independently checked',()=>{const f=fixture();for(const mutate of [
 d=>d.image_observations[0].content_sha256='0'.repeat(64),d=>d.image_observations[0].source_sha256='0'.repeat(64),d=>d.image_observations[0].natural_height=3,
 d=>d.image_observations[0].step_index=9,d=>d.image_observations[0].phase='failure_recovery',d=>d.artifacts=[],d=>d.semantic_assertions[0].observed.actual=false,
 ]){const d=structuredClone(f.report);mutate(d);assert.throws(()=>r.validateDecodedImageObservations(d,f.scenario,()=>f.bytes));}});
test('a non-PNG URL retains only native source identity, never invented encoded bytes',()=>{const f=fixture(),s=r.encodedPNGObservation({...f.state,native_source:'blob:authored-local-image'});assert.equal(s.bytes,null);assert.equal(s.state.content_sha256,null);assert.equal(s.state.source_sha256,sha('blob:authored-local-image'));});
