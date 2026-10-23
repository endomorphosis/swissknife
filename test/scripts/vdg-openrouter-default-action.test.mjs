import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {OpenRouterApp} from '../../web/js/apps/openrouter.js';

const first='google/gemini-4-argon';
const second='google/gemini-4-argon:batch';
const special='provider/model:batch[2]&variant+v1';
const model=id=>({id,name:id,provider:id.split('/')[0],context_length:4096,pricing:{prompt:'0.001',completion:'0.002'},features:[]});
function fixture(t,{count=3}={}){
  const window=new Window({url:'http://localhost'});
  const previous=Object.fromEntries(['window','document','localStorage'].map(key=>[key,globalThis[key]]));
  Object.assign(globalThis,{window,document:window.document,localStorage:window.localStorage});
  const app=new OpenRouterApp();
  const ids=count===3?[first,second,special]:[first,second,...Array.from({length:count-2},(_,index)=>`real-provider/model-${index}`)];
  app.models=new Map(ids.map(id=>[id,model(id)]));
  app.providers=new Map([...new Set(ids.map(id=>id.split('/')[0]))].map(id=>[id,{}]));
  app.favoriteModels=new Set(count===3?[first,second]:ids.slice(0,61));
  app.settings.defaultModel=first;
  app.saveSettings();
  document.body.innerHTML=app.render();
  t.after(()=>{window.openRouterApp?.dispose();window.happyDOM.abort();for(const[key,value]of Object.entries(previous)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}});
  const buttons=id=>[...app.getContainer().querySelectorAll('[data-openrouter-action="default"]')].filter(button=>button.dataset.openrouterModel===id);
  return{app,window,buttons};
}
function assertSelected(button,selected){
  assert.equal(button.textContent.trim(),selected?'✓ Default':'Set Default');
  assert.equal(button.getAttribute('aria-pressed'),String(selected));
  assert.equal(button.closest('.model-card').classList.contains('default-model'),selected);
}

