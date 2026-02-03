# Framework Temporal: Macro → Meso → Micro → Execução

## Estrutura Revisada

| Camada | Horizonte | Pergunta Central | Frequência de Atualização |
|--------|-----------|------------------|---------------------------|
| **MACRO** | Semanas a Meses | Qual é o regime? Quais forças dominam? | Semanal + quando dados-chave saem |
| **MESO** | Dias a 2 Semanas | Dado o regime, quais instrumentos/temas favorecer? | Diária (início do dia) |
| **MICRO** | Intraday a 48h | Qual setup específico? Entry, target, invalidação? | Contínua durante sessão |
| **EXECUÇÃO** | Transversal | Como implementar sem destruir edge? Sizing, stops, limites? | A cada trade + revisão semanal |

---

## Fluxo de Dados

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              MACRO LAYER                                     │
│  Horizonte: Semanas/Meses | Atualização: Semanal                            │
├─────────────────────────────────────────────────────────────────────────────┤
│  INPUTS:                                                                     │
│  - PMI, GDP, Employment (Growth)                                            │
│  - CPI, PCE, Inflation Expectations (Inflation)                             │
│  - Fed Balance Sheet, Real Rates, M2 (Liquidity)                            │
│  - HY Spreads, Credit Conditions (Credit)                                   │
│  - DXY, Real Yields (Dollar)                                                │
│  - VIX, MOVE (Volatility)                                                   │
│                                                                              │
│  OUTPUTS (para MESO):                                                        │
│  - regime: GOLDILOCKS | REFLATION | STAGFLATION | DEFLATION | etc          │
│  - axes: { G: ↑/↓, I: ↑/↓, L: ↑/↓, C: ↑/↓, D: ↑/↓, V: ↑/↓ }               │
│  - regimeConfidence: HIGH | PARTIAL | LOW                                   │
│  - dominantDrivers: string[]                                                │
│  - mesoTilts: MesoTilt[] (derivados do regime)                              │
│  - mesoProhibitions: string[]                                               │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              MESO LAYER                                      │
│  Horizonte: Dias/2 Semanas | Atualização: Diária                            │
├─────────────────────────────────────────────────────────────────────────────┤
│  INPUTS (do MACRO):                                                          │
│  - regime, axes, tilts, prohibitions                                        │
│                                                                              │
│  PROCESSAMENTO:                                                              │
│  - Derivar expectativas por classe (stocks, crypto, forex, commodities)     │
│  - Aplicar limiares de seleção                                              │
│  - Gerar lista de "permitidos" e "proibidos"                                │
│                                                                              │
│  OUTPUTS (para MICRO):                                                       │
│  - weeklyThesis: string (tese da semana)                                    │
│  - dailyFocus: string[] (focos do dia)                                      │
│  - allowedInstruments: string[] (lista para monitorar)                      │
│  - prohibitedInstruments: string[] (não operar)                             │
│  - classExpectations: { class, expectation, direction, confidence }[]       │
│  - catalysts: { event, timing, impact }[]                                   │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              MICRO LAYER                                     │
│  Horizonte: Intraday/48h | Atualização: Contínua                            │
├─────────────────────────────────────────────────────────────────────────────┤
│  INPUTS (do MESO):                                                           │
│  - allowedInstruments (quais monitorar)                                     │
│  - classExpectations (direção esperada)                                     │
│  - catalysts (notícias/eventos próximos)                                    │
│                                                                              │
│  PROCESSAMENTO:                                                              │
│  - Análise técnica (EMA, RSI, níveis)                                       │
│  - Detecção de setups (breakout, pullback, reversal)                        │
│  - Validação multi-timeframe                                                │
│  - Cálculo de R:R                                                           │
│                                                                              │
│  OUTPUTS (para EXECUÇÃO):                                                    │
│  - signals: { symbol, direction, setup, entry, stop, target, R:R }[]       │
│  - urgentCatalysts: string[] (notícias que afetam próximas 24h)            │
│  - killzones: { session, quality, nextOpen }                                │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           EXECUÇÃO LAYER                                     │
│  Horizonte: Transversal | Atualização: A cada trade                         │
├─────────────────────────────────────────────────────────────────────────────┤
│  INPUTS (de todas as camadas):                                               │
│  - signal do MICRO                                                          │
│  - regime do MACRO                                                          │
│  - allowedInstruments do MESO                                               │
│                                                                              │
│  GATES BINÁRIOS:                                                             │
│  □ Macro permite? (regime não contradiz)                                    │
│  □ Meso favorece? (instrumento na lista permitida)                          │
│  □ Setup válido? (R:R ≥ 2, quality OK)                                      │
│  □ Risco comporta? (não excede limite diário)                               │
│  → Se qualquer = NÃO → NÃO ENTRA                                            │
│                                                                              │
│  OUTPUTS:                                                                    │
│  - gateResult: { allPass, blockingReasons, warnings }                       │
│  - sizing: calculado baseado em risco                                       │
│  - executionPlan: { entry, stop, targets, timing }                          │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    LIVE SCAN (CommandView/Workspace)                         │
│  Foco: Próximas 24 horas | Atualização: Real-time                           │
├─────────────────────────────────────────────────────────────────────────────┤
│  CONSOLIDAÇÃO DE TODAS AS CAMADAS:                                           │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ REGIME ATUAL: RISK_ON (L↑ G→ I→)         Confidence: PARTIAL       │    │
│  │ TESE DA SEMANA: "Liquidez suportando risco..."                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ FOCO 24H:                                                           │    │
│  │ • Instrumentos: XAUUSD, EURUSD, BTCUSD                              │    │
│  │ • Direção favorecida: LONG risk-on                                  │    │
│  │ • Catalisador: FOMC Minutes amanhã 15h                              │    │
│  │ • Killzone: London/NY overlap (13-16 UTC)                           │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ SINAIS ATIVOS (passaram todos os gates):                            │    │
│  │ XAUUSD LONG | Entry: 2045 | Stop: 2038 | TP: 2065 | R:R 2.8        │    │
│  │ Gates: ✓ Macro ✓ Meso ✓ Micro ✓ Risk                               │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ BLOQUEADOS (não passaram gates):                                    │    │
│  │ USDJPY SHORT → ✗ Meso: USD strength favorecido pelo regime         │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Limiares Operacionais

