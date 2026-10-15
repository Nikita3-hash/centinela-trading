import test from 'node:test';
import assert from 'node:assert/strict';
class Element {
  constructor(){this.children=[];this.events={};this.value='';this.textContent='';this.disabled=false;this.hidden=false;}
  append(node){this.children.push(node);}
  replaceChildren(){this.children=[];this.textContent='';}
  addEventListener(name,handler){this.events[name]=handler;}
}
const elements=new Map(),get=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);};
globalThis.document={getElementById:get,querySelectorAll:()=>[],createElement:()=>new Element()};
globalThis.window={};const saved=new Map();
globalThis.localStorage={getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,v),removeItem:k=>saved.delete(k)};
const today=new Date().toLocaleDateString('en-CA',{timeZone:'America/New_York'});
const rows=Array.from({length:60},(_,i)=>({date:new Date(Date.parse(today+'T00:00:00Z')-(60-i)*86400000).toISOString().slice(0,10),close:100+i,volume:1000}));
const data={schema_version:1,generated_at:new Date().toISOString(),assets:[{symbol:'MP.US',name:'MP Materials',currency:'USD',date:rows.at(-1).date,close:159,rows}]};
let requests=0;
globalThis.fetch=async()=>{requests++;return {ok:true,json:async()=>structuredClone(data)}};
await import('../consult.js');
const submit=()=>get('consult-form').events.submit({preventDefault(){}});
const text=node=>[node.textContent,...node.children.map(text)].join(' ');
test('factual lookup is separate from AI, refreshes data, and cannot silently convert EUR',async()=>{
  get('consult-symbol').value='MP Materials';await submit();
  assert.equal(get('consult-result').hidden,false);assert.match(text(get('consult-result')),/Ficha calculada · sin IA/);
  assert.match(text(get('consult-result')),/dólares/);assert.match(text(get('consult-result')),/No se compara/);
  assert.equal(get('consult-ai-send').disabled,true);assert.match(get('consult-ai-state').textContent,/pendiente de activación/);
  const before=requests;await submit();assert.equal(requests,before+1);
  get('consult-symbol').value='UNKN';await submit();assert.equal(get('consult-result').hidden,true);
  assert.match(get('consult-message').textContent,/No hay un historial/);
});
test('invalid dates hide previous facts and do not call the model',async()=>{
  let calls=0;window.centinelaAdvisor={status:async()=>{calls++;return {ready:true,daily_limit:2}}};
  get('consult-symbol').value='MP';data.generated_at='2020-01-01';await submit();
  assert.equal(calls,0);assert.equal(get('consult-result').hidden,true);assert.equal(get('consult-ai-send').disabled,true);
});
test('local plan rejects ambiguous amounts and has explicit save and erase',()=>{
  get('plan-monthly').value='1.000';get('plan-loss').value='10';get('plan-save').events.click();assert.equal(saved.size,0);
  get('plan-monthly').value='100,50';get('plan-horizon').value='years';get('plan-save').events.click();
  assert.equal(JSON.parse(saved.get('centinela-plan')).monthly,'100,50');
  get('plan-forget').events.click();assert.equal(saved.size,0);assert.equal(get('plan-monthly').value,'');
});
