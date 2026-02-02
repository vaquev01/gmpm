OFF': 2.0,
            'TRANSITION': 2.5,
            'STRESS': 3.0,
            'UNCERTAIN': 2.5
        }.get(regime, 2.0)
        
        atr_stop = atr * mult
        
        # Ajustar por estrutura (SMC)
        if features.fractal:
            if direction == "LONG":
                ob_level = features.fractal.get('order_block_bull', 0)
                if ob_level < 0:  # OB abaixo do preço
                    structure_stop = price + (ob_level * atr) - (atr * 0.2)
                else:
                    structure_stop = price - atr_stop
            else:
                ob_level = features.fractal.get('order_block_bear', 0)
                if ob_level > 0:  # OB acima do preço
                    structure_stop = price + (ob_level * atr) + (atr * 0.2)
                else:
                    structure_stop = price + atr_stop
        else:
            structure_stop = price - atr_stop if direction == "LONG" else price + atr_stop
        
        # Usar o mais conservador
        if direction == "LONG":
            return min(price - atr_stop, structure_stop)
        else:
            return max(price + atr_stop, structure_stop)
    
    def _calculate_take_profits(self, direction: str, price: float,
                               stop_loss: float, scenario: str) -> List[Dict]:
        """Calcula take profits"""
        
        sl_distance = abs(price - stop_loss)
        
        # Multiplicador por cenário
        ext = {
            'DISINFLATION': 1.2,
            'REACCELERATION': 1.3,
            'RISK_OFF': 0.8,
            'CARRY': 1.1,
            'SHOCK': 0.6
        }.get(scenario, 1.0)
        
        if direction == "LONG":
            return [
                {'price': price + sl_distance * 1.5 * ext, 'size_pct': 0.40, 'prob': 0.70},
                {'price': price + sl_distance * 2.5 * ext, 'size_pct': 0.35, 'prob': 0.50},
                {'price': price + sl_distance * 4.0 * ext, 'size_pct': 0.15, 'prob': 0.30},
                {'price': 'TRAIL', 'size_pct': 0.10, 'prob': 0.20}
            ]
        else:
            return [
                {'price': price - sl_distance * 1.5 * ext, 'size_pct': 0.40, 'prob': 0.70},
                {'price': price - sl_distance * 2.5 * ext, 'size_pct': 0.35, 'prob': 0.50},
                {'price': price - sl_distance * 4.0 * ext, 'size_pct': 0.15, 'prob': 0.30},
                {'price': 'TRAIL', 'size_pct': 0.10, 'prob': 0.20}
            ]
    
    def _calculate_size(self, score: AssetScore, stop_loss: float,
                       price: float, regime: str) -> Tuple[float, float]:
        """Calcula tamanho da posição"""
        
        # Risk disponível
        available_risk = self.portfolio.available_risk()
        
        # Ajuste por score
        score_mult = score.total / 100
        
        # Ajuste por regime
        regime_mult = {
            'RISK_ON': 1.0,
            'RISK_OFF': 0.7,
            'TRANSITION': 0.5,
            'STRESS': 0.3,
            'UNCERTAIN': 0.5
        }.get(regime, 0.5)
        
        # Risk para este trade
        risk_r = min(0.5, available_risk * 0.3) * score_mult * regime_mult
        
        # Converter para tamanho
        sl_pct = abs(price - stop_loss) / price
        position_value = (self.portfolio.equity * risk_r) / sl_pct
        position_size = position_value / price
        
        return position_size, risk_r
    
    def _generate_rationale(self, symbol: str, score: AssetScore,
                           features: FeatureSet, scenario: str) -> str:
        """Gera explicação do trade"""
        
        direction = "comprar" if score.direction > 0 else "vender"
        
        # Top 3 componentes
        sorted_comps = sorted(score.components.items(), key=lambda x: x[1], reverse=True)
        top_3 = sorted_comps[:3]
        
        rationale = f"{direction.upper()} {symbol} porque: "
        
        for comp, value in top_3:
            if comp == 'macro' and value > 60:
                rationale += f"Cenário {scenario} favorável. "
            elif comp == 'trend' and value > 60:
                rationale += "Tendência forte alinhada. "
            elif comp == 'momentum' and value > 60:
                rationale += "Momentum positivo. "
            elif comp == 'flow' and value > 60:
                rationale += "Fluxo institucional favorável. "
            elif comp == 'fractal' and value > 60:
                rationale += "Estrutura SMC confirma. "
        
        return rationale.strip()
    
    def _identify_key_drivers(self, score: AssetScore) -> List[str]:
        """Identifica principais drivers do trade"""
        drivers = []
        
        for comp, value in score.components.items():
            if value > 70:
                drivers.append(f"{comp}: {value:.0f}/100")
        
        return drivers[:5]
    
    def _identify_risks(self, features: FeatureSet, regime: str) -> List[str]:
        """Identifica riscos do trade"""
        risks = []
        
        if regime == 'TRANSITION':
            risks.append("Regime em transição - pode mudar rapidamente")
        
        if features.volatility and features.volatility.get('atr_percentile', 50) > 80:
            risks.append("Volatilidade elevada")
        
        if features.fractal and features.fractal.get('hurst_exponent', 0.5) < 0.45:
            risks.append("Mercado mean-reverting - momentum pode falhar")
        
        return risks
    
    def _defense_mode(self) -> List[TradeDecision]:
        """Modo de defesa - fechar posições de risco"""
        # Implementar lógica de defesa
        return []
