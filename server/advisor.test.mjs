import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeSnapshot,DATA_URL} from '../analysis.mjs';
import {FREE_MODEL,advisorReady,validateQuestion,reserveQuestion,explain,handleAdvisor} from './advisor.mjs';
const now=Date.parse('2026-10-15T12:00:00Z');
function snapshot(){
  const rows=Array.from({length:60},(_,i)=>({date:new Date(Date.UTC(2026,7,16+i)).toISOString().slice(0,10),close:100+i,volume:1000+i}));
  return {schema_version:1,generated_at:'2026-10-15T08:00:00Z',assets:[{symbol:'MP.US',name:'MP Materials',currency:'USD',rows,date:rows.at(-1).date,close:rows.at(-1).close}]};
}
const config={ADVISOR_ENABLED:'true',ADVISOR_PROVIDER:'cloudflare-free',ADVISOR_FREE_PLAN_VERIFIED:'true',AI:{run:async()=>({})},ADVISOR_DAILY_LIMIT:'2'};
function storage(){const values=new Map();let tail=Promise.resolve();
  const tx={get:async k=>values.get(k),put:async(k,v)=>values.set(k,v)};
  return {transaction:fn=>{const job=tail.then(()=>fn(tx));tail=job.catch(()=>{});return job;}};
}
test('facts recomputed from valid history; USD never silently converted to EUR',()=>{
  const facts=analyzeSnapshot(snapshot(),'MP',now);
  assert.equal(facts.close,159);assert.equal(facts.currency,'USD');assert.equal(facts.ma20,149.5);
  assert.equal(facts.date,'2026-10-14');assert.equal(facts.above_ma20,true);
  assert.match(facts.limitations.join(' '),/No hay conversión/);
});
test('stale files, bad dates/prices/volume, insufficient and missing history block analysis',()=>{
  for(const mutate of [s=>s.generated_at='2026-10-01',s=>s.assets[0].rows[0].close=0,
    s=>s.assets[0].rows[0].volume=-1,s=>s.assets[0].rows[0].date='2026-02-30',
    s=>s.assets[0].rows[1].date=s.assets[0].rows[0].date,s=>s.assets[0].currency='EUR',
    s=>s.assets[0].close=123,s=>s.assets[0].rows=s.assets[0].rows.slice(-20),
    s=>s.assets.push(structuredClone(s.assets[0]))]){
    const value=snapshot();mutate(value);assert.throws(()=>analyzeSnapshot(value,'MP',now));
  }
  assert.throws(()=>analyzeSnapshot(snapshot(),'TSLA',now));
  assert.throws(()=>analyzeSnapshot(snapshot(),'MP',now+7*86400000));
});
test('AI defaults off and requires explicit model and bounded daily usage',()=>{
  assert.equal(advisorReady({}),false);assert.equal(advisorReady(config),true);
  for(const value of [{...config,ADVISOR_ENABLED:'false'},{...config,ADVISOR_FREE_PLAN_VERIFIED:'false'},
    {...config,ADVISOR_DAILY_LIMIT:'100'},{...config,AI:null},{...config,ADVISOR_PROVIDER:'paid'}])assert.equal(advisorReady(value),false);
  assert.throws(()=>validateQuestion({symbol:'https://evil.example',question:'hello',horizon:'days'}));
  assert.throws(()=>validateQuestion({symbol:'MP',question:'x'.repeat(601),horizon:'days'}));
});
test('usage reservations serialize concurrent attempts and reset on UTC day',async()=>{
  const db=storage();assert.deepEqual(await Promise.all([reserveQuestion(db,2,now),reserveQuestion(db,2,now)]),[true,false]);
  assert.equal(await reserveQuestion(db,2,now+11000),true);
  assert.equal(await reserveQuestion(db,2,now+22000),false);
  assert.equal(await reserveQuestion(db,2,now+86400000),true);
});
test('disabled service and missing data never call the model',async()=>{
  let calls=0;const fetcher=async()=>{calls++;return new Response('{}');};
  const request=()=>new Request('https://private/advisor',{method:'POST',body:JSON.stringify({symbol:'MP',question:'¿Qué falta comprobar?',horizon:'days'})});
  let response=await handleAdvisor(request(),{},storage(),fetcher);assert.equal(response.status,503);assert.equal(calls,0);
  response=await handleAdvisor(request(),config,storage(),fetcher);assert.equal(response.status,422);assert.equal(calls,1);
});
test('model receives only validated facts and bounded question; private token never in input',async()=>{
  let requestBody;
  const answer={summary:'Faltan datos para decidir.',in_favor:['Precio sobre la media.'],against:['Puede caer.'],missing:['Noticias actuales.'],next_step:'Comprobar datos.'};
  const env={...config,API_ACCESS_TOKEN:'private-owner-token',AI:{run:async(model,options)=>{
    assert.equal(model,FREE_MODEL);requestBody=options;return {response:answer};
  }}};
  const output=await explain(validateQuestion({symbol:'MP',question:'¿Cómo lo ves?',horizon:'days'}),analyzeSnapshot(snapshot(),'MP',now),env);
  assert.deepEqual(output,answer);assert.equal(requestBody.max_tokens,1000);
  assert.equal(requestBody.tools,undefined);assert.equal(JSON.stringify(requestBody).includes(env.API_ACCESS_TOKEN),false);
  assert.match(requestBody.messages[0].content,/No inventes/);assert.equal(requestBody.response_format.type,'json_schema');
});
test('refusal, incomplete output and provider failures are explicit errors',async()=>{
  for(const reply of [{},{response:'not JSON'},{response:{}},{response:{summary:'incomplete'}}])
    await assert.rejects(explain({question:'test'}, {},{...config,AI:{run:async()=>reply}}));
  await assert.rejects(explain({question:'test'},{},{...config,AI:{run:async()=>{throw Error('provider unavailable')}}}),/provider unavailable/);
});
test('complete private assistant path returns facts and answer; excess attempts blocked',async()=>{
  const value=snapshot(),day=new Date().toLocaleDateString('en-CA',{timeZone:'America/New_York'});
  value.generated_at=new Date().toISOString();
  value.assets[0].rows=Array.from({length:60},(_,i)=>({date:new Date(Date.parse(day+'T00:00:00Z')-(60-i)*86400000).toISOString().slice(0,10),close:100+i,volume:1000}));
  value.assets[0].date=value.assets[0].rows.at(-1).date;
  const db=storage();let modelCalls=0;
  const answer={summary:'Faltan datos actuales.',in_favor:[],against:[],missing:['Noticias.'],next_step:'Esperar a verificar.'};
  const fetcher=async url=>{
    if(url===DATA_URL)return new Response(JSON.stringify(value));
    assert.fail('Unexpected network call');
  };
  const request=()=>new Request('https://private/advisor',{method:'POST',body:JSON.stringify({symbol:'MP',question:'¿Cómo lo ves?',horizon:'days'})});
  const env={...config,AI:{run:async()=>{modelCalls++;return {response:JSON.stringify(answer)}}}};
  let response=await handleAdvisor(request(),env,db,fetcher);assert.equal(response.status,200);
  const output=await response.json();assert.equal(output.facts.symbol,'MP');assert.deepEqual(output.answer,answer);
  response=await handleAdvisor(request(),env,db,fetcher);assert.equal(response.status,429);assert.equal(modelCalls,1);
});
