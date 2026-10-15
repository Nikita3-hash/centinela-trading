import {analyzeSnapshot} from './analysis.mjs';
const el=id=>document.getElementById(id);
const money=(n,c)=>n.toLocaleString('es-ES',{style:'currency',currency:c});
const percent=n=>n.toLocaleString('es-ES',{maximumFractionDigits:2})+'%';
let snapshot=null,loading=null,facts=null,busy=false;
const aliases={nvidia:'NVDA',tesla:'TSLA',apple:'AAPL',microsoft:'MSFT','mp materials':'MP',palantir:'PLTR',amazon:'AMZN',google:'GOOGL',alphabet:'GOOGL',meta:'META'};
function add(parent,tag,text,cls=''){const node=document.createElement(tag);node.textContent=text;if(cls)node.className=cls;parent.append(node);return node;}
async function getSnapshot(){
  if(!loading)loading=fetch('./market-data.json?consult='+Date.now(),{cache:'no-store',signal:AbortSignal.timeout(15000)})
    .then(async r=>{if(!r.ok)throw Error('No se ha podido consultar el archivo de mercado.');snapshot=await r.json();return snapshot;})
    .catch(e=>{loading=null;throw e;});
  return loading;
}
function symbolValue(){const raw=el('consult-symbol').value.trim();return aliases[raw.toLowerCase()]||raw.toUpperCase().replace(/\.US$/,'');}
function paragraph(parent,title,text){add(parent,'h3',title);add(parent,'p',text);}
function showFacts(value){
  const target=el('consult-result');target.replaceChildren();
  add(target,'span','Ficha calculada · sin IA','status-pill');
  add(target,'h2',value.name+' · '+value.symbol);
  add(target,'p','Último cierre: '+money(value.close,value.currency)+' · '+value.date,'quote-number');
  add(target,'p','El precio está en dólares. No se compara con una cotización en euros ni se presenta como precio actual.','footer');
  paragraph(target,'Qué sabemos',`En cinco sesiones: ${percent(value.change5)}. El cierre está ${value.above_ma20?'por encima':'por debajo o al nivel'} de su media de veinte sesiones (${money(value.ma20,'USD')}).`);
  paragraph(target,'Qué falta para decidir','Una cotización actual, noticias y resultados recientes, y saber qué pérdidas puedes asumir. Estos datos no confirman una entrada ni una venta.');
  if(value.volume_ratio!==null)add(target,'p','Volumen medio de cinco sesiones: '+value.volume_ratio.toLocaleString('es-ES',{maximumFractionDigits:2})+' veces el de las veinte anteriores. Es descriptivo, no una previsión.','footer');
  const link=add(target,'a','Consultar historial en Yahoo Finance');link.href=value.source_url;link.target='_blank';link.rel='noopener noreferrer';
  add(target,'p','Archivo actualizado: '+new Date(value.generated_at).toLocaleString('es-ES')+'.','footer');
  target.hidden=false;el('consult-ai-answer').hidden=true;
}
function showAnswer(output){
  if(output?.mode!=='ai'||!output.answer||!output.facts)throw Error('El servicio devolvió una respuesta no válida.');
  const answer=output.answer;
  if(!['summary','next_step'].every(k=>typeof answer[k]==='string'&&answer[k].length<=1800)||
    !['in_favor','against','missing'].every(k=>Array.isArray(answer[k])&&answer[k].length<=5&&answer[k].every(x=>typeof x==='string'&&x.length<=600)))throw Error('El servicio devolvió una respuesta no válida.');
  // Facts are always checked separately from the generated explanation.
  const verified=analyzeSnapshot(snapshot,symbolValue());
  if(output.facts.symbol!==verified.symbol||output.facts.date!==verified.date||output.facts.close!==verified.close||output.facts.currency!=='USD')
    throw Error('Los datos han cambiado. Vuelve a consultar la ficha antes de pedir el análisis.');
  const target=el('consult-ai-answer');target.replaceChildren();
  add(target,'span','Explicación de IA · puede equivocarse','status-pill');
  paragraph(target,'Mi lectura',answer.summary);
  for(const [key,title] of [['in_favor','A favor'],['against','En contra'],['missing','Lo que falta comprobar']]){
    add(target,'h3',title);const list=add(target,'ul','');answer[key].forEach(item=>add(list,'li',item));
  }
  paragraph(target,'Siguiente paso',answer.next_step);
  add(target,'p','Basado en el cierre del '+verified.date+' en USD. Noticias y resultados no conectados. No hay una estrategia de rentabilidad demostrada.','footer');
  target.hidden=false;
}
async function checkAI(){
  const label=el('consult-ai-state');
  try{
    if(!window.centinelaAdvisor)throw Error();
    const result=await window.centinelaAdvisor.status();
    if(result.ready===true){label.textContent='IA conectada · máximo '+result.daily_limit+' consultas al día. Se limita el uso; no es un presupuesto en euros.';el('consult-ai-send').disabled=false;return;}
  }catch{}
  label.textContent='La IA está pendiente de activación. La ficha diaria funciona sin IA.';el('consult-ai-send').disabled=true;
}
el('consult-form').addEventListener('submit',async event=>{
  event.preventDefault();if(busy)return;busy=true;facts=null;
  el('consult-submit').disabled=true;el('consult-ai-send').disabled=true;
  el('consult-result').hidden=true;el('consult-ai-answer').hidden=true;
  el('consult-message').textContent='Comprobando historial, fechas y moneda…';
  try{
    const symbol=symbolValue();if(!/^[A-Z]{1,6}([.-][A-Z]{1,2})?$/.test(symbol))throw Error('Escribe el símbolo, por ejemplo MP, TSLA o NVDA.');
    loading=null;facts=analyzeSnapshot(await getSnapshot(),symbol);showFacts(facts);
    el('consult-message').textContent='Ficha disponible. Estos cálculos no responden a preguntas libres; la explicación de IA requiere activación.';
    await checkAI();
  }catch(e){el('consult-message').textContent=e.message;}
  finally{busy=false;el('consult-submit').disabled=false;}
});
el('consult-symbol').addEventListener('input',()=>{facts=null;el('consult-ai-send').disabled=true;el('consult-result').hidden=true;el('consult-ai-answer').hidden=true;});
document.querySelectorAll('[data-consult-symbol]').forEach(button=>button.addEventListener('click',()=>{
  el('consult-symbol').value=button.dataset.consultSymbol;el('consult-form').requestSubmit();
}));
el('consult-ai-send').addEventListener('click',async()=>{
  if(busy||!facts)return;
  const question=el('consult-question').value.trim();
  if(question.length<3||question.length>600){el('consult-ai-state').textContent='Escribe una pregunta de entre 3 y 600 caracteres.';return;}
  const symbol=facts.symbol;busy=true;el('consult-ai-send').disabled=true;el('consult-symbol').disabled=true;
  el('consult-submit').disabled=true;
  el('consult-ai-answer').hidden=true;el('consult-ai-state').textContent='Consultando la IA con el historial comprobado…';
  try{
    const output=await window.centinelaAdvisor.ask({symbol,question,horizon:el('consult-horizon').value});
    showAnswer(output);el('consult-ai-state').textContent='Respuesta recibida. Revisa sus argumentos y las limitaciones de los datos.';
  }catch(e){el('consult-ai-state').textContent=e.message;}
  finally{busy=false;el('consult-ai-send').disabled=false;el('consult-symbol').disabled=false;el('consult-submit').disabled=false;}
});
el('plan-save').addEventListener('click',()=>{
  const amount=el('plan-monthly').value.trim(),loss=el('plan-loss').value.trim();
  if(!/^\d+(?:[.,]\d{1,2})?$/.test(amount)||!/^\d+(?:[.,]\d{1,2})?$/.test(loss)){
    el('plan-message').textContent='Introduce importes en euros sin separadores de miles, aunque sean cero.';return;
  }
  try{localStorage.setItem('centinela-plan',JSON.stringify({monthly:amount,loss,horizon:el('plan-horizon').value}));
    el('plan-message').textContent='Plan guardado solo en este dispositivo. No se envía a la IA ni modifica sus respuestas.';}
  catch{el('plan-message').textContent='No se ha podido guardar el plan en este dispositivo.';}
});
el('plan-forget').addEventListener('click',()=>{
  try{localStorage.removeItem('centinela-plan');el('plan-monthly').value='';el('plan-loss').value='';el('plan-message').textContent='Plan borrado de este dispositivo.';}catch{el('plan-message').textContent='No se ha podido borrar el plan.';}
});
try{const plan=JSON.parse(localStorage.getItem('centinela-plan'));if(plan){
  if(typeof plan.monthly==='string')el('plan-monthly').value=plan.monthly;
  if(typeof plan.loss==='string')el('plan-loss').value=plan.loss;
  if(['days','years','unknown'].includes(plan.horizon))el('plan-horizon').value=plan.horizon;
}}catch{}
getSnapshot().then(value=>{
  const list=el('consult-options');value.assets?.forEach(a=>{if(typeof a.symbol==='string'&&typeof a.name==='string'){
    const option=document.createElement('option');option.value=a.symbol.replace('.US','');option.label=a.name;list.append(option);
  }});
}).catch(()=>{});