```

---

# 8. FASE 6: OUTPUT GENERATOR

```python
# output/generator.py

from typing import List, Dict
from dataclasses import dataclass, asdict
from datetime import datetime
import json

from analysis.decision import TradeDecision
from portfolio.manager import PortfolioManager
from analysis.regime import RegimeDetector
from analysis.scenario import ScenarioEngine

@dataclass
class SystemOutput:
    """Output completo do sistema"""
    
    # Metadata
    timestamp: str
    valid_until: str
    system_state: str
    
    # Context
    regime: str
    regime_confidence: float
    scenario: str
    scenario_probability: float
    scenario_sequence: List[str]
    next_scenario_prediction: str
    
    # Thesis
    thesis: str
    confidence: float
    invalidation_conditions: List[str]
    
    # Opportunities
    opportunities: List[Dict]
    
    # Portfolio
    portfolio_health: int
    positions_count: int
    total_risk: float
    available_risk: float
    exposure: Dict[str, float]
    
    # Alerts
    alerts: List[Dict]
    
    # Summary
    executive_summary: str
    quick_actions: List[str]
    one_liners: List[str]


class OutputGenerator:
    """Gera output final do sistema"""
    
    def __init__(self,
                 portfolio: PortfolioManager,
                 regime: RegimeDetector,
                 scenario: ScenarioEngine):
        self.portfolio = portfolio
        self.regime = regime
        self.scenario = scenario
    
    def generate(self, decisions: List[TradeDecision]) -> SystemOutput:
        """Gera output completo"""
        
        now = datetime.now()
        
        # Context
        current_regime = self.regime.detect()
        regime_conf = self.regime.confidence()
        current_scenario = self.scenario.determine()
        scenario_prob = self.scenario.probability()
        sequence = self.scenario.get_sequence()
        next_pred = self.scenario.predict_next()
        
        # Thesis
        thesis = self._generate_thesis(current_regime, current_scenario)
        invalidations = self._get_invalidations(current_scenario)
        
        # Opportunities
        opportunities = [self._format_opportunity(d) for d in decisions]
        
        # Portfolio
        portfolio_health = self.portfolio.health_score()
        exposure = self.portfolio.exposure_breakdown()
        
        # Alerts
        alerts = self._generate_alerts(current_regime, current_scenario)
        
        # Summary
        summary = self._generate_summary(decisions, current_regime, current_scenario)
        quick_actions = self._generate_quick_actions(decisions)
        one_liners = self._generate_one_liners(decisions)
        
        return SystemOutput(
            timestamp=now.isoformat(),
            valid_until=(now + timedelta(hours=12)).isoformat(),
            system_state="RUNNING",
            
            regime=current_regime,
            regime_confidence=regime_conf,
            scenario=current_scenario,
            scenario_probability=scenario_prob,
            scenario_sequence=sequence,
            next_scenario_prediction=next_pred,
            
            thesis=thesis,
            confidence=regime_conf * scenario_prob,
            invalidation_conditions=invalidations,
            
            opportunities=opportunities,
            
            portfolio_health=portfolio_health,
            positions_count=len(self.portfolio.positions),
            total_risk=self.portfolio.total_risk(),
            available_risk=self.portfolio.available_risk(),
            exposure=exposure,
            
            alerts=alerts,
            
            executive_summary=summary,
            quick_actions=quick_actions,
            one_liners=one_liners
        )
    
    def _format_opportunity(self, decision: TradeDecision) -> Dict:
        """Formata oportunidade para output"""
        return {
            'symbol': decision.symbol,
            'direction': decision.direction,
            'score': decision.score,
            'entry_zone': list(decision.entry_zone),
            'stop_loss': decision.stop_loss,
            'take_profits': decision.take_profits,
            'position_size': decision.position_size,
            'risk_r': decision.risk_r,
            'rationale': decision.rationale,
            'key_drivers': decision.key_drivers,
            'risks': decision.risks,
            'validity_hours': decision.validity_hours
        }
    
    def _generate_thesis(self, regime: str, scenario: str) -> str:
        """Gera thesis do mercado"""
        
        theses = {
            ('RISK_ON', 'DISINFLATION'): 
                "Ambiente Goldilocks: inflação cedendo com crescimento resiliente. "
                "Risk assets favored. USD deve enfraquecer.",
            
            ('RISK_OFF', 'FLIGHT_TO_QUALITY'):
                "Flight to quality em curso. Reduzir exposição a risco. "
                "Favorecer JPY, CHF, Gold, Treasuries.",
            
            ('STRESS', 'CRISIS'):
                "Modo de crise. Preservar capital é prioridade. "
                "Apenas posições defensivas."
        }
        
        return theses.get((regime, scenario), 
            f"Regime {regime} com cenário {scenario}. Cautela recomendada.")
    
    def _get_invalidations(self, scenario: str) -> List[str]:
        """Retorna condições de invalidação"""
        
        invalidations = {
            'DISINFLATION': [
                "CPI > 3.2%",
                "NFP < 50k",
                "VIX > 25"
            ],
            'RISK_ON': [
                "VIX > 20 por 3 dias",
                "Credit spreads +50bps",
                "SPX -5% intraday"
            ]
        }
        
        return invalidations.get(scenario, ["Mudança de regime"])
    
    def _generate_alerts(self, regime: str, scenario: str) -> List[Dict]:
        """Gera alertas relevantes"""
        alerts = []
        
        # Alertas de regime
        if regime == 'TRANSITION':
            alerts.append({
                'severity': 'MEDIUM',
                'message': 'Regime em transição - monitorar closely',
                'action': 'Reduzir tamanho de novas posições'
            })
        
        # Alertas de calendário (simplificado)
        # Na prática, integrar com calendário econômico
        alerts.append({
            'severity': 'INFO',
            'message': 'Verificar calendário econômico',
            'action': 'Review positions before major events'
        })
        
        return alerts
    
    def _generate_summary(self, decisions: List[TradeDecision],
                         regime: str, scenario: str) -> str:
        """Gera resumo executivo"""
        
        n_opportunities = len(decisions)
        
        if n_opportunities == 0:
            return f"Sem oportunidades no momento. Regime: {regime}, Cenário: {scenario}."
        
        directions = [d.direction for d in decisions]
        long_count = directions.count("LONG")
        short_count = directions.count("SHORT")
        
        avg_score = sum(d.score for d in decisions) / n_opportunities
        
        summary = f"{n_opportunities} oportunidades identificadas "
        summary += f"({long_count} longs, {short_count} shorts). "
        summary += f"Score médio: {avg_score:.0f}. "
        summary += f"Regime: {regime}. Cenário: {scenario}."
        
        return summary
    
    def _generate_quick_actions(self, decisions: List[TradeDecision]) -> List[str]:
        """Gera lista de ações rápidas"""
        actions = []
        
        for i, d in enumerate(decisions, 1):
            entry = (d.entry_zone[0] + d.entry_zone[1]) / 2
            tp1 = d.take_profits[0]['price'] if d.take_profits else "N/A"
            
            action = f"[{i}] {d.direction} {d.symbol} @ {entry:.5f} "
            action += f"SL={d.stop_loss:.5f} TP1={tp1:.5f if isinstance(tp1, float) else tp1}"
            
            actions.append(action)
        
        return actions
    
    def _generate_one_liners(self, decisions: List[TradeDecision]) -> List[str]:
        """Gera one-liners para cada decisão"""
        one_liners = []
        
        for d in decisions:
            entry = (d.entry_zone[0] + d.entry_zone[1]) / 2
            tp1 = d.take_profits[0]['price'] if d.take_profits else 0
            tp2 = d.take_profits[1]['price'] if len(d.take_profits) > 1 else 0
            
            line = f"{d.symbol}: {d.direction[:3]} {entry:.4f}→{tp1:.4f}/{tp2:.4f} "
            line += f"| SL {d.stop_loss:.4f} | {d.position_size:.2f}L "
            line += f"| S:{d.score:.0f} | {d.validity_hours}h"
            
            one_liners.append(line)
        
        return one_liners
    
    def to_json(self, output: SystemOutput) -> str:
        """Converte output para JSON"""
        return json.dumps(asdict(output), indent=2, default=str)
    
    def to_text(self, output: SystemOutput) -> str:
        """Converte output para texto formatado"""
        
        text = []
        text.append("=" * 70)
        text.append("GLOBAL MULTI-ASSET PORTFOLIO MANAGER - OUTPUT")
        text.append("=" * 70)
        text.append(f"Timestamp: {output.timestamp}")
        text.append(f"Valid until: {output.valid_until}")
        text.append(f"System State: {output.system_state}")
        text.append("-" * 70)
        text.append("CONTEXT")
        text.append(f"  Regime: {output.regime} ({output.regime_confidence:.0%})")
        text.append(f"  Scenario: {output.scenario} ({output.scenario_probability:.0%})")
        text.append(f"  Sequence: {' → '.join(output.scenario_sequence[-3:])}")
        text.append("-" * 70)
        text.append("THESIS")
        text.append(f"  {output.thesis}")
        text.append(f"  Confidence: {output.confidence:.0%}")
        text.append(f"  Invalidation: {', '.join(output.invalidation_conditions)}")
        text.append("-" * 70)
        text.append("OPPORTUNITIES")
        for opp in output.opportunities:
            text.append(f"  {opp['symbol']} {opp['direction']} Score:{opp['score']:.0f}")
            text.append(f"    Entry: {opp['entry_zone']}")
            text.append(f"    SL: {opp['stop_loss']:.5f} | Risk: {opp['risk_r']:.2f}R")
            text.append(f"    Rationale: {opp['rationale']}")
        text.append("-" * 70)
        text.append("PORTFOLIO")
        text.append(f"  Health: {output.portfolio_health}/100")
        text.append(f"  Positions: {output.positions_count}")
        text.append(f"  Total Risk: {output.total_risk:.2f}R")
        text.append(f"  Available: {output.available_risk:.2f}R")
        text.append("-" * 70)
        text.append("QUICK ACTIONS")
        for action in output.quick_actions:
            text.append(f"  {action}")
        text.append("-" * 70)
        text.append("ONE-LINERS")
        for line in output.one_liners:
            text.append(f"  {line}")
        text.append("=" * 70)
        
        return "\n".join(text)
