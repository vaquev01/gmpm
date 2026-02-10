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

  const { res: csRes, json: cs } = await getJson('/api/currency-strength');
  assert(csRes.ok, `/api/currency-strength HTTP ${csRes.status}`);
  assert(cs && cs.success === true, `/api/currency-strength success=false: ${cs?.error || 'unknown error'}`);
  assert(typeof cs.timestamp === 'string', '/api/currency-strength missing timestamp');
  assert(Array.isArray(cs.currencies), '/api/currency-strength missing currencies array');
  assert(cs.currencies.length >= 6, '/api/currency-strength currencies unexpectedly small');
  assert(isRecord(cs.globalFlow), '/api/currency-strength missing globalFlow');
  assert(typeof cs.globalFlow.dominantFlow === 'string', '/api/currency-strength globalFlow.dominantFlow not string');
  assert(typeof cs.globalFlow.weakestCurrency === 'string', '/api/currency-strength globalFlow.weakestCurrency not string');
  assert(Array.isArray(cs.bestPairs), '/api/currency-strength missing bestPairs array');

  if (cs.bestPairs.length > 0) {
    for (const p of cs.bestPairs) {
      assert(isRecord(p), '/api/currency-strength bestPairs[] not object');
      assert(typeof p.symbol === 'string', '/api/currency-strength bestPairs[].symbol not string');
      assert(p.direction === 'LONG' || p.direction === 'SHORT', '/api/currency-strength bestPairs[].direction invalid');
      if (isRecord(p.tradePlan)) {
        assert(isRecord(p.tradePlan.entryZone), '/api/currency-strength tradePlan.entryZone missing');
        assert(isFiniteNumber(p.tradePlan.entryZone.from), '/api/currency-strength tradePlan.entryZone.from not number');
        assert(isFiniteNumber(p.tradePlan.entryZone.to), '/api/currency-strength tradePlan.entryZone.to not number');
        assert(p.tradePlan.entryZone.from <= p.tradePlan.entryZone.to, '/api/currency-strength entryZone.from > entryZone.to');
        assert(isFiniteNumber(p.tradePlan.stopLoss), '/api/currency-strength tradePlan.stopLoss not number');
        assert(isFiniteNumber(p.tradePlan.takeProfit), '/api/currency-strength tradePlan.takeProfit not number');
        assert(isFiniteNumber(p.tradePlan.riskReward), '/api/currency-strength tradePlan.riskReward not number');
        assert(p.tradePlan.riskReward > 0, '/api/currency-strength tradePlan.riskReward must be > 0');
        assert(typeof p.tradePlan.horizon === 'string', '/api/currency-strength tradePlan.horizon not string');
        assert(typeof p.tradePlan.executionWindow === 'string', '/api/currency-strength tradePlan.executionWindow not string');
      }
    }
  }

  {
    let sym = 'EURUSD=X';
    let cls = 'forex';
    if (cs.bestPairs.length > 0 && typeof cs.bestPairs[0]?.symbol === 'string') {
      sym = cs.bestPairs[0].symbol;
    }

    if (sym.includes('-USD')) cls = 'crypto';
    if (sym.includes('=F')) cls = 'commodity';
    if (sym.startsWith('^')) cls = 'index';
    if (sym.includes('=X')) cls = 'forex';

    const { res: lmRes, json: lm } = await getJson(`/api/liquidity-map?symbol=${encodeURIComponent(sym)}&class=${encodeURIComponent(cls)}`);
    assert(lmRes.ok, `/api/liquidity-map single HTTP ${lmRes.status}`);
    assert(lm && lm.success === true, `/api/liquidity-map single success=false: ${lm?.error || 'unknown error'}`);
    assert(typeof lm.timestamp === 'string', '/api/liquidity-map single missing timestamp');
    assert(isRecord(lm.data), '/api/liquidity-map single missing data');
    assert(lm.data.symbol === sym, '/api/liquidity-map single data.symbol mismatch');
    assert(typeof lm.data.displaySymbol === 'string', '/api/liquidity-map single displaySymbol not string');
    assert(isFiniteNumber(lm.data.currentPrice), '/api/liquidity-map single currentPrice not number');
    assert(isFiniteNumber(lm.data.atr), '/api/liquidity-map single atr not number');
    assert(isRecord(lm.data.poc), '/api/liquidity-map single poc missing');
    assert(isFiniteNumber(lm.data.poc.price), '/api/liquidity-map single poc.price not number');
    assert(isRecord(lm.data.valueArea), '/api/liquidity-map single valueArea missing');
    assert(isFiniteNumber(lm.data.valueArea.low), '/api/liquidity-map single valueArea.low not number');
    assert(isFiniteNumber(lm.data.valueArea.high), '/api/liquidity-map single valueArea.high not number');
    assert(isRecord(lm.data.timing), '/api/liquidity-map single timing missing');
    assert(typeof lm.data.timing.nextLikelyWindow === 'string', '/api/liquidity-map single timing.nextLikelyWindow not string');
    assert(typeof lm.data.marketDirection === 'string', '/api/liquidity-map single marketDirection not string');
    assert(Array.isArray(lm.data.buySideLiquidity), '/api/liquidity-map single buySideLiquidity not array');
    assert(Array.isArray(lm.data.sellSideLiquidity), '/api/liquidity-map single sellSideLiquidity not array');
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

  // /api/health should return ok
  {
    const { res: hRes, json: h } = await getJson('/api/health');
    assert(hRes.ok, `/api/health HTTP ${hRes.status}`);
    assert(h && h.ok === true, '/api/health ok not true');
    assert(isFiniteNumber(h.ts), '/api/health ts not a number');
    assert(isFiniteNumber(h.uptime), '/api/health uptime not a number');
  }

  // /api/signals — track a test signal, read it, close it
  {
    const testId = `smoke-test-${Date.now()}`;
    const trackRes = await fetch(`${baseUrl}/api/signals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'track',
        signal: {
          id: testId,
          asset: 'SMOKE_TEST',
          assetClass: 'test',
          direction: 'LONG',
          entryPrice: 100,
          stopLoss: 95,
          takeProfits: [{ price: 110, ratio: '2R' }],
          score: 80,
          tier: 'B',
          components: { test: 80 },
          regime: 'RISK_ON',
          status: 'ACTIVE',
          currentPrice: 100,
          currentPnL: 0,
          createdAt: Date.now(),
          expiresAt: Date.now() + 86400000,
        },
      }),
    });
    assert(trackRes.ok, `/api/signals POST track HTTP ${trackRes.status}`);
    const trackJson = await trackRes.json();
    assert(trackJson.success === true, '/api/signals track failed');

    // Read it back
    const { res: listRes, json: listJson } = await getJson('/api/signals?status=ACTIVE');
    assert(listRes.ok, `/api/signals GET HTTP ${listRes.status}`);
    assert(listJson.success === true, '/api/signals GET failed');
    assert(Array.isArray(listJson.signals), '/api/signals signals not array');
    const found = listJson.signals.find((s) => s.id === testId);
    assert(found, '/api/signals tracked signal not found');
    assert(found.asset === 'SMOKE_TEST', '/api/signals asset mismatch');

    // Close it
    const closeRes = await fetch(`${baseUrl}/api/signals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'close',
        id: testId,
        exitPrice: 108,
        exitReason: 'HIT_TP1',
      }),
    });
    assert(closeRes.ok, `/api/signals POST close HTTP ${closeRes.status}`);
    const closeJson = await closeRes.json();
    assert(closeJson.success === true, '/api/signals close failed');
    assert(closeJson.outcome, '/api/signals close missing outcome');
    assert(closeJson.outcome.outcome === 'WIN', '/api/signals close outcome should be WIN');

    // Verify outcomes
    const { res: outcomeRes, json: outcomeJson } = await getJson('/api/signals?outcomes=1');
    assert(outcomeRes.ok, `/api/signals outcomes HTTP ${outcomeRes.status}`);
    assert(outcomeJson.success === true, '/api/signals outcomes failed');
    assert(Array.isArray(outcomeJson.outcomes), '/api/signals outcomes not array');
    assert(outcomeJson.outcomes.length > 0, '/api/signals no outcomes after close');
    assert(isRecord(outcomeJson.stats), '/api/signals stats missing');
    assert(isFiniteNumber(outcomeJson.stats.total), '/api/signals stats.total not number');
  }

  // /api/monitor should run without errors
  {
    const { res: monRes, json: mon } = await getJson('/api/monitor');
    assert(monRes.ok, `/api/monitor HTTP ${monRes.status}`);
    assert(mon && mon.success === true, `/api/monitor success=false: ${mon?.error || 'unknown error'}`);
    assert(isFiniteNumber(mon.activeSignals), '/api/monitor activeSignals not number');
    assert(isFiniteNumber(mon.duration), '/api/monitor duration not number');
  }

  // /api/risk should now return dataSource field
  {
    const { res: riskRes, json: risk } = await getJson('/api/risk');
    assert(riskRes.ok, `/api/risk HTTP ${riskRes.status}`);
    assert(risk && risk.success === true, `/api/risk success=false: ${risk?.error || 'unknown error'}`);
    assert(typeof risk.dataSource === 'string', '/api/risk missing dataSource');
    assert(isRecord(risk.report), '/api/risk missing report');
  }

  process.stdout.write('SMOKE_OK\n');
}

main().catch((e) => {
  process.stderr.write(`SMOKE_FAIL: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
