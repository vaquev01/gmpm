# DEV_CONTEXT

## Status
- Refatoração em andamento: migração de `gmpm-app` (Next.js monolito) para monorepo com `Frontend/Backend/Database/Scripts`.
- **Backend: 6/22 API routes migradas** (core data pipeline completo).
- Frontend: pendente migração para React+Vite.

## Runtime (dev)
| Serviço | URL | Porta |
|---------|-----|-------|
| DB (Postgres/Docker) | localhost | 5433 |
| **Backend (Express)** | **http://localhost:3001** | 3001 |
| Frontend (Vite) | http://localhost:5175 | 5175 |
| Legado (Next.js) | http://localhost:3000 | 3000 |

## Migração de API Routes

### ✅ Migrado no Backend (6 rotas)
| Rota | Serviço | Cache TTL | Fonte externa |
|------|---------|-----------|---------------|
| `/api/health` | inline | — | — |
| `/api/test` | selfTest.service | — | — (self-test puro) |
| `/api/server-logs` | serverLogs.service | — | Postgres + merge legado |
| `/api/fred` | fred.service | 1h (stale 6h) | FRED API (36 séries) |
| `/api/macro` | macro.service | 60s (stale 5min) | Yahoo Finance + FRED + Fear&Greed |
| `/api/market` | market.service | 60s (stale 5min) | Yahoo Finance (278 ativos) + FRED |
| `/api/regime` | regime.service | 15s | Self-call /macro + /market → regimeEngine |

### ⏳ Pendente (16 rotas — fallback via proxy para legado :3000)
`calendar`, `cot`, `currency-strength`, `decision-engine`, `history`, `lab`, `liquidity-map`, `meso`, `micro`, `mtf`, `news`, `orderflow`, `risk`, `smc`, `technical`, `telegram`

### Fallback
Todas as rotas não migradas são encaminhadas automaticamente via proxy HTTP para `http://localhost:3000` (Next.js legado) com timeout de 15s.

## Arquitetura Backend

```
Backend/src/
├── server.ts           # Entry point (dotenv + listen)
├── app.ts              # Express app factory (cors, json, router)
├── routes/
│   ├── index.ts        # Monta todas as rotas + proxy fallback
│   ├── fred.routes.ts
│   ├── macro.routes.ts
│   ├── market.routes.ts
│   ├── regime.routes.ts
│   ├── serverLogs.routes.ts
│   ├── test.routes.ts
│   └── proxy.routes.ts # Fallback para legado
├── controllers/        # Request → Service → Response
├── services/           # Business logic + caching
├── repositories/       # Prisma ORM data access
├── lib/
│   ├── regimeEngine.ts # 1254 linhas de cálculo de regime (6 eixos, gates)
│   ├── yahooClient.ts  # Concurrency queue + cache + fallback
│   └── shared.ts       # Utilidades compartilhadas
└── db/
    └── prisma.ts       # Prisma client singleton
```

**Padrão**: Controller → Service → Repository (quando aplicável).

**Caching**: Todas as rotas de dados usam cache in-memory com TTL + stale window + in-flight dedup + fallback para último snapshot válido.

## Libs do Sistema (gmpm-app/src/lib/)

| Módulo | Linhas | Função |
|--------|--------|--------|
| regimeEngine.ts | 1254 | Regime macro (6 eixos G/I/L/C/D/V), gates de execução |
| realEngine.ts | ~1200 | Motor de scoring real-time multi-componente |
| decisionEngine.ts | ~800 | Decision engine para sinais (score → signal) |
| riskManager.ts | ~750 | Gestão de risco (Kelly, drawdown, correlação) |
| smcEngine.ts | ~500 | Smart Money Concepts (OB, FVG, BOS) |
| continuousLearning.ts | ~450 | Aprendizado contínuo de performance |
| executionEngine.ts | ~350 | Motor de execução de trades |
| portfolioCorrelation.ts | ~300 | Correlação entre ativos do portfolio |
| portfolioManager.ts | ~300 | Gestão de portfolio (position sizing) |
| signalTracker.ts | ~400 | Tracking de sinais ativos/fechados |
| backtestEngine.ts | ~450 | Backtesting de estratégias |
| monteCarloEngine.ts | ~300 | Simulação Monte Carlo |
| engineEnhancements.ts | ~450 | Melhorias no motor principal |
| macroEngine.ts | ~300 | Motor macro simplificado |
| signalHistory.ts | ~250 | Histórico persistido de sinais |
| institutionalEngine.ts | ~300 | Posicionamento institucional |
| paperTradingEngine.ts | ~180 | Modo paper trading |
| strategyAdapter.ts | ~180 | Adapter de estratégias |
| stressTestEngine.ts | ~120 | Testes de stress |
| yahooClient.ts | 106 | Client Yahoo com concurrency queue |
| serverLogs.ts | ~60 | Logger server-side |
| sentimentEngine.ts | ~55 | Análise de sentimento |
| liquidityEngine.ts | ~50 | Motor de liquidez |
| engine.ts | ~120 | Motor base |
| utils.ts | ~30 | Utilidades gerais |

## Views do Frontend (gmpm-app/src/components/views/)

| View | Tamanho | Função |
|------|---------|--------|
| CommandView.tsx | 257KB | Scanner principal + oportunidades + execução |
| CurrencyStrengthView.tsx | 65KB | Força relativa de moedas |
| LiquidityHeatmap.tsx | 51KB | Mapa de liquidez |
| MacroView.tsx | 49KB | Dashboard macro (FRED + regime) |
| MesoView.tsx | 48KB | Análise meso (setorial/classe) |
| SignalOutputView.tsx | 48KB | Output de sinais gerados |
| LabView.tsx | 42KB | Laboratório de estratégias |
| MicroView.tsx | 37KB | Análise micro (ativo individual) |
| TierScanner.tsx | 35KB | Scanner por tiers de confiança |
| IncubatorView.tsx | 29KB | Incubadora de portfolio |
| RiskDashboardView.tsx | 22KB | Dashboard de risco |
| BacktestView.tsx | 19KB | Backtesting |
| FractalSMCView.tsx | 16KB | Fractais + Smart Money |
| ScoringView.tsx | 14KB | Visualização do scoring |
| LearningInsightsView.tsx | 13KB | Insights de aprendizado |
| PaperTradingView.tsx | 13KB | Paper trading |
| ExecutiveDashboardView.tsx | 13KB | Dashboard executivo |
| MultiTimeframeView.tsx | 6KB | Multi-timeframe |
| FactoryView.tsx | 3KB | Factory de componentes |
| FeatureSetView.tsx | 2KB | Feature set config |
| AssetUniverseView.tsx | 2KB | Universo de ativos |

## DB (PostgreSQL + Prisma)

### Tabelas (resumo)
- Portfolio (simulação Incubator)
- TrackedAsset (ativos dentro do Portfolio)
- Signal (sinais executados/track)
- ServerLog (logs do backend)

## Objetivo
- Manter paridade funcional com o Terminal atual (telas e endpoints `/api/*`).
- Introduzir PostgreSQL (Docker) + Prisma como fonte da verdade do schema.
- Padronizar backend Node.js com arquitetura Controller → Service → Repository.
- Padronizar frontend React + TypeScript com Zustand (global) e TanStack Query (server state).

## Próximos Passos
1. Migrar as 16 API routes restantes para o Backend Express.
2. Migrar frontend de Next.js para React+Vite com Zustand + TanStack Query.
3. Desligar proxy fallback após 100% de paridade.
4. Adicionar testes automatizados (Vitest).

(atualizado em 2026-02-05)
