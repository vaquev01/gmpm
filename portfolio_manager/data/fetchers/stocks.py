# data/fetchers/stocks.py
"""
Stock/ETF/Index data fetcher using Yahoo Finance
"""

from typing import Optional
from datetime import datetime, timedelta
import pandas as pd
from loguru import logger

try:
    import yfinance as yf
    YFINANCE_AVAILABLE = True
except ImportError:
    YFINANCE_AVAILABLE = False
    logger.warning("yfinance not installed. Run: pip install yfinance")

from .base import BaseFetcher


class StockFetcher(BaseFetcher):
    """Fetches stock, ETF, and index data from Yahoo Finance"""
    
    # Timeframe mapping
    TIMEFRAME_MAP = {
        'M': '1mo',
        'W': '1wk',
        'D': '1d',
        '4H': '1h',  # Will resample
        '1H': '1h',
        '15M': '15m',
    }
    
    def __init__(self):
        super().__init__("Yahoo Finance")
    
    def is_available(self) -> bool:
        return YFINANCE_AVAILABLE
    
    def fetch(self, symbol: str, timeframe: str = 'D',
              start: Optional[str] = None, end: Optional[str] = None) -> pd.DataFrame:
        """
        Fetch stock/ETF/index data from Yahoo Finance
        
        Args:
            symbol: Ticker symbol (e.g., 'AAPL', 'SPY', '^GSPC')
            timeframe: 'M', 'W', 'D', '4H', '1H', '15M'
            start: Start date
            end: End date
        """
        if not self.is_available():
            logger.error("yfinance not available")
            return pd.DataFrame()
        
        try:
            # Default date range
            if end is None:
                end = datetime.now().strftime('%Y-%m-%d')
            if start is None:
                # Get enough history
                start = (datetime.now() - timedelta(days=365 * 2)).strftime('%Y-%m-%d')
            
            yf_interval = self.TIMEFRAME_MAP.get(timeframe, '1d')
            
            ticker = yf.Ticker(symbol)
            df = ticker.history(start=start, end=end, interval=yf_interval)
            
            if df.empty:
                logger.warning(f"No data for {symbol}")
                return pd.DataFrame()
            
            # Rename columns to lowercase
            df.columns = [c.lower() for c in df.columns]
            
            # Handle 4H resampling if needed
            if timeframe == '4H' and yf_interval == '1h':
                df = self._resample_to_4h(df)
            
            return self._validate_data(df, symbol)
            
        except Exception as e:
            logger.error(f"Error fetching {symbol}: {e}")
            return pd.DataFrame()
    
    def _resample_to_4h(self, df: pd.DataFrame) -> pd.DataFrame:
        """Resample 1H data to 4H"""
        return df.resample('4H').agg({
            'open': 'first',
            'high': 'max',
            'low': 'min',
            'close': 'last',
            'volume': 'sum'
        }).dropna()
    
    def fetch_multiple(self, symbols: list, timeframe: str = 'D') -> dict:
        """Fetch data for multiple symbols"""
        data = {}
        for symbol in symbols:
            df = self.fetch(symbol, timeframe)
            if not df.empty:
                data[symbol] = df
        return data
