/* Private personal-use quote relay and price alerts. Never sends trade orders. */
export const SYMBOLS = ['NVDA','AAPL','MSFT','AMD','AMZN','GOOGL','META','TSLA','AVGO','PLTR','SOFI','RKLB','HIMS','HOOD','IONQ','CRWD','SPY'];
const FRESH_SECONDS = 120;
export const json = (value, status = 200, headers = {}) => new Response(JSON.stringify(value), {
  status, headers: {'Content-Type':'application/json', 'Cache-Control':'no-store', ...headers}});
export function validQuote(symbol, quote, now = Date.now()) {
  if (!SYMBOLS.includes(symbol) || !Number.isFinite(quote.c) || quote.c <= 0 ||
      !Number.isInteger(quote.t) || quote.t <= 0 || quote.t * 1000 > now + 60000)
    throw Error('Invalid provider quote');
  return {symbol: symbol + '.US', currency:'USD', price:quote.c,
    quoted_at:new Date(quote.t * 1000).toISOString(),
    age_seconds:Math.max(0, Math.floor(now / 1000 - quote.t))};
}
export function validateRule(rule) {
  if (!rule || !SYMBOLS.includes(rule.symbol) || !['above','below'].includes(rule.direction) ||
      typeof rule.price !== 'number' || !Number.isFinite(rule.price) || rule.price <= 0 || rule.price > 1000000)
    throw Error('Invalid price alert');
  return {id:crypto.randomUUID(), symbol:rule.symbol, direction:rule.direction, price:rule.price,
    enabled:true, triggered:false, armed_at:new Date().toISOString()};
}
export function reached(rule, quote) {
  return rule.enabled && !rule.triggered && quote.age_seconds <= FRESH_SECONDS &&
    (rule.direction === 'above' ? quote.price >= rule.price : quote.price <= rule.price);
}
export function validEndpoint(endpoint) {
  const u = new URL(endpoint);
  return u.protocol === 'https:' && !u.username && !u.password && !u.port &&
    ['web.push.apple.com','fcm.googleapis.com','updates.push.services.mozilla.com'].includes(u.hostname);
}
const encode = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const decode = text => Uint8Array.from(atob(text.replace(/-/g,'+').replace(/_/g,'/')), c=>c.charCodeAt(0));
export async function vapidAuthorization(endpoint, env) {
  const jwk = JSON.parse(env.VAPID_PRIVATE_JWK);
  if (!env.VAPID_SUBJECT?.startsWith('https://') && !env.VAPID_SUBJECT?.startsWith('mailto:')) throw Error('Missing VAPID subject');
  const key = await crypto.subtle.importKey('jwk', jwk, {name:'ECDSA',namedCurve:'P-256'}, false, ['sign']);
  const header = encode(new TextEncoder().encode(JSON.stringify({typ:'JWT',alg:'ES256'})));
  const claims = encode(new TextEncoder().encode(JSON.stringify({aud:new URL(endpoint).origin,
    exp:Math.floor(Date.now()/1000)+3600, sub:env.VAPID_SUBJECT})));
  const input = header + '.' + claims;
  const signature = await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'}, key, new TextEncoder().encode(input));
  return `vapid t=${input}.${encode(signature)}, k=${env.VAPID_PUBLIC_KEY}`;
}
export async function sendPush(endpoint, env, fetcher = fetch) {
  if (!validEndpoint(endpoint)) throw Error('Unsupported push service');
  // An empty push contains no personal payload. The service worker displays a
  // visible generic notice immediately, then fetches the protected alert feed.
  const response = await fetcher(endpoint, {method:'POST',redirect:'error', headers:{
    Authorization:await vapidAuthorization(endpoint, env), TTL:'300', Urgency:'normal'}});
  if ([404,410].includes(response.status)) return 'expired';
  if (!response.ok) throw Error('Push delivery failed: HTTP ' + response.status);
  return 'accepted'; // Acceptance by the push service is not proof of iPhone delivery.
}
async function smallJSON(request) {
  const body = await request.text();
  if (body.length > 8192) throw Error('Request too large');
  return JSON.parse(body);
}
async function equalSecret(actual, expected) {
  if (!actual || !expected) return false;
  const a = new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(actual)));
  const b = new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(expected)));
  let difference = 0; for (let i=0;i<a.length;i++) difference |= a[i]^b[i];
  return difference === 0;
}
export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    const cors = {'Access-Control-Allow-Origin':env.APP_ORIGIN,
      'Access-Control-Allow-Methods':'GET,POST,DELETE,OPTIONS',
      'Access-Control-Allow-Headers':'Authorization,Content-Type','Vary':'Origin'};
    if (origin && origin !== env.APP_ORIGIN) return json({error:'Forbidden origin'},403);
    if (request.method === 'OPTIONS') return new Response(null,{status:204,headers:cors});
    if (!env.API_ACCESS_TOKEN || env.API_ACCESS_TOKEN.length < 32 || !env.FINNHUB_API_KEY)
      return json({error:'Service not activated'},503,cors);
    if (!await equalSecret(request.headers.get('Authorization'), 'Bearer '+env.API_ACCESS_TOKEN))
      return json({error:'Unauthorized'},401,cors);
    const allowed = ['/quotes','/rules','/alerts','/push','/push-test','/status'];
    const url = new URL(request.url);
    if (!allowed.includes(url.pathname)) return json({error:'Not found'},404,cors);
    const response = await env.HUB.get(env.HUB.idFromName('personal-owner')).fetch(request);
    const headers = new Headers(response.headers);
    for (const [key,value] of Object.entries(cors)) headers.set(key,value);
    return new Response(response.body,{status:response.status,headers});
  },
  async scheduled(event, env, ctx) {
    if (!env.FINNHUB_API_KEY || !env.API_ACCESS_TOKEN) return;
    const hub = env.HUB.get(env.HUB.idFromName('personal-owner'));
    ctx.waitUntil(hub.fetch(new Request('https://internal/refresh',{method:'POST'})).then(response=>{
      if(!response.ok)throw Error('No valid quotes returned by provider');
    }));
  }
};
export class QuoteHub {
  constructor(ctx, env) {this.ctx=ctx;this.env=env;this.refreshing=null;}
  async refresh() {
    if (this.refreshing) return this.refreshing;
    this.refreshing = this.collect().finally(()=>{this.refreshing=null});
    return this.refreshing;
  }
  async collect() {
    const previous = await this.ctx.storage.get('quotes');
    if (previous && Date.now()-Date.parse(previous.fetched_at)<55000) return previous;
    const assets=[], errors=[];
    // A bounded batch of 17 fixed symbols; concurrent clients share this batch.
    await Promise.all(SYMBOLS.map(async symbol=>{
        try {
          const response = await fetch('https://finnhub.io/api/v1/quote?symbol='+symbol,{
            headers:{'X-Finnhub-Token':this.env.FINNHUB_API_KEY},signal:AbortSignal.timeout(10000)});
          if (!response.ok) throw Error('HTTP '+response.status);
          const text = await response.text();
          if (text.length > 32768) throw Error('Oversize quote');
          assets.push(validQuote(symbol,JSON.parse(text)));
        } catch {errors.push(symbol+': cotización no disponible');}
    }));
    const output={source:'Finnhub',fetched_at:new Date().toISOString(),assets,errors,
      poll_seconds:60,delay_verified:false,
      notice:'Se muestra la hora del proveedor. La cobertura y el retraso dependen de su plan; no se garantiza tiempo real.'};
    await this.ctx.storage.put('quotes',output);
    // A failed cycle never falls back to old quotes for alert decisions.
    const rules=await this.ctx.storage.get('rules')||[];
    const alerts=await this.ctx.storage.get('alerts')||[];
    let changed=false;
    for (const rule of rules) {
      const quote=assets.find(q=>q.symbol===rule.symbol+'.US');
      if (quote && reached(rule,quote) && Date.parse(quote.quoted_at)>=Date.parse(rule.armed_at)) {
        rule.triggered=true;
        alerts.push({id:crypto.randomUUID(),rule_id:rule.id,symbol:quote.symbol,
          price:quote.price,quoted_at:quote.quoted_at,created_at:new Date().toISOString(),
          message:quote.symbol+' '+(rule.direction==='above'?'ha alcanzado o superado ':'ha alcanzado o bajado de ')+rule.price+' USD'});
        changed=true;
      }
    }
    if (changed) {
      await this.ctx.storage.put({rules,alerts:alerts.slice(-50),pending_push:true});
    }
    if (await this.ctx.storage.get('pending_push')) {
      const subs=await this.ctx.storage.get('subscriptions')||[];
      let retry=false;
      for (const sub of [...subs]) {
        try {
          const result=await sendPush(sub.endpoint,this.env);
          if (result==='expired') subs.splice(subs.indexOf(sub),1);
        } catch {retry=true;}
      }
      await this.ctx.storage.put({subscriptions:subs,pending_push:retry,
        last_push_status:retry?'Falló algún envío; se reintentará':'Aceptado por el servicio de notificaciones; recepción no comprobada'});
    }
    return output;
  }
  async fetch(request) {
    const url=new URL(request.url), method=request.method;
    try {
      if ((url.pathname==='/refresh' && method==='POST')||(url.pathname==='/quotes' && method==='GET')) {
        const result=await this.refresh();return json(result,result.assets.length?200:503);
      }
      if (url.pathname==='/status' && method==='GET') return json({provider:'Finnhub',
        configured:true,push_ready:!!(this.env.VAPID_PRIVATE_JWK&&this.env.VAPID_PUBLIC_KEY&&this.env.VAPID_SUBJECT),
        public_key:this.env.VAPID_PUBLIC_KEY||null,delay_verified:false,
        last_push_status:await this.ctx.storage.get('last_push_status')||'Todavía no se han enviado avisos'});
      if (url.pathname==='/alerts' && method==='GET') return json({alerts:await this.ctx.storage.get('alerts')||[]});
      if (url.pathname==='/rules' && method==='GET') return json({rules:await this.ctx.storage.get('rules')||[]});
      if (url.pathname==='/rules' && method==='POST') {
        const rules=await this.ctx.storage.get('rules')||[];
        if (rules.filter(r=>r.enabled&&!r.triggered).length>=10) return json({error:'Máximo 10 avisos activos'},409);
        const rule=validateRule(await smallJSON(request));
        await this.ctx.storage.put('rules',[...rules.filter(r=>r.enabled&&!r.triggered),rule]);
        return json(rule,201);
      }
      if (url.pathname==='/rules' && method==='DELETE') {
        const input=await smallJSON(request), rules=await this.ctx.storage.get('rules')||[];
        await this.ctx.storage.put('rules',rules.filter(r=>r.id!==input.id));return json({ok:true});
      }
      if (url.pathname==='/push' && method==='POST') {
        const sub=await smallJSON(request);
        if (!validEndpoint(sub.endpoint)) return json({error:'Servicio de avisos no compatible'},400);
        const subs=await this.ctx.storage.get('subscriptions')||[];
        if (!subs.some(s=>s.endpoint===sub.endpoint)) {
          if (subs.length>=5) return json({error:'Máximo 5 dispositivos'},409);
          subs.push({endpoint:sub.endpoint});await this.ctx.storage.put('subscriptions',subs);
        }
        return json({ok:true});
      }
      if (url.pathname==='/push' && method==='DELETE') {
        const sub=await smallJSON(request), subs=await this.ctx.storage.get('subscriptions')||[];
        await this.ctx.storage.put('subscriptions',subs.filter(s=>s.endpoint!==sub.endpoint));return json({ok:true});
      }
      if (url.pathname==='/push-test' && method==='POST') {
        const sub=await smallJSON(request);
        const subs=await this.ctx.storage.get('subscriptions')||[];
        if (!subs.some(s=>s.endpoint===sub.endpoint)) return json({error:'Dispositivo no registrado'},400);
        const now=new Date().toISOString(), alerts=await this.ctx.storage.get('alerts')||[];
        alerts.push({id:crypto.randomUUID(),type:'test',message:'Prueba de notificaciones de Centinela',
          quoted_at:now,created_at:now});
        await this.ctx.storage.put('alerts',alerts.slice(-50));
        const status=await sendPush(sub.endpoint,this.env);return json({status});
      }
      return json({error:'Not found'},404);
    } catch {return json({error:'No se pudo completar la solicitud; comprueba la conexión y la configuración'},400);}
  }
}
