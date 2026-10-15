import test from 'node:test';
import assert from 'node:assert/strict';
class Element{
  constructor(){this.children=[];this.events={};this.textContent='';this.value='';}
  append(node){this.children.push(node);}
  replaceChildren(){this.children=[];this.textContent='';}
  addEventListener(name,handler){this.events[name]=handler;}
}
const elements=new Map(),get=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);};
globalThis.document={getElementById:get,createElement:()=>new Element()};
let view='',submits=0;globalThis.window={goToView:name=>view=name};get('consult-form').requestSubmit=()=>submits++;
const today=new Date().toLocaleDateString('en-CA',{timeZone:'America/New_York'});
const end=Date.parse(today+'T00:00:00Z')-86400000;
const rows=Array.from({length:60},(_,i)=>({date:new Date(end-(59-i)*86400000).toISOString().slice(0,10),close:i===59?80:100,volume:1000}));
let data={schema_version:1,generated_at:new Date().toISOString(),assets:[{symbol:'MP.US',name:'MP Materials',currency:'USD',rows,date:rows.at(-1).date,close:80}]};
globalThis.fetch=async()=>({ok:true,json:async()=>data});
await import('../radar.js');
await new Promise(resolve=>setImmediate(resolve));
const text=node=>[node.textContent,...node.children.map(text)].join(' ');
test('missing international data is explicit, and research opens the correct asset',()=>{
  assert.match(get('radar-status').textContent,/0\/8 referencias/);
  assert.equal(get('radar-regions').children.length,4);assert.equal(get('radar-sectors').children.length,4);
  assert.match(text(get('radar-regions')),/Sin cierre válido/);
  assert.match(text(get('radar-companies')),/entrada sin validar/);
  const card=get('radar-companies').children.find(c=>c.className==='research-card');
  card.children.find(c=>c.textContent==='Investigar este activo').events.click();
  assert.equal(view,'home');assert.equal(get('consult-symbol').value,'MP');assert.equal(submits,1);
});
test('a failed refresh removes previous candidates rather than retaining stale opportunities',async()=>{
  data={...data,generated_at:'2020-01-01'};await get('radar-refresh').events.click();
  assert.equal(get('radar-companies').children.length,0);assert.equal(get('radar-regions').children.length,0);
  assert.match(get('radar-status').textContent,/No hay datos recientes/);assert.equal(get('radar-refresh').disabled,false);
});
