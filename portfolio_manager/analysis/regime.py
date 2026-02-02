# analysis/regime.py
"""
Regime Detector - Determines market regime (Risk-On, Risk-Off, etc.)
"""

from typing import Dict, Optional
from dataclasses import dataclass
from loguru import logger


@dataclass
class RegimeState:
    """Current regime state"""
    regime: str  # RISK_ON, RISK_OFF, TRANSITION, STRESS, UNCERTAIN
    confidence: float  # 0-100
    previous: Optional[str] = None
    duration_days: int = 0


class RegimeDetector:
    """Detects current market regime"""
    
    REGIMES = ['RISK_ON', 'RISK_OFF', 'TRANSITION', 'STRESS', 'UNCERTAIN']
    
    def __init__(self, macro_fetcher=None):
        self.macro_fetcher = macro_fetcher
        self.current_state = RegimeState(regime='UNCERTAIN', confidence=50)
        logger.info("RegimeDetector initialized")
    
    def detect(self, macro_data: Optional[Dict] = None) -> RegimeState:
        """
        Detect current market regime based on macro indicators
        
        Args:
            macro_data: Dict of macro indicators
            
        Returns:
            RegimeState with current regime and confidence
        """
        if macro_data is None and self.macro_fetcher:
            try:
                snapshot = self.macro_fetcher.get_macro_snapshot()
                macro_data = snapshot.get('flat', {}) if isinstance(snapshot, dict) else {}
            except Exception as e:
                logger.warning(f"Could not fetch macro data: {e}")
                macro_data = {}
        
        if not macro_data:
            return self.current_state
        
        try:
            # Score each regime
            scores = {
                'RISK_ON': self._score_risk_on(macro_data),
                'RISK_OFF': self._score_risk_off(macro_data),
                'STRESS': self._score_stress(macro_data),
            }
            
            # Find highest scoring regime
            best_regime = max(scores, key=scores.get)
            best_score = scores[best_regime]
            
            # Transition detection
            if best_score < 60:
                if self.current_state.regime != 'UNCERTAIN':
                    best_regime = 'TRANSITION'
                else:
                    best_regime = 'UNCERTAIN'
            
            # Update state
            previous = self.current_state.regime
            if best_regime == previous:
                self.current_state.duration_days += 1
            else:
                self.current_state = RegimeState(
                    regime=best_regime,
                    confidence=best_score,
                    previous=previous,
                    duration_days=1
                )
            
            logger.debug(f"Regime: {best_regime} (confidence: {best_score:.0f}%)")
            return self.current_state
            
        except Exception as e:
            logger.error(f"Error detecting regime: {e}")
            return self.current_state
    
    def _score_risk_on(self, macro: Dict) -> float:
        """Score Risk-On regime"""
        score = 50
        
        # VIX low = risk on
        vix = macro.get('VIX', macro.get('vix', 20))
        if vix < 15:
            score += 20
        elif vix < 20:
            score += 10
        
        # Yield curve positive = risk on
        yield_curve = macro.get('YIELD_CURVE_10Y2Y', macro.get('yield_curve', 0))
        if yield_curve > 0:
            score += 15
        
        # Credit spreads tight = risk on
        credit_spread = macro.get('credit_spread')
        if credit_spread is None:
            hy = macro.get('HY_SPREAD')
            if isinstance(hy, (int, float)):
                credit_spread = float(hy * 100.0) if hy < 50 else float(hy)
        if isinstance(credit_spread, (int, float)) and credit_spread < 350:
            score += 15
        
        return min(100, score)
    
    def _score_risk_off(self, macro: Dict) -> float:
        """Score Risk-Off regime"""
        score = 50
        
        # VIX high = risk off
        vix = macro.get('VIX', macro.get('vix', 20))
        if vix > 25:
            score += 20
        elif vix > 20:
            score += 10
        
        # Yield curve inverted = risk off
        yield_curve = macro.get('YIELD_CURVE_10Y2Y', macro.get('yield_curve', 0))
        if yield_curve < 0:
            score += 15
        
        # Credit spreads wide = risk off
        credit_spread = macro.get('credit_spread')
        if credit_spread is None:
            hy = macro.get('HY_SPREAD')
            if isinstance(hy, (int, float)):
                credit_spread = float(hy * 100.0) if hy < 50 else float(hy)
        if isinstance(credit_spread, (int, float)) and credit_spread > 500:
            score += 15
        
        return min(100, score)
    
    def _score_stress(self, macro: Dict) -> float:
        """Score Stress regime"""
        score = 0
        
        # VIX very high = stress
        vix = macro.get('VIX', macro.get('vix', 20))
        if vix > 35:
            score += 40
        elif vix > 30:
            score += 20
        
        # Credit spreads very wide = stress
        credit_spread = macro.get('credit_spread')
        if credit_spread is None:
            hy = macro.get('HY_SPREAD')
            if isinstance(hy, (int, float)):
                credit_spread = float(hy * 100.0) if hy < 50 else float(hy)
        if isinstance(credit_spread, (int, float)) and credit_spread > 700:
            score += 30
        
        return min(100, score)
    
    def confidence(self) -> float:
        """Get current confidence level"""
        return self.current_state.confidence
    
    def get_regime(self) -> str:
        """Get current regime"""
        return self.current_state.regime
