# config/settings.py
"""
Portfolio Manager v8.1 - Settings
"""

import os
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Paths
BASE_DIR = Path(__file__).parent.parent
DATA_DIR = BASE_DIR / "data"
LOGS_DIR = BASE_DIR / "logs"
OUTPUTS_DIR = BASE_DIR / "outputs"

# API Keys
FRED_API_KEY = os.getenv("FRED_API_KEY", "")
ALPHA_VANTAGE_KEY = os.getenv("ALPHA_VANTAGE_KEY", "")
BINANCE_API_KEY = os.getenv("BINANCE_API_KEY", "")
BINANCE_SECRET = os.getenv("BINANCE_SECRET", "")

# Portfolio Settings
INITIAL_CAPITAL = float(os.getenv("INITIAL_CAPITAL", 100000))
MAX_RISK_PER_TRADE = float(os.getenv("MAX_RISK_PER_TRADE", 0.02))
MAX_PORTFOLIO_RISK = float(os.getenv("MAX_PORTFOLIO_RISK", 0.10))

# System Settings
RUN_INTERVAL_MINUTES = int(os.getenv("RUN_INTERVAL_MINUTES", 15))
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")

# Scoring Thresholds
SCORE_THRESHOLD_STRONG = 75
SCORE_THRESHOLD_MODERATE = 55
SCORE_THRESHOLD_NO_TRADE = 54

# Score Component Weights (v8.0 Final)
SCORE_WEIGHTS = {
    'macro_alignment': 0.15,
    'trend_quality': 0.15,
    'momentum': 0.10,
    'volatility': 0.10,
    'flow_positioning': 0.10,
    'technical_structure': 0.10,
    'fractal_smc': 0.10,
    'cross_asset': 0.05,
    'timing_seasonal': 0.05,
    'risk_reward': 0.10,
}

# Timeframe Weights
TIMEFRAME_WEIGHTS = {
    'M': 0.20,   # Monthly
    'W': 0.20,   # Weekly
    'D': 0.30,   # Daily
    '4H': 0.15,  # 4 Hour
    '1H': 0.10,  # 1 Hour
    '15M': 0.05, # 15 Min
}

# Regime-based Weight Adjustments
REGIME_WEIGHT_ADJUSTMENTS = {
    'RISK_ON': {
        'trend_quality': 1.2,
        'momentum': 1.3,
        'volatility': 0.8,
    },
    'RISK_OFF': {
        'trend_quality': 0.8,
        'momentum': 0.7,
        'volatility': 1.3,
        'macro_alignment': 1.2,
    },
    'TRANSITION': {
        'volatility': 1.2,
        'flow_positioning': 1.2,
    },
    'STRESS': {
        'volatility': 1.5,
        'macro_alignment': 1.3,
        'flow_positioning': 1.3,
    },
}


class Settings:
    """Settings singleton"""
    
    def __init__(self):
        self.INITIAL_CAPITAL = INITIAL_CAPITAL
        self.MAX_RISK_PER_TRADE = MAX_RISK_PER_TRADE
        self.MAX_PORTFOLIO_RISK = MAX_PORTFOLIO_RISK
        self.SCORE_WEIGHTS = SCORE_WEIGHTS
        self.TIMEFRAME_WEIGHTS = TIMEFRAME_WEIGHTS
        self.REGIME_WEIGHT_ADJUSTMENTS = REGIME_WEIGHT_ADJUSTMENTS
        
    def get_adjusted_weights(self, regime: str) -> dict:
        """Get score weights adjusted for current regime"""
        weights = SCORE_WEIGHTS.copy()
        adjustments = REGIME_WEIGHT_ADJUSTMENTS.get(regime, {})
        
        for component, multiplier in adjustments.items():
            if component in weights:
                weights[component] *= multiplier
        
        # Normalize to sum to 1.0
        total = sum(weights.values())
        return {k: v / total for k, v in weights.items()}


settings = Settings()
