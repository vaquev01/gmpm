# data/fetchers/macro.py
"""
Macroeconomic data fetcher using FRED API
"""

from typing import Optional, Dict, Any
from datetime import datetime, timedelta
import pandas as pd
from loguru import logger

try:
    from fredapi import Fred
    FRED_AVAILABLE = True
except ImportError:
    FRED_AVAILABLE = False
    logger.warning("fredapi not installed. Run: pip install fredapi")

from .base import BaseFetcher
from config.settings import FRED_API_KEY


# Key FRED Series for macro analysis
FRED_SERIES = {
    # Inflation
    'CPI': 'CPIAUCSL',           # Consumer Price Index
    'CORE_CPI': 'CPILFESL',      # Core CPI
    'PCE': 'PCEPI',              # Personal Consumption Expenditures
    'CORE_PCE': 'PCEPILFE',      # Core PCE
    'PPI': 'PPIACO',             # Producer Price Index
    
    # Growth
    'GDP': 'GDP',                 # Gross Domestic Product
    'REAL_GDP': 'GDPC1',         # Real GDP
    'GDP_GROWTH': 'A191RL1Q225SBEA', # GDP Growth Rate
    
    # Employment
    'UNEMPLOYMENT': 'UNRATE',     # Unemployment Rate
    'NFP': 'PAYEMS',             # Non-Farm Payrolls
    'INITIAL_CLAIMS': 'ICSA',    # Initial Jobless Claims
    
    # Interest Rates
    'FED_FUNDS': 'FEDFUNDS',     # Fed Funds Rate
    'TREASURY_3M': 'TB3MS',      # 3-Month Treasury
    'TREASURY_2Y': 'DGS2',       # 2-Year Treasury
    'TREASURY_10Y': 'DGS10',     # 10-Year Treasury
    'TREASURY_30Y': 'DGS30',     # 30-Year Treasury
    
    # Yield Curves
    'YIELD_CURVE_10Y2Y': 'T10Y2Y',  # 10Y-2Y Spread
    'YIELD_CURVE_10Y3M': 'T10Y3M',  # 10Y-3M Spread
    
    # Credit
    'BAA_SPREAD': 'BAAFFM',      # BAA Corporate Bond Spread
    'AAA_SPREAD': 'AAAFF',       # AAA Corporate Bond Spread
    'HY_SPREAD': 'BAMLH0A0HYM2', # High Yield Spread
    
    # Money Supply
    'M2': 'M2SL',                # M2 Money Supply
    'M2_VELOCITY': 'M2V',        # M2 Velocity
    
    # Housing
    'HOUSING_STARTS': 'HOUST',   # Housing Starts
    'EXISTING_HOME_SALES': 'EXHOSLUSM495S',
    
    # Consumer
    'CONSUMER_SENTIMENT': 'UMCSENT',  # UMich Consumer Sentiment
    'RETAIL_SALES': 'RSAFS',     # Retail Sales
    
    # Manufacturing
    'ISM_PMI': 'MANEMP',         # ISM Manufacturing Employment (proxy)
    'INDUSTRIAL_PRODUCTION': 'INDPRO',
    'CAPACITY_UTILIZATION': 'TCU',
    
    # Dollar
    'DOLLAR_INDEX': 'DTWEXBGS',  # Trade Weighted Dollar Index
}


class MacroFetcher(BaseFetcher):
    """Fetches macroeconomic data from FRED"""
    
    def __init__(self):
        super().__init__("FRED")
        self.fred = None
        if FRED_AVAILABLE and FRED_API_KEY:
            try:
                self.fred = Fred(api_key=FRED_API_KEY)
            except Exception as e:
                logger.warning(f"Could not initialize FRED: {e}")
    
    def is_available(self) -> bool:
        return FRED_AVAILABLE and self.fred is not None
    
    def fetch(self, series_id: str, timeframe: str = 'D',
              start: Optional[str] = None, end: Optional[str] = None) -> pd.DataFrame:
        """
        Fetch a FRED series
        
        Args:
            series_id: FRED series ID (e.g., 'CPIAUCSL')
            timeframe: Not used for FRED (data is at native frequency)
            start: Start date
            end: End date
        """
        if not self.is_available():
            logger.warning("FRED not available")
            return pd.DataFrame()
        
        try:
            # Default dates
            if start is None:
                start = (datetime.now() - timedelta(days=365 * 5)).strftime('%Y-%m-%d')
            if end is None:
                end = datetime.now().strftime('%Y-%m-%d')
            
            series = self.fred.get_series(series_id, start, end)
            
            if series is None or series.empty:
                logger.warning(f"No data for {series_id}")
                return pd.DataFrame()
            
            df = pd.DataFrame({'value': series})
            df.index.name = 'date'
            
            return df
            
        except Exception as e:
            logger.error(f"Error fetching {series_id}: {e}")
            return pd.DataFrame()
    
    def fetch_all(self) -> Dict[str, pd.DataFrame]:
        """Fetch all configured FRED series"""
        data = {}
        
        for name, series_id in FRED_SERIES.items():
            df = self.fetch(series_id)
            if not df.empty:
                data[name] = df
                logger.debug(f"Fetched {name} ({series_id})")
        
        return data
    
    def get_latest_values(self) -> Dict[str, float]:
        """Get latest value for each series"""
        latest = {}
        all_data = self.fetch_all()
        
        for name, df in all_data.items():
            if not df.empty:
                latest[name] = df['value'].iloc[-1]
        
        return latest
    
    def calculate_macro_indicators(self) -> Dict[str, Any]:
        """Calculate derived macro indicators"""
        latest = self.get_latest_values()
        
        indicators = {
            # Inflation regime
            'inflation_level': latest.get('CPI', 0),
            'core_inflation': latest.get('CORE_CPI', 0),
            'inflation_trend': self._calculate_trend('CPI'),
            
            # Growth regime
            'gdp_growth': latest.get('GDP_GROWTH', 0),
            'unemployment': latest.get('UNEMPLOYMENT', 0),
            
            # Rates
            'fed_funds': latest.get('FED_FUNDS', 0),
            'yield_curve': latest.get('YIELD_CURVE_10Y2Y', 0),
            
            # Credit
            'credit_spread': latest.get('HY_SPREAD', 0),
            
            # Sentiment
            'consumer_sentiment': latest.get('CONSUMER_SENTIMENT', 0),
        }
        
        return indicators
    
    def _calculate_trend(self, name: str, periods: int = 6) -> str:
        """Calculate trend direction for a series"""
        df = self.fetch(FRED_SERIES.get(name, ''))
        if df.empty or len(df) < periods:
            return 'UNKNOWN'
        
        recent = df['value'].tail(periods)
        if recent.iloc[-1] > recent.iloc[0]:
            return 'RISING'
        elif recent.iloc[-1] < recent.iloc[0]:
            return 'FALLING'
        else:
            return 'FLAT'
