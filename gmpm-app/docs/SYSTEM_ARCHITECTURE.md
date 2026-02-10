# GMPM - Sistema de Trading Institucional
## Arquitetura Completa: Fluxo de Informações e Tomada de Decisão

---

## 📊 VISÃO GERAL DA ARQUITETURA

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           FONTES DE DADOS EXTERNAS                              │
├─────────────────────────────────────────────────────────────────────────────────┤
│  Yahoo Finance │ FRED API │ Fear&Greed │ Alternative.me │ Economic Calendar    │
└────────┬────────────┬──────────┬────────────┬─────────────┬────────────────────┘
         │            │          │            │             │
         ▼            ▼          ▼            ▼             ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              CAMADA DE COLETA                                   │
│  /api/market  │ /api/macro │ /api/fred │ /api/calendar │ /api/news │ /api/cot  │
└────────┬────────────┬──────────┬────────────┬─────────────┬────────────────────┘
         │            │          │            │             │
         ▼            ▼          ▼            ▼             ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         FRAMEWORK MACRO → MESO → MICRO                          │
├─────────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐   ┌─────────────────────┐  │
│  │    MACRO    │ → │    MESO     │ → │    MICRO    │ → │     EXECUTION       │  │
│  │  (Regime)   │   │ (24h Focus) │   │  (Setups)   │   │     (Gating)        │  │
│  └─────────────┘   └─────────────┘   └─────────────┘   └─────────────────────┘  │
└────────┬────────────────┬────────────────┬─────────────────────┬────────────────┘
         │                │                │                     │
         ▼                ▼                ▼                     ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              UI / SCANNER                                       │
│            CommandView → AssetDetailPanel → Signal Tracking                     │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 🔴 CAMADA 1: MACRO (Regime Engine)

### Objetivo
Determinar o **regime macroeconômico** atual para definir o contexto de trading.

### Fonte de Dados
- **API**: `/api/regime` → chama `/api/macro` e `/api/market`
- **Arquivo**: `src/lib/regimeEngine.ts`

### 6 Eixos de Análise

| Eixo | Nome | Indicadores | Interpretação |
|------|------|-------------|---------------|
| **G** | Growth | Fear/Greed, Adv/Dec ratio, Avg market change | Crescimento econômico |
| **I** | Inflation | Yield curve (10Y-2Y), Treasury 10Y | Pressão inflacionária |
| **L** | Liquidity | VIX, VIX change, Yield curve | **MAIS IMPORTANTE** - liquidez do mercado |
| **C** | Credit | VIX (proxy), HY spread | Estresse de crédito |
| **D** | Dollar | DXY level, DXY change | Força do dólar |
| **V** | Volatility | VIX level, VIX percentile | Volatilidade de mercado |

### Hierarquia de Dominância
```
L (Liquidity) > C (Credit) > V (Volatility) > G (Growth) > I (Inflation) > D (Dollar)
```

### Regimes Possíveis

| Regime | Condição | Estratégia |
|--------|----------|------------|
| **GOLDILOCKS** | G↑ I→ L↑ | Risk-on, carry trades |
| **REFLATION** | G↑ I↑ | Commodities, value, short duration |
| **STAGFLATION** | G↓ I↑ L↓ | Defensivo, gold, cash |
| **DEFLATION** | G↓ I↓ L↓ C↓ | Cash, long duration, gold |
| **LIQUIDITY_DRIVEN** | L↑↑ | Todos os ativos sobem |
| **LIQUIDITY_DRAIN** | L↓↓ | **CRÍTICO** - todos os ativos caem |
| **CREDIT_STRESS** | C↓↓ | Risk-off urgente |
| **RISK_ON** | G↑ ou L↑ | Bullish genérico |
| **RISK_OFF** | G↓ ou L↓ | Bearish genérico |

### Outputs do Regime
```typescript
interface RegimeSnapshot {
    regime: RegimeType;           // Regime atual
    regimeConfidence: ConfidenceLevel;
    dominantDrivers: string[];    // Ex: ['L↓↓', 'V↑']
    axes: { G, I, L, C, D, V };   // Scores de cada eixo
    alerts: RegimeAlert[];        // Alertas críticos
    mesoTilts: MesoTilt[];        // Direcionamentos para MESO
    mesoProhibitions: string[];   // Proibições ativas
    transitionWarning: string;    // Mudança de regime iminente
}
```

---

## 🟠 CAMADA 2: MESO (24h Focus)

### Objetivo
Traduzir o regime macro em **expectativas por classe de ativo** e **instrumentos permitidos/proibidos** para as próximas 24 horas.

### Fonte de Dados
- **API**: `/api/meso` → chama `/api/regime` e `/api/market`
- **Arquivo**: `src/app/api/meso/route.ts`

### Classes de Ativos Analisadas

| Classe | Símbolos | Benchmarks |
|--------|----------|------------|
| **Stocks** | AAPL, MSFT, GOOGL, etc. | ^GSPC, ^DJI, ^IXIC |
| **Crypto** | BTC-USD, ETH-USD, SOL-USD | BTC-USD, ETH-USD |
| **Forex** | EUR/USD, GBP/USD, USD/JPY | DX=F |
| **Commodities** | GC=F, CL=F, SI=F | GC=F, CL=F |
| **Bonds** | TLT, IEF, HYG | ^TNX, ^TYX |
| **ETFs** | SPY, QQQ, IWM | SPY, QQQ |

