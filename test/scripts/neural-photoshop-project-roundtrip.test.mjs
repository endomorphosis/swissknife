// Authored DOM/native-image events test ordering and real PNG bytes; not browser/owner qualification.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {deflateSync,inflateSync} from 'node:zlib';
import {pathToFileURL} from 'node:url';
import {Window} from 'happy-dom';
const {NeuralPhotoshopApp}=await import(process.env.SVF_NEURAL_CANDIDATE ? pathToFileURL(process.env.SVF_NEURAL_CANDIDATE).href : new URL('../../web/js/apps/neural-photoshop.js',import.meta.url).href);
const SOURCE_PNG="iVBORw0KGgoAAAANSUhEUgAAAEAAAAAwCAYAAAChS3wfAAAAbklEQVR42u3YMREAIAwDwNpABF6YEYYcrIEDmKE/dMzQn3KJMvo6XW3zeK/nAwAAAAAAAEgM8PuDtzwAAAAAAACQGUATBAAAAAAAAOwBmiAAAAAAAABgD9AEAQAAAAAAAHuAJggAAAAAAAB8D7ABVCeNeI7CTKoAAAAASUVORK5CYII=";
const CID='bafkreiefsedovka56qbpo5s4o2mpfq2zbhdknta7rqarqjljugxdmpriue';
const BINDING='neural-photoshop.ipfs_kit_py.retrieve_content';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const tick=()=>new Promise(resolve=>setTimeout(resolve,2));
function crc32(bytes){let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return(crc^0xffffffff)>>>0;}
function chunk(type,data){const tag=Buffer.from(type);const out=Buffer.alloc(12+data.length);out.writeUInt32BE(data.length,0);tag.copy(out,4);data.copy(out,8);out.writeUInt32BE(crc32(Buffer.concat([tag,data])),8+data.length);return out;}
function png(width,height,pixels){const head=Buffer.alloc(13);head.writeUInt32BE(width,0);head.writeUInt32BE(height,4);head[8]=8;head[9]=6;const raw=Buffer.alloc((width*4+1)*height);for(let y=0;y<height;y++)Buffer.from(pixels.slice(y*width*4,(y+1)*width*4)).copy(raw,y*(width*4+1)+1);return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',head),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);}
function decodePng(bytes){bytes=Buffer.from(bytes);assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);assert.equal(bytes[24],8);assert.equal(bytes[25],6);let at=8,parts=[];while(at<bytes.length){const size=bytes.readUInt32BE(at),tag=bytes.subarray(at+4,at+8),data=bytes.subarray(at+8,at+8+size);assert.equal(bytes.readUInt32BE(at+8+size),crc32(Buffer.concat([tag,data])));if(tag.toString()==='IDAT')parts.push(data);at+=12+size;}const raw=inflateSync(Buffer.concat(parts)),pixels=new Uint8ClampedArray(width*height*4),stride=width*4;for(let y=0;y<height;y++){const filter=raw[y*(stride+1)];for(let x=0;x<stride;x++){const a=x>=4?pixels[y*stride+x-4]:0,b=y?pixels[(y-1)*stride+x]:0,c=y&&x>=4?pixels[(y-1)*stride+x-4]:0;let pred=0;if(filter===1)pred=a;if(filter===2)pred=b;if(filter===3)pred=Math.floor((a+b)/2);if(filter===4){const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);pred=pa<=pb&&pa<=pc?a:pb<=pc?b:c;}assert.ok(filter<=4);pixels[y*stride+x]=(raw[y*(stride+1)+1+x]+pred)&255;}}return{width,height,pixels};}
const source=decodePng(Buffer.from(SOURCE_PNG,'base64'));
assert.equal(source.width,64);assert.equal(source.height,48);assert.equal(hash(source.pixels),'9fdb6b885b647934503a0738caad55ff72c56f47726e06b09332fd606ebafc11');

