# features/technical/trend.py
"""
Trend Features - Moving averages, trend strength, direction
"""

from typing import Dict
import pandas as pd
import numpy as np
from loguru import logger


class TrendFeatures:
    """Calculate trend-based features"""
    
    def calculate(self, ohlcv: pd.DataFrame) -> Dict[str, float]:
        """Calculate all trend features"""
        features = {}
        
        try:
            close = ohlcv['close']
            high = ohlcv['high']
            low = ohlcv['low']
            
            # Moving Averages
            sma_20 = close.rolling(20).mean()
            sma_50 = close.rolling(50).mean()
            sma_200 = close.rolling(200).mean() if len(close) >= 200 else close.rolling(len(close)).mean()
            
            ema_9 = close.ewm(span=9).mean()
            ema_21 = close.ewm(span=21).mean()
            
            # Price vs MAs (normalized 0-100)
            features['price_vs_sma20'] = self._normalize_distance(close.iloc[-1], sma_20.iloc[-1])
            features['price_vs_sma50'] = self._normalize_distance(close.iloc[-1], sma_50.iloc[-1])
            features['price_vs_sma200'] = self._normalize_distance(close.iloc[-1], sma_200.iloc[-1])
            
            # MA Alignment (bullish = all aligned up)
            ma_alignment = 0
            if close.iloc[-1] > ema_9.iloc[-1]: ma_alignment += 25
            if ema_9.iloc[-1] > ema_21.iloc[-1]: ma_alignment += 25
            if close.iloc[-1] > sma_50.iloc[-1]: ma_alignment += 25
            if sma_50.iloc[-1] > sma_200.iloc[-1]: ma_alignment += 25
            features['ma_alignment'] = ma_alignment
            
            # ADX - Trend Strength
            features['adx'] = self._calculate_adx(ohlcv)
            
            # Trend Direction (simple: HH/HL vs LH/LL)
            features['trend_direction'] = self._calculate_trend_direction(close)
            
            # Linear Regression Slope (normalized)
            features['lr_slope'] = self._calculate_lr_slope(close, 20)
            
            # Donchian Channel Position
            dc_high = high.rolling(20).max()
            dc_low = low.rolling(20).min()
            dc_range = dc_high - dc_low
            features['donchian_position'] = ((close.iloc[-1] - dc_low.iloc[-1]) / dc_range.iloc[-1] * 100) if dc_range.iloc[-1] > 0 else 50
            
        except Exception as e:
            logger.error(f"Error calculating trend features: {e}")
            features = {
                'price_vs_sma20': 50, 'price_vs_sma50': 50, 'price_vs_sma200': 50,
                'ma_alignment': 50, 'adx': 25, 'trend_direction': 50,
                'lr_slope': 50, 'donchian_position': 50
            }
        
        return features
    
    def _normalize_distance(self, price: float, ma: float) -> float:
        """Normalize price distance from MA to 0-100"""
        if ma == 0:
            return 50
        pct_diff = (price - ma) / ma * 100
        # Clamp to -10% to +10% range, then scale to 0-100
        return max(0, min(100, (pct_diff + 10) * 5))
    
    def _calculate_adx(self, ohlcv: pd.DataFrame, period: int = 14) -> float:
        """Calculate ADX"""
        try:
            high = ohlcv['high']
            low = ohlcv['low']
            close = ohlcv['close']
            
            # True Range
            tr = pd.concat([
                high - low,
                (high - close.shift(1)).abs(),
                (low - close.shift(1)).abs()
            ], axis=1).max(axis=1)
            
            # Directional Movement
            up_move = high - high.shift(1)
            down_move = low.shift(1) - low
            
            plus_dm = np.where((up_move > down_move) & (up_move > 0), up_move, 0)
            minus_dm = np.where((down_move > up_move) & (down_move > 0), down_move, 0)
            
            atr = tr.rolling(period).mean()
            plus_di = 100 * pd.Series(plus_dm).rolling(period).mean() / atr
            minus_di = 100 * pd.Series(minus_dm).rolling(period).mean() / atr
            
            dx = 100 * (plus_di - minus_di).abs() / (plus_di + minus_di)
            adx = dx.rolling(period).mean()
            
            return float(adx.iloc[-1]) if not pd.isna(adx.iloc[-1]) else 25
            
        except Exception:
            return 25
    
    def _calculate_trend_direction(self, close: pd.Series, lookback: int = 20) -> float:
        """Calculate trend direction based on HH/HL pattern"""
        try:
            recent = close.tail(lookback)
            
            # Simple: compare recent high/lows
            highs = recent.rolling(5).max()
            lows = recent.rolling(5).min()
            
            higher_highs = highs.iloc[-1] > highs.iloc[-10] if len(highs) >= 10 else False
            higher_lows = lows.iloc[-1] > lows.iloc[-10] if len(lows) >= 10 else False
            
            if higher_highs and higher_lows:
                return 100  # Bullish
            elif not higher_highs and not higher_lows:
                return 0    # Bearish
            else:
                return 50   # Mixed
                
        except Exception:
            return 50
    
    def _calculate_lr_slope(self, close: pd.Series, period: int = 20) -> float:
        """Calculate linear regression slope (normalized)"""
        try:
            y = close.tail(period).values
            x = np.arange(len(y))
            slope = np.polyfit(x, y, 1)[0]
            
            # Normalize slope relative to price
            pct_slope = slope / close.iloc[-1] * 100
            return max(0, min(100, (pct_slope + 1) * 50))
            
        except Exception:
            return 50