```

---

# 9. MAIN.PY - ENTRY POINT

```python
# main.py

import schedule
import time
from datetime import datetime
from loguru import logger

# Config
from config.settings import settings
from config.assets import get_all_assets, ALL_ASSETS

# Data
from data.fetchers.forex import ForexFetcher
from data.fetchers.stocks import StockFetcher
from data.fetchers.crypto import CryptoFetcher
from data.fetchers.macro import MacroFetcher

# Features
from features.calculator import FeatureCalculator

# Scoring
from scoring.calculator import ScoreCalculator

# Analysis
from analysis.regime import RegimeDetector
from analysis.scenario import ScenarioEngine
from analysis.decision import DecisionEngine

# Portfolio
from portfolio.manager import PortfolioManager

# Output
from output.generator import OutputGenerator

# Setup logging
logger.add("logs/system_{time}.log", rotation="1 day")


class PortfolioManagerSystem:
    """Sistema principal"""
    
    def __init__(self):
        logger.info("Initializing Portfolio Manager System v8.1")
        
        # Initialize fetchers
        self.forex_fetcher = ForexFetcher()
        self.stock_fetcher = StockFetcher()
        self.crypto_fetcher = CryptoFetcher()
        self.macro_fetcher = MacroFetcher()
        
        # Initialize components
        self.feature_calc = FeatureCalculator({
            'forex': self.forex_fetcher,
            'stocks': self.stock_fetcher,
            'crypto': self.crypto_fetcher
        })
        
        self.score_calc = ScoreCalculator()
        self.regime = RegimeDetector(self.macro_fetcher)
        self.scenario = ScenarioEngine(self.macro_fetcher)
        self.portfolio = PortfolioManager(settings.INITIAL_CAPITAL)
        
        self.decision_engine = DecisionEngine(
            feature_calculator=self.feature_calc,
            score_calculator=self.score_calc,
            portfolio_manager=self.portfolio,
            regime_detector=self.regime,
            scenario_engine=self.scenario
        )
        
        self.output_gen = OutputGenerator(
            portfolio=self.portfolio,
            regime=self.regime,
            scenario=self.scenario
        )
        
        logger.info("System initialized successfully")
    
    def fetch_all_data(self) -> dict:
        """Busca dados de todos os ativos"""
        logger.info("Fetching market data...")
        
        all_data = {}
        
        # Forex
        for symbol in ALL_ASSETS['forex']:
            try:
                ohlcv = self.forex_fetcher.fetch(symbol, 'D')
                all_data[symbol] = {'ohlcv': ohlcv, 'class': 'forex'}
            except Exception as e:
                logger.warning(f"Failed to fetch {symbol}: {e}")
        
        # Stocks & ETFs
        for symbol in ALL_ASSETS['stocks'] + ALL_ASSETS['etfs']:
            try:
                ohlcv = self.stock_fetcher.fetch(symbol, 'D')
                all_data[symbol] = {'ohlcv': ohlcv, 'class': 'stocks'}
            except Exception as e:
                logger.warning(f"Failed to fetch {symbol}: {e}")
        
        # Crypto
        for symbol in ALL_ASSETS['crypto']:
            try:
                ohlcv = self.crypto_fetcher.fetch(symbol, 'D')
                all_data[symbol] = {'ohlcv': ohlcv, 'class': 'crypto'}
            except Exception as e:
                logger.warning(f"Failed to fetch {symbol}: {e}")
        
        logger.info(f"Fetched data for {len(all_data)} assets")
        return all_data
    
    def fetch_macro_data(self) -> dict:
        """Busca dados macroeconômicos"""
        logger.info("Fetching macro data...")
        return self.macro_fetcher.fetch_all()
    
    def run_cycle(self):
        """Executa um ciclo completo"""
        logger.info("=" * 50)
        logger.info(f"Starting cycle at {datetime.now()}")
        
        try:
            # 1. Fetch data
            market_data = self.fetch_all_data()
            macro_data = self.fetch_macro_data()
            
            # 2. Run decision engine
            decisions = self.decision_engine.run_cycle(market_data, macro_data)
            
            # 3. Generate output
            output = self.output_gen.generate(decisions)
            
            # 4. Print/save output
            print(self.output_gen.to_text(output))
            
            # 5. Save to file
            with open(f"outputs/output_{datetime.now().strftime('%Y%m%d_%H%M')}.json", 'w') as f:
                f.write(self.output_gen.to_json(output))
            
            logger.info(f"Cycle completed. {len(decisions)} opportunities found.")
            
        except Exception as e:
            logger.error(f"Cycle failed: {e}")
            raise
    
    def start(self, interval_minutes: int = 15):
        """Inicia o sistema em loop"""
        logger.info(f"Starting system with {interval_minutes} minute intervals")
        
        # Run immediately
        self.run_cycle()
        
        # Schedule periodic runs
        schedule.every(interval_minutes).minutes.do(self.run_cycle)
        
        while True:
            schedule.run_pending()
            time.sleep(1)