async function fixture(t){
 const names=['window','document','localStorage','CustomEvent','Image','File','fetch','__SWISSKNIFE_GATEWAY_FORCE_DRY_RUN__'];const before=new Map(names.map(n=>[n,Object.getOwnPropertyDescriptor(globalThis,n)]));
 const win=new Window({url:'http://localhost'});Object.assign(globalThis,{window:win,document:win.document,localStorage:win.localStorage,CustomEvent:win.CustomEvent,File:win.File,__SWISSKNIFE_GATEWAY_FORCE_DRY_RUN__:false});
 const states=new WeakMap();
 function state(canvas){let s=states.get(canvas);if(!s||s.w!==canvas.width||s.h!==canvas.height){s={w:canvas.width,h:canvas.height,pixels:new Uint8ClampedArray(canvas.width*canvas.height*4)};states.set(canvas,s);}return s;}
 class Context{constructor(canvas){this.canvas=canvas;this.globalAlpha=1;this.globalCompositeOperation='source-over';this.fillStyle='#ffffff';this.lineWidth=1;}
 clearRect(){state(this.canvas).pixels.fill(0);}getImageData(){return{data:state(this.canvas).pixels.slice(),width:this.canvas.width,height:this.canvas.height};}
 drawImage(image){const src=image._pixels||state(image).pixels,dst=state(this.canvas).pixels;for(let i=0;i<dst.length;i+=4){const alpha=(src[i+3]||0)/255*this.globalAlpha;if(!alpha)continue;for(let c=0;c<3;c++)dst[i+c]=Math.round(src[i+c]*alpha+dst[i+c]*(1-alpha));dst[i+3]=Math.round(255*alpha+dst[i+3]*(1-alpha));}}
 putImageData(image){state(this.canvas).pixels.set(image.data);}fillRect(x,y,w,h){const dst=state(this.canvas).pixels,c=String(this.fillStyle).replace('#',''),rgb=c.length===6?[parseInt(c.slice(0,2),16),parseInt(c.slice(2,4),16),parseInt(c.slice(4,6),16)]:[0,0,0];for(let row=Math.max(0,Math.floor(y));row<Math.min(this.canvas.height,Math.ceil(y+h));row++)for(let col=Math.max(0,Math.floor(x));col<Math.min(this.canvas.width,Math.ceil(x+w));col++)dst.set([...rgb,255],(row*this.canvas.width+col)*4);}
 save(){this.saved={fillStyle:this.fillStyle,strokeStyle:this.strokeStyle,lineWidth:this.lineWidth,globalAlpha:this.globalAlpha};}restore(){Object.assign(this,this.saved);}beginPath(){}moveTo(x,y){this.start=[x,y];}lineTo(x,y){this.end=[x,y];}stroke(){this.fillStyle=this.strokeStyle;const[a,b]=this.start,[c,d]=this.end;for(let n=0;n<=Math.max(Math.abs(c-a),Math.abs(d-b));n++){const f=n/Math.max(Math.abs(c-a),Math.abs(d-b));this.fillRect(a+(c-a)*f-this.lineWidth/2,b+(d-b)*f-this.lineWidth/2,this.lineWidth,this.lineWidth);}}}
 win.HTMLCanvasElement.prototype.getContext=function(){return this._ctx||=(new Context(this));};
 win.HTMLCanvasElement.prototype.toDataURL=function(){return'data:image/png;base64,'+png(this.width,this.height,state(this).pixels).toString('base64');};
 const oldCreate=URL.createObjectURL,oldRevoke=URL.revokeObjectURL,blobs=new Map();let blobSerial=0;URL.createObjectURL=file=>{const key='blob:authored-neural-'+(++blobSerial);blobs.set(key,file);return key;};URL.revokeObjectURL=key=>blobs.delete(key);
 let automatic=true;const pending=[];const images=[];
 globalThis.Image=function(){const image=document.createElement('img');let value='',decoded=null;Object.defineProperties(image,{complete:{get:()=>Boolean(decoded)},naturalWidth:{get:()=>decoded?.width||0},naturalHeight:{get:()=>decoded?.height||0},_pixels:{get:()=>decoded?.pixels},src:{get:()=>value,set:src=>{value=src;const load=async()=>{try{decoded=decodePng(src.startsWith('blob:')?Buffer.from(await blobs.get(src).arrayBuffer()):Buffer.from(src.split(',')[1]||'','base64'));image.onload?.();}catch(error){image.onerror?.(error);}};pending.push(load);if(automatic)queueMicrotask(()=>{const at=pending.indexOf(load);if(at>=0){pending.splice(at,1);load();}});}}});images.push(image);return image;};
 const calls=[];globalThis.fetch=async(url,options={})=>{if(String(url).startsWith('/mcp/tools/bindings'))return{ok:true,json:async()=>({controls:[{app_id:'neural-photoshop',owner:'ipfs_kit_py',binding_id:BINDING,selected_tool_id:'ipfs_cat',preferred_tool_ids:['ipfs_cat'],transport:'http',transports:['http'],mutates_remote_state:true}]})};if(url==='/mcp/tools/dispositions')return{ok:true,json:async()=>({entries:[]})};assert.equal(url,'/mcp/tools/call','no unrelated network access');const call=JSON.parse(options.body);calls.push(call);const valid=call.input.payload.cid===CID;return{status:valid?200:400,json:async()=>({ok:valid,outcome:valid?'executed':'failed',correlation_id:call.correlation_id,...valid?{result:{content:[{type:'json',json:{success:true,cid:CID,bytes_base64:SOURCE_PNG,sha256:hash(Buffer.from(SOURCE_PNG,'base64'))}}]},receipt:{receipt_id:'authored-unit-only',event_dag_refs:['authored-unit-event']}}:{error:'Invalid source CID'}})};};
 function mount(existingRoot=null){const root=existingRoot||document.createElement('main');if(!existingRoot)document.body.append(root);const app=new NeuralPhotoshopApp(root,{});app.currentProject={name:'Authored image',width:64,height:48,colorMode:'RGB',resolution:300};app.layers=[];app.createLayer('Background','normal',1,true);root.innerHTML=app.createWindow().content;app.showNotification=()=>{};const ready=app.setupEventHandlers(root);return{app,root,ready};}
 const mounted=mount();await mounted.ready;
 async function confirm(root,promise,cancel=false){for(let n=0;n<100&&!root.querySelector('[data-gateway-confirm]');n++)await tick();const button=root.querySelector(cancel?'[data-gateway-cancel]':'[data-gateway-confirm]');assert.ok(button);const count=calls.length;if(cancel)button.click();else{button.click();assert.equal(calls.length,count,'untrusted click cannot consent');const event=new win.MouseEvent('click',{bubbles:true});Object.defineProperty(event,'isTrusted',{value:true});button.dispatchEvent(event);}await promise;}
 async function read(app,root,cid=CID,cancel=false){root.querySelector('[data-source-cid-input]').value=cid;await confirm(root,app.markVdaG042SourceLoaded(root,root.querySelector('#load-source-bytes')),cancel);}
 async function edit(app,root){await read(app,root);root.querySelector('[data-tool="brush"]').click();app.canvas.dispatchEvent(new win.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));}
 async function drain(){automatic=true;while(pending.length)await pending.shift()();await tick();}
 t.after(async()=>{await drain();await win.happyDOM.abort();URL.createObjectURL=oldCreate;URL.revokeObjectURL=oldRevoke;for(const[n,d]of before){if(d)Object.defineProperty(globalThis,n,d);else delete globalThis[n];}});
 return{...mounted,win,calls,mount,read,edit,confirm,drain,pending,setAutomatic:value=>{automatic=value;},hashCanvas:canvas=>hash(state(canvas).pixels),imageBytes:image=>Buffer.from(image.src.split(',')[1],'base64')};
}

