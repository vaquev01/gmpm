type PositionSize = { size: string; riskPercent: number };

type TestCase = {
  name: string;
  input: Record<string, unknown>;
  expectedOutput: unknown;
  actualOutput?: unknown;
  passed?: boolean;
};

function calculateRSI(closes: number[]): number {
  if (closes.length < 15) return 50;

  const gains: number[] = [];
  const losses: number[] = [];

  for (let i = closes.length - 14; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains.push(diff);
    else losses.push(Math.abs(diff));
  }

  const avgGain = gains.length > 0 ? gains.reduce((a, b) => a + b, 0) / 14 : 0;
  const avgLoss = losses.length > 0 ? losses.reduce((a, b) => a + b, 0) / 14 : 0.001;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function calculateATR(highs: number[], lows: number[], closes: number[]): number {
  if (highs.length < 14) return 0;

  const ranges: number[] = [];
  for (let i = closes.length - 14; i < closes.length; i++) {
    if (highs[i] && lows[i]) {
      const tr = Math.max(
        highs[i] - lows[i],
        Math.abs(highs[i] - (closes[i - 1] || closes[i])),
        Math.abs(lows[i] - (closes[i - 1] || closes[i]))
      );
      ranges.push(tr);
    }
  }

  return ranges.length > 0 ? ranges.reduce((a, b) => a + b, 0) / ranges.length : 0;
}

function calculateScore(components: Record<string, number>, weights: Record<string, number>): number {
  let total = 0;
  let weightSum = 0;

  for (const [key, value] of Object.entries(components)) {
    const weight = weights[key.toLowerCase()] || 0.1;
    total += value * weight;
    weightSum += weight;
  }

  return Math.round(total / weightSum);
}

function calculateStopLoss(price: number, atr: number, direction: 'LONG' | 'SHORT', regime: string): number {
  const multiplier: Record<string, number> = {
    RISK_ON: 1.5,
    RISK_OFF: 2.0,
    TRANSITION: 2.5,
    STRESS: 3.0,
  };

  const mult = multiplier[regime] || 2.0;

  if (direction === 'LONG') {
    return price - atr * mult;
  }
  return price + atr * mult;
}

function calculateTakeProfit(price: number, stopLoss: number, direction: 'LONG' | 'SHORT', ratio: number): number {
  const slDistance = Math.abs(price - stopLoss);

  if (direction === 'LONG') {
    return price + slDistance * ratio;
  }
  return price - slDistance * ratio;
}

function calculatePositionSize(score: number): PositionSize {
  if (score >= 80) return { size: '0.5R', riskPercent: 0.5 };
  if (score >= 70) return { size: '0.3R', riskPercent: 0.3 };
  return { size: '0.2R', riskPercent: 0.2 };
}

function detectRegime(vix: number, fearGreed: number, yieldCurve: number): string {
  if (vix > 30 && fearGreed < 25) return 'STRESS';
  if (vix > 25 || yieldCurve < 0) return 'RISK_OFF';
  if (vix < 18 && fearGreed > 55) return 'RISK_ON';
  if (vix >= 18 && vix <= 25) return 'TRANSITION';
  return 'UNCERTAIN';
}

export function runSelfTestSuite() {
  const tests: TestCase[] = [];

  const rsiCloses = [100, 102, 101, 103, 105, 104, 106, 108, 107, 109, 111, 110, 112, 114, 113];
  const rsiResult = calculateRSI(rsiCloses);
  tests.push({
    name: 'RSI Calculation',
    input: { closes: rsiCloses },
    expectedOutput: { range: [50, 80], description: 'RSI should be between 50-80 for uptrend' },
    actualOutput: rsiResult,
    passed: rsiResult >= 50 && rsiResult <= 80,
  });

  const atrHighs = [105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119];
  const atrLows = [100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114];
  const atrCloses = [102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116];
  const atrResult = calculateATR(atrHighs, atrLows, atrCloses);
  tests.push({
    name: 'ATR Calculation',
    input: { highs: atrHighs, lows: atrLows },
    expectedOutput: { range: [4, 6], description: 'ATR should be ~5 (high-low = 5)' },
    actualOutput: atrResult,
    passed: atrResult >= 4 && atrResult <= 6,
  });

  const scoreComponents = {
    macro: 70,
    trend: 80,
    momentum: 60,
    volatility: 75,
    flow: 65,
    technical: 72,
    fractal: 68,
    crossAsset: 50,
    timing: 55,
    riskReward: 70,
  };
  const scoreWeights = {
    macro: 0.15,
    trend: 0.15,
    momentum: 0.1,
    volatility: 0.1,
    flow: 0.1,
    technical: 0.1,
    fractal: 0.1,
    crossasset: 0.05,
    timing: 0.05,
    riskreward: 0.1,
  };
  const scoreResult = calculateScore(scoreComponents, scoreWeights);
  tests.push({
    name: 'Weighted Score Calculation',
    input: scoreComponents,
    expectedOutput: { range: [65, 75], description: 'Score should be weighted average ~70' },
    actualOutput: scoreResult,
    passed: scoreResult >= 65 && scoreResult <= 75,
  });

  const slPrice = 100;
  const slAtr = 2;
  const slLong = calculateStopLoss(slPrice, slAtr, 'LONG', 'RISK_ON');
  const slShort = calculateStopLoss(slPrice, slAtr, 'SHORT', 'RISK_OFF');
  tests.push({
    name: 'Stop Loss - LONG RISK_ON',
    input: { price: slPrice, atr: slAtr, direction: 'LONG', regime: 'RISK_ON' },
    expectedOutput: 97,
    actualOutput: slLong,
    passed: slLong === 97,
  });
  tests.push({
    name: 'Stop Loss - SHORT RISK_OFF',
    input: { price: slPrice, atr: slAtr, direction: 'SHORT', regime: 'RISK_OFF' },
    expectedOutput: 104,
    actualOutput: slShort,
    passed: slShort === 104,
  });

  const tpPrice = 100;
  const tpSL = 97;
  const tp1 = calculateTakeProfit(tpPrice, tpSL, 'LONG', 1.5);
  const tp2 = calculateTakeProfit(tpPrice, tpSL, 'LONG', 2.5);
  tests.push({
    name: 'Take Profit 1.5:1',
    input: { price: tpPrice, sl: tpSL, ratio: 1.5 },
    expectedOutput: 104.5,
    actualOutput: tp1,
    passed: tp1 === 104.5,
  });
  tests.push({
    name: 'Take Profit 2.5:1',
    input: { price: tpPrice, sl: tpSL, ratio: 2.5 },
    expectedOutput: 107.5,
    actualOutput: tp2,
    passed: tp2 === 107.5,
  });

  const ps80 = calculatePositionSize(80);
  const ps70 = calculatePositionSize(70);
  const ps60 = calculatePositionSize(60);
  tests.push({
    name: 'Position Size Score 80+',
    input: { score: 80 },
    expectedOutput: { size: '0.5R', riskPercent: 0.5 },
    actualOutput: ps80,
    passed: ps80.size === '0.5R',
  });
  tests.push({
    name: 'Position Size Score 70-79',
    input: { score: 70 },
    expectedOutput: { size: '0.3R', riskPercent: 0.3 },
    actualOutput: ps70,
    passed: ps70.size === '0.3R',
  });
  tests.push({
    name: 'Position Size Score <70',
    input: { score: 60 },
    expectedOutput: { size: '0.2R', riskPercent: 0.2 },
    actualOutput: ps60,
    passed: ps60.size === '0.2R',
  });

  const regimes = [
    { vix: 35, fg: 15, yc: 0.5, expected: 'STRESS' },
    { vix: 28, fg: 40, yc: 0.3, expected: 'RISK_OFF' },
    { vix: 15, fg: 65, yc: 0.5, expected: 'RISK_ON' },
    { vix: 22, fg: 50, yc: 0.4, expected: 'TRANSITION' },
    { vix: 20, fg: 50, yc: -0.2, expected: 'RISK_OFF' },
  ];

  for (const r of regimes) {
    const result = detectRegime(r.vix, r.fg, r.yc);
    tests.push({
      name: `Regime Detection VIX=${r.vix} FG=${r.fg}`,
      input: r,
      expectedOutput: r.expected,
      actualOutput: result,
      passed: result === r.expected,
    });
  }

  const passed = tests.filter((t) => t.passed).length;
  const failed = tests.filter((t) => !t.passed).length;
  const total = tests.length;

  return {
    summary: {
      total,
      passed,
      failed,
      percentage: Math.round((passed / total) * 100),
    },
    tests: tests.map((t) => ({
      name: t.name,
      passed: t.passed,
      expected: t.expectedOutput,
      actual: t.actualOutput,
    })),
  };
}