if __name__ == "__main__":
    system = PortfolioManagerSystem()
    system.start(interval_minutes=15)
```

---

# 10. FONTES DE DADOS REAIS

## 10.1 APIs Gratuitas

| Fonte | Dados | Limite | URL |
|-------|-------|--------|-----|
| **Yahoo Finance** | Stocks, ETFs, Indices | Ilimitado | yfinance library |
| **FRED** | Macro USA | 500 calls/day | api.stlouisfed.org |
| **Alpha Vantage** | Forex, Stocks | 5 calls/min free | alphavantage.co |
| **Binance** | Crypto | 1200/min | api.binance.com |
| **CFTC** | COT Reports | Semanal | cftc.gov |

## 10.2 APIs Pagas (Recomendadas para Produção)

| Fonte | Dados | Custo | URL |
|-------|-------|-------|-----|
| **Polygon.io** | Stocks, Forex, Crypto | $29-199/mo | polygon.io |
| **Quandl** | Macro, Alternatives | $50-500/mo | quandl.com |
| **Bloomberg** | Tudo | $2000+/mo | bloomberg.com |
| **Refinitiv** | Tudo | $1500+/mo | refinitiv.com |

## 10.3 Broker APIs

| Broker | Tipo | API | Notas |
|--------|------|-----|-------|
| **MetaTrader 5** | Forex/CFD | MetaTrader5 library | Gratuito com conta |
| **Interactive Brokers** | Tudo | ib_insync library | Requer conta |
| **Alpaca** | Stocks USA | alpaca-trade-api | Gratuito |

## 10.4 Como Obter API Keys

### FRED (Obrigatório para Macro)
```
1. Acesse: https://fred.stlouisfed.org/
2. Clique em "My Account" → "API Keys"
3. Crie uma conta gratuita
4. Gere sua API key
5. Adicione ao .env: FRED_API_KEY=sua_key
```

### Alpha Vantage (Forex)
```
1. Acesse: https://www.alphavantage.co/support/#api-key
2. Preencha o formulário (gratuito)
3. Receba a key por email
4. Adicione ao .env: ALPHA_VANTAGE_KEY=sua_key
```

### Binance (Crypto)
```
1. Crie conta em: https://www.binance.com/
2. Vá em: API Management
3. Crie nova API key
4. Adicione ao .env:
   BINANCE_API_KEY=sua_key
   BINANCE_SECRET=seu_secret
