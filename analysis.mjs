// Shared, deterministic facts. This module does not make trading recommendations.
export const DATA_URL='https://nikita3-hash.github.io/centinela-trading/market-data.json';
export function analyzeSnapshot(snapshot,symbol,now=Date.now()) {
  const generated=Date.parse(snapshot?.generated_at);
  if(snapshot?.schema_version!==1||!Array.isArray(snapshot.assets)||!snapshot.assets.length||
    !Number.isFinite(generated)||generated>now+60000||now-generated>48*3600000)
    throw Error('El archivo de datos no está actualizado. No se puede valorar una entrada.');
  const matches=snapshot.assets.filter(a=>a.symbol===symbol+'.US');
  if(matches.length!==1)throw Error('No hay un historial válido para ese activo en nuestra cobertura.');
  const a=matches[0],today=new Date(now).toLocaleDateString('en-CA',{timeZone:'America/New_York'});
  if(a.currency!=='USD'||typeof a.name!=='string'||a.name.length>100||!Array.isArray(a.rows)||a.rows.length<55||a.rows.length>500)
    throw Error('Historial o moneda no válidos.');
  let previous='';
  for(const row of a.rows) {
    const day=Date.parse(row.date+'T00:00:00Z');
    if(typeof row.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(row.date)||!Number.isFinite(day)||
      new Date(day).toISOString().slice(0,10)!==row.date||row.date<=previous||row.date>=today||
      !Number.isFinite(row.close)||row.close<=0||!Number.isFinite(row.volume)||row.volume<0)
      throw Error('El historial contiene precios, fechas o volúmenes no válidos.');
    previous=row.date;
  }
  const rows=a.rows,last=rows.at(-1),age=Math.floor((now-Date.parse(last.date+'T00:00:00Z'))/86400000);
  if(age>5||last.date!==a.date||last.close!==a.close)throw Error('El último cierre es antiguo o no coincide con el historial.');
  const average=values=>values.reduce((sum,n)=>sum+n,0)/values.length;
  const closes=rows.map(r=>r.close),ma20=average(closes.slice(-20)),ma50=average(closes.slice(-50));
  const baseVolume=average(rows.slice(-25,-5).map(r=>r.volume));
  const change5=(last.close/closes.at(-6)-1)*100;
  const changes=closes.slice(-21).slice(1).map((c,i)=>(c/closes.slice(-21)[i]-1)*100);
  return {symbol,name:a.name,currency:'USD',close:last.close,date:last.date,generated_at:snapshot.generated_at,
    change5,ma20,ma50,above_ma20:last.close>ma20,
    volume_ratio:baseVolume>0?average(rows.slice(-5).map(r=>r.volume))/baseVolume:null,
    mean_absolute_daily_change:average(changes.map(Math.abs)),
    source:'Yahoo Finance · cierres diarios',source_url:'https://finance.yahoo.com/quote/'+encodeURIComponent(symbol)+'/history/',
    limitations:['No se ha comprobado una cotización en directo.','Noticias y resultados empresariales no están conectados.',
      'No hay conversión verificada a euros ni estrategia de entrada validada.']};
}