### Análise por Classe

```typescript
interface ClassAnalysis {
    class: string;
    expectation: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'MIXED';
    confidence: 'HIGH' | 'MEDIUM' | 'LOW';
    direction: 'LONG' | 'SHORT' | 'AVOID';
    drivers: string[];           // Razões da expectativa
    liquidityScore: number;      // 0-100
    volatilityRisk: 'LOW' | 'MEDIUM' | 'HIGH';
    topPicks: string[];          // Melhores instrumentos
    avoidList: string[];         // Instrumentos a evitar
}
```

### Regras de Derivação por Regime

**GOLDILOCKS:**
- Stocks: BULLISH (Growth + Liquidity support)
- Crypto: BULLISH (Risk-on + Liquidity)
- Commodities: NEUTRAL
- Bonds: BEARISH

**STAGFLATION:**
- Stocks: BEARISH
- Crypto: AVOID
- Gold: BULLISH
- Bonds: BEARISH

**LIQUIDITY_DRAIN:**
- TODAS as classes: AVOID
- USD: LONG (dollar shortage)
- Cash: preferred

### Output: Instrumentos para MICRO

```typescript
interface MesoOutput {
    allowedInstruments: { 
        symbol: string; 
        direction: 'LONG' | 'SHORT';
        class: string;
        reason: string;
        score: number;
    }[];
    prohibitedInstruments: { 
        symbol: string; 
        reason: string;
    }[];
    weeklyThesis: string;
    dailyFocus: string[];
    favoredDirection: 'LONG' | 'SHORT' | 'NEUTRAL';
    volatilityContext: 'HIGH' | 'NORMAL' | 'LOW';
    marketBias: 'RISK_ON' | 'RISK_OFF' | 'NEUTRAL';
}
```

---

## 🟢 CAMADA 3: MICRO (Technical Setups)

### Objetivo
Analisar tecnicamente os instrumentos permitidos pelo MESO e gerar **setups acionáveis** com níveis de entrada, stop e target.

### Fonte de Dados
- **API**: `/api/micro` → chama `/api/meso`, `/api/market`, `/api/mtf`, `/api/liquidity-map`
- **Arquivo**: `src/app/api/micro/route.ts`

### Análise Técnica Multi-Timeframe

```typescript
interface TechnicalAnalysis {
    trend: {
        h4: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
        h1: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
        m15: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
        alignment: 'ALIGNED' | 'CONFLICTING' | 'PARTIAL';
    };
    structure: {
        lastBOS: 'BULLISH' | 'BEARISH' | null;
        lastCHoCH: 'BULLISH' | 'BEARISH' | null;
        currentPhase: 'IMPULSE' | 'CORRECTION' | 'RANGING';
    };
    levels: {
        resistance: number[];
        support: number[];
        pivot: number;
        atr: number;
    };
    indicators: {
        rsi: number;
        rsiDivergence: 'BULLISH' | 'BEARISH' | null;
        ema21, ema50, ema200: number;
        macdSignal: 'BUY' | 'SELL' | 'NEUTRAL';
        bbPosition: 'UPPER' | 'MIDDLE' | 'LOWER';
    };
    volume: {
        relative: number;
        trend: 'INCREASING' | 'DECREASING' | 'STABLE';
        climax: boolean;
    };
    smc: {  // Smart Money Concepts
        orderBlocks: [];
        fvgs: [];           // Fair Value Gaps
        liquidityPools: [];
        premiumDiscount: 'PREMIUM' | 'DISCOUNT' | 'EQUILIBRIUM';
    };
}
```

### Análise de Cenário (Scenario Analysis)

```typescript
interface ScenarioAnalysis {
    status: 'PRONTO' | 'DESENVOLVENDO' | 'CONTRA';
    statusReason: string;
    technicalAlignment: number;  // 0-100
    entryQuality: 'OTIMO' | 'BOM' | 'RUIM';
    timing: 'AGORA' | 'AGUARDAR' | 'PERDIDO';
    blockers: string[];
    catalysts: string[];
}
```

### Critérios para Status

| Status | Condição | Ação |
|--------|----------|------|
| **PRONTO** | alignment ≥ 75, blockers = 0 | EXECUTE imediato |
| **PRONTO** | alignment ≥ 60, blockers ≤ 1 | EXECUTE com ressalvas |
| **DESENVOLVENDO** | alignment ≥ 45 | WAIT - cenário formando |
| **CONTRA** | alignment < 45 ou trend contrário | AVOID |

### Setup Gerado

```typescript
interface Setup {
    symbol: string;
    type: 'BREAKOUT' | 'PULLBACK' | 'REVERSAL' | 'CONTINUATION' | 'LIQUIDITY_GRAB';
    direction: 'LONG' | 'SHORT';
    timeframe: 'M15' | 'H1' | 'H4';
    entry: number;
    stopLoss: number;
    takeProfit1: number;
    takeProfit2: number;
    takeProfit3: number;
    riskReward: number;
    confidence: 'HIGH' | 'MEDIUM' | 'LOW';
    confluences: string[];
    thesis: string;
    mesoAlignment: boolean;
    technicalScore: number;
}
```

