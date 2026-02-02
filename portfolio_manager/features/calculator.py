# features/calculator.py
"""
Feature Calculator - Computes all 120 features for each asset
"""

from typing import Dict, Any, Optional
from dataclasses import dataclass, field
import pandas as pd
import numpy as np
from loguru import logger

try:
    import ta
    TA_AVAILABLE = True
except ImportError:
    TA_AVAILABLE = False

from .technical.trend import TrendFeatures
from .technical.momentum import MomentumFeatures
from .technical.volatility import VolatilityFeatures
from .fractal.hurst import HurstFeatures
from .fractal.smc import SMCFeatures


@dataclass
class FeatureSet:
    """Complete feature set for an asset"""
    symbol: str
    timestamp: pd.Timestamp
    
    # Technical Features
    trend: Dict[str, float] = field(default_factory=dict)
    momentum: Dict[str, float] = field(default_factory=dict)
    volatility: Dict[str, float] = field(default_factory=dict)
    
    # Fractal Features
    fractal: Dict[str, float] = field(default_factory=dict)
    
    # Volume/Flow Features
    flow: Dict[str, float] = field(default_factory=dict)
    
    # Macro Features (injected separately)
    macro: Dict[str, float] = field(default_factory=dict)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            'symbol': self.symbol,
            'timestamp': str(self.timestamp),
            'trend': self.trend,
            'momentum': self.momentum,
            'volatility': self.volatility,
            'fractal': self.fractal,
            'flow': self.flow,
            'macro': self.macro,
        }
    
    def get_feature_count(self) -> int:
        """Count total features"""
        return sum([
            len(self.trend),
            len(self.momentum),
            len(self.volatility),
            len(self.fractal),
            len(self.flow),
            len(self.macro),
        ])


class FeatureCalculator:
    """Calculates all features for assets"""
    
    def __init__(self, fetchers: Dict):
        self.fetchers = fetchers
        
        # Feature calculators
        self.trend = TrendFeatures()
        self.momentum = MomentumFeatures()
        self.volatility_calc = VolatilityFeatures()
        self.hurst = HurstFeatures()
        self.smc = SMCFeatures()
        
        logger.info("FeatureCalculator initialized")
    
    def calculate(self, symbol: str, ohlcv: pd.DataFrame, 
                  macro_data: Optional[Dict] = None) -> FeatureSet:
        """
        Calculate all features for a single asset
        
        Args:
            symbol: Asset symbol
            ohlcv: OHLCV DataFrame
            macro_data: Optional macro indicators
            
        Returns:
            FeatureSet with all calculated features
        """
        if ohlcv.empty or len(ohlcv) < 50:
            logger.warning(f"Insufficient data for {symbol}")
            return FeatureSet(symbol=symbol, timestamp=pd.Timestamp.now())
        
        features = FeatureSet(
            symbol=symbol,
            timestamp=ohlcv.index[-1] if isinstance(ohlcv.index, pd.DatetimeIndex) else pd.Timestamp.now()
        )
        
        try:
            # Trend Features
            features.trend = self.trend.calculate(ohlcv)
            
            # Momentum Features
            features.momentum = self.momentum.calculate(ohlcv)
            
            # Volatility Features
            features.volatility = self.volatility_calc.calculate(ohlcv)
            
            # Fractal/SMC Features
            features.fractal = {
                **self.hurst.calculate(ohlcv),
                **self.smc.calculate(ohlcv),
            }
            
            # Flow/Volume Features
            features.flow = self._calculate_flow_features(ohlcv)
            
            # Macro Features (if provided)
            if macro_data:
                features.macro = self._normalize_macro(macro_data)
            
            logger.debug(f"Calculated {features.get_feature_count()} features for {symbol}")
            
        except Exception as e:
            logger.error(f"Error calculating features for {symbol}: {e}")
        
        return features
    
    def _calculate_flow_features(self, ohlcv: pd.DataFrame) -> Dict[str, float]:
        """Calculate flow/volume based features"""
        features = {}
        
        try:
            close = ohlcv['close']
            volume = ohlcv['volume']
            
            # Volume features
            vol_sma_20 = volume.rolling(20).mean()
            features['volume_ratio'] = (volume.iloc[-1] / vol_sma_20.iloc[-1]) if vol_sma_20.iloc[-1] > 0 else 1.0
            features['volume_trend'] = 100 if volume.iloc[-5:].mean() > volume.iloc[-20:-5].mean() else 0
            
            # On Balance Volume
            obv = ((close.diff() > 0) * volume - (close.diff() < 0) * volume).cumsum()
            features['obv_trend'] = 100 if obv.iloc[-1] > obv.iloc[-20] else 0
            
            # Money Flow
            tp = (ohlcv['high'] + ohlcv['low'] + close) / 3
            mf = tp * volume
            positive_mf = mf.where(tp > tp.shift(1), 0).rolling(14).sum()
            negative_mf = mf.where(tp < tp.shift(1), 0).rolling(14).sum()
            mfi = 100 - (100 / (1 + positive_mf / negative_mf.replace(0, 1)))
            features['mfi'] = float(mfi.iloc[-1]) if not pd.isna(mfi.iloc[-1]) else 50
            
        except Exception as e:
            logger.warning(f"Error calculating flow features: {e}")
            features = {'volume_ratio': 1.0, 'volume_trend': 50, 'obv_trend': 50, 'mfi': 50}
        
        return features
    
    def _normalize_macro(self, macro_data: Dict) -> Dict[str, float]:
        """Normalize macro data to 0-100 scale"""
        normalized = {}
        
        # Normalize each macro indicator (simplified)
        for key, value in macro_data.items():
            if isinstance(value, (int, float)):
                # Simple normalization (would need proper bounds in production)
                normalized[key] = min(100, max(0, float(value)))
        
        return normalized
    
    def calculate_batch(self, data: Dict[str, pd.DataFrame], 
                        macro_data: Optional[Dict] = None) -> Dict[str, FeatureSet]:
        """Calculate features for multiple assets"""
        results = {}
        
        for symbol, ohlcv in data.items():
            features = self.calculate(symbol, ohlcv, macro_data)
            results[symbol] = features
        
        logger.info(f"Calculated features for {len(results)} assets")
        return results
