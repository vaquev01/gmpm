#!/usr/bin/env node
// Full system functionality test
const BASE = process.env.BASE_URL || 'http://localhost:3000';
const TIMEOUT = 30_000;

const results = [];

async function test(name, url, opts = {}) {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeout || TIMEOUT);
    const res = await fetch(url, {
      method: opts.method || 'GET',
      signal: controller.signal,
      headers: opts.headers || {},
      body: opts.body || undefined,
    });
    clearTimeout(timer);
    const ms = Date.now() - start;
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch {}
    const ok = res.status >= 200 && res.status < 400;
    const summary = json
      ? (json.success !== undefined ? `success=${json.success}` : `keys=${Object.keys(json).slice(0,5).join(',')}`)
      : `text=${text.slice(0,80)}`;
    results.push({ name, status: res.status, ok, ms, summary });
    console.log(`${ok ? '✅' : '❌'} ${name} — ${res.status} — ${ms}ms — ${summary}`);
    return { ok, json, status: res.status };
  } catch (err) {
    const ms = Date.now() - start;
    results.push({ name, status: 0, ok: false, ms, summary: err.message });
    console.log(`❌ ${name} — ERROR — ${ms}ms — ${err.message}`);
    return { ok: false, json: null, status: 0 };
  }
}

async function run() {
  console.log(`\n🔬 GMPM Full System Test — ${new Date().toISOString()}\n`);
  console.log(`Base URL: ${BASE}\n`);
  console.log('━'.repeat(70));

  // ── 1. INFRA ──
  console.log('\n📡 INFRA ENDPOINTS\n');
  await test('Health', `${BASE}/api/health`);
  await test('Server Logs', `${BASE}/api/server-logs`);
  await test('Test', `${BASE}/api/test`);

  // ── 2. CORE MARKET DATA ──
  console.log('\n📊 CORE MARKET DATA\n');
  await test('Market (default)', `${BASE}/api/market`);
  await test('Market (filtered: BTC)', `${BASE}/api/market?symbols=BTC-USD&macro=0`);
  await test('Market (multi: 3 symbols)', `${BASE}/api/market?symbols=BTC-USD,ETH-USD,GC=F&macro=0`);
  await test('Regime', `${BASE}/api/regime`);

  // ── 3. MACRO / MESO / MICRO ──
  console.log('\n🏛️ MACRO → MESO → MICRO PIPELINE\n');
  await test('Macro', `${BASE}/api/macro`);
  await test('Meso', `${BASE}/api/meso`);
  await test('Micro (BTC-USD)', `${BASE}/api/micro?symbol=BTC-USD`, { timeout: 60_000 });
  // Second call should be cached
  const microStart = Date.now();
  const micro2 = await test('Micro (BTC-USD cache)', `${BASE}/api/micro?symbol=BTC-USD`);
  const microCacheMs = Date.now() - microStart;

  // ── 4. ANALYSIS ENDPOINTS ──
  console.log('\n🔍 ANALYSIS ENDPOINTS\n');
  await test('MTF (BTC-USD)', `${BASE}/api/mtf?symbol=BTC-USD`);
  await test('History (BTC-USD)', `${BASE}/api/history?symbol=BTC-USD`);
  await test('SMC (BTC-USD)', `${BASE}/api/smc?symbol=BTC-USD`);
  await test('Technical (BTC-USD)', `${BASE}/api/technical?symbol=BTC-USD`);
  await test('Liquidity Map', `${BASE}/api/liquidity-map?symbol=BTC-USD`);
  await test('Currency Strength', `${BASE}/api/currency-strength`);
  await test('OrderFlow (BTC-USD)', `${BASE}/api/orderflow?symbol=BTC-USD`);

  // ── 5. EXTERNAL DATA ──
  console.log('\n🌐 EXTERNAL DATA\n');
  await test('FRED', `${BASE}/api/fred`);
  await test('COT', `${BASE}/api/cot`);
  await test('Calendar', `${BASE}/api/calendar`);
  await test('News', `${BASE}/api/news`);

  // ── 6. OPERATIONS ──
  console.log('\n⚙️ OPERATIONS ENDPOINTS\n');
  await test('Risk', `${BASE}/api/risk`);
  await test('Signals (GET)', `${BASE}/api/signals`);
  await test('Monitor', `${BASE}/api/monitor`);
  await test('Decision Engine', `${BASE}/api/decision-engine`);

  // ── 7. UI PAGE ──
  console.log('\n🖥️ UI\n');
  await test('Homepage (SSR)', BASE);

  // ── SUMMARY ──
  console.log('\n' + '━'.repeat(70));
  console.log('\n📋 SUMMARY\n');
  const passed = results.filter(r => r.ok).length;
  const failed = results.filter(r => !r.ok).length;
  const total = results.length;
  const avgMs = Math.round(results.reduce((a, r) => a + r.ms, 0) / total);

  console.log(`Total: ${total} | ✅ Passed: ${passed} | ❌ Failed: ${failed} | Avg: ${avgMs}ms`);

  if (failed > 0) {
    console.log('\nFailed tests:');
    results.filter(r => !r.ok).forEach(r => {
      console.log(`  ❌ ${r.name} — status ${r.status} — ${r.ms}ms — ${r.summary}`);
    });
  }

  if (microCacheMs < 1000) {
    console.log(`\n⚡ Micro cache working: second call took ${microCacheMs}ms`);
  } else {
    console.log(`\n⚠️ Micro cache might not be working: second call took ${microCacheMs}ms`);
  }

  console.log('\n' + (failed === 0 ? '🎉 ALL TESTS PASSED' : `⚠️ ${failed} TEST(S) FAILED`) + '\n');
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(2);
});