test('selecting a real default preserves the app, all button nodes, focus, scroll and existing listeners',t=>{
  const{app,buttons}=fixture(t);
  const root=app.getContainer(),button=buttons(second)[0],grid=root.querySelector('#models-grid');
  const nodes=[...root.querySelectorAll('button')];
  grid.scrollTop=777;grid.scrollLeft=19;button.focus();
  let existing=0;button.addEventListener('vdg-existing',()=>existing++);
  app.setDefaultModel(second);
  assert.ok(app.getContainer()===root,"app root must retain identity");assert.equal(button.isConnected,true);
  assert.ok([...root.querySelectorAll('button')].every((node,index)=>node===nodes[index]),"all button nodes must retain identity");
  assert.ok(document.activeElement===button,"button must retain focus");assert.equal(grid.scrollTop,777);assert.equal(grid.scrollLeft,19);
  button.dispatchEvent(new window.Event('vdg-existing'));assert.equal(existing,1);
});
test('previous and new default classes, labels and aria state update in both catalog and favorite copies',t=>{
  const{app,buttons}=fixture(t);
  assert.equal(buttons(first).length,2);assert.equal(buttons(second).length,2);
  for(const button of buttons(first))assertSelected(button,true);
  app.setDefaultModel(second);
  for(const button of buttons(first))assertSelected(button,false);
  for(const button of buttons(second))assertSelected(button,true);
});
test('all468 catalog models and their four genuine controls remain exact same nodes with61 favorites',t=>{
  const{app}=fixture(t,{count:468});
  const root=app.getContainer();
  const controls=[...root.querySelectorAll('[data-openrouter-action]')];
  const attributes=controls.map(node=>node.outerHTML);
  assert.equal(root.querySelectorAll('[data-openrouter-placement="catalog"]').length,468*4);
  assert.equal(root.querySelectorAll('[data-openrouter-placement="favorites"]').length,61*4);
  app.setDefaultModel(second);
  assert.ok(app.getContainer()===root,"app root must retain identity");assert.ok([...root.querySelectorAll('[data-openrouter-action]')].every((node,index)=>node===controls[index]),"all model controls must retain identity");
  assert.equal(app.models.size,468);assert.equal(app.favoriteModels.size,61);
  for(const[index,node]of controls.entries())if(node.dataset.openrouterAction!=='default')assert.equal(node.outerHTML,attributes[index]);
});
test('repeated default selection retains preferences and DOM while preserving the original four-key save contract',t=>{
  const{app,buttons}=fixture(t);const root=app.getContainer(),button=buttons(first)[0];
  const before=Object.fromEntries(['openrouter_settings','openrouter_favorites','openrouter_conversations','openrouter_history'].map(key=>[key,localStorage.getItem(key)]));
  const writes=[],original=localStorage.setItem.bind(localStorage);t.mock.method(localStorage,'setItem',(key,value)=>{writes.push([key,value]);return original(key,value);});
  app.setDefaultModel(first);app.setDefaultModel(first);
  assert.equal(writes.length,8);for(const[key,value]of writes)assert.equal(value,before[key]);
  assert.ok(app.getContainer()===root,"app root must retain identity");assert.ok(buttons(first)[0]===button,"button must retain identity");
});
test('Try-selected but unsaved default is genuinely persisted, with all original settings and owned data',t=>{
  const{app}=fixture(t);app.settings.defaultModel=second; // The actual Try action changes this value without saving.
  app.settings.temperature=1.25;app.conversations=[{id:'actual-local-conversation'}];app.requestHistory=[{id:'actual-local-request'}];
  app.setDefaultModel(second);
  assert.deepEqual(JSON.parse(localStorage.getItem('openrouter_settings')),app.settings);
  assert.deepEqual(JSON.parse(localStorage.getItem('openrouter_favorites')),[...app.favoriteModels]);
  assert.deepEqual(JSON.parse(localStorage.getItem('openrouter_conversations')),app.conversations);
  assert.deepEqual(JSON.parse(localStorage.getItem('openrouter_history')),app.requestHistory);
});
test('selecting an unchanged default still saves unsaved favorites, conversations and history',t=>{
  const{app}=fixture(t);const settings=localStorage.getItem('openrouter_settings');
  app.favoriteModels.add(special);app.conversations.push({id:'new-unsaved-conversation'});app.requestHistory.push({id:'new-unsaved-request'});
  app.setDefaultModel(first);
  assert.equal(localStorage.getItem('openrouter_settings'),settings);
  assert.deepEqual(JSON.parse(localStorage.getItem('openrouter_favorites')),[...app.favoriteModels]);
  assert.deepEqual(JSON.parse(localStorage.getItem('openrouter_conversations')),app.conversations);
  assert.deepEqual(JSON.parse(localStorage.getItem('openrouter_history')),app.requestHistory);
});
test('colon, slash, brackets, ampersand and plus model identifiers use exact dataset equality',t=>{
  const{app,buttons}=fixture(t);const root=app.getContainer(),button=buttons(special)[0];
  app.setDefaultModel(special);
  assert.equal(app.settings.defaultModel,special);assertSelected(button,true);assert.ok(app.getContainer()===root,"app root must retain identity");
  for(const old of buttons(first))assertSelected(old,false);
});
test('an existing playground model select updates without destroying an unsent prompt or its focus',t=>{
  const{app}=fixture(t);app.currentTab='playground';document.body.innerHTML=app.render();
  const root=app.getContainer(),select=root.querySelector('#playground-model'),prompt=root.querySelector('#playground-input');
  prompt.value='Unsent actual local prompt';prompt.focus();prompt.setSelectionRange(2,8);
  app.setDefaultModel(second);
  assert.ok(app.getContainer()===root,"app root must retain identity");assert.equal(select.value,second);assert.equal(prompt.value,'Unsent actual local prompt');
  assert.ok(document.activeElement===prompt,"prompt must retain focus");assert.equal(prompt.selectionStart,2);assert.equal(prompt.selectionEnd,8);
});
test('the genuine saved default is restored by a new app instance while other storage stays untouched',async t=>{
  const{app}=fixture(t);localStorage.setItem('openrouter_api_key','owned-existing-key');localStorage.setItem('unrelated','exact bytes');
  app.setDefaultModel(second);const next=new OpenRouterApp();await next.loadUserData();
  assert.equal(next.settings.defaultModel,second);assert.equal(localStorage.getItem('openrouter_api_key'),'owned-existing-key');
  assert.equal(localStorage.getItem('unrelated'),'exact bytes');
});
test('a stale instance cannot modify another instance root or save an obsolete default',t=>{
  const{app}=fixture(t);const other=new OpenRouterApp();other.models=new Map(app.models);other.favoriteModels=new Set(app.favoriteModels);
  other.settings.defaultModel=first;other.saveSettings();document.body.insertAdjacentHTML('beforeend',other.render());
  const root=other.getContainer(),html=root.outerHTML,persisted=localStorage.getItem('openrouter_settings');
  app.setDefaultModel(second);
  assert.equal(root.outerHTML,html);assert.equal(localStorage.getItem('openrouter_settings'),persisted);assert.equal(other.settings.defaultModel,first);
});
test('default selection resolves the current root after a genuine favorite action rerenders it',t=>{
  const{app,buttons}=fixture(t);const before=app.getContainer();
  app.toggleFavorite(special);
  const current=app.getContainer(),button=buttons(special)[0];
  assert.ok(current!==before,'existing genuine favorite action still rebuilds its own root');
  assert.equal(buttons(special).length,2);app.setDefaultModel(special);
  assert.ok(app.getContainer()===current,'default selection must patch the newly mounted root');
  assert.equal(button.isConnected,true);for(const copy of buttons(special))assertSelected(copy,true);
  for(const old of buttons(first))assertSelected(old,false);
});
test('storage failure remains visible and cannot display a newly persisted default claim',t=>{
  const{app,buttons}=fixture(t);const root=app.getContainer();
  t.mock.method(localStorage,'setItem',()=>{throw new Error('actual storage write failure');});
  assert.throws(()=>app.setDefaultModel(second),/actual storage write failure/);
  assert.ok(app.getContainer()===root,"app root must retain identity");for(const button of buttons(first))assertSelected(button,true);
});