test('real source bytes, brush pixels, Undo/Redo and encoded saved PNG agree',async t=>{
 const f=await fixture(t);await f.read(f.app,f.root);const original=f.hashCanvas(f.app.canvas);assert.equal(original,hash(source.pixels));
 f.root.querySelector('[data-tool="brush"]').click();f.app.canvas.dispatchEvent(new f.win.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));const edited=f.hashCanvas(f.app.canvas);assert.notEqual(edited,original);
 f.root.querySelector('#undo-btn').click();assert.equal(f.hashCanvas(f.app.canvas),original);f.root.querySelector('#redo-btn').click();assert.equal(f.hashCanvas(f.app.canvas),edited);
 await f.app.saveProject();const saved=JSON.parse(localStorage.getItem('neural-photoshop-project'));assert.equal(saved.schema,'swissknife.neural-photoshop.project.v2');assert.equal(saved.output.pixelSha256,edited);
 const image=f.root.querySelector('[data-saved-project-image]'),bytes=f.imageBytes(image),decoded=decodePng(bytes);
 assert.equal(image.complete,true);assert.equal(image.naturalWidth,64);assert.equal(image.naturalHeight,48);assert.equal(hash(bytes),saved.output.sha256);assert.equal(bytes.length,saved.output.bytes);assert.equal(hash(decoded.pixels),edited);assert.equal(f.root.querySelector('[data-project-storage-status]').dataset.projectStorageState,'saved');
});

