# features/technical/momentum.py
"""
Momentum Features - RSI, MACD, Stochastic, etc.
"""

from typing import Dict
import pandas as pd
import numpy as np
from loguru import logger


class MomentumFeatures:
    """Calculate momentum-based features"""
    
    def calculate(self, ohlcv: pd.DataFrame) -> Dict[str, float]:
        """Calculate all momentum features"""
        features = {}
        
        try:
            close = ohlcv['close']
            high = ohlcv['high']
            low = ohlcv['low']
            
            # RSI
            features['rsi_14'] = self._calculate_rsi(close, 14)
            features['rsi_7'] = self._calculate_rsi(close, 7)
            
            # MACD
            macd_line, signal_line, histogram = self._calculate_macd(close)
            features['macd_histogram'] = self._normalize_macd(histogram, close.iloc[-1])
            features['macd_signal'] = 100 if macd_line > signal_line else 0
            
            # Stochastic
            stoch_k, stoch_d = self._calculate_stochastic(high, low, close)
            features['stoch_k'] = stoch_k
            features['stoch_d'] = stoch_d
            
            # Rate of Change
            features['roc_10'] = self._calculate_roc(close, 10)
            features['roc_20'] = self._calculate_roc(close, 20)
            
            # Williams %R
            features['williams_r'] = self._calculate_williams_r(high, low, close)
            
            # CCI
            features['cci'] = self._calculate_cci(ohlcv)
            
            # Momentum composite
            features['momentum_composite'] = (
                features['rsi_14'] * 0.3 +
                features['stoch_k'] * 0.2 +
                features['macd_histogram'] * 0.3 +
                features['roc_10'] * 0.2
            )
            
        except Exception as e:
            logger.error(f"Error calculating momentum features: {e}")
            features = {
                'rsi_14': 50, 'rsi_7': 50, 'macd_histogram': 50, 'macd_signal': 50,
                'stoch_k': 50, 'stoch_d': 50, 'roc_10': 50, 'roc_20': 50,
                'williams_r': 50, 'cci': 50, 'momentum_composite': 50
            }
        
        return features
    
    def _calculate_rsi(self, close: pd.Series, period: int = 14) -> float:
        """Calculate RSI"""
        try:
            delta = close.diff()
            gain = delta.where(delta > 0, 0).rolling(period).mean()
            loss = (-delta.where(delta < 0, 0)).rolling(period).mean()
            
            rs = gain / loss.replace(0, 1)
            rsi = 100 - (100 / (1 + rs))
            
            return float(rsi.iloc[-1]) if not pd.isna(rsi.iloc[-1]) else 50
            
        except Exception:
            return 50
    
    def _calculate_macd(self, close: pd.Series) -> tuple:
        """Calculate MACD"""
        try:
            ema_12 = close.ewm(span=12).mean()
            ema_26 = close.ewm(span=26).mean()
            macd_line = ema_12 - ema_26
            signal_line = macd_line.ewm(span=9).mean()
            histogram = macd_line - signal_line
            
            return (
                float(macd_line.iloc[-1]),
                float(signal_line.iloc[-1]),
                float(histogram.iloc[-1])
            )
            
        except Exception:
            return 0, 0, 0
    
    def _normalize_macd(self, histogram: float, price: float) -> float:
        """Normalize MACD histogram to 0-100"""
        if price == 0:
            return 50
        pct = histogram / price * 100
        return max(0, min(100, (pct + 2) * 25))
    
    def _calculate_stochastic(self, high: pd.Series, low: pd.Series, 
                               close: pd.Series, k_period: int = 14, d_period: int = 3) -> tuple:
        """Calculate Stochastic Oscillator"""
        try:
            lowest_low = low.rolling(k_period).min()
            highest_high = high.rolling(k_period).max()
            
            stoch_k = 100 * (close - lowest_low) / (highest_high - lowest_low)
            stoch_d = stoch_k.rolling(d_period).mean()
            
            return (
                float(stoch_k.iloc[-1]) if not pd.isna(stoch_k.iloc[-1]) else 50,
                float(stoch_d.iloc[-1]) if not pd.isna(stoch_d.iloc[-1]) else 50
            )
            
        except Exception:
            return 50, 50
    
    def _calculate_roc(self, close: pd.Series, period: int = 10) -> float:
        """Calculate Rate of Change (normalized)"""
        try:
            roc = (close.iloc[-1] / close.iloc[-period] - 1) * 100
            # Normalize -10% to +10% range to 0-100
            return max(0, min(100, (roc + 10) * 5))
        except Exception:
            return 50
    
    def _calculate_williams_r(self, high: pd.Series, low: pd.Series, 
                               close: pd.Series, period: int = 14) -> float:
        """Calculate Williams %R (inverted to 0-100)"""
        try:
            highest_high = high.rolling(period).max()
            lowest_low = low.rolling(period).min()
            
            wr = -100 * (highest_high - close) / (highest_high - lowest_low)
            # Invert to 0-100 (0 = oversold, 100 = overbought)
            return float(wr.iloc[-1] + 100) if not pd.isna(wr.iloc[-1]) else 50
            
        except Exception:
            return 50
    
    def _calculate_cci(self, ohlcv: pd.DataFrame, period: int = 20) -> float:
        """Calculate Commodity Channel Index (normalized)"""
        try:
            tp = (ohlcv['high'] + ohlcv['low'] + ohlcv['close']) / 3
            sma = tp.rolling(period).mean()
            mad = tp.rolling(period).apply(lambda x: np.abs(x - x.mean()).mean())
            
            cci = (tp - sma) / (0.015 * mad)
            # Normalize -200 to +200 range to 0-100
            normalized = (float(cci.iloc[-1]) + 200) / 4
            return max(0, min(100, normalized))
            
        except Exception:
            return 50
