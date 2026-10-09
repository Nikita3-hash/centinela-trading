self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
function connection(){return new Promise((resolve,reject)=>{
  const request=indexedDB.open('centinela-live',1);
  request.onupgradeneeded=()=>request.result.createObjectStore('settings');
  request.onerror=()=>reject(Error('Settings unavailable'));
  request.onsuccess=()=>{const db=request.result,tx=db.transaction('settings','readonly');
    const read=tx.objectStore('settings').get('connection');read.onsuccess=()=>resolve(read.result);read.onerror=()=>reject(Error('Settings unavailable'));tx.oncomplete=()=>db.close()};
})}
self.addEventListener('push',event=>event.waitUntil((async()=>{
  // Always display a visible notification, including when the network is down.
  await self.registration.showNotification('Centinela: aviso de precio',{
    body:'Abre la app para consultar el aviso y la hora del precio. No es una recomendación de compra.',
    tag:'centinela-price',data:{url:new URL('./',self.registration.scope).href}});
  try{
    const cfg=await connection();if(!cfg)return;
    const response=await fetch(cfg.url+'/alerts',{headers:{Authorization:'Bearer '+cfg.token},cache:'no-store',signal:AbortSignal.timeout(8000)});
    if(!response.ok)return;const output=await response.json(),last=output.alerts?.at(-1);
    if(!last||Date.now()-Date.parse(last.created_at)>600000)return;
    await self.registration.showNotification(last.type==='test'?'Centinela: prueba recibida':'Centinela: nivel alcanzado',{
      body:last.type==='test'?'El iPhone ha recibido el aviso de prueba.':last.message+'. Hora del precio: '+new Date(last.quoted_at).toLocaleTimeString('es-ES')+'. No es una orden de compra.',
      tag:'centinela-price',data:{url:new URL('./',self.registration.scope).href}});
  }catch{/* The generic visible notification above remains available. */}
})()));
self.addEventListener('notificationclick',event=>{
  event.notification.close();event.waitUntil(self.clients.openWindow(new URL('./',self.registration.scope).href));
});