test('reopen waits for every decoded layer and publishes matching bytes, pixels and metadata atomically',async t=>{
 const f=await fixture(t);await f.edit(f.app,f.root);f.root.querySelector('#add-layer-btn').click();assert.equal(f.app.layers.length,2);await f.app.saveProject();const saved=JSON.parse(localStorage.getItem('neural-photoshop-project')),savedBytes=f.imageBytes(f.root.querySelector('[data-saved-project-image]'));
 f.root.remove();f.setAutomatic(false);const reopened=f.mount();assert.equal(reopened.app.layers.length,1);assert.equal(reopened.root.querySelector('#project-meta').textContent,'No decoded source');assert.equal(reopened.root.querySelector('[data-project-storage-status]').dataset.projectStorageState,'loading');assert.equal(f.pending.length,2);
 f.pending.shift()();await tick();assert.equal(reopened.app.layers.length,1);assert.equal(reopened.root.querySelector('#project-meta').textContent,'No decoded source');
 await f.drain();await reopened.ready;
 assert.equal(reopened.app.layers.length,2);assert.deepEqual(reopened.app.layers.map(x=>x.name),['Background','Layer 2']);assert.equal(f.hashCanvas(reopened.app.canvas),saved.output.pixelSha256);assert.equal(reopened.root.querySelector('#project-meta').textContent,'64×48; Background, Layer 2; Brush stroke');
 const preview=reopened.root.querySelector('[data-saved-project-image]');assert.deepEqual(f.imageBytes(preview),savedBytes);assert.equal(preview.complete,true);assert.equal(reopened.root.querySelector('[data-project-storage-status]').dataset.projectStorageState,'restored');assert.deepEqual(reopened.app.vdaG042.sourceBytes,Uint8Array.from(Buffer.from(SOURCE_PNG,'base64')));
});

test('corrupt layer bytes, output bytes, output pixels or dimensions cannot replace the current edited image',async t=>{
 const f=await fixture(t);await f.edit(f.app,f.root);await f.app.saveProject();const saved=localStorage.getItem('neural-photoshop-project'),layers=f.app.layers,pixels=f.hashCanvas(f.app.canvas),preview=f.root.querySelector('[data-saved-project-image]');
 for(const fault of['layer','output','pixels','dimensions']){const bad=JSON.parse(saved);if(fault==='layer')bad.layers[0].pngSha256='0'.repeat(64);if(fault==='output')bad.output.sha256='0'.repeat(64);if(fault==='pixels')bad.output.pixelSha256='0'.repeat(64);if(fault==='dimensions')bad.width=63;localStorage.setItem('neural-photoshop-project',JSON.stringify(bad));f.app.restoredSavedProject=false;const restored=await f.app.restoreSavedProject();assert.equal(restored,false,fault);assert.equal(f.app.layers,layers);assert.equal(f.hashCanvas(f.app.canvas),pixels);assert.equal(f.root.querySelector('[data-saved-project-image]'),preview);assert.equal(f.root.querySelector('[data-project-storage-status]').dataset.projectStorageState,'error');}
});

