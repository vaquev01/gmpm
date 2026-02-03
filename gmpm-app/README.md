# GMPM - Global Macro Portfolio Manager

Professional-grade trading scanner with institutional framework alignment.

## Features

### Regime Engine (6 Axes)
- **G** - Growth (GDP, employment, consumer sentiment)
- **I** - Inflation (CPI, yield curve)
- **L** - Liquidity (VIX, Fed balance sheet proxy)
- **C** - Credit (HY spreads, credit conditions)
- **D** - Dollar (DXY strength)
- **V** - Volatility (VIX levels and changes)

### Trade Gates
- **MACRO** - Regime alignment check
- **MESO** - Sector/asset class tilts
- **MICRO** - Individual asset quality
- **RISK** - Position sizing and exposure
- **EXEC** - Execution timing (session quality)

### Data Sources (Real)
- Yahoo Finance (equities, forex, crypto, commodities)
- FRED API (Treasury yields, Fed Funds, economic indicators)
- CNN Fear/Greed Index
- News feeds (geopolitics, tech, headlines)

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3001](http://localhost:3001)

## Scripts

```bash
npm run dev        # Development server
npm run build      # Production build
npm run lint       # ESLint check
npm run smoke      # API smoke tests
npm run test:e2e   # Playwright E2E tests (10 tests)
```

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `/api/market` | Real-time market data with quality scoring |
| `/api/regime` | Regime snapshot (6 axes + gates) |
| `/api/fred` | FRED economic data |
| `/api/news` | News feeds (geo, tech, headlines) |
| `/api/calendar` | Economic calendar |
| `/api/server-logs` | Server-side logging |

## Pages

| Route | Description |
|-------|-------------|
| `/` | Main scanner (CommandView) |
| `/verify` | System health checks (7 APIs) |
| `/logs` | Server logs viewer |

## Architecture

```
src/
├── app/
│   ├── api/           # API routes
│   ├── logs/          # Logs page
│   └── verify/        # Health check page
├── components/
│   ├── views/         # Main views (CommandView, MacroView)
│   └── ui/            # Shadcn components
├── lib/
│   ├── regimeEngine.ts    # Regime classification + gates
│   ├── signalTracker.ts   # Signal tracking with attribution
│   └── continuousLearning.ts # Learning system
└── tests/             # Playwright E2E tests
```

## Tech Stack

- Next.js 15
- React 19
- Tailwind CSS
- Shadcn/ui
- Zustand (state)
- Playwright (E2E tests)
