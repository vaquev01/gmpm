# output/generator.py
"""
Output Generator - Creates the final trading signals and one-liners
"""

from typing import List, Dict, Any
from dataclasses import dataclass, asdict, field
from datetime import datetime, timedelta
import json
from loguru import logger

from scoring.calculator import AssetScore


@dataclass
class TradeSignal:
    """A single trade signal"""
    symbol: str
    direction: str  # 'LONG' or 'SHORT'
    score: float
    confidence: str
    entry_price: float
    stop_loss: float
    take_profit_1: float
    take_profit_2: float
    position_size: float  # In lots or units
    risk_r: float  # Risk in R
    rationale: str
    key_drivers: List[str]
    valid_hours: int = 24


@dataclass 
class SystemOutput:
    """Complete system output"""
    timestamp: str
    valid_until: str
    system_state: str
    
    # Context
    regime: str
    regime_confidence: float
    scenario: str
    scenario_probability: float
    
    # Thesis
    thesis: str
    
    # Signals
    signals: List[TradeSignal] = field(default_factory=list)
    
    # Summary
    executive_summary: str = ""
    one_liners: List[str] = field(default_factory=list)


class OutputGenerator:
    """Generates final output from scores"""
    
    def __init__(self, capital: float = 100000, risk_per_trade: float = 0.02):
        self.capital = capital
        self.risk_per_trade = risk_per_trade
        logger.info("OutputGenerator initialized")
    
    def generate(self, 
                 scores: Dict[str, AssetScore],
                 prices: Dict[str, float],
                 regime: str = 'UNCERTAIN',
                 regime_conf: float = 50,
                 scenario: str = 'UNCERTAIN',
                 scenario_prob: float = 50,
                 min_score: float = 55) -> SystemOutput:
        """
        Generate complete output from asset scores
        
        Args:
            scores: Dict of symbol -> AssetScore
            prices: Dict of symbol -> current price
            regime: Current market regime
            regime_conf: Regime confidence
            scenario: Current scenario
            scenario_prob: Scenario probability
            min_score: Minimum score threshold
            
        Returns:
            SystemOutput with all signals and summaries
        """
        now = datetime.now()
        
        # Filter by score threshold
        qualified = {s: sc for s, sc in scores.items() if sc.total >= min_score}
        
        # Sort by score
        sorted_scores = sorted(qualified.items(), key=lambda x: x[1].total, reverse=True)
        
        # Generate signals
        signals = []
        for symbol, score in sorted_scores[:20]:  # Top 20
            price = prices.get(symbol, 0)
            if price <= 0:
                continue
            
            signal = self._create_signal(symbol, score, price, regime)
            signals.append(signal)
        
        # Generate thesis
        thesis = self._generate_thesis(regime, scenario)
        
        # Generate summary
        summary = self._generate_summary(signals, regime, scenario)
        
        # Generate one-liners
        one_liners = [self._generate_one_liner(s) for s in signals]
        
        return SystemOutput(
            timestamp=now.isoformat(),
            valid_until=(now + timedelta(hours=12)).isoformat(),
            system_state='RUNNING',
            regime=regime,
            regime_confidence=regime_conf,
            scenario=scenario,
            scenario_probability=scenario_prob,
            thesis=thesis,
            signals=signals,
            executive_summary=summary,
            one_liners=one_liners
        )
    
    def _create_signal(self, symbol: str, score: AssetScore, 
                       price: float, regime: str) -> TradeSignal:
        """Create a trade signal"""
        direction = 'LONG' if score.direction > 0 else 'SHORT'
        
        # Calculate stop loss (simplified ATR-based)
        atr_pct = 0.02  # Assume 2% ATR
        if regime == 'STRESS':
            atr_pct *= 1.5
        
        if direction == 'LONG':
            stop_loss = price * (1 - atr_pct * 2)
            tp1 = price * (1 + atr_pct * 3)
            tp2 = price * (1 + atr_pct * 5)
        else:
            stop_loss = price * (1 + atr_pct * 2)
            tp1 = price * (1 - atr_pct * 3)
            tp2 = price * (1 - atr_pct * 5)
        
        # Position size
        risk_amount = self.capital * self.risk_per_trade
        stop_distance = abs(price - stop_loss)
        position_size = risk_amount / stop_distance if stop_distance > 0 else 0
        
        # Adjust by score
        position_size *= score.total / 100
        
        # Generate rationale
        rationale = f"{direction} {symbol}: "
        if score.components:
            top_comps = sorted(score.components.items(), key=lambda x: x[1], reverse=True)[:2]
            rationale += ", ".join([f"{k.replace('_', ' ').title()} strong" for k, v in top_comps if v > 60])
        
        return TradeSignal(
            symbol=symbol,
            direction=direction,
            score=score.total,
            confidence=score.confidence,
            entry_price=price,
            stop_loss=round(stop_loss, 5),
            take_profit_1=round(tp1, 5),
            take_profit_2=round(tp2, 5),
            position_size=round(position_size, 2),
            risk_r=self.risk_per_trade,
            rationale=rationale,
            key_drivers=score.top_drivers,
            valid_hours=24
        )
    
    def _generate_thesis(self, regime: str, scenario: str) -> str:
        """Generate market thesis"""
        theses = {
            ('RISK_ON', 'GOLDILOCKS'): "Goldilocks environment: Low inflation with solid growth. Risk assets favored. Overweight equities, reduce bonds.",
            ('RISK_ON', 'DISINFLATION'): "Disinflation supporting risk assets. Fed likely done hiking. Favor growth over value.",
            ('RISK_OFF', 'STAGFLATION'): "Stagflation risk rising. Defensive positioning recommended. Favor commodities, short growth.",
            ('STRESS', 'SHOCK'): "Market stress detected. Reduce exposure. Cash and high-quality bonds recommended.",
        }
        
        return theses.get((regime, scenario), 
            f"Regime: {regime}. Scenario: {scenario}. Exercise appropriate caution.")
    
    def _generate_summary(self, signals: List[TradeSignal], regime: str, scenario: str) -> str:
        """Generate executive summary"""
        n = len(signals)
        if n == 0:
            return f"No qualified opportunities. Regime: {regime}. Stand aside."
        
        longs = sum(1 for s in signals if s.direction == 'LONG')
        shorts = n - longs
        avg_score = sum(s.score for s in signals) / n
        
        return f"{n} opportunities identified ({longs} long, {shorts} short). Avg score: {avg_score:.0f}. Regime: {regime}. Scenario: {scenario}."
    
    def _generate_one_liner(self, signal: TradeSignal) -> str:
        """Generate one-liner for quick execution"""
        return (
            f"{signal.symbol}: {signal.direction[:3]} {signal.entry_price:.4f}"
            f"→{signal.take_profit_1:.4f}/{signal.take_profit_2:.4f} | "
            f"SL {signal.stop_loss:.4f} | {signal.position_size:.2f}L | "
            f"S:{signal.score:.0f} | {signal.valid_hours}h"
        )
    
    def to_json(self, output: SystemOutput) -> str:
        """Convert output to JSON"""
        data = asdict(output)
        return json.dumps(data, indent=2, default=str)
    
    def to_text(self, output: SystemOutput) -> str:
        """Convert output to formatted text"""
        lines = []
        lines.append("=" * 70)
        lines.append("GLOBAL MULTI-ASSET PORTFOLIO MANAGER - OUTPUT")
        lines.append("=" * 70)
        lines.append(f"Timestamp: {output.timestamp}")
        lines.append(f"Valid until: {output.valid_until}")
        lines.append("-" * 70)
        lines.append(f"REGIME: {output.regime} ({output.regime_confidence:.0f}%)")
        lines.append(f"SCENARIO: {output.scenario} ({output.scenario_probability:.0f}%)")
        lines.append("-" * 70)
        lines.append("THESIS:")
        lines.append(f"  {output.thesis}")
        lines.append("-" * 70)
        lines.append("OPPORTUNITIES:")
        
        for signal in output.signals:
            lines.append(f"  {signal.symbol} {signal.direction} | Score: {signal.score:.0f} | {signal.confidence}")
            lines.append(f"    Entry: {signal.entry_price:.5f}")
            lines.append(f"    SL: {signal.stop_loss:.5f} | TP1: {signal.take_profit_1:.5f} | TP2: {signal.take_profit_2:.5f}")
            lines.append(f"    Size: {signal.position_size:.2f} | Rationale: {signal.rationale}")
        
        lines.append("-" * 70)
        lines.append("ONE-LINERS:")
        for ol in output.one_liners:
            lines.append(f"  {ol}")
        
        lines.append("=" * 70)
        return "\n".join(lines)
