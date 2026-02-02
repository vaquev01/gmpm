# features/fractal/smc.py
"""
Smart Money Concepts (SMC) Features
- Order Blocks
- Fair Value Gaps
- Break of Structure
- Liquidity Zones
"""

from typing import Dict, List, Tuple
import pandas as pd
import numpy as np
from loguru import logger


class SMCFeatures:
    """Calculate Smart Money Concepts features"""
    
    def calculate(self, ohlcv: pd.DataFrame) -> Dict[str, float]:
        """Calculate all SMC features"""
        features = {}
        
        try:
            high = ohlcv['high'].values
            low = ohlcv['low'].values
            close = ohlcv['close'].values
            open_ = ohlcv['open'].values
            
            current_price = close[-1]
            
            # Order Blocks
            bull_ob, bear_ob = self._find_order_blocks(open_, high, low, close)
            features['order_block_bull'] = self._normalize_distance(current_price, bull_ob)
            features['order_block_bear'] = self._normalize_distance(current_price, bear_ob)
            features['ob_proximity'] = self._ob_proximity_score(current_price, bull_ob, bear_ob)
            
            # Fair Value Gaps
            fvg_up, fvg_down = self._find_fvgs(high, low)
            features['fvg_up'] = self._normalize_distance(current_price, fvg_up)
            features['fvg_down'] = self._normalize_distance(current_price, fvg_down)
            features['fvg_bias'] = 100 if fvg_up and fvg_up < current_price else (0 if fvg_down and fvg_down > current_price else 50)
            
            # Break of Structure
            features['bos_bullish'] = self._detect_bos(high, low, 'bullish')
            features['bos_bearish'] = self._detect_bos(high, low, 'bearish')
            features['structure_bias'] = (features['bos_bullish'] * 0.5 + (100 - features['bos_bearish']) * 0.5)
            
            # Liquidity Zones (equal highs/lows)
            features['liquidity_above'] = self._find_liquidity(high, 'above', current_price)
            features['liquidity_below'] = self._find_liquidity(low, 'below', current_price)
            
            # Combined SMC Score
            features['smc_score'] = (
                features['ob_proximity'] * 0.25 +
                features['fvg_bias'] * 0.25 +
                features['structure_bias'] * 0.30 +
                (features['liquidity_above'] + features['liquidity_below']) / 2 * 0.20
            )
            
        except Exception as e:
            logger.error(f"Error calculating SMC features: {e}")
            features = {
                'order_block_bull': 50, 'order_block_bear': 50, 'ob_proximity': 50,
                'fvg_up': 50, 'fvg_down': 50, 'fvg_bias': 50,
                'bos_bullish': 50, 'bos_bearish': 50, 'structure_bias': 50,
                'liquidity_above': 50, 'liquidity_below': 50, 'smc_score': 50
            }
        
        return features
    
    def _find_order_blocks(self, open_: np.ndarray, high: np.ndarray, 
                           low: np.ndarray, close: np.ndarray, 
                           lookback: int = 50) -> Tuple[float, float]:
        """
        Find bullish and bearish order blocks
        OB = last candle before a strong move
        """
        bull_ob = None
        bear_ob = None
        
        try:
            for i in range(-lookback, -3):
                # Check for strong bullish move after candle
                if close[i+2] > high[i] * 1.01:  # 1% move
                    # This is a bullish OB (the low of the candle before the move)
                    bull_ob = low[i]
                
                # Check for strong bearish move
                if close[i+2] < low[i] * 0.99:
                    # Bearish OB (the high of the candle before the move)
                    bear_ob = high[i]
        except Exception:
            pass
        
        return bull_ob, bear_ob
    
    def _find_fvgs(self, high: np.ndarray, low: np.ndarray, 
                   lookback: int = 30) -> Tuple[float, float]:
        """
        Find Fair Value Gaps (imbalances)
        FVG up: low[i] > high[i-2]
        FVG down: high[i] < low[i-2]
        """
        fvg_up = None
        fvg_down = None
        
        try:
            for i in range(-lookback, -2):
                # Bullish FVG
                if low[i+2] > high[i]:
                    gap_midpoint = (low[i+2] + high[i]) / 2
                    fvg_up = gap_midpoint
                
                # Bearish FVG
                if high[i+2] < low[i]:
                    gap_midpoint = (high[i+2] + low[i]) / 2
                    fvg_down = gap_midpoint
        except Exception:
            pass
        
        return fvg_up, fvg_down
    
    def _detect_bos(self, high: np.ndarray, low: np.ndarray, 
                    direction: str, lookback: int = 20) -> float:
        """
        Detect Break of Structure
        Bullish BOS: Higher High after Higher Low
        Bearish BOS: Lower Low after Lower High
        """
        try:
            recent_high = high[-lookback:]
            recent_low = low[-lookback:]
            
            if direction == 'bullish':
                # Check for HH/HL pattern
                swing_highs = self._find_swing_points(recent_high, 'high')
                swing_lows = self._find_swing_points(recent_low, 'low')
                
                if len(swing_highs) >= 2 and len(swing_lows) >= 2:
                    if swing_highs[-1] > swing_highs[-2] and swing_lows[-1] > swing_lows[-2]:
                        return 100
                    elif swing_highs[-1] > swing_highs[-2]:
                        return 75
                return 25
                
            else:  # bearish
                swing_highs = self._find_swing_points(recent_high, 'high')
                swing_lows = self._find_swing_points(recent_low, 'low')
                
                if len(swing_highs) >= 2 and len(swing_lows) >= 2:
                    if swing_lows[-1] < swing_lows[-2] and swing_highs[-1] < swing_highs[-2]:
                        return 100
                    elif swing_lows[-1] < swing_lows[-2]:
                        return 75
                return 25
                
        except Exception:
            return 50
    
    def _find_swing_points(self, arr: np.ndarray, point_type: str, 
                           window: int = 5) -> List[float]:
        """Find swing highs or lows"""
        swings = []
        for i in range(window, len(arr) - window):
            if point_type == 'high':
                if arr[i] == max(arr[i-window:i+window+1]):
                    swings.append(arr[i])
            else:
                if arr[i] == min(arr[i-window:i+window+1]):
                    swings.append(arr[i])
        return swings
    
    def _find_liquidity(self, arr: np.ndarray, direction: str, 
                        current_price: float, lookback: int = 50) -> float:
        """
        Find liquidity zones (equal highs/lows where stops likely cluster)
        """
        try:
            recent = arr[-lookback:]
            
            # Find clusters of similar prices (potential stop zones)
            tolerance = np.std(recent) * 0.1
            
            clusters = []
            for i, price in enumerate(recent):
                similar_count = np.sum(np.abs(recent - price) < tolerance)
                if similar_count >= 3:  # At least 3 touches
                    clusters.append(price)
            
            if not clusters:
                return 50
            
            if direction == 'above':
                above = [p for p in clusters if p > current_price]
                if above:
                    nearest = min(above)
                    distance_pct = (nearest - current_price) / current_price * 100
                    # Closer = higher score
                    return max(0, 100 - distance_pct * 20)
            else:
                below = [p for p in clusters if p < current_price]
                if below:
                    nearest = max(below)
                    distance_pct = (current_price - nearest) / current_price * 100
                    return max(0, 100 - distance_pct * 20)
            
            return 50
            
        except Exception:
            return 50
    
    def _normalize_distance(self, current: float, level: float) -> float:
        """Normalize distance from level to 0-100"""
        if level is None:
            return 50
        try:
            pct_diff = (level - current) / current * 100
            # -5% to +5% maps to 0-100
            return max(0, min(100, (pct_diff + 5) * 10))
        except Exception:
            return 50
    
    def _ob_proximity_score(self, price: float, bull_ob: float, bear_ob: float) -> float:
        """Calculate how close price is to order blocks"""
        if bull_ob is None and bear_ob is None:
            return 50
        
        try:
            bull_dist = abs(price - bull_ob) / price * 100 if bull_ob else 100
            bear_dist = abs(price - bear_ob) / price * 100 if bear_ob else 100
            
            if bull_dist < bear_dist:
                return max(0, 100 - bull_dist * 10)  # Near bullish OB = high score
            else:
                return max(0, 100 - bear_dist * 10)
        except Exception:
            return 50
