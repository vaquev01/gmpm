# features/technical/volatility.py
"""
Volatility Features - ATR, Bollinger Bands, etc.
"""

from typing import Dict
import pandas as pd
import numpy as np
from loguru import logger


class VolatilityFeatures:
    """Calculate volatility-based features"""
    
    def calculate(self, ohlcv: pd.DataFrame) -> Dict[str, float]:
        """Calculate all volatility features"""
        features = {}
        
        try:
            close = ohlcv['close']
            high = ohlcv['high']
            low = ohlcv['low']
            
            # ATR
            atr = self._calculate_atr(ohlcv)
            features['atr'] = atr
            features['atr_pct'] = (atr / close.iloc[-1]) * 100 if close.iloc[-1] > 0 else 0
            
            # ATR Percentile (where current ATR sits vs history)
            atr_series = self._calculate_atr_series(ohlcv)
            features['atr_percentile'] = self._percentile_rank(atr_series, atr)
            
            # Bollinger Bands
            bb_position, bb_width = self._calculate_bollinger(close)
            features['bb_position'] = bb_position
            features['bb_width'] = bb_width
            
            # Historical Volatility (annualized)
            features['hist_vol_20'] = self._calculate_historical_vol(close, 20)
            features['hist_vol_60'] = self._calculate_historical_vol(close, 60)
            
            # Volatility Ratio (short/long)
            if features['hist_vol_60'] > 0:
                features['vol_ratio'] = (features['hist_vol_20'] / features['hist_vol_60']) * 50
            else:
                features['vol_ratio'] = 50
            
            # Keltner Channel Position
            features['keltner_position'] = self._calculate_keltner(ohlcv)
            
            # Average True Range expansion/contraction
            features['atr_expansion'] = 100 if atr_series.iloc[-1] > atr_series.iloc[-20] else 0
            
        except Exception as e:
            logger.error(f"Error calculating volatility features: {e}")
            features = {
                'atr': 0, 'atr_pct': 0, 'atr_percentile': 50,
                'bb_position': 50, 'bb_width': 50,
                'hist_vol_20': 0, 'hist_vol_60': 0, 'vol_ratio': 50,
                'keltner_position': 50, 'atr_expansion': 50
            }
        
        return features
    
    def _calculate_atr(self, ohlcv: pd.DataFrame, period: int = 14) -> float:
        """Calculate Average True Range"""
        try:
            high = ohlcv['high']
            low = ohlcv['low']
            close = ohlcv['close']
            
            tr = pd.concat([
                high - low,
                (high - close.shift(1)).abs(),
                (low - close.shift(1)).abs()
            ], axis=1).max(axis=1)
            
            atr = tr.rolling(period).mean()
            return float(atr.iloc[-1]) if not pd.isna(atr.iloc[-1]) else 0
            
        except Exception:
            return 0
    
    def _calculate_atr_series(self, ohlcv: pd.DataFrame, period: int = 14) -> pd.Series:
        """Calculate ATR series"""
        try:
            high = ohlcv['high']
            low = ohlcv['low']
            close = ohlcv['close']
            
            tr = pd.concat([
                high - low,
                (high - close.shift(1)).abs(),
                (low - close.shift(1)).abs()
            ], axis=1).max(axis=1)
            
            return tr.rolling(period).mean()
            
        except Exception:
            return pd.Series([0])
    
    def _percentile_rank(self, series: pd.Series, value: float, lookback: int = 100) -> float:
        """Calculate percentile rank of value in series"""
        try:
            recent = series.tail(lookback).dropna()
            if len(recent) == 0:
                return 50
            return float((recent < value).sum() / len(recent) * 100)
        except Exception:
            return 50
    
    def _calculate_bollinger(self, close: pd.Series, period: int = 20, std_dev: float = 2.0) -> tuple:
        """Calculate Bollinger Bands position and width"""
        try:
            sma = close.rolling(period).mean()
            std = close.rolling(period).std()
            
            upper = sma + std_dev * std
            lower = sma - std_dev * std
            
            # Position: where price is within the bands (0=lower, 50=middle, 100=upper)
            band_range = upper - lower
            position = ((close.iloc[-1] - lower.iloc[-1]) / band_range.iloc[-1] * 100) if band_range.iloc[-1] > 0 else 50
            
            # Width: normalized bandwidth
            width = (band_range.iloc[-1] / sma.iloc[-1] * 100) if sma.iloc[-1] > 0 else 0
            # Normalize to 0-100 (assuming 0-10% is typical range)
            width_normalized = min(100, width * 10)
            
            return float(position), float(width_normalized)
            
        except Exception:
            return 50, 50
    
    def _calculate_historical_vol(self, close: pd.Series, period: int = 20) -> float:
        """Calculate annualized historical volatility"""
        try:
            returns = close.pct_change().dropna()
            vol = returns.tail(period).std() * np.sqrt(252) * 100
            return float(vol) if not pd.isna(vol) else 0
        except Exception:
            return 0
    
    def _calculate_keltner(self, ohlcv: pd.DataFrame, period: int = 20, mult: float = 2.0) -> float:
        """Calculate Keltner Channel position"""
        try:
            close = ohlcv['close']
            atr = self._calculate_atr(ohlcv, period)
            ema = close.ewm(span=period).mean()
            
            upper = ema.iloc[-1] + mult * atr
            lower = ema.iloc[-1] - mult * atr
            
            channel_range = upper - lower
            position = ((close.iloc[-1] - lower) / channel_range * 100) if channel_range > 0 else 50
            
            return float(position)
            
        except Exception:
            return 50
