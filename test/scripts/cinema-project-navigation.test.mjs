// Authored DOM geometry verifies owned scrolling only, never browser/app acceptance.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {Window} from 'happy-dom';
import {CinemaApp} from '../../web/js/apps/cinema.js';
function environment(t,width=390){
 const window=new Window({url:'http://localhost',width,height:844});
 const names=['window','document','localStorage','sessionStorage','CustomEvent','MutationObserver','fetch'];
 const previous=new Map(names.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
 Object.assign(globalThis,{window,document:window.document,localStorage:window.localStorage,sessionStorage:window.sessionStorage,CustomEvent:window.CustomEvent,MutationObserver:window.MutationObserver,fetch:async()=>{throw Error('UNIT_FORBIDS_NETWORK')}});
 t.after(async()=>{await window.happyDOM.abort();for(const name of names){const descriptor=previous.get(name);if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}});
 for(const match of fs.readFileSync(new URL('../../web/index.html',import.meta.url),'utf8').matchAll(/<link\s+rel="stylesheet"\s+href="([^"]+)"/g)){const style=document.createElement('style');style.textContent=fs.readFileSync(new URL('../../web'+match[1],import.meta.url),'utf8');document.head.append(style);}
 return window;
}
function mount(){
 const shell=document.createElement('section');shell.className='window';shell.dataset.appId='cinema';
 shell.innerHTML='<div class="window-app-content"><div class="cinema-unit-mount"></div></div>';document.body.append(shell);
 const container=shell.querySelector('.cinema-unit-mount');const app=new CinemaApp();app.createInterface(container);
 return{app,shell,container,root:container.querySelector('.cinema-root'),target:container.querySelector('.cinema-vda-workflow'),props:container.querySelector('.cinema-props')};
}
function measured(f){
 for(const[element,clientHeight,scrollHeight]of[[f.root,500,1500],[f.props,200,600]]){Object.defineProperties(element,{clientHeight:{value:clientHeight,configurable:true},scrollHeight:{value:scrollHeight,configurable:true}});}
 f.root.scrollTop=50;f.props.scrollTop=30;
 f.root.getBoundingClientRect=()=>({top:100,height:500});
 f.props.getBoundingClientRect=()=>({top:750-f.root.scrollTop,height:200});
 f.target.getBoundingClientRect=()=>({top:900-f.root.scrollTop-f.props.scrollTop,height:180});
 f.root.querySelector('.cinema-header').getBoundingClientRect=()=>({top:100,height:40});
}
test('Cinema Project actions click reaches the existing panel through owned panes and transfers keyboard focus',t=>{
 const window=environment(t);const f=mount();measured(f);document.documentElement.scrollTop=75;f.shell.scrollTop=52;
 const nav=f.root.querySelector('[data-cinema-navigation="project-actions"]');assert.ok(nav,'header must expose project actions');
 assert.equal(nav.tagName,'BUTTON');assert.equal(nav.type,'button');assert.equal(nav.tabIndex,0);assert.equal(nav.disabled,false);assert.equal(nav.getAttribute('aria-controls'),f.target.id);
 nav.focus();assert.equal(document.activeElement===nav,true);nav.click();
 assert.equal(f.props.scrollTop,142);assert.equal(f.root.scrollTop,610);assert.equal(f.target.getBoundingClientRect().top,148);
 assert.equal(document.activeElement===f.target,true);assert.equal(f.target.tabIndex,-1);
 assert.equal(document.documentElement.scrollTop,75);assert.equal(f.shell.scrollTop,52);
 assert.equal(window.getComputedStyle(f.root.querySelector('.cinema-header')).position,'sticky');
 assert.ok(f.target.querySelector('[data-cinema-workflow="load-project-media-cids"]'));assert.ok(f.target.querySelector('[data-cinema-workflow="simulate-failed-export"]'));
});
test('Cinema navigation is instance-scoped and cannot scroll another editor or replace its genuine state',t=>{
 environment(t,1440);const first=mount(),second=mount();measured(first);measured(second);
 second.root.scrollTop=25;second.props.scrollTop=17;const status=first.target.querySelector('[data-cinema-workflow-status]');status.textContent='Existing owner result retained';
 assert.notEqual(first.target.id,second.target.id);
 const nav=first.root.querySelector('[data-cinema-navigation="project-actions"]');assert.ok(nav);nav.click();
 assert.equal(second.root.scrollTop,25);assert.equal(second.props.scrollTop,17);assert.equal(status.textContent,'Existing owner result retained');
 assert.equal(document.activeElement===first.target,true);
});
test('Cinema navigation clamps to owned scroll bounds and ignores a detached view',t=>{
 environment(t);const f=mount();measured(f);const nav=f.root.querySelector('[data-cinema-navigation="project-actions"]');assert.ok(nav);
 f.target.getBoundingClientRect=()=>({top:100000,height:180});nav.click();assert.equal(f.root.scrollTop,1000);assert.equal(f.props.scrollTop,400);
 f.shell.remove();assert.equal(f.app.revealProjectActions(f.container),false);assert.equal(f.root.scrollTop,1000);
});
