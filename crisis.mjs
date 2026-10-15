import {analyzeSnapshot} from './analysis.mjs';
// These are research triggers, not a tested trading strategy or a crisis diagnosis.
export const REFERENCES=[
  {symbol:'SPY',label:'Estados Unidos · S&P 500',group:'region',issuer:'https://www.ssga.com/us/en/individual/etfs/spdr-sp-500-etf-trust-spy'},
  {symbol:'EZU',label:'Eurozona',group:'region',issuer:'https://www.blackrock.com/us/individual/products/239644/ishares-msci-emu-etf'},
  {symbol:'EWJ',label:'Japón',group:'region',issuer:'https://www.ishares.com/us/products/239665/ishares-msci-japan-etf'},
  {symbol:'EEM',label:'Mercados emergentes',group:'region',issuer:'https://www.ishares.com/us/products/239637/ishares-msci-emerging-markets-etf'},
  {symbol:'XLK',label:'Tecnología · EE. UU.',group:'sector',issuer:'https://www.ssga.com/us/en/individual/etfs/state-street-technology-select-sector-spdr-etf-xlk'},
  {symbol:'XLF',label:'Finanzas · EE. UU.',group:'sector',issuer:'https://www.ssga.com/us/en/individual/capabilities/equities/sector-investing/select-sector-etfs'},
  {symbol:'XLE',label:'Energía · EE. UU.',group:'sector',issuer:'https://www.ssga.com/us/en/individual/capabilities/equities/sector-investing/select-sector-etfs'},
  {symbol:'XLV',label:'Salud · EE. UU.',group:'sector',issuer:'https://www.ssga.com/us/en/individual/capabilities/equities/sector-investing/select-sector-etfs'}
];
export function priceStress(facts,rows) {
  const window=rows.slice(-60),peak=Math.max(...window.map(r=>r.close));
  const drawdown=(facts.close/peak-1)*100;
  const change20=(facts.close/rows.at(-21).close-1)*100;
  if(![peak,drawdown,change20,facts.change5,facts.ma20,facts.ma50].every(Number.isFinite))throw Error('Indicadores no válidos.');
  return {symbol:facts.symbol,name:facts.name,date:facts.date,currency:facts.currency,close:facts.close,
    change5:facts.change5,change20,
    drawdown,window_sessions:window.length,peak_close:peak,
    research_trigger:drawdown<=-15+1e-9||facts.change5<=-8+1e-9,
    price_recovery:facts.change5>0&&facts.above_ma20};
}
export function crisisRadar(snapshot,now=Date.now()) {
  const assets=[],errors=[];
  if(!Array.isArray(snapshot?.assets)||!snapshot.assets.length)throw Error('No hay datos para el radar.');
  for(const asset of snapshot.assets) {
    try {
      const symbol=asset.symbol.replace(/\.US$/,'');
      const facts=analyzeSnapshot(snapshot,symbol,now);
      assets.push(priceStress(facts,asset.rows));
    }catch{errors.push(typeof asset?.symbol==='string'?asset.symbol:'Activo inválido');}
  }
  if(!assets.length)throw Error('No hay datos recientes y válidos para el radar.');
  const latest=assets.map(a=>a.date).sort().at(-1);
  const aligned=assets.filter(a=>a.date===latest);
  const references=REFERENCES.map(ref=>({...ref,data:aligned.find(a=>a.symbol===ref.symbol)||null}));
  const excluded=new Set(REFERENCES.map(ref=>ref.symbol));
  const companies=aligned.filter(a=>!excluded.has(a.symbol));
  return {date:latest,generated_at:snapshot.generated_at,
    references,reference_coverage:references.filter(r=>r.data).length,
    company_coverage:companies.length,valid_assets:aligned.length,
    invalid_assets:errors,unaligned_assets:assets.filter(a=>a.date!==latest).map(a=>a.symbol),
    // All qualifying companies are counted; only three are displayed.
    research_count:companies.filter(a=>a.research_trigger).length,
    research:companies.filter(a=>a.research_trigger).sort((a,b)=>a.drawdown-b.drawdown||a.symbol.localeCompare(b.symbol)).slice(0,3)};
}
export function marketContext(snapshot,now=Date.now()) {
  const radar=crisisRadar(snapshot,now);
  return {date:radar.date,coverage:radar.reference_coverage,expected:REFERENCES.length,
    references:radar.references.map(r=>({symbol:r.symbol,exposure:r.label,
      change5:r.data?.change5??null,drawdown:r.data?.drawdown??null})),
    limitation:'ETF de referencia cotizados en USD en EE. UU.; no representan todo el mundo ni explican las causas. No hay noticias ni balances conectados.'};
}