test('late decode from a closed editor cannot publish into a new editor',async t=>{
 const f=await fixture(t);await f.edit(f.app,f.root);await f.app.saveProject();f.app.restoredSavedProject=false;f.setAutomatic(false);const restore=f.app.restoreSavedProject();f.root.remove();localStorage.removeItem('neural-photoshop-project');const fresh=f.mount();await fresh.ready;const pixels=f.hashCanvas(fresh.app.canvas);await f.drain();assert.equal(await restore,false);assert.equal(f.hashCanvas(fresh.app.canvas),pixels);assert.equal(fresh.root.querySelector('#project-meta').textContent,'No decoded source');assert.equal(fresh.root.querySelector('[data-saved-project-output]').hidden,true);
});

test('genuine confirmed invalid read and same-CID retry retain reopened editable layers and saved PNG',async t=>{
 const f=await fixture(t);await f.edit(f.app,f.root);f.root.querySelector('#add-layer-btn').click();await f.app.saveProject();f.root.remove();const reopened=f.mount();await reopened.ready;const layers=reopened.app.layers,pixels=f.hashCanvas(reopened.app.canvas),bytes=f.imageBytes(reopened.root.querySelector('[data-saved-project-image]'));
 await f.read(reopened.app,reopened.root,'not-a-cid');assert.match(reopened.root.querySelector('[data-source-result]').textContent,/Source read failed/);assert.equal(reopened.app.layers,layers);assert.equal(f.hashCanvas(reopened.app.canvas),pixels);
 await f.read(reopened.app,reopened.root);assert.equal(f.calls.length,3);assert.equal(f.calls[2].input.policy.consent,'granted');assert.equal(f.calls[2].input.policy.dry_run,false);assert.equal(f.calls[2].input.payload.cid,CID);assert.equal(reopened.app.layers,layers);assert.equal(f.hashCanvas(reopened.app.canvas),pixels);assert.deepEqual(f.imageBytes(reopened.root.querySelector('[data-saved-project-image]')),bytes);assert.match(reopened.root.querySelector('[data-source-result]').textContent,/Current edits kept/);
});

test('cancelled source read does not dispatch or leave a loading state',async t=>{
 const f=await fixture(t);await f.edit(f.app,f.root);const pixels=f.hashCanvas(f.app.canvas),count=f.calls.length;await f.read(f.app,f.root,CID,true);assert.equal(f.calls.length,count);assert.equal(f.hashCanvas(f.app.canvas),pixels);assert.equal(f.root.querySelector('[data-source-cid-state]').dataset.sourceCidState,'decoded-image');assert.equal(f.app.sourceReadPending,false);assert.match(f.root.querySelector('[data-source-result]').textContent,/Cancelled/);
});

test('layer binding is idempotent after actual asynchronous restore and explicit repeated setup',async t=>{
 const f=await fixture(t);await f.edit(f.app,f.root);await f.app.saveProject();f.root.remove();const reopened=f.mount();await reopened.ready;reopened.app.setupLayerHandlers(reopened.root);reopened.app.setupLayerHandlers(reopened.root);const count=reopened.app.layers.length;reopened.root.querySelector('#add-layer-btn').click();assert.equal(reopened.app.layers.length,count+1);
});

test('source controls remain outside optional generation disclosure and all controls have real labels',async t=>{
 const f=await fixture(t);const source=f.root.querySelector('[data-source-cid-input]'),load=f.root.querySelector('#load-source-bytes'),prompt=f.root.querySelector('[data-generation-prompt]');assert.equal(source.closest('details'),null);assert.equal(load.closest('details'),null);const detail=prompt.closest('details');assert.ok(detail);assert.equal(detail.open,false);detail.open=true;assert.equal(prompt.isConnected,true);assert.match(detail.querySelector('summary').textContent,/Generation/);assert.equal(f.root.querySelectorAll('#load-source-bytes').length,1);assert.equal(f.calls.length,0);
});

