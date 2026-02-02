# data/fetchers/base.py
"""
Base class for all data fetchers
"""

from abc import ABC, abstractmethod
from typing import Optional
import pandas as pd
from loguru import logger


class BaseFetcher(ABC):
    """Abstract base class for market data fetchers"""
    
    def __init__(self, name: str):
        self.name = name
        self._cache = {}
        logger.info(f"Initialized {name} fetcher")
    
    @abstractmethod
    def fetch(self, symbol: str, timeframe: str = 'D', 
              start: Optional[str] = None, end: Optional[str] = None) -> pd.DataFrame:
        """
        Fetch OHLCV data for a symbol
        
        Args:
            symbol: Asset symbol
            timeframe: 'M' (monthly), 'W' (weekly), 'D' (daily), '4H', '1H', '15M'
            start: Start date (YYYY-MM-DD)
            end: End date (YYYY-MM-DD)
            
        Returns:
            DataFrame with columns: open, high, low, close, volume
        """
        pass
    
    @abstractmethod
    def is_available(self) -> bool:
        """Check if the data source is available"""
        pass
    
    def _validate_data(self, df: pd.DataFrame, symbol: str) -> pd.DataFrame:
        """Validate and clean fetched data"""
        if df is None or df.empty:
            logger.warning(f"No data returned for {symbol}")
            return pd.DataFrame()
        
        # Ensure required columns
        required_cols = ['open', 'high', 'low', 'close', 'volume']
        df.columns = [c.lower() for c in df.columns]
        
        for col in required_cols:
            if col not in df.columns:
                logger.warning(f"Missing column {col} for {symbol}")
                df[col] = 0
        
        # Remove NaN
        df = df.dropna()
        
        # Sort by date
        if isinstance(df.index, pd.DatetimeIndex):
            df = df.sort_index()
        
        return df[required_cols]
    
    def _get_cached(self, key: str) -> Optional[pd.DataFrame]:
        """Get cached data if available and fresh"""
        return self._cache.get(key)
    
    def _set_cache(self, key: str, data: pd.DataFrame):
        """Cache data"""
        self._cache[key] = data
