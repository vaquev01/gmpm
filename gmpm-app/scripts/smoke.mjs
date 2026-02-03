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

async function getText(path) {
  const res = await fetch(`${baseUrl}${path}`, {
    headers: { accept: 'text/html' },
  });
  const text = await res.text();
  return { res, text };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function isFiniteNumber(n) {
  return typeof n === 'number' && Number.isFinite(n);
}

function isRecord(v) {
  return typeof v === 'object' && v !== null;
}

async function main() {
  // Core pages should render
  {
    const { res, text } = await getText('/');
    assert(res.ok, `/ HTTP ${res.status}`);
    assert(typeof text === 'string' && text.length > 100, '/ returned unexpectedly small HTML');
  }
  {
    const { res, text } = await getText('/verify');
    assert(res.ok, `/verify HTTP ${res.status}`);
    assert(text.includes('Verification'), '/verify missing expected marker');
  }
  {
    const { res, text } = await getText('/logs');
    assert(res.ok, `/logs HTTP ${res.status}`);
    assert(text.toLowerCase().includes('logs'), '/logs missing expected marker');
  }

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

  assert(typeof market.degraded === 'boolean', '/api/market missing degraded boolean');
  assert(typeof market.tradeEnabled === 'boolean', '/api/market missing tradeEnabled boolean');
  assert(market.qualitySummary && typeof market.qualitySummary === 'object', '/api/market missing qualitySummary');
  assert(market.tradeEnabledByClass && typeof market.tradeEnabledByClass === 'object', '/api/market missing tradeEnabledByClass');

  const qs = market.qualitySummary;
  for (const k of ['OK', 'PARTIAL', 'STALE', 'SUSPECT']) {
    if (k in qs) assert(isFiniteNumber(qs[k]), `/api/market qualitySummary.${k} not a number`);
  }

  // Invariants on at least one returned asset
  const anyWithHistory = market.assets.find((a) => isRecord(a) && Array.isArray(a.history) && a.history.length >= 8);
  assert(!!anyWithHistory, '/api/market missing any asset with history>=8');
  const anyWithTs = market.assets.find((a) => isRecord(a) && typeof a.quoteTimestamp === 'string');
  assert(!!anyWithTs, '/api/market missing any asset with quoteTimestamp');
  const anyWithQuality = market.assets.find((a) => isRecord(a) && isRecord(a.quality) && typeof a.quality.status === 'string');
  assert(!!anyWithQuality, '/api/market missing any asset with quality.status');

  const macro = market.macro;
  assert(macro && typeof macro === 'object', '/api/market missing macro');
  assert(isFiniteNumber(macro.treasury10y), '/api/market macro.treasury10y not a number');
  assert(isFiniteNumber(macro.treasury2y), '/api/market macro.treasury2y not a number');
  assert(isFiniteNumber(macro.yieldCurve), '/api/market macro.yieldCurve not a number');

  const { res: calRes, json: cal } = await getJson('/api/calendar?days=14');
  assert(calRes.ok, `/api/calendar HTTP ${calRes.status}`);
  assert(cal && cal.success === true, `/api/calendar success=false: ${cal?.error || 'unknown error'}`);
  assert(Array.isArray(cal.events), '/api/calendar missing events array');

  const { res: newsRes, json: news } = await getJson('/api/news');
  assert(newsRes.ok, `/api/news HTTP ${newsRes.status}`);
  assert(news && news.success === true, `/api/news success=false: ${news?.error || 'unknown error'}`);
  assert(Array.isArray(news.geopolitics), '/api/news missing geopolitics array');
  assert(Array.isArray(news.technology), '/api/news missing technology array');
  assert(Array.isArray(news.headlines), '/api/news missing headlines array');

  // /api/technical should return indicator set for at least one symbol
  const { res: techRes, json: tech } = await getJson('/api/technical?symbol=SPY');
  assert(techRes.ok, `/api/technical HTTP ${techRes.status}`);
  assert(tech && tech.success === true, `/api/technical success=false: ${tech?.error || 'unknown error'}`);
  assert(Array.isArray(tech.data), '/api/technical missing data array');
  assert(tech.data.length > 0, '/api/technical returned 0 indicators');
  assert(isFiniteNumber(tech.data[0].rsi14), '/api/technical data[0].rsi14 not a number');

  // /api/smc should return analysis for SPY
  const { res: smcRes, json: smc } = await getJson('/api/smc?symbol=SPY&interval=1d');
  assert(smcRes.ok, `/api/smc HTTP ${smcRes.status}`);
  assert(smc && smc.success === true, `/api/smc success=false: ${smc?.error || 'unknown error'}`);
  assert(isRecord(smc.analysis), '/api/smc missing analysis object');

  // /api/orderflow should return at least one item for BTC (crypto only)
  const { res: ofRes, json: of } = await getJson('/api/orderflow?symbol=BTC');
  assert(ofRes.ok, `/api/orderflow HTTP ${ofRes.status}`);
  assert(of && of.success === true, `/api/orderflow success=false: ${of?.error || 'unknown error'}`);
  assert(Array.isArray(of.data), '/api/orderflow missing data array');
  assert(of.data.length > 0, '/api/orderflow returned 0 analyses');

  // /api/regime should return regime snapshot with 6 axes
  const { res: regimeRes, json: regime } = await getJson('/api/regime');
  assert(regimeRes.ok, `/api/regime HTTP ${regimeRes.status}`);
  assert(regime && regime.success === true, `/api/regime success=false: ${regime?.error || 'unknown error'}`);
  assert(isRecord(regime.snapshot), '/api/regime missing snapshot object');
  assert(typeof regime.snapshot.regime === 'string', '/api/regime missing snapshot.regime');
  assert(isRecord(regime.snapshot.axes), '/api/regime missing snapshot.axes');
  for (const axis of ['G', 'I', 'L', 'C', 'D', 'V']) {
    assert(isRecord(regime.snapshot.axes[axis]), `/api/regime missing axes.${axis}`);
    assert(typeof regime.snapshot.axes[axis].direction === 'string', `/api/regime axes.${axis}.direction not string`);
  }
  assert(Array.isArray(regime.snapshot.mesoTilts), '/api/regime missing mesoTilts array');
  assert(Array.isArray(regime.snapshot.mesoProhibitions), '/api/regime missing mesoProhibitions array');

  // /api/meso should return meso analysis with classes and sectors
  const { res: mesoRes, json: meso } = await getJson('/api/meso');
  assert(mesoRes.ok, `/api/meso HTTP ${mesoRes.status}`);
  assert(meso && meso.success === true, `/api/meso success=false: ${meso?.error || 'unknown error'}`);
  assert(isRecord(meso.regime), '/api/meso missing regime object');
  assert(Array.isArray(meso.classes), '/api/meso missing classes array');
  assert(meso.classes.length > 0, '/api/meso returned 0 classes');
  assert(Array.isArray(meso.sectors), '/api/meso missing sectors array');
  assert(meso.sectors.length > 0, '/api/meso returned 0 sectors');
  for (const cls of meso.classes) {
    assert(typeof cls.name === 'string', '/api/meso class missing name');
    assert(typeof cls.expectation === 'string', '/api/meso class missing expectation');
    assert(typeof cls.liquidityScore === 'number', '/api/meso class missing liquidityScore');
  }

  // /api/server-logs should be reachable, clearable, and then populated by market/news calls
  {
    const clearRes = await fetch(`${baseUrl}/api/server-logs`, { method: 'DELETE' });
    assert(clearRes.ok, `/api/server-logs DELETE HTTP ${clearRes.status}`);

    // Generate logs
    await getJson('/api/market?limit=5');
    await getJson('/api/news?limit=5');

    const { res: slRes, json: sl } = await getJson('/api/server-logs');
    assert(slRes.ok, `/api/server-logs HTTP ${slRes.status}`);
    assert(sl && sl.success === true, `/api/server-logs success=false: ${sl?.error || 'unknown error'}`);
    assert(Array.isArray(sl.entries), '/api/server-logs missing entries array');
    assert(sl.entries.length > 0, '/api/server-logs returned 0 entries after generating logs');
  }

  process.stdout.write('SMOKE_OK\n');
}

main().catch((e) => {
  process.stderr.write(`SMOKE_FAIL: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
