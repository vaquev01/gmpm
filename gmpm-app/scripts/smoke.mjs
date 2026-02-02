const baseUrl = process.env.SMOKE_BASE_URL || 'http://localhost:3001';

async function getJson(path) {
  const res = await fetch(`${baseUrl}${path}`, {
    headers: { accept: 'application/json' },
  });

  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Non-JSON response from ${path}: HTTP ${res.status}`);
  }

  return { res, json };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function isFiniteNumber(n) {
  return typeof n === 'number' && Number.isFinite(n);
}

async function main() {
  const { res: fredRes, json: fred } = await getJson('/api/fred');
  assert(fredRes.ok, `/api/fred HTTP ${fredRes.status}`);
  assert(fred && fred.success === true, `/api/fred success=false: ${fred?.error || 'unknown error'}`);
  assert(fred.data && typeof fred.data === 'object', '/api/fred missing data object');
  const keys = Object.keys(fred.data);
  assert(keys.length > 0, '/api/fred returned empty data');

  const rates = fred.summary?.rates;
  assert(rates && typeof rates === 'object', '/api/fred missing summary.rates');
  assert(isFiniteNumber(rates.treasury10y), 'summary.rates.treasury10y not a number');
  assert(isFiniteNumber(rates.treasury2y), 'summary.rates.treasury2y not a number');
  assert(isFiniteNumber(rates.yieldCurve), 'summary.rates.yieldCurve not a number');

  const { res: marketRes, json: market } = await getJson('/api/market?limit=50');
  assert(marketRes.ok, `/api/market HTTP ${marketRes.status}`);
  assert(market && market.success === true, `/api/market success=false: ${market?.error || 'unknown error'}`);
  assert(Array.isArray(market.assets), '/api/market missing assets array');
  assert(market.assets.length > 0, '/api/market returned 0 assets');

  const macro = market.macro;
  assert(macro && typeof macro === 'object', '/api/market missing macro');
  assert(isFiniteNumber(macro.treasury10y), '/api/market macro.treasury10y not a number');
  assert(isFiniteNumber(macro.treasury2y), '/api/market macro.treasury2y not a number');
  assert(isFiniteNumber(macro.yieldCurve), '/api/market macro.yieldCurve not a number');

  process.stdout.write('SMOKE_OK\n');
}

main().catch((e) => {
  process.stderr.write(`SMOKE_FAIL: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