### MACRO - Limiares de Regime

| Eixo | Indicador | Threshold ↑ | Threshold ↓ | Persistência |
|------|-----------|-------------|-------------|--------------|
| G (Growth) | PMI Composite | > 52 e subindo | < 48 ou caindo 2 meses | 2 leituras |
| I (Inflation) | Core CPI YoY | > target + 1pp | < target | 2 leituras |
| L (Liquidity) | Fed BS + Real Rates | BS↑ OU real rates↓ | BS↓ E real rates↑ | 1 mês |
| C (Credit) | HY Spread (OAS) | < 350bps | > 500bps | 2 semanas |
| D (Dollar) | DXY z-score 3m | z < -1 | z > +1 | 2 semanas |
| V (Volatility) | VIX + MOVE | VIX<15 E MOVE<100 | VIX>25 OU MOVE>140 | Instantâneo↑, 2sem↓ |

**Regra:** Regime muda quando 3+ eixos confirmam nova direção.

### MESO - Limiares de Seleção

| Critério | Incluir | Excluir |
|----------|---------|---------|
| Alinhamento Macro | Beneficia de 2+ eixos | Prejudicado por 2+ eixos |
| Catalisador | Evento em < 5 dias úteis | Nenhum em 2+ semanas |
| Tendência | Preço > EMA21 > EMA50 | EMA21 flat |
| ATR(14) | 0.5% - 3% do preço | < 0.3% ou > 3% |

### MICRO - Limiares de Setup

| Critério | Mínimo |
|----------|--------|
| R:R | ≥ 1:2 (TP1), ≥ 1:3 (final) |
| Stop | ≤ 1.5 × ATR do TF entrada |
| Volume | > média 20 períodos |
| Multi-TF | Setup no TF entrada + tendência TF superior |
| Sessão | Dentro de Killzone (London/NY) |
| Spread | ≤ 20% do stop em pips |

### EXECUÇÃO - Limiares de Risco

| Parâmetro | Limite |
|-----------|--------|
| Risco por trade | 1-2% |
| Risco diário máximo | 3-5% |
| Drawdown pausa | -10% → 48h off |
| Drawdown revisão | -15% → revisão sistema |
| Correlação máx | < 0.7 |
| Posições simultâneas | 3 máx |

---

## Correções Conceituais Implementadas

1. **Notícias urgentes** → Saem do MACRO, vão para MICRO como catalisadores
2. **Meso deriva do Macro** → Não está "dentro", traduz o regime para instrumentos
3. **Micro ≠ Execução** → Micro = decisão de trade, Execução = implementação
4. **Live Scan = Foco 24h** → Resultado do empilhamento de todas as camadas