test('canonical scenario asserts native decoded image and actual retry bytes without changing owner policy',()=>{
 const scenario=JSON.parse(fs.readFileSync(new URL('../e2e/functional-workflows/neural-photoshop.json',import.meta.url)));
 assert.equal(scenario.phases.primary_result.at(-1).probe.kind,'image_state');assert.equal(scenario.phases.persist_reopen.at(-1).probe.kind,'image_state');assert.equal(scenario.phases.failure_recovery.at(-1).probe.kind,'backend_result');assert.equal(scenario.phases.failure_recovery.at(-1).expected,hash(Buffer.from(SOURCE_PNG,'base64')));assert.equal(scenario.backend_bindings[0].consent,'ui_required');assert.equal(scenario.backend_bindings[0].result_assertion.expected,CID);assert.ok(scenario.phases.primary_result.some(s=>s.selector==='#undo-btn'));assert.ok(scenario.phases.primary_result.some(s=>s.selector==='#redo-btn'));assert.equal(scenario.phases.failure_recovery.some(s=>s.op==='wait_ms'),false);
});

test('Save captures one byte/pixel snapshot and reports newer edits as unsaved',async t=>{
 const f=await fixture(t);await f.edit(f.app,f.root);const expected=f.hashCanvas(f.app.canvas),label=f.app.projectMetaLabel;f.setAutomatic(false);const saving=f.app.saveProject();
 f.app.layers[0].context.fillStyle='#00ff00';f.app.layers[0].context.fillRect(0,0,12,12);f.app.redrawCanvas();f.app.saveToHistory('Later edit');const current=f.hashCanvas(f.app.canvas);assert.notEqual(current,expected);
 await f.drain();await saving;const saved=JSON.parse(localStorage.getItem('neural-photoshop-project'));assert.equal(saved.output.pixelSha256,expected);assert.equal(saved.layers[0].pixelSha256,expected);assert.equal(saved.label,label);assert.equal(f.hashCanvas(f.app.canvas),current);assert.equal(f.root.querySelector('[data-project-storage-status]').dataset.projectStorageState,'unsaved');assert.match(f.root.querySelector('[data-project-storage-status]').textContent,/Newer edits/);
});

test('storage failure preserves current pixels without publishing a saved PNG',async t=>{
 const f=await fixture(t);await f.edit(f.app,f.root);const pixels=f.hashCanvas(f.app.canvas);const original=globalThis.localStorage;globalThis.localStorage={getItem:original.getItem.bind(original),setItem(){throw new Error('Authored browser storage quota failure');}};try{await f.app.saveProject();}finally{globalThis.localStorage=original;}assert.equal(f.hashCanvas(f.app.canvas),pixels);assert.equal(f.root.querySelector('[data-saved-project-output]').hidden,true);assert.equal(f.root.querySelector('[data-project-storage-status]').dataset.projectStorageState,'error');
});

test('late old restore cannot overwrite or unlock a fresh editor mounted in the same container',async t=>{
 const f=await fixture(t);await f.edit(f.app,f.root);await f.app.saveProject();f.app.restoredSavedProject=false;f.setAutomatic(false);const old=f.app.restoreSavedProject();localStorage.removeItem('neural-photoshop-project');const fresh=f.mount(f.root);await fresh.ready;fresh.root.inert=true;const pixels=f.hashCanvas(fresh.app.canvas);await f.drain();assert.equal(await old,false);assert.equal(f.hashCanvas(fresh.app.canvas),pixels);assert.equal(fresh.root.querySelector('#project-meta').textContent,'No decoded source');assert.equal(fresh.root.inert,true,'old completion must not unlock a newer mount');
});

test('opening a different local image and Undo/Redo preserve dimensions and honest original CID identity',async t=>{
 const f=await fixture(t);await f.edit(f.app,f.root);const old=f.hashCanvas(f.app.canvas);const rgba=new Uint8ClampedArray(32*24*4);for(let i=0;i<rgba.length;i+=4)rgba.set([20,30,40,255],i);const bytes=png(32,24,rgba);await f.app.loadImageFile(new File([bytes],'Local image.png',{type:'image/png'}));assert.equal(f.app.canvas.width,32);assert.equal(f.app.vdaG042.sourceCid,null);assert.equal(f.app.canvas.dataset.sourceCid,undefined);
 f.root.querySelector('#undo-btn').click();assert.equal(f.app.canvas.width,64);assert.equal(f.app.canvas.height,48);assert.equal(f.hashCanvas(f.app.canvas),old);assert.equal(f.app.vdaG042.sourceCid,CID);f.root.querySelector('#redo-btn').click();assert.equal(f.app.canvas.width,32);assert.equal(f.app.canvas.height,24);assert.equal(f.hashCanvas(f.app.canvas),hash(rgba));assert.equal(f.app.vdaG042.sourceCid,null);assert.equal(f.root.querySelector('[data-source-cid-input]').value,'');
});

