import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parse} from 'acorn';
import {Window} from 'happy-dom';

const source=fs.readFileSync(new URL('../../web/js/apps/mcp-control.js',import.meta.url),'utf8');
const ast=parse(source,{ecmaVersion:'latest',sourceType:'module'});
const declaration=ast.body.find(node=>node.type==='ClassDeclaration'&&node.id.name==='MCPControlApp');
const policy=ast.body.find(node=>node.type==='VariableDeclaration'&&node.declarations.some(item=>item.id.name==='MCP_DASHBOARD_BROWSER_POLICY'));
const App=vm.runInNewContext(`${source.slice(policy.start,policy.end)}\n(${source.slice(declaration.start,declaration.end)})`,{console});
const globalRule=['huggingface.css','openrouter.css'].map(name=>{
  const css=fs.readFileSync(new URL('../../web/css/'+name,import.meta.url),'utf8');
  return /(?:^|\n)\.status-indicator\s*\{[^}]+\}/.exec(css)[0];
}).join('\n');
async function fixture(t,{scoped=true,width=390}={}) {
  const window=new Window({width,height:844});t.after(()=>window.happyDOM.abort());
  const app=Object.create(App.prototype);
  Object.assign(app,{servers:new Map(),remoteServers:new Map(),connections:new Map(),serverTemplates:new Map(),connectionHistory:[],autoDiscovery:true,
    refreshLibp2pBrowserDefaults:async()=>{},renderOwnerDiagnostics:()=>'',renderLibp2pBrowserDefaultsPanel:()=>'',renderRecentActivity:()=>'',renderServerList:()=>'',renderModals:()=>''});
  const html=await app.render();
  window.document.body.innerHTML=html+'<section id="other-app"><span class="status-indicator">Other owner</span></section>';
  for(const style of window.document.querySelectorAll('style'))style.remove();
  const style=window.document.createElement('style');
  // Deliberately load the real colliding global dot rules after the app rules.
  style.textContent=(scoped?app.renderLibp2pBrowserStyles().replace(/<\/?style>/g,''):'')+globalRule;
  window.document.head.append(style);
  return window;
}
test('actual MCP rendered header keeps host, remote and discovery labels with all seven actions',async t=>{
  const w=await fixture(t),header=w.document.querySelector('.mcp-header');
  assert.equal(header.querySelectorAll('.status-indicator').length,2);
  assert.equal(header.querySelectorAll('.discovery-status').length,1);
  assert.match(header.textContent,/0 host daemon commands running/);
  assert.match(header.textContent,/0 browser-connected remotes/);
  assert.match(header.textContent,/Auto-discovery ON/);
  assert.equal(header.querySelectorAll('button').length,7);
});
test('real global eight-pixel dot styling cannot constrain the MCP header label boxes',async t=>{
  const before=await fixture(t,{scoped:false});
  assert.equal(before.getComputedStyle(before.document.querySelector('.mcp-header .status-indicator')).height,'8px');
  const after=await fixture(t);
  for(const node of after.document.querySelectorAll('.mcp-header .status-indicator,.mcp-header .discovery-status')){
    const style=after.getComputedStyle(node);
    assert.equal(style.width,'auto');assert.equal(style.height,'auto');assert.equal(style.flexBasis,'auto');
    assert.equal(style.maxWidth,'100%');assert.equal(style.whiteSpace,'normal');
  }
});
test('narrow and desktop headers keep title above normally flowing wrapping status labels',async t=>{
  for(const width of [390,1440]){
    const w=await fixture(t,{width}),header=w.document.querySelector('.mcp-header');
    const column=w.getComputedStyle(header.querySelector('.header-left'));
    assert.equal(column.display,'flex');assert.equal(column.flexDirection,'column');
    assert.equal(w.getComputedStyle(header.querySelector('.server-status')).flexWrap,'wrap');
    for(const node of header.querySelectorAll('.status-indicator,.discovery-status')){
      const style=w.getComputedStyle(node);
      assert.notEqual(style.display,'none');assert.notEqual(style.visibility,'hidden');
      assert.notEqual(style.position,'absolute');assert.equal(style.animation,'none');
    }
  }
});
test('another app retains its real shared status-dot styling',async t=>{
  const w=await fixture(t),style=w.getComputedStyle(w.document.querySelector('#other-app .status-indicator'));
  assert.equal(style.width,'8px');assert.equal(style.height,'8px');
});
