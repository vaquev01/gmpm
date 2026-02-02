# features/fractal/hurst.py
"""
Hurst Exponent - Measures long-term memory of time series
H > 0.5 = trending (persistent)
H < 0.5 = mean-reverting (anti-persistent)
H = 0.5 = random walk
"""

from typing import Dict
import pandas as pd
import numpy as np
from loguru import logger


class HurstFeatures:
    """Calculate Hurst exponent and related fractal features"""
    
    def calculate(self, ohlcv: pd.DataFrame) -> Dict[str, float]:
        """Calculate Hurst-based features"""
        features = {}
        
        try:
            close = ohlcv['close']
            
            # Hurst Exponent
            hurst = self._calculate_hurst(close)
            features['hurst_exponent'] = hurst
            
            # Normalize to 0-100 (0.3 = 0, 0.5 = 50, 0.7 = 100)
            features['hurst_normalized'] = max(0, min(100, (hurst - 0.3) * 250))
            
            # Trend/Mean-Reversion indicator
            if hurst > 0.55:
                features['market_type'] = 100  # Trending
            elif hurst < 0.45:
                features['market_type'] = 0    # Mean-reverting
            else:
                features['market_type'] = 50   # Random
            
            # Fractal Dimension (related to Hurst: D = 2 - H)
            features['fractal_dimension'] = 2 - hurst
            # D ≈ 1 = smooth trend, D ≈ 2 = choppy
            features['fractal_dimension_normalized'] = (features['fractal_dimension'] - 1) * 100
            
            # R/S analysis based confidence
            features['rs_confidence'] = self._calculate_rs_confidence(close)
            
        except Exception as e:
            logger.error(f"Error calculating Hurst features: {e}")
            features = {
                'hurst_exponent': 0.5,
                'hurst_normalized': 50,
                'market_type': 50,
                'fractal_dimension': 1.5,
                'fractal_dimension_normalized': 50,
                'rs_confidence': 50
            }
        
        return features
    
    def _calculate_hurst(self, series: pd.Series, min_periods: int = 20) -> float:
        """
        Calculate Hurst exponent using R/S analysis
        """
        try:
            ts = series.dropna().values
            if len(ts) < min_periods * 2:
                return 0.5
            
            # Use multiple sub-series lengths
            max_k = min(len(ts) // 2, 100)
            lags = range(min_periods, max_k)
            
            rs_values = []
            ns = []
            
            for lag in lags:
                # Split into sub-series
                sub_series_count = len(ts) // lag
                if sub_series_count < 2:
                    continue
                
                rs_list = []
                for i in range(sub_series_count):
                    sub = ts[i * lag:(i + 1) * lag]
                    
                    # Calculate R/S
                    mean = np.mean(sub)
                    deviations = sub - mean
                    cumdev = np.cumsum(deviations)
                    
                    R = np.max(cumdev) - np.min(cumdev)
                    S = np.std(sub, ddof=1)
                    
                    if S > 0:
                        rs_list.append(R / S)
                
                if rs_list:
                    rs_values.append(np.mean(rs_list))
                    ns.append(lag)
            
            if len(rs_values) < 3:
                return 0.5
            
            # Log-log regression
            log_n = np.log(ns)
            log_rs = np.log(rs_values)
            
            # Hurst = slope of log(R/S) vs log(n)
            slope, _ = np.polyfit(log_n, log_rs, 1)
            
            # Clamp to valid range
            return max(0.0, min(1.0, slope))
            
        except Exception as e:
            logger.debug(f"Hurst calculation error: {e}")
            return 0.5
    
    def _calculate_rs_confidence(self, series: pd.Series) -> float:
        """Calculate confidence in R/S analysis based on data quality"""
        try:
            n = len(series.dropna())
            # More data = higher confidence (max at ~500 points)
            return min(100, n / 5)
        except Exception:
            return 50