### Recomendação Final

```typescript
interface Recommendation {
    action: 'EXECUTE' | 'WAIT' | 'AVOID';
    reason: string;
    bestSetup: Setup | null;
    metrics: {
        pWin: number;       // Probabilidade de vitória
        rrMin: number;      // R:R mínimo
        evR: number;        // Expected Value em R
        modelRisk: 'LOW' | 'MED' | 'HIGH';
        kellyFraction: number;
        positionSizePercent: number;
    };
}
```

---

## 🔵 CAMADA 4: LIQUIDITY MAP

### Objetivo
Mapear **zonas de liquidez** (stops de traders, equal highs/lows) para identificar alvos de preço baseados em Smart Money Concepts.

### Fonte de Dados
- **API**: `/api/liquidity-map`
- **Arquivo**: `src/app/api/liquidity-map/route.ts`

### Análise de Liquidez

```typescript
interface LiquidityMapData {
    // Volume Profile
    volumeProfile: VolumeProfileBar[];
    poc: { price: number; volume: number };  // Point of Control
    valueArea: { high: number; low: number }; // 70% do volume
    
    // Zonas de Liquidez
    buySideLiquidity: { level: number; strength: number }[];   // Stops dos shorts
    sellSideLiquidity: { level: number; strength: number }[];  // Stops dos longs
    equalLevels: EqualLevel[];  // Equal highs/lows
    
    // Direção do Mercado
    marketDirection: 'SEEKING_BUYSIDE' | 'SEEKING_SELLSIDE' | 'BALANCED';
    
    // Perfil de Tolerância
    toleranceProfile: {
        toleranceScore: number;
        behaviorPattern: 'AGGRESSIVE_HUNTER' | 'SELECTIVE_HUNTER' | 'PASSIVE' | 'UNPREDICTABLE';
    };
    
    // Análise Multi-Timeframe
    mtfLiquidity: {
        alignment: 'ALIGNED_BUYSIDE' | 'ALIGNED_SELLSIDE' | 'CONFLICTING' | 'NEUTRAL';
        strongestTimeframe: 'M15' | 'H1' | 'H4' | 'D1';
    };
    
    // Alvos de Preço
    priceTargets: {
        direction: 'LONG' | 'SHORT';
        primaryTarget: number;
        primaryProbability: number;
        secondaryTarget: number;
        invalidationLevel: number;
        timeHorizon: string;
        rationale: string[];
    };
    
    liquidityScore: number;  // 0-100
}
```

---

## 🟣 CAMADA 5: CURRENCY STRENGTH (Forex)

### Objetivo
Analisar a **força relativa das moedas** para identificar os melhores pares de Forex.

### Fonte de Dados
- **API**: `/api/currency-strength`
- **Arquivo**: `src/app/api/currency-strength/route.ts`

### Moedas Analisadas

| Moeda | Perfil de Risco | Exposição Commodities |
|-------|-----------------|----------------------|
| USD | SAFE_HAVEN | Oil -, Gold - |
| EUR | RISK_NEUTRAL | Oil -, Copper + |
| GBP | RISK_NEUTRAL | Oil +, Gold + |
| JPY | SAFE_HAVEN | Oil -, Gold + |
| CHF | SAFE_HAVEN | Gold ++ |
| AUD | RISK_ON | Copper ++, Gold + |
| CAD | RISK_ON | Oil ++, Gold + |
| NZD | RISK_ON | - |

### Análise de Força

```typescript
interface CurrencyStrength {
    code: CurrencyCode;
    strength: number;           // -100 a +100
    strengthLabel: 'STRONG' | 'BULLISH' | 'NEUTRAL' | 'BEARISH' | 'WEAK';
    trend: 'UP' | 'DOWN' | 'SIDEWAYS';
    momentum: number;
    economicIndicators: {
        interestRate: number;
        inflation: number;
        gdpGrowth: number;
        sentiment: 'HAWKISH' | 'NEUTRAL' | 'DOVISH';
    };
    flowAnalysis: {
        capitalFlow: 'INFLOW' | 'OUTFLOW' | 'NEUTRAL';
        institutionalBias: 'LONG' | 'SHORT' | 'NEUTRAL';
    };
}
```

### Identificação do Par Ideal

```typescript
// Melhor par = Moeda mais forte vs Moeda mais fraca
const idealPair = {
    base: dominantCurrency,    // Mais forte
    quote: weakestCurrency,    // Mais fraca
    direction: 'LONG',         // Comprar base contra quote
    confidence: 'HIGH' | 'MEDIUM' | 'LOW',
    tradePlan: {
        entryZone: { from, to },
        stopLoss: number,
        takeProfit: number,
        riskReward: number,
        horizon: string,
    }
};
```

---

## ⚡ CAMADA 6: EXECUTION GATING

### Objetivo
**5 Gates de validação** que TODOS devem passar antes de executar um trade.

### Fonte de Dados
- **Arquivo**: `src/lib/regimeEngine.ts` → `evaluateGates()`

