// Actual rendered markup/global stylesheet cascade; no browser acceptance claim.
import assert from 'node:assert/strict';import fs from 'node:fs';import test from 'node:test';import {Window} from 'happy-dom';
import {AIChatApp} from '../../web/js/apps/ai-chat.js';
function rgb(value){const hex=/^#([0-9a-f]{6})$/i.exec(value.trim());if(hex)return[0,2,4].map(i=>parseInt(hex[1].slice(i,i+2),16));const parts=value.match(/[\d.]+/g);assert.ok(parts?.length>=3,'computed color must be concrete RGB');return parts.slice(0,3).map(Number);}
function luminance(color){return rgb(color).map(x=>x/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4).reduce((sum,x,i)=>sum+x*[.2126,.7152,.0722][i],0);}
for(const width of [1440,390])test(`AI Assistant heading has readable contrast at ${width}px with actual globally loaded CSS`,async t=>{
 const window=new Window({url:'http://localhost',width,height:900,settings:{disableJavaScriptEvaluation:true,disableCSSFileLoading:true}});
 const names=['window','document','localStorage'];const old=new Map(names.map(n=>[n,Object.getOwnPropertyDescriptor(globalThis,n)]));Object.assign(globalThis,{window,document:window.document,localStorage:window.localStorage});
 t.after(async()=>{await window.happyDOM.abort();for(const n of names){if(old.get(n))Object.defineProperty(globalThis,n,old.get(n));else delete globalThis[n];}});
 for(const m of fs.readFileSync(new URL('../../web/index.html',import.meta.url),'utf8').matchAll(/<link\s+rel="stylesheet"\s+href="([^"]+)"/g)){const style=document.createElement('style');style.textContent=fs.readFileSync(new URL('../../web'+m[1],import.meta.url),'utf8');document.head.append(style);}
 const app=new AIChatApp({windows:new Map()});const shell=document.createElement('section');shell.className='window';shell.dataset.appId='ai-chat';shell.innerHTML=await app.render();document.body.append(shell);
 const heading=shell.querySelector('.chat-header h3');assert.match(heading.textContent,/AI Assistant/);const foreground=window.getComputedStyle(heading).color;const pane=window.getComputedStyle(shell.querySelector('.ai-chat-container'));const background=pane.getPropertyValue('--sk-bg-panel').trim()||'#101b18';const a=luminance(foreground),b=luminance(background);assert.ok((Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=4.5,`heading ${foreground} must contrast with pane ${background}`);
 const sibling=document.createElement('section');sibling.className='window';sibling.dataset.appId='openrouter';sibling.innerHTML='<div class="chat-header"><h3>Unchanged sibling</h3></div>';document.body.append(sibling);assert.notEqual(window.getComputedStyle(sibling.querySelector('h3')).color,foreground,'fix must stay within AI Chat');
});
