# 🚀 QUICK START PARA IDE
## Portfolio Manager v8.1 - Instruções Diretas

---

## O QUE VOCÊ PRECISA FAZER

### 1️⃣ CRIAR ESTRUTURA (5 min)
```bash
mkdir -p portfolio_manager/{config,data/fetchers,features/{macro,technical,fractal},analysis,scoring,portfolio,execution,output,utils,tests}
cd portfolio_manager
python -m venv venv && source venv/bin/activate
```

### 2️⃣ INSTALAR DEPENDÊNCIAS (2 min)
```bash
pip install numpy pandas scipy yfinance ccxt fredapi MetaTrader5 ta pandas-ta scikit-learn fastapi uvicorn loguru pydantic python-dotenv
```

### 3️⃣ CONFIGURAR APIS (10 min)
Criar arquivo `.env`:
```env
FRED_API_KEY=obter_em_fred.stlouisfed.org
ALPHA_VANTAGE_KEY=obter_em_alphavantage.co
BINANCE_API_KEY=obter_em_binance.com
BINANCE_SECRET=seu_secret
```

### 4️⃣ IMPLEMENTAR MÓDULOS
Seguir o guia completo `IMPLEMENTATION_GUIDE_v1.md` na ordem:
1. `config/` - Configurações e lista de ativos
2. `data/fetchers/` - Conexão com fontes de dados
3. `features/` - Cálculo das 120 features
4. `scoring/` - Sistema de pontuação 0-100
5. `analysis/` - Regime e cenário
6. `output/` - Geração do output final

### 5️⃣ TESTAR
```bash
python main.py
```

---

## FONTES DE DADOS REAIS

| O Que | Fonte | Como Obter |
|-------|-------|------------|
| **Forex** | MetaTrader 5 | Abrir conta em qualquer corretora MT5 |
| **Stocks/ETFs** | Yahoo Finance | Gratuito, sem API key |
| **Crypto** | Binance | Criar conta, gerar API key |
| **Macro** | FRED | Criar conta gratuita, gerar API key |
| **COT Data** | CFTC | Download semanal gratuito |

---

## O QUE O SISTEMA GERA

### INPUT
- Dados de preço (OHLCV) de 278 ativos
- Dados macroeconômicos (inflação, GDP, taxas)

### PROCESSAMENTO
1. Calcula 120 features para cada ativo
2. Gera score 0-100 por ativo
3. Filtra por threshold (>55)
4. Verifica fit com portfolio
5. Calcula níveis (entry, SL, TP)

### OUTPUT
```
EURUSD: BUY 1.0850→1.0920/1.0980 | SL 1.0805 | 0.65L | S:82 | 24h
AUDUSD: BUY 0.6580→0.6650/0.6700 | SL 0.6545 | 0.50L | S:78 | 24h
```

Significado:
- `BUY 1.0850` = Comprar em 1.0850
- `→1.0920/1.0980` = TPs em 1.0920 e 1.0980
- `SL 1.0805` = Stop Loss
- `0.65L` = 0.65 lotes
- `S:82` = Score 82/100
- `24h` = Válido por 24 horas

---

## ARQUIVOS CRÍTICOS

| Arquivo | Função |
|---------|--------|
| `config/assets.py` | Lista dos 278 ativos |
| `features/calculator.py` | Calcula 120 features |
| `scoring/calculator.py` | Gera score 0-100 |
| `analysis/decision.py` | Toma decisões |
| `output/generator.py` | Gera output final |
| `main.py` | Entry point |

---

## DÚVIDAS FREQUENTES

**Q: De onde vêm os dados?**
A: Yahoo Finance (ações), MT5 (forex), Binance (crypto), FRED (macro)

**Q: Os dados são reais?**
A: SIM. Todas as fontes são APIs reais e gratuitas.

**Q: Preciso de conta em corretora?**
A: Para Forex sim (MT5). Para o resto, não.

**Q: Posso rodar sem MT5?**
A: Sim, só não terá dados de Forex. Pode usar Alpha Vantage como alternativa.

**Q: Como sei se está funcionando?**
A: O output mostra oportunidades rankeadas. Se aparecer, está funcionando.

---

## VALIDAÇÃO

O sistema está funcionando se você ver:
1. ✅ Dados sendo baixados (logs)
2. ✅ Features calculadas (120 por ativo)
3. ✅ Scores gerados (0-100)
4. ✅ Output com oportunidades
5. ✅ One-liners prontos para executar

---

## PRÓXIMOS PASSOS

1. Implementar seguindo o guia completo
2. Testar com dados históricos
3. Rodar em paper trading por 4 semanas
4. Se performance OK, ir para live com capital mínimo
5. Escalar gradualmente

**Tempo estimado para implementação completa: 2-4 semanas**