### Gate 1: MACRO Gate

```typescript
// Verifica se o regime permite a operação
function evaluateMacroGate(regime, trade): GateResult {
    // FAIL se:
    // - Regime é LIQUIDITY_DRAIN/CREDIT_STRESS/DEFLATION E trade é LONG em risk asset
    // - L↓↓ (Liquidity Drain ativo)
    // - C↓↓ (Credit Stress ativo)
    
    // WARN se:
    // - Regime confidence baixa
}
```

### Gate 2: MESO Gate

```typescript
// Verifica proibições e alinhamento com tilts
function evaluateMesoGate(regime, trade): GateResult {
    // WARN se:
    // - Proibição ativa para a classe/direção
    
    // PASS com bonus se:
    // - Alinhado com mesoTilts
}
```

### Gate 3: MICRO Gate

```typescript
// Verifica qualidade do setup técnico
function evaluateMicroGate(trade): GateResult {
    // FAIL se:
    // - Signal é WAIT
    // - R:R < 2.0
    // - Data quality SUSPECT/STALE
    // - Liquidity score < 40
    
    // WARN se:
    // - Score < 50
}
```

### Gate 4: RISK Gate

```typescript
// Verifica limites de risco
function evaluateRiskGate(regime, trade): GateResult {
    // FAIL se:
    // - Risk per trade > 2%
    // - Total open risk > 5%
    
    // WARN se:
    // - Correlated exposure > 3%
    // - VIX > 80th percentile (sizing 50%)
}
```

### Gate 5: EXECUTION Gate

```typescript
// Verifica condições de execução
function evaluateExecutionGate(trade): GateResult {
    // FAIL se:
    // - Spread cost > 10% do target
    
    // WARN se:
    // - Horário de rollover (21-03 UTC)
    // - News de alto impacto próximo
}
```

### Resultado Final

```typescript
interface GateSummary {
    allPass: boolean;           // Só TRUE se TODOS passarem
    gates: { macro, meso, micro, risk, execution };
    blockingReasons: string[];  // Motivos de bloqueio
    warnings: string[];         // Alertas (não bloqueiam)
}
```

---

## 🛡️ CAMADA 7: RISK MANAGEMENT

### Fonte de Dados
- **API**: `/api/risk`
- **Arquivo**: `src/lib/riskManager.ts`, `src/lib/portfolioManager.ts`

### Controles de Risco

```typescript
// Limites de Risco
const RISK_PARAMS = {
    maxRiskPerTrade: 2.0,        // % do capital
    maxTotalOpenRisk: 5.0,       // % do capital
    maxCorrelatedExposure: 3.0,  // % do capital
    maxDrawdown: 10.0,           // % do capital
    kellyFraction: 0.25,         // Fração do Kelly
};

// Trading Status
type TradingStatus = 'NORMAL' | 'REDUCED' | 'HALTED';

// HALTED quando:
// - Drawdown > maxDrawdown
// - Regime LIQUIDITY_DRAIN ou CREDIT_STRESS
// - Manual kill-switch ativo
```

### Position Sizing (Kelly Criterion)

```typescript
// Kelly = (pWin * avgWin - pLoss * avgLoss) / avgWin
// Usar fração do Kelly (25%) para segurança

function calculateKelly(winRate, avgWin, avgLoss): number {
    const pWin = winRate;
    const pLoss = 1 - winRate;
    const kelly = (pWin * avgWin - pLoss * avgLoss) / avgWin;
    return Math.max(0, kelly * 0.25);  // 25% do Kelly
}
```

### Portfolio Manager

```typescript
class PortfolioManager {
    canOpenPosition(riskPercent): { allowed: boolean; reason?: string } {
        // Verifica:
        // 1. Risk per trade ≤ 2%
        // 2. Total open risk ≤ 5%
        // 3. Correlated exposure ≤ 3%
        // 4. Drawdown < max
        // 5. Defense mode não ativo
    }
}
```

---

## 🎛️ CAMADA 8: EXECUTION CONTROLS (UI)

### Fonte de Dados
- **Arquivo**: `src/components/views/CommandView.tsx`

### Kill-Switch Manual

```typescript
// localStorage: 'gmpm_manual_kill_switch'
const [manualKillSwitch, setManualKillSwitch] = useState(false);

// Se ativo: TODAS as execuções são CANCELLED
// Motivo: "MANUAL_KILL_SWITCH"
```

### Risk Trading Status

```typescript
// Busca /api/risk a cada 60s
const [riskTradingStatus, setRiskTradingStatus] = useState<
    'NORMAL' | 'REDUCED' | 'HALTED' | 'UNKNOWN'
>('UNKNOWN');

// Se HALTED: execuções CANCELLED
// Se UNKNOWN: execuções CANCELLED (fail-closed)
```

### Validação de Execução (executeSignal)

