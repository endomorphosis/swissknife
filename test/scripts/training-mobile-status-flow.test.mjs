import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Window} from 'happy-dom';
const source=fs.readFileSync(new URL('../../web/js/apps/training-manager.js',import.meta.url),'utf8');
const plain=/\.training-manager-container \.status-indicator\s*\{([^}]+)\}/.exec(source)?.[0];
const narrow=/@container training-manager \(max-width: 560px\)\s*\{\s*(\.training-manager-container \.toolbar-section:nth-child\(2\) \.status-indicator\s*\{[^}]+\})\s*\}/.exec(source)?.[1];
function fixture(t,active){const w=new Window();t.after(()=>w.happyDOM.abort());w.document.body.innerHTML='<div class="training-manager-container"><div class="toolbar-section"></div><div class="toolbar-section"><div class="status-indicator"><span>IPFS Accelerate: disconnected</span></div><div class="status-indicator">Hugging Face: unavailable</div><div class="status-indicator">P2P: fallback</div></div></div>';const style=w.document.createElement('style');style.textContent=(active?'.training-manager-container .toolbar-section:nth-child(2){display:flex;flex-direction:column}':'')+plain+(active?narrow:'');w.document.head.append(style);return w;}
test('narrow container overrides the inherited220px flex basis for all three actual status nodes',t=>{assert.ok(plain);assert.ok(narrow);const w=fixture(t,true);for(const n of w.document.querySelectorAll('.status-indicator')){const style=w.getComputedStyle(n);assert.equal(style.flexGrow,'0');assert.equal(style.flexShrink,'0');assert.equal(style.flexBasis,'auto');assert.equal(style.minWidth,'0');}assert.match(w.document.body.textContent,/IPFS Accelerate: disconnected/);assert.match(w.document.body.textContent,/Hugging Face: unavailable/);});
test('desktop status wrapping keeps the original declared220px basis',t=>{const w=fixture(t,false);assert.equal(w.getComputedStyle(w.document.querySelector('.status-indicator')).flexBasis,'220px');});
test('narrow correction occurs after the broad status rule and does not hide controls/status',()=>{assert.ok(source.lastIndexOf(narrow)>source.indexOf(plain));assert.doesNotMatch(narrow,/display:\s*none|visibility:\s*hidden|height:\s*0/);});
