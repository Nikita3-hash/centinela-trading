const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const code = fs.readFileSync(path.join(root, 'index.html'), 'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
const valid = JSON.parse(fs.readFileSync(path.join(root, 'market-data.json'), 'utf8'));
async function render(payload, status = 200) {
  const elements = {};
  for (const id of ['reload', 'status', 'source', 'assets', 'detail', 'filter'])
    elements[id] = {textContent: '', innerHTML: '', value: 'all'};
  const context = vm.createContext({Date, Set, console,
    document: {getElementById: id => elements[id], querySelectorAll: () => []},
    fetch: async () => ({ok: status === 200, status, json: async () => payload})});
  vm.runInContext(code, context);
  await new Promise(resolve => setImmediate(resolve));
  return {elements, context};
}
(async () => {
  let result = await render(valid);
  assert.ok(result.elements.status.textContent.includes(`${valid.assets.length}/${valid.expected_assets} activos cargados`));
  assert.match(result.elements.source.textContent, /No son datos en tiempo real/);
  assert.match(result.elements.assets.innerHTML, /Ver explicación/);
  assert.match(result.elements.detail.innerHTML, /Último cierre/);
  result.elements.filter.value = 'review';
  vm.runInContext('render()', result.context);
  assert.equal((result.elements.assets.innerHTML.match(/class="asset"/g) || []).length,
    valid.assets.filter(a => a.score >= 3).length);
  result.elements.filter.value = 'watch';
  vm.runInContext('render()', result.context);
  assert.equal((result.elements.assets.innerHTML.match(/class="asset"/g) || []).length,
    valid.assets.filter(a => a.score < 3).length);
  if (valid.assets.length > 1) {
    const partial = structuredClone(valid);
    const removed = partial.assets.pop(); partial.errors.push(removed.symbol + ': unavailable');
    result = await render(partial);
    assert.ok(result.elements.status.textContent.includes(`${partial.errors.length} activos sin datos`));
    assert.equal(result.elements.status.className, 'warning');
  }
  for (const alter of [p => p.assets = [], p => p.assets[0].close = 0,
    p => p.assets[0].checks = [], p => p.assets[0].score = 9,
    p => p.assets[0].rows[0].close = null, p => p.assets[0].date = '2026-02-30',
    p => p.assets[0].currency = 'EUR', p => p.generated_at = 'invalid']) {
    const invalid = structuredClone(valid); alter(invalid);
    result = await render(invalid);
    assert.equal(result.elements.status.textContent, 'No hay datos de mercado disponibles');
    assert.equal(result.elements.detail.textContent, 'Sin análisis disponible.');
  }
  result = await render(null, 404);
  assert.match(result.elements.source.textContent, /HTTP 404/);
  assert.equal(result.elements.reload.disabled, false);
  assert.equal(vm.runInContext('esc("a\\\'b")', result.context), 'a&#39;b');
  const scenario=vm.runInContext('shortScenario(100,5,2)',result.context);
  assert.equal(scenario.up,3);assert.equal(scenario.down,-7);assert.equal(scenario.breakEven,2);
  for(const expression of ['shortScenario(0,5,2)','shortScenario(100,0,2)','shortScenario(100,101,2)','shortScenario(100,5,-1)','shortScenario(NaN,5,2)'])
    assert.equal(vm.runInContext(expression,result.context),null);
  result.context.sample={date:new Date().toISOString().slice(0,10),symbol:'TEST.US',change5:2,close:154,ma20:140,
    rows:Array.from({length:55},(_,i)=>({close:100+i,volume:i<50?100:200}))};
  assert.equal(vm.runInContext('shortSelection([sample]).length',result.context),1);
  assert.equal(vm.runInContext('shortMetrics(sample).volumeRatio',result.context),2);
  assert.equal(vm.runInContext('shortSelection([{...sample,change5:-2}]).length',result.context),0);
  assert.equal(vm.runInContext('shortSelection([{...sample,ma20:200}]).length',result.context),0);
  assert.equal(vm.runInContext("shortSelection([{...sample,date:'2000-01-01'}]).length",result.context),0);
  assert.equal(vm.runInContext('shortSelection([{...sample,rows:sample.rows.map(r=>({...r,volume:0}))}]).length',result.context),0);
  console.log('Frontend: carga, filtros, detalle, cobertura parcial y 9 casos de error verificados');
})().catch(error => {console.error(error); process.exitCode = 1});