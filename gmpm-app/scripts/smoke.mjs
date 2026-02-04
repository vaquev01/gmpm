const baseUrl = process.env.SMOKE_BASE_URL || 'http://localhost:3000';

async function getJson(path) {
  const url = `${baseUrl}${path}`;
  let res;
  try {
    res = await fetch(url, {
      headers: { accept: 'application/json' },
    });
  } catch (e) {
    throw new Error(`Fetch failed: ${url} (${String(e)})`);
  }

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
  const url = `${baseUrl}${path}`;
  let res;
  try {
    res = await fetch(url, {
      headers: { accept: 'text/html' },
    });
  } catch (e) {
    throw new Error(`Fetch failed: ${url} (${String(e)})`);
  }
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

function isNumberOrNull(v) {
  return v === null || (typeof v === 'number' && Number.isFinite(v));
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

  const { res: macroRes, json: macroSnap } = await getJson('/api/macro');
  assert(macroRes.ok, `/api/macro HTTP ${macroRes.status}`);
  assert(macroSnap && macroSnap.success === true, `/api/macro success=false: ${macroSnap?.error || 'unknown error'}`);
  assert(macroSnap.macro && typeof macroSnap.macro === 'object', '/api/macro missing macro');
  assert(isFiniteNumber(macroSnap.macro.treasury10y), '/api/macro macro.treasury10y not a number');
  assert(isFiniteNumber(macroSnap.macro.treasury2y), '/api/macro macro.treasury2y not a number');
  assert(isFiniteNumber(macroSnap.macro.yieldCurve), '/api/macro macro.yieldCurve not a number');

  const { res: marketRes, json: market } = await getJson('/api/market?limit=50&macro=0');
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

  const { res: histRes, json: hist } = await getJson('/api/history?symbol=SPY&period=6M');
  assert(histRes.ok, `/api/history HTTP ${histRes.status}`);
  assert(hist && hist.success === true, `/api/history success=false: ${hist?.error || 'unknown error'}`);
  assert(isRecord(hist.data), '/api/history missing data object');
  assert(Array.isArray(hist.data.candles), '/api/history missing data.candles array');
  assert(hist.data.candles.length > 5, '/api/history returned too few candles');
  assert(isRecord(hist.data.stats), '/api/history missing data.stats object');
  assert(isFiniteNumber(hist.data.stats.totalReturn), '/api/history stats.totalReturn not number');
  assert(isFiniteNumber(hist.data.stats.annualizedReturn), '/api/history stats.annualizedReturn not number');
  const hc0 = hist.data.candles[0];
  assert(isRecord(hc0), '/api/history candles[0] not object');
  assert(isFiniteNumber(hc0.open), '/api/history candles[0].open not number');
  assert(isFiniteNumber(hc0.high), '/api/history candles[0].high not number');
  assert(isFiniteNumber(hc0.low), '/api/history candles[0].low not number');
  assert(isFiniteNumber(hc0.close), '/api/history candles[0].close not number');
  assert(isFiniteNumber(hc0.changePercent), '/api/history candles[0].changePercent not number');

  const { res: mtfRes, json: mtf } = await getJson('/api/mtf?symbol=SPY');
  assert(mtfRes.ok, `/api/mtf HTTP ${mtfRes.status}`);
  assert(mtf && mtf.success === true, `/api/mtf success=false: ${mtf?.error || 'unknown error'}`);
  assert(isRecord(mtf.data), '/api/mtf missing data object');
  assert(isRecord(mtf.data.timeframes), '/api/mtf missing data.timeframes object');
  for (const tf of ['1D', '4H', '1H', '15M']) {
    assert(isRecord(mtf.data.timeframes[tf]), `/api/mtf missing timeframe ${tf}`);
    assert(Array.isArray(mtf.data.timeframes[tf].candles), `/api/mtf timeframe ${tf} missing candles array`);
  }
  assert(isRecord(mtf.data.confluence), '/api/mtf missing confluence');
  assert(isFiniteNumber(mtf.data.confluence.score), '/api/mtf confluence.score not number');
  assert(typeof mtf.data.confluence.bias === 'string', '/api/mtf confluence.bias not string');

  const { res: mtfLiteRes, json: mtfLite } = await getJson('/api/mtf?symbol=SPY&lite=1');
  assert(mtfLiteRes.ok, `/api/mtf?lite=1 HTTP ${mtfLiteRes.status}`);
  assert(mtfLite && mtfLite.success === true, `/api/mtf?lite=1 success=false: ${mtfLite?.error || 'unknown error'}`);
  assert(isRecord(mtfLite.data), '/api/mtf?lite=1 missing data object');
  assert(isRecord(mtfLite.data.timeframes), '/api/mtf?lite=1 missing data.timeframes object');
  assert(isRecord(mtfLite.data.timeframes['15M']), '/api/mtf?lite=1 missing timeframe 15M');
  assert(Array.isArray(mtfLite.data.timeframes['15M'].candles), '/api/mtf?lite=1 15M candles not array');
  assert(mtfLite.data.timeframes['15M'].candles.length === 0, '/api/mtf?lite=1 expected empty 15M candles');

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

  // Pipeline integration: MESO -> MICRO -> LAB (single symbol)
  {
    const allowed = meso.microInputs?.allowedInstruments;
    if (Array.isArray(allowed) && allowed.length > 0) {
      const pick = allowed.find((i) => isRecord(i) && typeof i.symbol === 'string' && (i.direction === 'LONG' || i.direction === 'SHORT')) || allowed[0];
      const sym = String(pick.symbol);
      const dir = pick.direction === 'SHORT' ? 'SHORT' : 'LONG';

      // MICRO override should accept symbol + direction
      const { res: microRes, json: micro } = await getJson(`/api/micro?symbol=${encodeURIComponent(sym)}&direction=${encodeURIComponent(dir)}`);
      assert(microRes.ok, `/api/micro override HTTP ${microRes.status}`);
      assert(micro && micro.success === true, `/api/micro override success=false: ${micro?.error || 'unknown error'}`);
      assert(Array.isArray(micro.analyses), '/api/micro override missing analyses array');
      assert(micro.analyses.length === 1, '/api/micro override expected exactly 1 analysis');
      const a = micro.analyses[0];
      assert(isRecord(a), '/api/micro analysis[0] not object');
      assert(typeof a.symbol === 'string', '/api/micro analysis[0] missing symbol');
      assert(isRecord(a.recommendation), '/api/micro analysis[0] missing recommendation');

      // LAB report should be consistent with MESO direction
      const { res: labRes, json: lab } = await getJson(`/api/lab?symbol=${encodeURIComponent(sym)}`);
      assert(labRes.ok, `/api/lab HTTP ${labRes.status}`);
      assert(lab && lab.success === true, `/api/lab success=false: ${lab?.error || 'unknown error'}`);
      assert(isRecord(lab.report), '/api/lab missing report object');
      assert(lab.report.symbol === sym, '/api/lab report.symbol mismatch');
      assert(isRecord(lab.report.summary), '/api/lab missing report.summary');
      assert(lab.report.summary.direction === dir, '/api/lab summary.direction not aligned with MESO direction');

      // Levels/metrics basic invariants
      assert(isRecord(lab.report.levels), '/api/lab missing report.levels');
      assert(isRecord(lab.report.metrics), '/api/lab missing report.metrics');
      assert(isNumberOrNull(lab.report.levels.entry), '/api/lab levels.entry must be number|null');
      assert(isNumberOrNull(lab.report.levels.stopLoss), '/api/lab levels.stopLoss must be number|null');
      assert(Array.isArray(lab.report.levels.takeProfits), '/api/lab levels.takeProfits must be array');
      assert(isNumberOrNull(lab.report.metrics.rr), '/api/lab metrics.rr must be number|null');
      assert(isNumberOrNull(lab.report.metrics.evR), '/api/lab metrics.evR must be number|null');
      assert(isNumberOrNull(lab.report.metrics.rrMin), '/api/lab metrics.rrMin must be number|null');
    }
  }

  // /api/server-logs should be reachable, clearable, and then populated by market/news calls
  {
    const clearRes = await fetch(`${baseUrl}/api/server-logs`, { method: 'DELETE' });
    assert(clearRes.ok, `/api/server-logs DELETE HTTP ${clearRes.status}`);

    // Generate logs
    await getJson('/api/market?limit=5&macro=0');
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