```typescript
function executeSignal(asset) {
    // 1. Feed health check
    if (feedDegraded || feedFallback) → CANCELLED: FEED_UNHEALTHY
    
    // 2. Kill-switch check
    if (manualKillSwitch) → CANCELLED: MANUAL_KILL_SWITCH
    
    // 3. Risk status check
    if (riskTradingStatus === 'HALTED') → CANCELLED: RISK_HALTED
    if (riskTradingStatus === 'UNKNOWN') → CANCELLED: RISK_STATUS_UNAVAILABLE
    
    // 4. Trade enabled check
    if (!tradeEnabled || !classAllowed) → CANCELLED: TRADE_DISABLED
    
    // 5. Signal check
    if (signal === 'WAIT') → CANCELLED: SIGNAL_WAIT
    
    // 6. Data quality check
    if (quality.status !== 'OK') → CANCELLED: DATA_QUALITY
    
    // 7. Trade plan coherence
    if (!coherent) → CANCELLED: INCOHERENT_TRADE_PLAN
    
    // 8. Portfolio gate
    if (!portfolioGate.allowed) → CANCELLED: PORTFOLIO_BLOCKED
    
    // 9. Regime check
    if (!regime) → CANCELLED: REGIME_UNAVAILABLE
    
    // 10. Gates check
    if (!gatesAllPass) → CANCELLED: GATES_BLOCKED
    
    // ✅ Se passar todos: trackSignal()
}
```

---

## 📈 CAMADA 9: SIGNAL TRACKING

### Fonte de Dados
- **Arquivo**: `src/lib/signalTracker.ts`, `src/lib/signalHistory.ts`

### Ciclo de Vida do Sinal

```
EXECUTE → ACTIVE → HIT_TP1/HIT_TP2/HIT_TP3/HIT_SL/EXPIRED/CANCELLED
```

### Signal Tracking

```typescript
interface TrackedSignal {
    id: string;
    asset: string;
    direction: 'LONG' | 'SHORT';
    entryPrice: number;
    stopLoss: number;
    takeProfits: { price: number; ratio: string }[];
    status: 'ACTIVE' | 'HIT_SL' | 'HIT_TP1' | 'HIT_TP2' | 'HIT_TP3' | 'EXPIRED' | 'CANCELLED';
    currentPrice: number;
    currentPnL: number;  // Em R múltiplos
    createdAt: number;
    expiresAt: number;
    closedAt?: number;
    gates?: GateResultSummary[];
}
```

### Audit Trail

```typescript
// Todos os sinais (incluindo CANCELLED) são auditados
interface SignalHistoryEntry {
    id: string;
    symbol: string;
    direction: string;
    status: string;
    notes?: string;        // Razão do CANCELLED
    timestamp: number;
}

// localStorage: 'gmpm_signal_history'
```

---

## 🖥️ UI: LIVE OPPORTUNITY SCANNER

### Componente Principal
- **Arquivo**: `src/components/views/CommandView.tsx`

### Fluxo de Dados na UI

```
1. fetchData() → /api/market (preços + SCAN scores)
2. fetchRegime() → /api/regime (regime snapshot)
3. fetchMeso() → /api/meso (allowed instruments)
4. fetchMicro() → /api/micro (setups técnicos)
5. computeConfluenceScore() → Score final 0-100
6. Render Scanner Table com badges e filtros
```

### Scanner Columns

| Coluna | Descrição |
|--------|-----------|
| Symbol | Ativo com tipo (CRYPTO/FX/FUT/SPOT) |
| Score | Trust score (0-100) |
| Signal | LONG/SHORT/WAIT |
| R:R | Risk/Reward ratio |
| Scenario | PRONTO/DESENVOLVENDO/CONTRA |
| Micro | EXECUTE/WAIT/AVOID |
| Risk | LOW/MED/HIGH |

### Filtros Disponíveis
- **Class**: ALL, stocks, crypto, forex, etc.
- **Micro**: ALL, EXECUTE, WAIT, AVOID
- **Scenario**: ALL, PRONTO, DESENVOLVENDO, CONTRA
- **Risk**: ALL, LOW, MED, HIGH

### Painéis de Destaque

**Top Garantido (1-3 items):**
- MICRO = EXECUTE
- Scenario = PRONTO
- Risk = LOW
- R:R ≥ 1.5

**Muito Confiáveis (5-10 items):**
- MICRO ≠ AVOID
- Scenario ≠ CONTRA
- Risk ≠ HIGH
- R:R ≥ 1.2

---

## 🔄 CONFLUENCE ANALYSIS (AssetDetailPanel)

### Integração Liquidez + Currency Strength

Para ativos que têm dados de ambas as fontes:

```typescript
interface ConfluenceAnalysis {
    liquidityBias: 'LONG' | 'SHORT' | 'NEUTRAL';
    fxBias: 'LONG' | 'SHORT' | 'NEUTRAL';
    alignment: 'ALIGNED' | 'CONFLICTING' | 'MIXED';
    alignmentScore: number;  // 0-100
    tradePlan: TradePlan;
    nearestLiquidity: { buyside: number; sellside: number };
}
```

---

## 🧠 CAMADA 10: DECISION ENGINE v2.0 (NOVO)

### Objetivo
**Unificar todas as fontes de dados** em um único score de confluência e sistema de tiers de confiança para decisões transparentes e consistentes.

### Fonte de Dados
- **API**: `/api/decision-engine`
- **Arquivo**: `src/lib/decisionEngine.ts`
- **UI**: `src/components/views/TierScanner.tsx`

