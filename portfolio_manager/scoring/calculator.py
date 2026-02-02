# scoring/calculator.py
"""
Score Calculator - Generates 0-100 scores for each asset
"""

from typing import Dict, Optional
from dataclasses import dataclass, field
import numpy as np
from loguru import logger

from features.calculator import FeatureSet
from config.settings import settings


@dataclass
class AssetScore:
    """Complete score for an asset"""
    symbol: str
    total: float  # 0-100
    direction: float  # -1 to +1 (negative = short, positive = long)
    confidence: str  # 'LOW', 'MODERATE', 'HIGH', 'INSTITUTIONAL'
    
    # Component scores
    components: Dict[str, float] = field(default_factory=dict)
    
    # Rationale
    top_drivers: list = field(default_factory=list)
    
    def to_dict(self) -> dict:
        return {
            'symbol': self.symbol,
            'total': self.total,
            'direction': self.direction,
            'confidence': self.confidence,
            'components': self.components,
            'top_drivers': self.top_drivers
        }


class ScoreCalculator:
    """Calculates trading scores from features"""
    
    def __init__(self, regime: str = 'RISK_ON'):
        self.regime = regime
        self.weights = settings.get_adjusted_weights(regime)
        logger.info(f"ScoreCalculator initialized with regime: {regime}")
    
    def set_regime(self, regime: str):
        """Update regime and recalculate weights"""
        self.regime = regime
        self.weights = settings.get_adjusted_weights(regime)
    
    def calculate(self, features: FeatureSet) -> AssetScore:
        """
        Calculate score from features
        
        Args:
            features: FeatureSet for an asset
            
        Returns:
            AssetScore with total score and breakdown
        """
        components = {}
        
        try:
            # 1. Macro Alignment (15%)
            components['macro_alignment'] = self._score_macro(features.macro)
            
            # 2. Trend Quality (15%)
            components['trend_quality'] = self._score_trend(features.trend)
            
            # 3. Momentum (10%)
            components['momentum'] = self._score_momentum(features.momentum)
            
            # 4. Volatility (10%)
            components['volatility'] = self._score_volatility(features.volatility)
            
            # 5. Flow/Positioning (10%)
            components['flow_positioning'] = self._score_flow(features.flow)
            
            # 6. Technical Structure (10%)
            components['technical_structure'] = self._score_technical(features.trend, features.momentum)
            
            # 7. Fractal/SMC (10%)
            components['fractal_smc'] = self._score_fractal(features.fractal)
            
            # 8. Cross-Asset (5%)
            components['cross_asset'] = 50  # Placeholder - needs correlation data
            
            # 9. Timing/Seasonal (5%)
            components['timing_seasonal'] = 50  # Placeholder - needs calendar data
            
            # 10. Risk/Reward (10%)
            components['risk_reward'] = self._score_risk_reward(features)
            
            # Calculate weighted total
            total = sum(
                components[k] * self.weights.get(k, 0.1)
                for k in components
            )
            
            # Direction: aggregate trend indicators
            direction = self._calculate_direction(features, components)
            
            # Confidence level
            confidence = self._determine_confidence(total, components)
            
            # Top drivers
            top_drivers = self._identify_top_drivers(components)
            
            return AssetScore(
                symbol=features.symbol,
                total=min(100, max(0, total)),
                direction=direction,
                confidence=confidence,
                components=components,
                top_drivers=top_drivers
            )
            
        except Exception as e:
            logger.error(f"Error calculating score for {features.symbol}: {e}")
            return AssetScore(
                symbol=features.symbol,
                total=0,
                direction=0,
                confidence='LOW',
                components={},
                top_drivers=[]
            )
    
    def _score_macro(self, macro: Dict) -> float:
        """Score macro alignment"""
        if not macro:
            return 50
        
        # Aggregate macro indicators
        scores = list(macro.values())
        if scores:
            return np.mean(scores)
        return 50
    
    def _score_trend(self, trend: Dict) -> float:
        """Score trend quality"""
        if not trend:
            return 50
        
        # Weighted combination of trend features
        score = 0
        weights = {
            'ma_alignment': 0.30,
            'adx': 0.25,
            'trend_direction': 0.25,
            'lr_slope': 0.20
        }
        
        for key, weight in weights.items():
            score += trend.get(key, 50) * weight
        
        return score
    
    def _score_momentum(self, momentum: Dict) -> float:
        """Score momentum"""
        if not momentum:
            return 50
        
        return momentum.get('momentum_composite', 50)
    
    def _score_volatility(self, volatility: Dict) -> float:
        """Score volatility (lower is better for entry)"""
        if not volatility:
            return 50
        
        # Invert: high volatility = low score
        atr_pctl = volatility.get('atr_percentile', 50)
        
        # Mid-range volatility is ideal
        if 30 <= atr_pctl <= 70:
            return 80
        elif atr_pctl < 30:
            return 60  # Low vol - might be consolidation
        else:
            return 40  # High vol - risky
    
    def _score_flow(self, flow: Dict) -> float:
        """Score flow/volume"""
        if not flow:
            return 50
        
        mfi = flow.get('mfi', 50)
        vol_trend = flow.get('volume_trend', 50)
        
        return (mfi * 0.5 + vol_trend * 0.5)
    
    def _score_technical(self, trend: Dict, momentum: Dict) -> float:
        """Score overall technical structure"""
        if not trend and not momentum:
            return 50
        
        # Combine key technical indicators
        scores = []
        if trend:
            scores.append(trend.get('ma_alignment', 50))
            scores.append(trend.get('donchian_position', 50))
        if momentum:
            scores.append(momentum.get('rsi_14', 50))
            scores.append(momentum.get('macd_signal', 50))
        
        return np.mean(scores) if scores else 50
    
    def _score_fractal(self, fractal: Dict) -> float:
        """Score fractal/SMC features"""
        if not fractal:
            return 50
        
        # Combine Hurst and SMC
        hurst = fractal.get('hurst_normalized', 50)
        smc = fractal.get('smc_score', 50)
        structure = fractal.get('structure_bias', 50)
        
        return (hurst * 0.3 + smc * 0.4 + structure * 0.3)
    
    def _score_risk_reward(self, features: FeatureSet) -> float:
        """Score risk/reward potential"""
        # Based on volatility and structure
        vol = features.volatility.get('atr_pct', 0)
        trend_str = features.trend.get('adx', 25)
        
        # Good R:R = strong trend + moderate volatility
        if trend_str > 25 and vol < 3:
            return 80
        elif trend_str > 20:
            return 60
        else:
            return 40
    
    def _calculate_direction(self, features: FeatureSet, components: Dict) -> float:
        """Calculate trade direction (-1 to +1)"""
        signals = []
        
        # Trend direction
        if features.trend.get('trend_direction', 50) > 60:
            signals.append(1)
        elif features.trend.get('trend_direction', 50) < 40:
            signals.append(-1)
        
        # MA alignment
        if features.trend.get('ma_alignment', 50) > 75:
            signals.append(1)
        elif features.trend.get('ma_alignment', 50) < 25:
            signals.append(-1)
        
        # RSI
        rsi = features.momentum.get('rsi_14', 50)
        if rsi > 60:
            signals.append(1)
        elif rsi < 40:
            signals.append(-1)
        
        # SMC structure
        if features.fractal.get('structure_bias', 50) > 60:
            signals.append(1)
        elif features.fractal.get('structure_bias', 50) < 40:
            signals.append(-1)
        
        if signals:
            return np.mean(signals)
        return 0
    
    def _determine_confidence(self, total: float, components: Dict) -> str:
        """Determine confidence level"""
        if total >= 80:
            return 'INSTITUTIONAL'
        elif total >= 70:
            return 'HIGH'
        elif total >= 55:
            return 'MODERATE'
        else:
            return 'LOW'
    
    def _identify_top_drivers(self, components: Dict, n: int = 3) -> list:
        """Identify top scoring components"""
        sorted_components = sorted(components.items(), key=lambda x: x[1], reverse=True)
        return [f"{k}: {v:.0f}/100" for k, v in sorted_components[:n]]
    
    def calculate_batch(self, features_dict: Dict[str, FeatureSet]) -> Dict[str, AssetScore]:
        """Calculate scores for multiple assets"""
        scores = {}
        for symbol, features in features_dict.items():
            scores[symbol] = self.calculate(features)
        return scores
