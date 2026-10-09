import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import worker,{QuoteHub,SYMBOLS,validQuote,validateRule,reached,validEndpoint,vapidAuthorization,sendPush} from './worker.mjs';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const quote=(age=0,price=100)=>({c:price,t:Math.floor(Date.now()/1000)-age});
const token='owner-access-token-with-more-than-32-characters';
function store(initial={}){
  const map=new Map(Object.entries(initial));return {
    get:async key=>structuredClone(map.get(key)),
    put:async (key,value)=>{if(typeof key==='string')map.set(key,structuredClone(value));else for(const [k,v] of Object.entries(key))map.set(k,structuredClone(v))}
  };
}
function env(){return {API_ACCESS_TOKEN:token,FINNHUB_API_KEY:'unit-test-only',APP_ORIGIN:'https://nikita3-hash.github.io',
  HUB:{idFromName:()=>1,get:()=>({fetch:async()=>new Response('{"private":true}',{headers:{'Content-Type':'application/json'}})})}}}
test('zero, NaN, wrong timestamps and unexpected symbols rejected',()=>{
  for(const q of [{c:0,t:1},{c:NaN,t:1},{c:10,t:0},{c:10,t:1.5},{c:10,t:Math.floor(Date.now()/1000)+70}])
    assert.throws(()=>validQuote('AAPL',q));
  assert.throws(()=>validQuote('OTHER',quote()));
  assert.equal(validQuote('AAPL',quote(300)).age_seconds,300);
});
test('old quotes never trigger and rules trigger at the requested level',()=>{
  const rule=validateRule({symbol:'AAPL',direction:'above',price:100});
  assert.equal(reached(rule,validQuote('AAPL',quote(0,100))),true);
  assert.equal(reached(rule,validQuote('AAPL',quote(300,200))),false);
  assert.equal(reached({...rule,triggered:true},validQuote('AAPL',quote(0,200))),false);
  assert.equal(reached({...rule,direction:'below'},validQuote('AAPL',quote(0,99))),true);
  for(const r of [{symbol:'AAPL',direction:'above',price:0},{symbol:'AAPL',direction:'buy',price:100},{symbol:'OTHER',direction:'above',price:100}])assert.throws(()=>validateRule(r));
});
test('public requests do not expose quotes or provider secrets',async()=>{
  let r=await worker.fetch(new Request('https://worker/quotes'),env());assert.equal(r.status,401);
  assert.equal((await r.text()).includes('unit-test-only'),false);
  r=await worker.fetch(new Request('https://worker/quotes',{headers:{Authorization:'Bearer '+token,Origin:'https://evil.example'}}),env());assert.equal(r.status,403);
  r=await worker.fetch(new Request('https://worker/quotes',{headers:{Authorization:'Bearer '+token,Origin:'https://nikita3-hash.github.io'}}),env());
  assert.equal(r.status,200);assert.equal(r.headers.get('Access-Control-Allow-Origin'),'https://nikita3-hash.github.io');
  r=await worker.fetch(new Request('https://worker/quotes'),{...env(),FINNHUB_API_KEY:null});assert.equal(r.status,503);
});
test('preflight works and the internal refresh endpoint cannot be called publicly',async()=>{
  const r=await worker.fetch(new Request('https://worker/quotes',{method:'OPTIONS',headers:{Origin:'https://nikita3-hash.github.io'}}),env());assert.equal(r.status,204);
  const internal=await worker.fetch(new Request('https://worker/refresh',{headers:{Authorization:'Bearer '+token}}),env());assert.equal(internal.status,404);
});
test('push endpoints reject arbitrary addresses and embedded credentials',()=>{
  assert.equal(validEndpoint('https://web.push.apple.com/notification'),true);
  assert.equal(validEndpoint('https://evil.example/notification'),false);
  assert.equal(validEndpoint('https://user:pass@web.push.apple.com/a'),false);
  assert.equal(validEndpoint('http://web.push.apple.com/a'),false);
  assert.equal(validEndpoint('https://web.push.apple.com:999/a'),false);
});
test('provider failure cannot reuse a previous quote or trigger alerts',async()=>{
  const previousFetch=globalThis.fetch;
  const storage=store({quotes:{fetched_at:new Date(Date.now()-60000).toISOString(),assets:[validQuote('AAPL',quote())]},
    rules:[{...validateRule({symbol:'AAPL',direction:'above',price:1}),armed_at:'2026-01-01T00:00:00Z'}]});
  const hub=new QuoteHub({storage},env());
  globalThis.fetch=async()=>new Response('not available',{status:429});
  try{const result=await hub.refresh();assert.equal(result.assets.length,0);assert.equal(result.errors.length,17);
    assert.equal((await storage.get('rules'))[0].triggered,false);assert.equal(await storage.get('alerts'),undefined);
    const response=await hub.fetch(new Request('https://internal/quotes'));assert.equal(response.status,503);
  }finally{globalThis.fetch=previousFetch}
});
test('concurrent calls share one collection, successful data cached, alert fires once',async()=>{
  const previousFetch=globalThis.fetch;let calls=0;
  const storage=store({rules:[{...validateRule({symbol:'AAPL',direction:'above',price:99}),armed_at:'2026-01-01T00:00:00Z'}]});
  const hub=new QuoteHub({storage},env());
  globalThis.fetch=async()=>{calls++;return new Response(JSON.stringify(quote()))};
  try{
    const [a,b]=await Promise.all([hub.refresh(),hub.refresh()]);assert.equal(calls,17);assert.equal(a.assets.length,17);assert.equal(b.assets.length,17);
    assert.equal((await storage.get('alerts')).length,1);await hub.refresh();assert.equal(calls,17);
    const cached=await storage.get('quotes');cached.fetched_at=new Date(Date.now()-60000).toISOString();await storage.put('quotes',cached);
    await hub.refresh();assert.equal(calls,34);assert.equal((await storage.get('alerts')).length,1);
  }finally{globalThis.fetch=previousFetch}
});
test('a quote from before creation of an alert cannot trigger it',async()=>{
  const previousFetch=globalThis.fetch;
  const storage=store({rules:[{...validateRule({symbol:'AAPL',direction:'above',price:1}),armed_at:new Date(Date.now()+1000).toISOString()}]});
  globalThis.fetch=async()=>new Response(JSON.stringify(quote()));
  try{await new QuoteHub({storage},env()).refresh();assert.equal((await storage.get('rules'))[0].triggered,false)}finally{globalThis.fetch=previousFetch}
});
test('VAPID JWT has a valid signature and a restricted audience',async()=>{
  const keys=await webcrypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
  const privateJwk=await webcrypto.subtle.exportKey('jwk',keys.privateKey);
  const publicKey=Buffer.from(await webcrypto.subtle.exportKey('raw',keys.publicKey)).toString('base64url');
  const config={VAPID_PRIVATE_JWK:JSON.stringify(privateJwk),VAPID_PUBLIC_KEY:publicKey,VAPID_SUBJECT:'https://nikita3-hash.github.io/centinela-trading/'};
  const auth=await vapidAuthorization('https://web.push.apple.com/test',config);
  const jwt=auth.split('t=')[1].split(',')[0],pieces=jwt.split('.');
  const claims=JSON.parse(Buffer.from(pieces[1],'base64url'));
  assert.equal(claims.aud,'https://web.push.apple.com');assert.ok(claims.exp> Date.now()/1000);
  assert.equal(await webcrypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},keys.publicKey,Buffer.from(pieces[2],'base64url'),new TextEncoder().encode(pieces[0]+'.'+pieces[1])),true);
  assert.equal(await sendPush('https://web.push.apple.com/test',config,async(url,options)=>{
    assert.equal(options.headers['Content-Length'],'0');assert.equal(options.body.byteLength,0);
    assert.ok(options.signal);return new Response(null,{status:201});}),'accepted');
  assert.equal(await sendPush('https://web.push.apple.com/test',config,async()=>new Response(null,{status:410})),'expired');
  await assert.rejects(sendPush('https://web.push.apple.com/test',config,async()=>
    new Response('{"reason":"BadWebPushRequest"}',{status:400})),/HTTP 400 · BadWebPushRequest/);
  await assert.rejects(sendPush('https://web.push.apple.com/test',config,async()=>
    new Response('{"reason":"private-provider-secret"}',{status:403})),error=>
      error.message.includes('HTTP 403')&&!error.message.includes('private-provider-secret'));
});
test('rules persist and can be deleted; unknown devices cannot request test notifications',async()=>{
  const storage=store(),hub=new QuoteHub({storage},env());
  let r=await hub.fetch(new Request('https://internal/rules',{method:'POST',body:JSON.stringify({symbol:'NVDA',direction:'below',price:200})}));
  assert.equal(r.status,201);const rule=await r.json();assert.equal((await storage.get('rules')).length,1);
  r=await hub.fetch(new Request('https://internal/rules',{method:'DELETE',body:JSON.stringify({id:rule.id})}));assert.equal(r.status,200);assert.equal((await storage.get('rules')).length,0);
  r=await hub.fetch(new Request('https://internal/push-test',{method:'POST',body:JSON.stringify({endpoint:'https://web.push.apple.com/test'})}));assert.equal(r.status,400);
});