### Princípio Fundamental
```
CONFIANÇA = f(QUANTIDADE_DADOS × QUALIDADE_DADOS × ALINHAMENTO)
```

### Sistema de Tiers de Confiança

| Tier | Score | Action | Position Size | Descrição |
|------|-------|--------|---------------|-----------|
| **A** | 85-100 | EXECUTE_FULL | 100% | Confluência máxima. Todas as camadas alinhadas. |
| **B** | 70-84 | EXECUTE_STANDARD | 75% | Boa confluência. Maioria alinhada. |
| **C** | 55-69 | EXECUTE_REDUCED | 50% | Confluência parcial. Algumas divergências. |
| **D** | 40-54 | WATCH_ONLY | 25% | Confluência fraca. Muitos gaps. |
| **F** | 0-39 | SKIP | 0% | Sem confluência. Dados insuficientes. |

### Pesos por Classe de Ativo

```typescript
const WEIGHTS_BY_CLASS = {
    FOREX: { macro: 0.20, meso: 0.15, micro: 0.20, liquidityMap: 0.15, currencyStrength: 0.20, fundamentals: 0.10 },
    CRYPTO: { macro: 0.25, meso: 0.15, micro: 0.25, liquidityMap: 0.15, sentiment: 0.20 },
    COMMODITY: { macro: 0.25, meso: 0.15, micro: 0.20, liquidityMap: 0.10, currencyStrength: 0.10, fundamentals: 0.15 },
    INDEX: { macro: 0.30, meso: 0.20, micro: 0.20, liquidityMap: 0.10, sentiment: 0.15 },
    STOCK: { macro: 0.20, meso: 0.20, micro: 0.25, liquidityMap: 0.10, fundamentals: 0.15, sentiment: 0.10 },
    BOND: { macro: 0.35, meso: 0.20, micro: 0.15, liquidityMap: 0.05, fundamentals: 0.20 }
};
```

### Cobertura de Dados e Caps de Confiança

```typescript
// Quanto menos dados, menor o cap de confiança possível
const COVERAGE_CONFIDENCE_CAP = {
    FULL: 100,     // Todos os dados disponíveis
    HIGH: 85,      // Maioria disponível
    MEDIUM: 70,    // Metade disponível
    LOW: 55,       // Pouco disponível
    MINIMAL: 40    // Quase nada - máximo Tier D
};
```

### Override Rules (Regras de Downgrade)

```typescript
// Condições que forçam downgrade independente do score
const OVERRIDE_RULES = [
    // TIER_F_OVERRIDES (forçam Tier F)
    { condition: 'LIQUIDITY_DRAIN ativo', result: 'FORCE_TIER_F' },
    { condition: 'CREDIT_STRESS ativo', result: 'FORCE_TIER_F' },
    { condition: 'Cobertura MINIMAL + score < 50', result: 'FORCE_TIER_F' },
    
    // TIER_CAP_OVERRIDES (limitam tier máximo)
    { condition: 'Regime LOW confidence', result: 'MAX_TIER_C' },
    { condition: 'Direções conflitantes', result: 'MAX_TIER_C' },
    { condition: 'Dados stale (> 5min)', result: 'CAP_ONE_TIER' }
];
```

### Unified Score Calculation

```typescript
interface UnifiedScore {
    score: number;              // 0-100
    coverageTier: CoverageTier; // FULL/HIGH/MEDIUM/LOW/MINIMAL
    alignment: Alignment;       // ALIGNED/CONFLICTING/NEUTRAL
    confidenceCap: number;      // Cap baseado na cobertura
    breakdown: Record<string, number>; // Scores individuais
    weights: Record<string, number>;   // Pesos aplicados
    freshnessFactor: number;    // Penalização por dados antigos
    alignmentFactor: number;    // Bonus/penalty por alinhamento
}
```

### Evidence System

```typescript
interface EvidenceItem {
    source: string;            // 'macro', 'meso', 'micro', etc.
    factor: string;            // Descrição do fator
    impact: 'STRONG' | 'MODERATE' | 'WEAK';
    direction: 'SUPPORTING' | 'OPPOSING';
    score?: number;
}

interface Evidence {
    supporting: EvidenceItem[]; // Fatores a favor
    opposing: EvidenceItem[];   // Fatores contra
    missing: string[];          // Dados não disponíveis
}
```

### Trade Plan Generation

```typescript
interface TradePlan {
    entry: { price: number; type: 'LIMIT' | 'MARKET' | 'STOP' };
    stopLoss: { price: number; atrMultiple: number; riskPercent: number };
    targets: { tp1: number; tp2: number; tp3: number };
    riskReward: number;
    positionSize: {
        percent: number;       // Base %
        kellyAdjusted: number; // Após Kelly
        tierAdjusted: number;  // Após ajuste por tier
        final: number;         // Final %
    };
    maxHoldTime: string;
}
```

### Decision Engine Response

