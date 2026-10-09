const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const path=require('node:path'),source=fs.readFileSync(path.join(__dirname,'../live.js'),'utf8');
function setup(config=null,providerOutput=null){
  const ids=['alert-symbol','alert-direction','alert-price','live-status','live-source','live-quotes','alert-status','alert-list','alert-feed','push-enable','push-disable','push-test','alert-create','connect-save','connect-forget','connect-url','connect-code','connection-settings'];
  const elements=Object.fromEntries(ids.map(id=>[id,{value:'',textContent:'',innerHTML:'',disabled:true,querySelectorAll:()=>[]}]));
  let requests=0,permissionRequests=0;
  function indexedDBRequest(){
    let tx={};const db={close(){},transaction(){return tx={objectStore(){return{get(){const r={result:config};setImmediate(()=>{r.onsuccess();tx.oncomplete()});return r},put(v){config=v;const r={};setImmediate(()=>tx.oncomplete());return r}}}}}};
    const request={result:db};setImmediate(()=>request.onsuccess());return request;
  }
  const context=vm.createContext({console,URL,Date,Set,Uint8Array,atob,AbortSignal,
    window:{Notification:{},PushManager:{}},Notification:{requestPermission:async()=>{permissionRequests++;return'granted'}},
    navigator:{},indexedDB:{open:indexedDBRequest},setInterval:()=>1,clearInterval:()=>{},
    document:{hidden:false,getElementById:id=>elements[id],addEventListener:()=>{}},
    fetch:async(url)=>{requests++;let payload;
      if(url.endsWith('/status'))payload={public_key:null,push_ready:false};
      else if(url.endsWith('/quotes'))payload=providerOutput;
      else if(url.endsWith('/rules'))payload={rules:[]};else payload={alerts:[]};
      return{ok:true,json:async()=>payload}}
  });
  vm.runInContext(source,context);return {elements,context,get requests(){return requests},get permissionRequests(){return permissionRequests}};
}
const wait=()=>new Promise(resolve=>setImmediate(()=>setImmediate(resolve)));
(async()=>{
  let app=setup();await wait();assert.equal(app.requests,0);assert.equal(app.permissionRequests,0);
  const quotes=['NVDA','AAPL','MSFT','AMD','AMZN','GOOGL','META','TSLA','AVGO','PLTR','SOFI','RKLB','HIMS','HOOD','IONQ','CRWD','SPY'].map(symbol=>({symbol:symbol+'.US',price:100,currency:'USD',quoted_at:new Date().toISOString()}));
  const config={url:'https://personal.workers.dev',token:'unit-test-owner-token'};
  const output={source:'Finnhub',assets:quotes,errors:[],fetched_at:new Date().toISOString()};
  app=setup(config,output);await wait();assert.match(app.elements['live-status'].textContent,/17\/17 precios disponibles/);
  assert.match(app.elements['live-source'].textContent,/no están certificados/);assert.equal(app.permissionRequests,0);
  const old=structuredClone(output);old.assets.forEach(q=>q.quoted_at=new Date(Date.now()-3600000).toISOString());
  app=setup(config,old);await wait();assert.match(app.elements['live-status'].textContent,/0 con hora/);
  assert.match(app.elements['live-quotes'].innerHTML,/Precio antiguo/);
  const invalid=structuredClone(output);invalid.assets[0].price=0;
  app=setup(config,invalid);await wait();assert.match(app.elements['live-status'].textContent,/inválidas/);
  assert.equal(app.elements['live-quotes'].textContent,'No se muestran precios anteriores como actuales.');
  console.log('Precios: modo sin activar, sin permiso automático, cotizaciones recientes, antiguas e inválidas comprobados');
})().catch(e=>{console.error(e);process.exitCode=1});
