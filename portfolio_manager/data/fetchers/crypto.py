# data/fetchers/crypto.py
"""
Cryptocurrency data fetcher using CCXT (Binance)
"""

from typing import Optional
from datetime import datetime, timedelta
import pandas as pd
from loguru import logger

try:
    import ccxt
    CCXT_AVAILABLE = True
except ImportError:
    CCXT_AVAILABLE = False
    logger.warning("ccxt not installed. Run: pip install ccxt")

from .base import BaseFetcher
from config.settings import BINANCE_API_KEY, BINANCE_SECRET


class CryptoFetcher(BaseFetcher):
    """Fetches cryptocurrency data from Binance"""
    
    TIMEFRAME_MAP = {
        'M': '1M',
        'W': '1w',
        'D': '1d',
        '4H': '4h',
        '1H': '1h',
        '15M': '15m',
    }
    
    def __init__(self):
        super().__init__("Binance")
        self.exchange = None
        if CCXT_AVAILABLE:
            try:
                self.exchange = ccxt.binance({
                    'apiKey': BINANCE_API_KEY,
                    'secret': BINANCE_SECRET,
                    'enableRateLimit': True,
                })
            except Exception as e:
                logger.warning(f"Could not initialize Binance: {e}")
    
    def is_available(self) -> bool:
        return CCXT_AVAILABLE and self.exchange is not None
    
    def fetch(self, symbol: str, timeframe: str = 'D',
              start: Optional[str] = None, end: Optional[str] = None) -> pd.DataFrame:
        """
        Fetch crypto OHLCV data from Binance
        
        Args:
            symbol: Trading pair (e.g., 'BTC/USDT')
            timeframe: 'M', 'W', 'D', '4H', '1H', '15M'
            start: Start date
            end: End date
        """
        if not self.is_available():
            logger.warning("Binance exchange not available")
            return pd.DataFrame()
        
        try:
            ccxt_tf = self.TIMEFRAME_MAP.get(timeframe, '1d')
            
            # Calculate since timestamp
            if start:
                since = int(datetime.strptime(start, '%Y-%m-%d').timestamp() * 1000)
            else:
                since = int((datetime.now() - timedelta(days=365)).timestamp() * 1000)
            
            # Fetch OHLCV
            ohlcv = self.exchange.fetch_ohlcv(symbol, ccxt_tf, since=since, limit=1000)
            
            if not ohlcv:
                logger.warning(f"No data for {symbol}")
                return pd.DataFrame()
            
            # Convert to DataFrame
            df = pd.DataFrame(ohlcv, columns=['timestamp', 'open', 'high', 'low', 'close', 'volume'])
            df['timestamp'] = pd.to_datetime(df['timestamp'], unit='ms')
            df.set_index('timestamp', inplace=True)
            
            return self._validate_data(df, symbol)
            
        except Exception as e:
            logger.error(f"Error fetching {symbol}: {e}")
            return pd.DataFrame()
    
    def fetch_multiple(self, symbols: list, timeframe: str = 'D') -> dict:
        """Fetch data for multiple symbols"""
        data = {}
        for symbol in symbols:
            df = self.fetch(symbol, timeframe)
            if not df.empty:
                data[symbol] = df
        return data
