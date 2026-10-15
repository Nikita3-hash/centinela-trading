import test from 'node:test';
import assert from 'node:assert/strict';
import {crisisRadar,marketContext,REFERENCES} from '../crisis.mjs';
const now=Date.parse('2026-10-15T12:00:00Z');
function asset(symbol,last=100,date='2026-10-14') {
  const end=Date.parse(date+'T00:00:00Z');
  const rows=Array.from({length:60},(_,i)=>({date:new Date(end-(59-i)*86400000).toISOString().slice(0,10),close:i===59?last:100,volume:1000}));
  return {symbol:symbol+'.US',name:symbol,currency:'USD',close:last,date,rows};
}
function snapshot(assets){return {schema_version:1,generated_at:'2026-10-15T08:00:00Z',assets};}
test('thresholds produce research candidates, never automatic entries',()=>{
  const result=crisisRadar(snapshot([asset('MP',85),asset('AAPL',92),asset('MSFT',93)]),now);
  assert.deepEqual(result.research.map(a=>a.symbol),['MP','AAPL']);
  assert.equal(result.research[0].research_trigger,true);assert.equal(result.research[0].price_recovery,false);
  assert.equal(result.research[0].window_sessions,60);
  assert.equal('entry_price' in result.research[0],false);assert.equal('buy' in result.research[0],false);
});
test('falling ETFs remain market references, not company candidates',()=>{
  const result=crisisRadar(snapshot([...REFERENCES.map(r=>asset(r.symbol,70)),asset('MP',80)]),now);
  assert.equal(result.reference_coverage,8);assert.equal(result.company_coverage,1);
  assert.deepEqual(result.research.map(a=>a.symbol),['MP']);
  const context=marketContext(snapshot([...REFERENCES.map(r=>asset(r.symbol)),asset('MP')]),now);
  assert.equal(context.expected,8);assert.equal(context.coverage,8);
  assert.match(context.limitation,/no representan todo el mundo/);
});
test('only same-date prices are compared and missing references stay missing',()=>{
  const result=crisisRadar(snapshot([asset('MP',80),asset('SPY',75,'2026-10-13')]),now);
  assert.equal(result.reference_coverage,0);assert.deepEqual(result.unaligned_assets,['SPY']);
  assert.equal(result.references.find(r=>r.symbol==='SPY').data,null);
});
test('stale data, duplicate symbols and bad histories cannot become opportunities',()=>{
  const bad=asset('MP',1);bad.rows[0].close=0;
  const result=crisisRadar(snapshot([bad,asset('AAPL')]),now);
  assert.deepEqual(result.invalid_assets,['MP.US']);assert.equal(result.research_count,0);
  assert.throws(()=>crisisRadar({...snapshot([asset('MP',1)]),generated_at:'2026-01-01'},now));
  assert.throws(()=>crisisRadar(snapshot([asset('MP',1),asset('MP',2)]),now));
});
test('candidate count includes all matches while display is capped at three',()=>{
  const result=crisisRadar(snapshot(['MP','AAPL','MSFT','NVDA'].map((s,i)=>asset(s,70+i))),now);
  assert.equal(result.research_count,4);assert.equal(result.research.length,3);
  assert.deepEqual(result.research.map(a=>a.symbol),['MP','AAPL','MSFT']);
  assert.equal(crisisRadar(snapshot([asset('MP',105)]),now).research_count,0);
});