```typescript
interface DecisionEngineResponse {
    timestamp: number;
    regime: { type: string; confidence: string; dominantDrivers: string[] } | null;
    decisions: ActionDecision[];
    summary: {
        tierA: number;        // Contagem por tier
        tierB: number;
        tierC: number;
        tierD: number;
        tierF: number;
        topPicks: string[];   // Top 3 ativos
        marketBias: 'RISK_ON' | 'RISK_OFF' | 'NEUTRAL';
    };
    dataHealth: {
        feedStatus: 'HEALTHY' | 'DEGRADED' | 'DOWN';
        lastMacroUpdate: number;
        lastMesoUpdate: number;
        staleAssets: string[];
    };
}
```

### TierScanner Component

O novo componente **TierScanner** exibe:
- Ativos agrupados por Tier (A-F)
- Cards expansíveis com evidências detalhadas
- Trade plan com Entry/SL/TP
- Warnings e blockers
- Decision path (caminho da decisão)
- Filtros por classe e acionáveis

---

## 📊 RESUMO DO FLUXO DE DECISÃO

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              FLUXO DECISION ENGINE v2.0                          │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                        1. COLETA DE DADOS                                │   │
│  │  /api/regime → /api/meso → /api/micro → /api/liquidity-map              │   │
│  │  /api/currency-strength → /api/market                                    │   │
│  └─────────────────────────────────┬───────────────────────────────────────┘   │
│                                    ▼                                            │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                    2. DECISION ENGINE (/api/decision-engine)             │   │
│  │  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────────────────┐ │   │
│  │  │ COBERTURA │→ │  SCORE    │→ │ OVERRIDE  │→ │ TIER CLASSIFICATION   │ │   │
│  │  │  CHECK    │  │ UNIFICADO │  │  RULES    │  │  A → B → C → D → F    │ │   │
│  │  └───────────┘  └───────────┘  └───────────┘  └───────────────────────┘ │   │
│  └─────────────────────────────────┬───────────────────────────────────────┘   │
│                                    ▼                                            │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                        3. EVIDÊNCIAS & TRADE PLAN                        │   │
│  │  • Supporting factors (Fatores a favor)                                  │   │
│  │  • Opposing factors (Fatores contra)                                     │   │
│  │  • Missing data (Dados faltantes)                                        │   │
│  │  • Entry/SL/TP/Position Size                                             │   │
│  └─────────────────────────────────┬───────────────────────────────────────┘   │
│                                    ▼                                            │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                         4. UI (TierScanner)                              │   │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐       │   │
│  │  │ TIER A  │  │ TIER B  │  │ TIER C  │  │ TIER D  │  │ TIER F  │       │   │
│  │  │ EXECUTE │  │ EXECUTE │  │ REDUCED │  │  WATCH  │  │  SKIP   │       │   │
│  │  │  FULL   │  │ STANDARD│  │         │  │  ONLY   │  │         │       │   │
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘  └─────────┘       │   │
│  └─────────────────────────────────┬───────────────────────────────────────┘   │
│                                    ▼                                            │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                          5. EXECUTION GATING                             │   │
│  │  MACRO ✓ → MESO ✓ → MICRO ✓ → RISK ✓ → EXECUTION ✓ → PORTFOLIO ✓       │   │
│  └─────────────────────────────────┬───────────────────────────────────────┘   │
│                                    ▼                                            │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                         6. SIGNAL TRACKING                               │   │
│  │  EXECUTE → ACTIVE → HIT_TP1/TP2/TP3 | HIT_SL | EXPIRED | CANCELLED      │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Fluxo Detalhado por Etapa

```
1. MACRO: Qual é o regime atual?
   → GOLDILOCKS? RISK_OFF? LIQUIDITY_DRAIN?
   → Score Macro + Dominant Drivers

2. MESO: Quais classes/instrumentos são permitidos?
   → Stocks OK? Crypto AVOID? Gold LONG?
   → Score Meso + Allowed/Prohibited lists

3. MICRO: O setup técnico confirma a direção MESO?
   → PRONTO? DESENVOLVENDO? CONTRA?
   → Entry, SL, TP calculados com SMC

4. LIQUIDITY MAP: Onde está a liquidez alvo?
   → Buyside/Sellside targets
   → Probability of capture

5. CURRENCY STRENGTH: Força relativa das moedas (FX)
   → Melhor par = Strong vs Weak
   → Alignment com direção

6. DECISION ENGINE: Unifica todas as camadas
   → Calcula Unified Score (0-100)
   → Aplica Override Rules
   → Classifica em Tier (A-F)
   → Gera Evidence & Trade Plan

7. GATING: Todos os 5 gates passam?
   → MACRO ✓ → MESO ✓ → MICRO ✓ → RISK ✓ → EXECUTION ✓

8. EXECUTION: Verificações finais
   → Kill-switch? Risk status? Portfolio limits?
   → Coherent trade plan?

9. TRACK: Sinal registrado e monitorado
   → Update prices every 30s
   → Check SL/TP hits
   → Audit trail completo
```

---

## 📁 ESTRUTURA DE ARQUIVOS

