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
  assert.match(result.elements.status.textContent, /17\/17 activos cargados/);
  assert.match(result.elements.source.textContent, /No son datos en tiempo real/);
  assert.match(result.elements.assets.innerHTML, /Entender señal/);
  assert.match(result.elements.detail.innerHTML, /Último cierre/);
  result.elements.filter.value = 'review';
  vm.runInContext('render()', result.context);
  assert.equal((result.elements.assets.innerHTML.match(/class="asset"/g) || []).length,
    valid.assets.filter(a => a.score >= 3).length);
  result.elements.filter.value = 'watch';
  vm.runInContext('render()', result.context);
  assert.equal((result.elements.assets.innerHTML.match(/class="asset"/g) || []).length,
    valid.assets.filter(a => a.score < 3).length);
  const partial = structuredClone(valid);
  partial.assets.pop(); partial.errors.push('SPY.US: unavailable');
  result = await render(partial);
  assert.match(result.elements.status.textContent, /1 activos sin datos/);
  assert.equal(result.elements.status.className, 'warning');
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
  console.log('Frontend: carga, filtros, detalle, cobertura parcial y 9 casos de error verificados');
})().catch(error => {console.error(error); process.exitCode = 1});
