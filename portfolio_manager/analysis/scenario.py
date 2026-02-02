# analysis/scenario.py
"""
Scenario Engine - Determines current macro scenario
"""

from typing import Dict, List, Optional
from dataclasses import dataclass
from loguru import logger


@dataclass
class ScenarioState:
    """Current scenario state"""
    scenario: str
    probability: float  # 0-100
    sequence: List[str]  # Historical sequence
    next_prediction: str


class ScenarioEngine:
    """Determines current macro scenario"""
    
    SCENARIOS = [
        'DISINFLATION',      # Inflation falling, growth OK
        'REACCELERATION',    # Growth picking up
        'STAGFLATION',       # High inflation, low growth
        'GOLDILOCKS',        # Low inflation, good growth
        'RISK_OFF',          # Flight to quality
        'CARRY',             # Stable rates, seek yield
        'SHOCK',             # Sudden market stress
        'RECOVERY',          # Post-stress recovery
    ]
    
    def __init__(self, macro_fetcher=None):
        self.macro_fetcher = macro_fetcher
        self.sequence: List[str] = []
        self.current = ScenarioState(
            scenario='UNCERTAIN',
            probability=50,
            sequence=[],
            next_prediction='UNCERTAIN'
        )
        logger.info("ScenarioEngine initialized")
    
    def determine(self, macro_data: Optional[Dict] = None) -> ScenarioState:
        """
        Determine current macro scenario
        
        Args:
            macro_data: Dict of macro indicators
            
        Returns:
            ScenarioState with current scenario
        """
        if macro_data is None and self.macro_fetcher:
            try:
                snapshot = self.macro_fetcher.get_macro_snapshot()
                macro_data = snapshot.get('flat', {}) if isinstance(snapshot, dict) else {}
            except Exception:
                try:
                    macro_data = self.macro_fetcher.calculate_macro_indicators()
                except Exception:
                    macro_data = {}
        
        if not macro_data:
            return self.current
        
        try:
            # Score each scenario
            scores = {}
            scores['DISINFLATION'] = self._score_disinflation(macro_data)
            scores['REACCELERATION'] = self._score_reacceleration(macro_data)
            scores['GOLDILOCKS'] = self._score_goldilocks(macro_data)
            scores['STAGFLATION'] = self._score_stagflation(macro_data)
            scores['RISK_OFF'] = self._score_risk_off(macro_data)
            
            # Find best scenario
            best_scenario = max(scores, key=scores.get)
            best_prob = scores[best_scenario]
            
            # Update sequence
            if len(self.sequence) == 0 or self.sequence[-1] != best_scenario:
                self.sequence.append(best_scenario)
                self.sequence = self.sequence[-10:]  # Keep last 10
            
            # Predict next
            next_pred = self._predict_next(best_scenario, macro_data)
            
            self.current = ScenarioState(
                scenario=best_scenario,
                probability=best_prob,
                sequence=self.sequence.copy(),
                next_prediction=next_pred
            )
            
            return self.current
            
        except Exception as e:
            logger.error(f"Error determining scenario: {e}")
            return self.current
    
    def _score_disinflation(self, macro: Dict) -> float:
        """Score disinflation scenario"""
        score = 50
        
        inflation_trend = macro.get('inflation_trend', 'FLAT')
        if inflation_trend == 'FALLING':
            score += 25
        
        gdp = macro.get('gdp_growth', 2)
        if gdp > 1:
            score += 15
        
        return min(100, score)
    
    def _score_reacceleration(self, macro: Dict) -> float:
        """Score reacceleration scenario"""
        score = 40
        
        gdp = macro.get('gdp_growth', 2)
        if gdp > 2.5:
            score += 30
        elif gdp > 2:
            score += 15
        
        return min(100, score)
    
    def _score_goldilocks(self, macro: Dict) -> float:
        """Score goldilocks scenario"""
        score = 40
        
        inflation = macro.get('core_inflation', 3)
        gdp = macro.get('gdp_growth', 2)
        
        if 1.5 < inflation < 2.5 and gdp > 2:
            score += 40
        elif inflation < 3 and gdp > 1.5:
            score += 20
        
        return min(100, score)
    
    def _score_stagflation(self, macro: Dict) -> float:
        """Score stagflation scenario"""
        score = 30
        
        inflation = macro.get('core_inflation', 3)
        gdp = macro.get('gdp_growth', 2)
        
        if inflation > 4 and gdp < 1:
            score += 50
        elif inflation > 3 and gdp < 1.5:
            score += 25
        
        return min(100, score)
    
    def _score_risk_off(self, macro: Dict) -> float:
        """Score risk-off scenario"""
        score = 30
        
        credit_spread = macro.get('credit_spread', 400)
        if credit_spread > 500:
            score += 30
        
        return min(100, score)
    
    def _predict_next(self, current: str, macro: Dict) -> str:
        """Predict next likely scenario"""
        # Simplified prediction based on current scenario
        transitions = {
            'DISINFLATION': 'GOLDILOCKS',
            'REACCELERATION': 'DISINFLATION',
            'GOLDILOCKS': 'GOLDILOCKS',
            'STAGFLATION': 'RISK_OFF',
            'RISK_OFF': 'RECOVERY',
            'RECOVERY': 'GOLDILOCKS',
        }
        return transitions.get(current, 'UNCERTAIN')
    
    def get_scenario(self) -> str:
        return self.current.scenario
    
    def probability(self) -> float:
        return self.current.probability
    
    def get_sequence(self) -> List[str]:
        return self.current.sequence
    
    def predict_next(self) -> str:
        return self.current.next_prediction
