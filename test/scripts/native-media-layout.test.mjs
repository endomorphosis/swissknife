// Computed-style fixtures exercise the real global cascade; browser geometry remains independently gated.
import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import test from 'node:test';import {parse} from 'acorn';import {Window} from 'happy-dom';import {fileURLToPath} from 'node:url';
const sourceRoot=process.env.SVF_MEDIA_LAYOUT_SOURCE_ROOT||fileURLToPath(new URL('../../../',import.meta.url));
const globalRoot=process.env.SVF_MEDIA_LAYOUT_GLOBAL_ROOT||sourceRoot;
for(const width of [1440,390])for(const appId of ['peertube','media-player'])test(`${appId} ${width}px bounds native root and owns vertical scrolling without changing siblings`,async t=>{
 const w=new Window({url:'http://authored.invalid',width,height:844,settings:{disableCSSFileLoading:true,disableJavaScriptEvaluation:true}});t.after(()=>w.happyDOM.abort());const d=w.document;
 for(const match of fs.readFileSync(globalRoot+'/swissknife/web/index.html','utf8').matchAll(/<link\s+rel="stylesheet"\s+href="([^"]+)"/g)){const st=d.createElement('style');st.textContent=fs.readFileSync(globalRoot+'/swissknife/web'+match[1],'utf8');d.head.append(st);}
 const source=fs.readFileSync(sourceRoot+'/swissknife/web/js/apps/'+appId+'.js','utf8'),ast=parse(source,{ecmaVersion:'latest',sourceType:'module'});
 const name=appId==='peertube'?'PeerTubeApp':'MediaPlayer',node=ast.body.map(n=>n.declaration||n).find(n=>n.type==='ClassDeclaration'&&n.id.name===name),functions=ast.body.filter(n=>n.type==='FunctionDeclaration').map(n=>source.slice(n.start,n.end)).join('\n');
 const App=vm.runInNewContext(functions+';('+source.slice(node.start,node.end)+')',{window:w,document:d,localStorage:w.localStorage,console:{log(){},warn(){},error(){}},URL,crypto:globalThis.crypto,setTimeout,clearTimeout});
 const app=new App({});const host=d.createElement('section');host.className='window';host.dataset.appId=appId;host.innerHTML='<div class="window-content"><div class="window-app-content"><div id="unit-content"></div><div class="live-tool-gateway-host">Shared tool status</div></div></div>';d.body.append(host);
 const mount=host.querySelector('#unit-content');mount.innerHTML=appId==='peertube'?app.getHTML():app.createInterface();if(appId==='peertube'){const st=d.createElement('style');st.textContent=app.getCSS();d.head.append(st);}
 const root=host.querySelector(appId==='peertube'?'.peertube-container':'.media-player-container');
 for(const sel of ['.window-content','.window-app-content','#unit-content']){const style=w.getComputedStyle(host.querySelector(sel));assert.equal(style.display,'flex',sel);assert.equal(style.flexDirection,'column',sel);assert.equal(style.minHeight,'0',sel);assert.equal(style.overflow,'hidden',sel);}
 const style=w.getComputedStyle(root);assert.equal(style.flexGrow,'1');assert.equal(style.flexBasis,'0px');assert.equal(style.minHeight,'0');assert.equal(style.height,'auto');
 const scroller=w.getComputedStyle(appId==='peertube'?root.querySelector('.content-area'):root);assert.equal(scroller.overflowY,'auto');assert.equal(scroller.overflowX,'hidden');
 for(const sel of appId==='peertube'?['#cid-open-btn','[data-cid-play]','[data-cid-seek]']:['#playButton','#progressBar','.vda-tools-summary'])assert.ok(root.querySelector(sel),'Existing actual playback/control remains present: '+sel);
 assert.ok(host.querySelector('.live-tool-gateway-host'),'Shared tool status remains present');
 const sibling=d.createElement('section');sibling.className='window';sibling.dataset.appId='unrelated';sibling.innerHTML='<div class="window-content"><div class="window-app-content"><div id="sibling-content"></div></div></div>';d.body.append(sibling);assert.notEqual(w.getComputedStyle(sibling.querySelector('#sibling-content')).flexBasis,'0px','Owned rule cannot style unrelated app mount');
});