```

---

# 11. CHECKLIST FINAL

## Fase 1: Setup ✓
- [ ] Criar estrutura de pastas
- [ ] Instalar dependências
- [ ] Configurar .env com API keys
- [ ] Testar conexões

## Fase 2: Data Layer ✓
- [ ] Implementar ForexFetcher (MT5)
- [ ] Implementar StockFetcher (Yahoo)
- [ ] Implementar CryptoFetcher (Binance)
- [ ] Implementar MacroFetcher (FRED)
- [ ] Testar cada fetcher individualmente

## Fase 3: Features ✓
- [ ] Implementar TrendFeatures
- [ ] Implementar MomentumFeatures
- [ ] Implementar VolatilityFeatures
- [ ] Implementar HurstFeatures
- [ ] Implementar SMCFeatures
- [ ] Implementar FeatureCalculator
- [ ] Testar cálculo de features

## Fase 4: Scoring ✓
- [ ] Implementar ScoreComponents
- [ ] Implementar WeightManager
- [ ] Implementar ScoreCalculator
- [ ] Testar scoring com dados reais

## Fase 5: Decision Engine ✓
- [ ] Implementar RegimeDetector
- [ ] Implementar ScenarioEngine
- [ ] Implementar DecisionEngine
- [ ] Testar geração de decisões

## Fase 6: Output ✓
- [ ] Implementar OutputGenerator
- [ ] Testar output JSON
- [ ] Testar output texto

## Fase 7: Integration ✓
- [ ] Implementar main.py
- [ ] Testar ciclo completo
- [ ] Verificar logs
- [ ] Rodar em paper trading

## Fase 8: Production
- [ ] Configurar servidor
- [ ] Implementar monitoring
- [ ] Configurar alertas
- [ ] Go live com capital mínimo

---

# COMANDOS PARA EXECUTAR

```bash
# 1. Ativar ambiente
source venv/bin/activate

# 2. Verificar dependências
pip list

# 3. Testar conexões
python -c "from data.fetchers.forex import ForexFetcher; f = ForexFetcher(); print(f.fetch('EURUSD'))"

# 4. Executar sistema
python main.py

# 5. Ver logs
tail -f logs/system_*.log
```

---

# RESUMO

Este guia implementa o PRD v8.1 completo:

1. **278 Ativos** em 7 classes
2. **120 Features** em 8 categorias
3. **10 Componentes** de scoring
4. **Pesos Dinâmicos** por regime
5. **Output Completo** em JSON e texto

**A IDE deve:**
1. Criar todos os arquivos na estrutura indicada
2. Implementar cada classe conforme o código
3. Obter API keys das fontes indicadas
4. Testar cada módulo individualmente
5. Integrar tudo no main.py
6. Executar e verificar output

**O sistema gera:**
- Oportunidades rankeadas por score
- Entry, SL, TP calculados
- Sizing baseado em risco
- Explicação de cada trade
- One-liners para execução rápida

---

**FIM DO GUIA DE IMPLEMENTAÇÃO v1**