```
src/
├── app/
│   └── api/
│       ├── decision-engine/route.ts  # Decision Engine API (Unified)
│       ├── regime/route.ts      # Regime Engine API
│       ├── macro/route.ts       # Macro indicators
│       ├── meso/route.ts        # MESO layer
│       ├── micro/route.ts       # MICRO setups
│       ├── market/route.ts      # Market data (278 ativos via Yahoo Finance)
│       ├── liquidity-map/route.ts  # Liquidity analysis
│       ├── currency-strength/route.ts  # FX analysis
│       ├── risk/route.ts        # Risk report (real data from serverStore)
│       ├── fred/route.ts        # Economic data (FRED API)
│       ├── calendar/route.ts    # Economic events
│       ├── news/route.ts        # News feeds (GDELT)
│       ├── cot/route.ts         # COT data (CFTC)
│       ├── mtf/route.ts         # Multi-timeframe
│       ├── smc/route.ts         # Smart Money Concepts
│       ├── technical/route.ts   # Technical indicators
│       ├── health/route.ts      # 🆕 Health check endpoint
│       ├── signals/route.ts     # 🆕 Signal CRUD (track/update/close/bulk_update_prices)
│       ├── monitor/route.ts     # 🆕 Server-side signal monitor + Telegram alerts
│       └── telegram/route.ts    # Telegram send API
│
├── lib/
│   ├── decisionEngine.ts        # Decision Engine Core (Scoring + Tiers)
│   ├── regimeEngine.ts          # Regime classification + Gates
│   ├── riskManager.ts           # Kelly + position sizing
│   ├── portfolioManager.ts      # Portfolio state + limits
│   ├── signalTracker.ts         # Signal tracking (client-side/localStorage)
│   ├── signalHistory.ts         # Audit trail (client-side/localStorage)
│   ├── signalBridge.ts          # 🆕 Client→Server signal bridge (non-blocking)
│   ├── serverStore.ts           # 🆕 Server-side persistent store (JSON files in .data/)
│   ├── telegramAlert.ts         # 🆕 Telegram alert formatting + sending
│   ├── continuousLearning.ts    # Weight optimization from outcomes
│   ├── executionEngine.ts       # Order execution (Binance integration stub)
│   └── serverLogs.ts            # Logging system
│
├── middleware.ts                 # 🆕 Basic HTTP auth (optional via env vars)
│
└── components/
    └── views/
        ├── CommandView.tsx      # Main scanner + execution (server-synced)
        ├── TierScanner.tsx      # Tier-based scanner UI
        ├── CurrencyStrengthView.tsx  # FX dashboard
        ├── LiquidityMapView.tsx     # Liquidity dashboard
        └── MacroView.tsx            # Macro dashboard

.data/                           # 🆕 Persistent JSON store (gitignored)
├── signals.json                 # Active + historical signals
├── outcomes.json                # Trade outcomes for risk calculations
├── learning.json                # Continuous learning weights
└── audit.json                   # Full audit trail
```

---

## 🆕 CAMADA 11: PERSISTÊNCIA & MONITORAMENTO

### Server Store (`src/lib/serverStore.ts`)
- Armazena sinais, outcomes, learning weights e audit trail em arquivos JSON
- Substituiu `Math.random()` no `/api/risk` por dados reais de outcomes
- Kelly, drawdown, position sizing agora baseados em performance real

### Signal Bridge (`src/lib/signalBridge.ts`)
- Client-side helper que espelha cada `trackSignal()` para o servidor
- Non-blocking (fire-and-forget) para não atrasar a UI
- Também envia price updates e triggers do monitor

### Monitor API (`/api/monitor`)
- Roda a cada 60s (triggered pelo CommandView)
- Busca preços atuais de todos os ativos com sinais ativos
- Checa SL/TP/expiry automaticamente
- Registra outcomes no serverStore
- Envia alertas Telegram para closures
- Com `?scan=1`: escaneia por novas oportunidades Tier A/B

### Telegram Alerts (`src/lib/telegramAlert.ts`)
- Formata sinais novos e closures em Markdown para Telegram
- Ativado via `TELEGRAM_BOT_TOKEN` e `TELEGRAM_CHAT_ID` no `.env.local`
- Alertas automáticos para: Tier A/B novos + todos os closures

### Autenticação (`src/middleware.ts`)
- HTTP Basic Auth opcional
- Ativado via `GMPM_AUTH_USER` e `GMPM_AUTH_PASS` no `.env.local`
- Health endpoint exempto (para monitoring externo)

---

## 🔑 PRINCÍPIOS-CHAVE DO SISTEMA

1. **Fail-Closed**: Na dúvida, bloqueia execução
2. **Hierarquia**: MACRO > MESO > MICRO
3. **Liquidez é Rei**: L↓↓ domina tudo
4. **Audit Trail**: Todo sinal é registrado (server-side persistente)
5. **Position Sizing**: Kelly + volatility-adjusted (dados reais)
6. **Multi-Timeframe**: Confirmar em 3+ timeframes
7. **Smart Money**: Seguir a liquidez institucional
8. **Dual Persistence**: localStorage (UI rápida) + serverStore (durável)
9. **Non-blocking Bridge**: Client→Server sync não bloqueia a UI

---

*Documento gerado automaticamente - GMPM v2.1.0*
*Última atualização: 2026-02-10*
*Persistência server-side + Monitor + Telegram integrados*
