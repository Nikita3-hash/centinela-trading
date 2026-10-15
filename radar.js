import {crisisRadar} from './crisis.mjs';
const el=id=>document.getElementById(id);
const pct=n=>n.toLocaleString('es-ES',{maximumFractionDigits:2})+'%';
function add(parent,tag,text,cls=''){const node=document.createElement(tag);node.textContent=text;if(cls)node.className=cls;parent.append(node);return node;}
function marketCard(ref){
  const card=document.createElement('article');card.className='market-card';
  add(card,'h3',ref.label);add(card,'small',ref.symbol+' · ETF de referencia');
  if(!ref.data)add(card,'p','Sin cierre válido para la fecha del radar.','warning');
  else{
    add(card,'p',pct(ref.data.change5),'market-move '+(ref.data.change5<0?'warning':'good'));
    add(card,'small','En cinco sesiones');
    add(card,'p','Desde su máximo de '+ref.data.window_sessions+' sesiones: '+pct(ref.data.drawdown),'footer');
  }
  const link=add(card,'a','Qué representa');link.href=ref.issuer;link.target='_blank';link.rel='noopener noreferrer';
  return card;
}
async function refresh(){
  el('radar-refresh').disabled=true;el('radar-status').textContent='Comprobando precios, cobertura y fechas…';
  for(const id of ['radar-regions','radar-sectors','radar-companies'])el(id).replaceChildren();
  try{
    const response=await fetch('./market-data.json?radar='+Date.now(),{cache:'no-store',signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw Error('No se ha podido obtener el archivo de mercado.');
    const result=crisisRadar(await response.json());
    el('radar-status').textContent=`Cierres del ${result.date} · ${result.reference_coverage}/8 referencias y ${result.company_coverage} empresas con datos alineados. ${result.invalid_assets.length?result.invalid_assets.length+' activos descartados por datos inválidos. ':''}${result.unaligned_assets.length?result.unaligned_assets.length+' activos excluidos por fecha diferente. ':''}No es tiempo real.`;
    el('radar-status').className='state-note '+(result.reference_coverage<8||result.invalid_assets.length||result.unaligned_assets.length?'warning':'');
    for(const ref of result.references)el(ref.group==='region'?'radar-regions':'radar-sectors').append(marketCard(ref));
    const target=el('radar-companies');
    if(!result.research.length)add(target,'p','Ninguna empresa de nuestra lista cumple ahora los umbrales de caída. No se fuerza una oportunidad.');
    else{
      add(target,'p',`${result.research_count} empresas cumplen los umbrales. Mostramos hasta tres, ordenadas por caída, sin valorar aún si están baratas.`,'footer');
      for(const value of result.research){
        const card=add(target,'article','','research-card');
        add(card,'span','Caída detectada · entrada sin validar','status-pill');
        add(card,'h3',value.name+' · '+value.symbol);
        add(card,'p',`Cinco sesiones: ${pct(value.change5)}. Desde el máximo de ${value.window_sessions} sesiones: ${pct(value.drawdown)}.`);
        add(card,'p',value.price_recovery?'El precio ha recuperado su media de veinte sesiones y sube en cinco sesiones. Eso no valida una compra.':'Todavía no coinciden una subida en cinco sesiones y un cierre sobre la media de veinte.');
        add(card,'p','Causa de la caída: pendiente. Deuda, caja y capacidad de recuperarse: pendientes. Precio de entrada: sin validar.','footer');
        const button=add(card,'button','Investigar este activo','secondary');
        button.addEventListener('click',()=>{
          window.goToView('home');el('consult-symbol').value=value.symbol;
          el('consult-question').value='¿Qué se puede comprobar sobre esta caída y qué falta para distinguir una oportunidad de un deterioro del negocio?';
          el('consult-form').requestSubmit();
        });
      }
    }
  }catch(error){el('radar-status').textContent=error.message;el('radar-status').className='warning state-note';}
  finally{el('radar-refresh').disabled=false;}
}
el('radar-refresh').addEventListener('click',refresh);
refresh();