// Layout-only regression for the actual desktop's intermediate mount. Happy
// DOM checks the CSS allocation chain; real viewport geometry remains a browser
// qualification responsibility, never authored acceptance evidence.
for (const width of [1440, 390]) test(`native ${width}px window allocates editor separately from its gateway sibling`,async t=>{
 const f=await fixture(t);f.win.happyDOM.setWindowSize({width,height:900});
 const native=document.createElement('section');native.className='window';native.dataset.appId='neural-photoshop';
 native.style.cssText='display:flex;flex-direction:column;height:700px;width:'+Math.min(width,800)+'px';
 const defaults=document.createElement('style');defaults.textContent='.window-content{flex:1;overflow:auto;padding-bottom:56px}.window-app-content{min-height:0}';
 // Put desktop defaults before the application's own scoped stylesheet.
 document.head.prepend(defaults);
 const content=document.createElement('div');content.className='window-content';
 const primary=document.createElement('div');primary.className='window-app-content';
 const mount=f.root;mount.id='unit-neural-content';
 const gateway=document.createElement('div');gateway.className='live-tool-gateway-host';
 gateway.innerHTML='<details><summary>Backends</summary><button>Actual confirmation remains independently reachable</button></details>';
 f.root.replaceWith(native);native.append(content);content.append(primary);primary.append(mount,gateway);
 for(const element of [content,primary,mount,f.root.querySelector('.neural-photoshop-container')]){
  const style=f.win.getComputedStyle(element);assert.equal(style.display,'flex',element.className||element.id);assert.equal(style.minHeight,'0',element.className||element.id);
 }
 for(const element of [primary,mount,f.root.querySelector('.neural-photoshop-container')])assert.equal(f.win.getComputedStyle(element).flexGrow,'1',element.className||element.id);
 assert.equal(f.win.getComputedStyle(content).paddingBottom,'0px');
 assert.equal(f.win.getComputedStyle(mount).overflow,'hidden');
 const footer=f.win.getComputedStyle(gateway);assert.equal(footer.flexShrink,'0');assert.equal(footer.maxHeight,'40%');assert.equal(footer.overflow,'auto');
 assert.equal(gateway.parentElement,primary);assert.equal(gateway.previousElementSibling,mount);assert.equal(gateway.style.pointerEvents,'');
 gateway.querySelector('details').open=true;assert.equal(gateway.querySelector('button').disabled,false);
 assert.equal(f.root.querySelector('#load-source-bytes').disabled,false);assert.equal(f.calls.length,0);
 native.remove();defaults.remove();
});

// The visible canvas dimensions follow actual decoded/local/history pixels.
test('visible canvas size follows source decode, local import, Undo/Redo and reopen',async t=>{
 const f=await fixture(t);const info=()=>f.root.querySelector('#canvas-info').textContent.trim().split(' px |')[0];
 await f.read(f.app,f.root);assert.equal(info(),'64 × 48');
 const rgba=new Uint8ClampedArray(32*24*4);for(let i=0;i<rgba.length;i+=4)rgba.set([20,30,40,255],i);
 await f.app.loadImageFile(new File([png(32,24,rgba)],'Different dimensions.png',{type:'image/png'}));assert.equal(info(),'32 × 24');
 f.root.querySelector('#undo-btn').click();assert.equal(info(),'64 × 48');
 f.root.querySelector('#redo-btn').click();assert.equal(info(),'32 × 24');
 await f.app.saveProject();f.root.remove();const reopened=f.mount();await reopened.ready;
 assert.equal(reopened.root.querySelector('#canvas-info').textContent.trim(),'32 × 24 px | RGB');
 assert.equal(reopened.app.canvas.width,32);assert.equal(reopened.app.canvas.height,24);
});
