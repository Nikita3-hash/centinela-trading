/* Quotes and owner-defined price alerts. Daily technical scores stay separate. */
(()=>{
  const el=id=>document.getElementById(id), escape=value=>String(value).replace(/[&<>"']/g,
    c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let config=null, subscription=null, busy=false, timer=null, publicKey=null;
  const symbols=['NVDA','AAPL','MSFT','AMD','AMZN','GOOGL','META','TSLA','AVGO','PLTR','SOFI','RKLB','HIMS','HOOD','IONQ','CRWD','SPY'];
  el('alert-symbol').innerHTML=symbols.map(s=>`<option>${s}</option>`).join('');
  function database(){return new Promise((resolve,reject)=>{
    const request=indexedDB.open('centinela-live',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('settings');
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(Error('No se pueden guardar los ajustes'));
  })}
  async function settings(value){const db=await database();return new Promise((resolve,reject)=>{
    const tx=db.transaction('settings',value===undefined?'readonly':'readwrite');
    const store=tx.objectStore('settings');const request=value===undefined?store.get('connection'):store.put(value,'connection');
    request.onsuccess=()=>{if(value===undefined)resolve(request.result)};
    tx.oncomplete=()=>{db.close();if(value!==undefined)resolve(value)};tx.onerror=()=>reject(Error('No se pueden guardar los ajustes'));
  })}
  async function api(path,method='GET',body){
    if(!config)throw Error('La conexión de precios todavía no está activada');
    const response=await fetch(config.url+path,{method,cache:'no-store',signal:AbortSignal.timeout(15000),
      headers:{Authorization:'Bearer '+config.token,...(body?{'Content-Type':'application/json'}:{})},
      body:body?JSON.stringify(body):undefined});
    if(!response.ok)throw Error(response.status===401?'Conexión no autorizada: vuelve a conectar':response.status===503?'El servicio todavía no está activado':'El servicio no responde (HTTP '+response.status+')');
    return response.json();
  }
  const time=value=>new Date(value).toLocaleString('es-ES');
  function renderQuotes(output){
    if(output.source!=='Finnhub'||!Array.isArray(output.assets)||!Array.isArray(output.errors)||
      !Number.isFinite(Date.parse(output.fetched_at))||Date.parse(output.fetched_at)>Date.now()+60000)throw Error('Respuesta de precios inválida');
    const quotes=output.assets.filter(q=>symbols.includes(q.symbol?.replace('.US',''))&&q.currency==='USD'&&
      typeof q.price==='number'&&Number.isFinite(q.price)&&q.price>0&&Number.isFinite(Date.parse(q.quoted_at))&&Date.parse(q.quoted_at)<=Date.now()+60000);
    if(quotes.length!==output.assets.length||new Set(quotes.map(q=>q.symbol)).size!==quotes.length||quotes.length+output.errors.length!==17)throw Error('Cobertura o cotizaciones inválidas');
    if(!quotes.length)throw Error('El proveedor no ha devuelto precios válidos');
    const fresh=quotes.filter(q=>Date.now()-Date.parse(q.quoted_at)<=120000).length;
    el('live-status').textContent=`${quotes.length}/17 precios disponibles · ${fresh} con hora de hace menos de 2 minutos`;
    el('live-status').className=fresh===quotes.length?'good':'warning';
    el('live-source').textContent='Consulta del servicio: '+time(output.fetched_at)+'. Fuente: Finnhub. El retraso y la cobertura del mercado no están certificados. Los criterios del radar siguen usando cierres diarios.';
    el('live-quotes').innerHTML=quotes.map(q=>{
      const stale=Date.now()-Date.parse(q.quoted_at)>120000;
      return `<div class="asset"><div class="row"><strong>${escape(q.symbol.replace('.US',''))}</strong><span>${q.price.toLocaleString('es-ES',{minimumFractionDigits:2,maximumFractionDigits:2})} USD</span></div><small class="${stale?'warning':''}">Hora del precio: ${escape(time(q.quoted_at))}${stale?' · Precio antiguo; puede ser un cierre o un dato retrasado':''}</small></div>`;
    }).join('');
  }
  async function renderRules(){
    const output=await api('/rules');
    if(!Array.isArray(output.rules))throw Error('Respuesta de avisos inválida');
    el('alert-list').innerHTML=output.rules.map(r=>`<div class="asset"><div class="row"><span>${escape(r.symbol)} ${r.direction==='above'?'≥':'≤'} ${escape(r.price)} USD${r.triggered?' · Ya alcanzado':''}</span><button class="secondary" data-remove="${escape(r.id)}">Eliminar</button></div></div>`).join('')||'Todavía no has creado avisos.';
    el('alert-list').querySelectorAll('[data-remove]').forEach(b=>b.onclick=async()=>{
      try{await api('/rules','DELETE',{id:b.dataset.remove});await renderRules()}catch(e){el('alert-status').textContent=e.message}
    });
    const feed=await api('/alerts');
    el('alert-feed').innerHTML=(feed.alerts||[]).slice(-5).reverse().map(a=>`<div class="asset">${escape(a.message)}<br><small>Hora del precio: ${escape(time(a.quoted_at))}</small></div>`).join('');
  }
  async function refresh(){
    if(!config||busy||document.hidden)return;
    busy=true;
    try{renderQuotes(await api('/quotes'));await renderRules()}
    catch(e){el('live-status').textContent=e.message;el('live-status').className='warning';el('live-quotes').textContent='No se muestran precios anteriores como actuales.'}
    finally{busy=false}
  }
  async function start(){
    if(timer)clearInterval(timer);
    if(!config)return;
    const status=await api('/status');publicKey=status.public_key;
    el('push-enable').disabled=!status.push_ready;
    el('alert-create').disabled=false;
    el('alert-status').textContent=status.push_ready?'Puedes crear avisos y activar las notificaciones.':'Los precios están conectados. El servicio de notificaciones todavía no está preparado.';
    await refresh();timer=setInterval(refresh,60000);
  }
  function decode(text){return Uint8Array.from(atob(text.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0))}
  async function registration(){
    if(!('serviceWorker' in navigator)||!('PushManager' in window)||!('Notification' in window))
      throw Error('En iPhone: añade esta página a la pantalla de inicio y ábrela desde su icono. Se requiere iOS 16.4 o posterior.');
    await navigator.serviceWorker.register('./sw.js',{scope:'./'});
    return navigator.serviceWorker.ready;
  }
  el('connect-save').onclick=async()=>{
    try{
      const url=new URL(el('connect-url').value.trim());
      if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||!url.hostname.endsWith('.workers.dev'))throw Error('Introduce la dirección segura del servicio personal');
      const token=el('connect-code').value.trim();if(token.length<32)throw Error('Código de conexión incompleto');
      const previous=config;config={url:url.origin,token};
      try{await api('/status')}catch(e){config=previous;throw e}
      await settings(config);el('connect-code').value='';el('connection-settings').open=false;await start();
    }catch(e){el('live-status').textContent=e.message}
  };
  el('connect-forget').onclick=async()=>{
    try{
      if(subscription)await api('/push','DELETE',{endpoint:subscription.endpoint});
      if(subscription)await subscription.unsubscribe();subscription=null;
      await settings(null);config=null;publicKey=null;if(timer)clearInterval(timer);
      el('live-status').textContent='Conexión desactivada en este dispositivo';el('live-quotes').textContent='';
      el('alert-list').textContent='';el('alert-feed').textContent='';el('push-enable').disabled=true;el('push-disable').disabled=true;el('push-test').disabled=true;el('alert-create').disabled=true;
    }catch(e){el('alert-status').textContent='No se pudo desconectar: '+e.message}
  };
  el('alert-create').onclick=async()=>{
    try{
      const price=Number(el('alert-price').value.replace(',','.'));
      if(!Number.isFinite(price)||price<=0)throw Error('Introduce un precio mayor que cero en USD');
      await api('/rules','POST',{symbol:el('alert-symbol').value,direction:el('alert-direction').value,price});
      el('alert-status').textContent='Aviso guardado. Se activará una sola vez si el proveedor devuelve un precio reciente que alcance ese nivel.';
      await renderRules();
    }catch(e){el('alert-status').textContent=e.message}
  };
  el('push-enable').onclick=async()=>{
    try{
      // Permission is requested only in direct response to this button.
      if(!publicKey)throw Error('Las notificaciones no están configuradas');
      if(!('Notification' in window)||!('PushManager' in window))throw Error('En iPhone, abre la app desde la pantalla de inicio. Se requiere iOS 16.4 o posterior.');
      const permission=await Notification.requestPermission();if(permission!=='granted')throw Error('Notificaciones no permitidas. Puedes seguir consultando los precios.');
      const reg=await registration();subscription=await reg.pushManager.getSubscription()||await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:decode(publicKey)});
      await api('/push','POST',{endpoint:subscription.endpoint});
      el('push-disable').disabled=false;el('push-test').disabled=false;
      el('alert-status').textContent='Dispositivo registrado. Pulsa «Enviar aviso de prueba» para comprobar la recepción en tu iPhone.';
    }catch(e){el('alert-status').textContent=e.message}
  };
  el('push-test').onclick=async()=>{
    try{
      const result=await api('/push-test','POST',{endpoint:subscription.endpoint});
      if(result.status!=='accepted')throw Error('El registro de este dispositivo ha caducado');
      el('alert-status').textContent='El servicio ha aceptado el aviso de prueba. Comprueba que llega al iPhone; la aceptación no confirma su recepción.';
    }catch(e){el('alert-status').textContent=e.message}
  };
  el('push-disable').onclick=async()=>{
    try{await api('/push','DELETE',{endpoint:subscription.endpoint});await subscription.unsubscribe();subscription=null;
      el('push-disable').disabled=true;el('push-test').disabled=true;el('alert-status').textContent='Notificaciones desactivadas en este dispositivo.';
    }catch(e){el('alert-status').textContent=e.message}
  };
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});
  settings().then(async value=>{
    config=value;if(config){await start();
      if('serviceWorker' in navigator){const reg=await navigator.serviceWorker.getRegistration('./');
        subscription=await reg?.pushManager.getSubscription();if(subscription){el('push-disable').disabled=false;el('push-test').disabled=false;}}
    }
  }).catch(()=>{el('live-status').textContent='No se ha podido recuperar la conexión. Puedes volver a conectarla.'});
})();
