# data/fetchers/macro.py
"""
Macroeconomic data fetcher using FRED API
"""

from typing import Optional, Dict, Any
from datetime import datetime, timedelta
import pandas as pd
import numpy as np
from pandas.tseries.offsets import DateOffset
from loguru import logger

try:
    from fredapi import Fred
    FRED_AVAILABLE = True
except ImportError:
    FRED_AVAILABLE = False
    logger.warning("fredapi not installed. Run: pip install fredapi")

try:
    import yfinance as yf
    YFINANCE_AVAILABLE = True
except ImportError:
    YFINANCE_AVAILABLE = False

from .base import BaseFetcher
from config.settings import FRED_API_KEY


MACRO_SCHEMA_VERSION = "2.0"


def _domain_for_series(name: str) -> str:
    n = (name or "").upper()

    if n in {'CPI', 'CORE_CPI', 'PCE', 'CORE_PCE', 'PPI'} or 'BREAKEVEN' in n or 'TIPS' in n or 'INFLATION' in n:
        return 'inflation'

    if n in {'GDP', 'REAL_GDP', 'GDP_GROWTH'} or 'INDUSTRIAL' in n or 'RETAIL' in n or 'PMI' in n or 'HOUSING' in n or 'CAPACITY' in n or 'ORDERS' in n:
        return 'growth'

    if n in {'UNEMPLOYMENT', 'NFP', 'INITIAL_CLAIMS', 'CONTINUING_CLAIMS', 'JOLTS_OPENINGS', 'PARTICIPATION', 'AVG_HOURLY_EARNINGS', 'PERSONAL_SAVING_RATE'} or 'WAGE' in n or 'EARN' in n:
        return 'labor'

    if 'TREASURY' in n or 'YIELD_CURVE' in n or n in {'FED_FUNDS', 'EFFR', 'SOFR'} or 'MORTGAGE' in n:
        return 'rates'

    if n in {'M2', 'M2_VELOCITY', 'FED_BALANCE_SHEET', 'RRP'} or 'LIQUID' in n or 'RESERV' in n:
        return 'liquidity'

    if 'SPREAD' in n or 'CREDIT' in n:
        return 'credit'

    if 'DOLLAR' in n or 'USD' in n or 'FX' in n:
        return 'fx'

    if 'OIL' in n or 'WTI' in n or 'GOLD' in n or 'COPPER' in n or 'COMMOD' in n:
        return 'commodities'

    if n in {'VIX', 'SP500'} or 'EQUITY' in n or 'VOL' in n or 'STRESS' in n or 'FCI' in n:
        return 'markets'

    return 'other'


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

    # Financial Conditions / Stress
    'FINANCIAL_STRESS_INDEX': 'STLFSI4',
    'NFCI': 'NFCI',
    'ANFCI': 'ANFCI',

    # Policy / Funding
    'EFFR': 'EFFR',
    'SOFR': 'SOFR',

    # Balance sheet / Liquidity plumbing
    'FED_BALANCE_SHEET': 'WALCL',
    'RRP': 'RRPONTSYD',

    # Inflation expectations
    'BREAKEVEN_5Y': 'T5YIE',
    'BREAKEVEN_10Y': 'T10YIE',

    # Markets
    'SP500': 'SP500',
    'VIX_FRED': 'VIXCLS',

    # Commodities
    'WTI_OIL': 'DCOILWTICO',
    'COPPER': 'PCOPPUSDM',

    # Housing / Consumer finance
    'MORTGAGE_30Y': 'MORTGAGE30US',
    'MORTGAGE_15Y': 'MORTGAGE15US',
    'PERSONAL_SAVING_RATE': 'PSAVERT',

    # Labor market depth
    'CONTINUING_CLAIMS': 'CCSA',
    'JOLTS_OPENINGS': 'JTSJOL',
    'PARTICIPATION': 'CIVPART',
    'AVG_HOURLY_EARNINGS': 'CES0500000003',
}


class MacroFetcher(BaseFetcher):
    """Fetches macroeconomic data from FRED"""
    
    def __init__(self):
        super().__init__("FRED")
        self.fred = None
        self._series_info_cache: Dict[str, Dict[str, Any]] = {}
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

            cache_key = f"{self.name}:{series_id}:{start}:{end}"
            cached = self._get_cached(cache_key)
            if isinstance(cached, pd.DataFrame) and not cached.empty:
                return cached
            
            series = self.fred.get_series(series_id, start, end)
            
            if series is None or series.empty:
                logger.warning(f"No data for {series_id}")
                return pd.DataFrame()
            
            df = pd.DataFrame({'value': series})
            df.index.name = 'date'

            try:
                if not df.empty:
                    self._set_cache(cache_key, df)
            except Exception:
                pass
            
            return df
            
        except Exception as e:
            msg = str(e)
            if 'series does not exist' in msg.lower() or 'bad request' in msg.lower():
                logger.warning(f"Error fetching {series_id}: {e}")
            else:
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
        cpi_yoy = self._calculate_yoy('CPI')
        core_cpi_yoy = self._calculate_yoy('CORE_CPI')
        hy_spread = self._latest_value('HY_SPREAD')
        credit_spread_bps = None
        if hy_spread is not None:
            credit_spread_bps = float(hy_spread * 100.0) if hy_spread < 50 else float(hy_spread)

        indicators = {
            'inflation_level': float(cpi_yoy) if cpi_yoy is not None else 0.0,
            'core_inflation': float(core_cpi_yoy) if core_cpi_yoy is not None else 0.0,
            'inflation_trend': self._calculate_trend('CPI'),
            'gdp_growth': float(self._latest_value('GDP_GROWTH') or 0.0),
            'unemployment': float(self._latest_value('UNEMPLOYMENT') or 0.0),
            'fed_funds': float(self._latest_value('FED_FUNDS') or 0.0),
            'yield_curve': float(self._latest_value('YIELD_CURVE_10Y2Y') or 0.0),
            'credit_spread': float(credit_spread_bps or 0.0),
            'consumer_sentiment': float(self._latest_value('CONSUMER_SENTIMENT') or 0.0),
        }

        return indicators

    def get_macro_snapshot(self, lookback_days: int = 365 * 2, timeseries_days: int = 180) -> Dict[str, Any]:
        now = datetime.now()
        snapshot: Dict[str, Any] = {
            'schema_version': MACRO_SCHEMA_VERSION,
            'timestamp': now.isoformat(),
            'availability': {
                'fred_available': self.is_available(),
                'yfinance_available': YFINANCE_AVAILABLE,
                'bis_available': False,
                'imf_available': False,
                'eia_available': False,
                'osint_available': False,
            },
            'meta': {
                'country': 'US',
                'sources': ['FRED', 'YFINANCE'],
            },
            'quality': {},
            'domains': {},
            'series_meta': {},
            'raw_latest': {},
            'derived': {},
            'flat': {},
            'features': {},
            'timeseries': {},
            'missing': [],
        }

        start = (now - timedelta(days=lookback_days)).strftime('%Y-%m-%d')
        ts_start = (now - timedelta(days=timeseries_days * 2)).strftime('%Y-%m-%d')
        end = now.strftime('%Y-%m-%d')

        core_names = [
            'CPI',
            'CORE_CPI',
            'GDP_GROWTH',
            'UNEMPLOYMENT',
            'FED_FUNDS',
            'TREASURY_2Y',
            'TREASURY_10Y',
            'YIELD_CURVE_10Y2Y',
            'HY_SPREAD',
            'DOLLAR_INDEX',
            'CONSUMER_SENTIMENT',
        ]

        series_names = list(dict.fromkeys(core_names + sorted(FRED_SERIES.keys())))

        histories: Dict[str, pd.DataFrame] = {}

        if self.is_available():
            for name in series_names:
                series_id = FRED_SERIES.get(name)
                if not series_id:
                    snapshot['missing'].append(name)
                    continue

                info = self._get_series_info(series_id)
                frequency_short = info.get('frequency_short')
                staleness_threshold_days = self._staleness_threshold_days(frequency_short)
                domain = _domain_for_series(name)

                df = self.fetch(series_id, start=start, end=end)
                if df.empty:
                    snapshot['missing'].append(name)
                    snapshot['series_meta'][name] = {
                        'series_id': series_id,
                        'domain': domain,
                        'source': 'FRED',
                        'available': False,
                        'frequency': info.get('frequency'),
                        'frequency_short': frequency_short,
                        'units': info.get('units'),
                        'seasonal_adjustment': info.get('seasonal_adjustment'),
                        'seasonal_adjustment_short': info.get('seasonal_adjustment_short'),
                        'staleness_threshold_days': staleness_threshold_days,
                    }
                    continue

                histories[name] = df

                asof = df.index[-1]
                asof_str = asof.date().isoformat() if hasattr(asof, 'date') else str(asof)
                staleness_days = self._staleness_days(asof, now)

                value = self._safe_float(df['value'].iloc[-1])
                if value is None:
                    snapshot['missing'].append(name)
                    snapshot['series_meta'][name] = {
                        'series_id': series_id,
                        'domain': domain,
                        'source': 'FRED',
                        'available': False,
                        'frequency': info.get('frequency'),
                        'frequency_short': frequency_short,
                        'units': info.get('units'),
                        'seasonal_adjustment': info.get('seasonal_adjustment'),
                        'seasonal_adjustment_short': info.get('seasonal_adjustment_short'),
                        'staleness_threshold_days': staleness_threshold_days,
                        'staleness_days': staleness_days,
                        'asof': asof_str,
                    }
                    continue

                snapshot['raw_latest'][name] = {
                    'value': value,
                    'asof': asof_str,
                    'series_id': series_id,
                    'domain': domain,
                    'source': 'FRED',
                    'frequency_short': frequency_short,
                    'units': info.get('units'),
                }

                snapshot['series_meta'][name] = {
                    'series_id': series_id,
                    'domain': domain,
                    'source': 'FRED',
                    'available': True,
                    'frequency': info.get('frequency'),
                    'frequency_short': frequency_short,
                    'units': info.get('units'),
                    'seasonal_adjustment': info.get('seasonal_adjustment'),
                    'seasonal_adjustment_short': info.get('seasonal_adjustment_short'),
                    'staleness_threshold_days': staleness_threshold_days,
                    'staleness_days': staleness_days,
                    'asof': asof_str,
                }

                snapshot['flat'][name] = value

        vix_value = None
        vix_series = None
        if YFINANCE_AVAILABLE:
            try:
                vix_df = yf.Ticker('^VIX').history(start=ts_start, end=end, interval='1d')
                if not vix_df.empty and 'Close' in vix_df.columns:
                    vix_series = vix_df['Close'].dropna().astype(float)
                    vix_value = float(vix_series.iloc[-1]) if len(vix_series) else None
                    vix_asof = vix_series.index[-1] if len(vix_series) else None
                    if vix_value is not None:
                        vix_asof_str = vix_asof.date().isoformat() if hasattr(vix_asof, 'date') else str(vix_asof)
                        snapshot['raw_latest']['VIX'] = {
                            'value': vix_value,
                            'asof': vix_asof_str,
                            'series_id': '^VIX',
                            'domain': 'markets',
                            'source': 'YFINANCE',
                        }
                        snapshot['series_meta']['VIX'] = {
                            'series_id': '^VIX',
                            'domain': 'markets',
                            'source': 'YFINANCE',
                            'available': True,
                            'frequency_short': 'D',
                            'units': 'index',
                            'staleness_threshold_days': 5,
                            'staleness_days': self._staleness_days(vix_asof, now),
                            'asof': vix_asof_str,
                        }
                        snapshot['flat']['VIX'] = vix_value
                        snapshot['flat']['vix'] = vix_value
                        snapshot['timeseries']['VIX'] = self._format_timeseries(vix_series.tail(timeseries_days))
            except Exception as e:
                logger.debug(f"Could not fetch VIX: {e}")

        if YFINANCE_AVAILABLE:
            try:
                gold_tickers = ['GC=F', 'XAUUSD=X']
                gold_value = None
                gold_series = None
                gold_asof = None
                gold_used = None

                for t in gold_tickers:
                    df = yf.Ticker(t).history(start=ts_start, end=end, interval='1d')
                    if df.empty or 'Close' not in df.columns:
                        continue
                    s = df['Close'].dropna().astype(float)
                    if len(s) == 0:
                        continue
                    gold_series = s
                    gold_value = float(s.iloc[-1])
                    gold_asof = s.index[-1]
                    gold_used = t
                    break

                if gold_value is not None and gold_asof is not None:
                    gold_asof_str = gold_asof.date().isoformat() if hasattr(gold_asof, 'date') else str(gold_asof)
                    snapshot['raw_latest']['GOLD'] = {
                        'value': float(gold_value),
                        'asof': gold_asof_str,
                        'series_id': gold_used or 'GOLD',
                        'domain': 'commodities',
                        'source': 'YFINANCE',
                        'units': 'usd',
                    }
                    snapshot['series_meta']['GOLD'] = {
                        'series_id': gold_used or 'GOLD',
                        'domain': 'commodities',
                        'source': 'YFINANCE',
                        'available': True,
                        'frequency_short': 'D',
                        'units': 'usd',
                        'staleness_threshold_days': 5,
                        'staleness_days': self._staleness_days(gold_asof, now),
                        'asof': gold_asof_str,
                    }
                    snapshot['flat']['GOLD'] = float(gold_value)
                    snapshot['timeseries']['GOLD'] = self._format_timeseries(gold_series.tail(timeseries_days))
            except Exception as e:
                logger.debug(f"Could not fetch GOLD: {e}")

        derived = self._derive_from_histories(histories)
        snapshot['derived'].update(derived)
        snapshot['flat'].update({k: v for k, v in derived.items() if isinstance(v, (int, float, str))})

        hy_value = snapshot['flat'].get('HY_SPREAD')
        if isinstance(hy_value, (int, float)):
            snapshot['flat']['credit_spread'] = float(hy_value * 100.0) if hy_value < 50 else float(hy_value)

        if 'YIELD_CURVE_10Y2Y' in snapshot['flat']:
            snapshot['flat']['yield_curve'] = float(snapshot['flat']['YIELD_CURVE_10Y2Y'])

        if self.is_available():
            for name in [
                'YIELD_CURVE_10Y2Y',
                'HY_SPREAD',
                'DOLLAR_INDEX',
                'TREASURY_10Y',
                'FINANCIAL_STRESS_INDEX',
                'NFCI',
                'ANFCI',
                'SP500',
                'WTI_OIL',
                'COPPER',
            ]:
                df = histories.get(name)
                if df is None or df.empty:
                    continue
                s = df['value'].dropna().astype(float).tail(timeseries_days)
                snapshot['timeseries'][name] = self._format_timeseries(s)

        snapshot['derived'].update(self._build_changes(histories, snapshot.get('series_meta', {})))
        snapshot['derived'].update(self._build_stats(histories, vix_value=vix_value, vix_series=vix_series))

        snapshot['flat'].update({k: v for k, v in snapshot['derived'].items() if isinstance(v, (int, float, str))})

        snapshot['features'] = self._build_macro_features(histories, vix_value=vix_value, vix_series=vix_series)
        snapshot['flat'].update(snapshot['features'])

        domains: Dict[str, Dict[str, Any]] = {}
        for name, item in snapshot.get('raw_latest', {}).items():
            if not isinstance(item, dict):
                continue
            domain = item.get('domain') or _domain_for_series(name)
            domains.setdefault(domain, {'latest': {}, 'asof': {}})
            domains[domain]['latest'][name] = item.get('value')
            domains[domain]['asof'][name] = item.get('asof')

        snapshot['domains'] = domains
        snapshot['quality'] = {
            'missing_count': len(snapshot.get('missing', [])),
            'missing': snapshot.get('missing', []),
            'stale': self._stale_series(snapshot.get('series_meta', {})),
        }

        return snapshot

    def _get_series_info(self, series_id: str) -> Dict[str, Any]:
        if not series_id:
            return {}
        if series_id in self._series_info_cache:
            return self._series_info_cache[series_id]
        if not self.is_available():
            self._series_info_cache[series_id] = {}
            return {}
        try:
            info = self.fred.get_series_info(series_id)
            d = dict(info) if info is not None else {}
            self._series_info_cache[series_id] = d
            return d
        except Exception:
            self._series_info_cache[series_id] = {}
            return {}

    def _staleness_threshold_days(self, frequency_short: Optional[str]) -> int:
        f = (frequency_short or '').upper()
        if f == 'D':
            return 7
        if f == 'W':
            return 21
        if f == 'M':
            return 60
        if f == 'Q':
            return 150
        if f == 'A':
            return 450
        return 60

    def _staleness_days(self, asof: Any, now: datetime) -> Optional[int]:
        try:
            if asof is None:
                return None
            if isinstance(asof, pd.Timestamp):
                return int((now.date() - asof.date()).days)
            if isinstance(asof, datetime):
                return int((now.date() - asof.date()).days)
        except Exception:
            return None
        return None

    def _stale_series(self, series_meta: Dict[str, Any]) -> Dict[str, Any]:
        out: Dict[str, Any] = {}
        for name, meta in (series_meta or {}).items():
            if not isinstance(meta, dict):
                continue
            days = meta.get('staleness_days')
            thr = meta.get('staleness_threshold_days')
            if isinstance(days, int) and isinstance(thr, int) and days > thr:
                out[name] = {'staleness_days': days, 'threshold_days': thr}
        return out
    
    def _calculate_trend(self, name: str, periods: int = 6) -> str:
        """Calculate trend direction for a series"""
        series_id = FRED_SERIES.get(name)
        if not series_id:
            return 'UNKNOWN'

        df = self.fetch(series_id)
        if df.empty:
            return 'UNKNOWN'

        s = df['value'].dropna().astype(float)
        if name in {'CPI', 'CORE_CPI', 'PCE', 'CORE_PCE', 'PPI'}:
            yoy = s.pct_change(12) * 100.0
            recent = yoy.dropna().tail(periods)
        else:
            recent = s.tail(periods)

        if len(recent) < 2:
            return 'UNKNOWN'

        if recent.iloc[-1] > recent.iloc[0]:
            return 'RISING'
        if recent.iloc[-1] < recent.iloc[0]:
            return 'FALLING'
        return 'FLAT'

    def _latest_value(self, name: str) -> Optional[float]:
        series_id = FRED_SERIES.get(name)
        if not series_id:
            return None
        df = self.fetch(series_id)
        if df.empty:
            return None
        return self._safe_float(df['value'].iloc[-1])

    def _calculate_yoy(self, name: str, periods: int = 12) -> Optional[float]:
        series_id = FRED_SERIES.get(name)
        if not series_id:
            return None
        df = self.fetch(series_id)
        if df.empty:
            return None
        s = df['value'].dropna().astype(float)
        if len(s) < periods + 1:
            return None
        base = float(s.iloc[-(periods + 1)])
        if base == 0:
            return None
        return float((float(s.iloc[-1]) / base - 1.0) * 100.0)

    def _derive_from_histories(self, histories: Dict[str, pd.DataFrame]) -> Dict[str, Any]:
        out: Dict[str, Any] = {}

        cpi = histories.get('CPI')
        if cpi is not None and not cpi.empty:
            s = cpi['value'].dropna().astype(float)
            if len(s) >= 13:
                out['inflation_level'] = float((s.iloc[-1] / s.iloc[-13] - 1.0) * 100.0)

        core = histories.get('CORE_CPI')
        if core is not None and not core.empty:
            s = core['value'].dropna().astype(float)
            if len(s) >= 13:
                out['core_inflation'] = float((s.iloc[-1] / s.iloc[-13] - 1.0) * 100.0)

        out['inflation_trend'] = self._calculate_trend('CPI')

        for key, field in [
            ('GDP_GROWTH', 'gdp_growth'),
            ('UNEMPLOYMENT', 'unemployment'),
            ('FED_FUNDS', 'fed_funds'),
            ('YIELD_CURVE_10Y2Y', 'yield_curve'),
            ('CONSUMER_SENTIMENT', 'consumer_sentiment'),
        ]:
            df = histories.get(key)
            if df is None or df.empty:
                continue
            v = self._safe_float(df['value'].iloc[-1])
            if v is None:
                continue
            out[field] = float(v)

        hy = histories.get('HY_SPREAD')
        if hy is not None and not hy.empty:
            v = self._safe_float(hy['value'].iloc[-1])
            if v is not None:
                out['credit_spread'] = float(v * 100.0) if v < 50 else float(v)

        return out

    def _safe_float(self, v: Any) -> Optional[float]:
        try:
            if v is None or (isinstance(v, float) and np.isnan(v)):
                return None
            return float(v)
        except Exception:
            return None

    def _format_timeseries(self, s: pd.Series) -> list:
        items = []
        if s is None or len(s) == 0:
            return items
        for idx, v in s.items():
            if pd.isna(v):
                continue
            items.append({
                'date': idx.date().isoformat() if hasattr(idx, 'date') else str(idx),
                'value': float(v),
            })
        return items

    def _series_percentile(self, s: pd.Series, value: float) -> float:
        if s is None or len(s) < 20:
            return 50.0
        arr = s.dropna().astype(float).values
        if arr.size < 20:
            return 50.0
        arr.sort()
        pos = np.searchsorted(arr, value, side='right')
        return float(pos / arr.size * 100.0)

    def _series_zscore(self, s: pd.Series, value: float) -> float:
        if s is None or len(s) < 20:
            return 0.0
        arr = s.dropna().astype(float).values
        if arr.size < 20:
            return 0.0
        mu = float(np.mean(arr))
        sigma = float(np.std(arr))
        if sigma == 0:
            return 0.0
        return float((value - mu) / sigma)

    def _build_changes(self, histories: Dict[str, pd.DataFrame], series_meta: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        out: Dict[str, Any] = {}
        meta = series_meta or {}

        for name, df in histories.items():
            if df is None or df.empty:
                continue

            s = df['value'].dropna().astype(float)
            if len(s) < 5:
                continue

            last_dt = df.index[-1]
            last_val = float(s.iloc[-1])

            m = meta.get(name) if isinstance(meta, dict) else None
            freq = None
            if isinstance(m, dict):
                freq = m.get('frequency_short')
            freq = (freq or '').upper()

            def val_at(dt: Any) -> Optional[float]:
                try:
                    if dt is None:
                        return None
                    ss = s.loc[:dt]
                    if ss is None or len(ss) == 0:
                        return None
                    return float(ss.iloc[-1])
                except Exception:
                    return None

            if freq in {'D', 'W'}:
                v_1w = val_at(last_dt - timedelta(days=7))
                v_1m = val_at(last_dt - timedelta(days=30))
                out[f'{name}_change_1w'] = float(last_val - v_1w) if v_1w is not None else None
                out[f'{name}_change_1m'] = float(last_val - v_1m) if v_1m is not None else None
            elif freq == 'M':
                v_1m = val_at(last_dt - DateOffset(months=1))
                v_3m = val_at(last_dt - DateOffset(months=3))
                out[f'{name}_change_1m'] = float(last_val - v_1m) if v_1m is not None else None
                out[f'{name}_change_3m'] = float(last_val - v_3m) if v_3m is not None else None
            elif freq == 'Q':
                v_1q = val_at(last_dt - DateOffset(months=3))
                v_1y = val_at(last_dt - DateOffset(months=12))
                out[f'{name}_change_1q'] = float(last_val - v_1q) if v_1q is not None else None
                out[f'{name}_change_1y'] = float(last_val - v_1y) if v_1y is not None else None
            else:
                v_1y = val_at(last_dt - DateOffset(months=12))
                out[f'{name}_change_1y'] = float(last_val - v_1y) if v_1y is not None else None

            base = None
            if freq in {'D', 'W'}:
                base = val_at(last_dt - timedelta(days=30))
                if base is not None and base != 0:
                    out[f'{name}_pct_change_1m'] = float((last_val / base - 1.0) * 100.0)
            elif freq == 'M':
                base = val_at(last_dt - DateOffset(months=12))
                if base is not None and base != 0:
                    out[f'{name}_pct_change_1y'] = float((last_val / base - 1.0) * 100.0)

        return out

    def _build_stats(self, histories: Dict[str, pd.DataFrame], vix_value: Optional[float], vix_series: Optional[pd.Series]) -> Dict[str, Any]:
        out: Dict[str, Any] = {}

        yc = histories.get('YIELD_CURVE_10Y2Y')
        if yc is not None and not yc.empty:
            v = float(yc['value'].dropna().iloc[-1])
            out['yield_curve_percentile_2y'] = self._series_percentile(yc['value'], v)
            out['yield_curve_zscore_2y'] = self._series_zscore(yc['value'], v)

        hy = histories.get('HY_SPREAD')
        if hy is not None and not hy.empty:
            raw = float(hy['value'].dropna().iloc[-1])
            bps = raw * 100.0 if raw < 50 else raw
            hist_bps = hy['value'].dropna().astype(float)
            hist_bps = hist_bps * 100.0 if hist_bps.median() < 50 else hist_bps
            out['credit_spread_percentile_2y'] = self._series_percentile(hist_bps, bps)
            out['credit_spread_zscore_2y'] = self._series_zscore(hist_bps, bps)

        dx = histories.get('DOLLAR_INDEX')
        if dx is not None and not dx.empty:
            v = float(dx['value'].dropna().iloc[-1])
            out['dollar_index_percentile_2y'] = self._series_percentile(dx['value'], v)
            out['dollar_index_zscore_2y'] = self._series_zscore(dx['value'], v)

        fsi = histories.get('FINANCIAL_STRESS_INDEX')
        if fsi is not None and not fsi.empty:
            v = float(fsi['value'].dropna().iloc[-1])
            out['financial_stress_percentile_2y'] = self._series_percentile(fsi['value'], v)
            out['financial_stress_zscore_2y'] = self._series_zscore(fsi['value'], v)

        nfci = histories.get('NFCI')
        if nfci is not None and not nfci.empty:
            v = float(nfci['value'].dropna().iloc[-1])
            out['nfci_percentile_2y'] = self._series_percentile(nfci['value'], v)
            out['nfci_zscore_2y'] = self._series_zscore(nfci['value'], v)

        if vix_value is not None and vix_series is not None and len(vix_series) > 20:
            out['vix_percentile_2y'] = self._series_percentile(vix_series, float(vix_value))
            out['vix_zscore_2y'] = self._series_zscore(vix_series, float(vix_value))
            out['vix_level'] = float(vix_value)

        return out

    def _build_macro_features(self, histories: Dict[str, pd.DataFrame], vix_value: Optional[float], vix_series: Optional[pd.Series]) -> Dict[str, float]:
        yc = histories.get('YIELD_CURVE_10Y2Y')
        hy = histories.get('HY_SPREAD')
        usd = histories.get('DOLLAR_INDEX')
        fsi = histories.get('FINANCIAL_STRESS_INDEX')
        nfci = histories.get('NFCI')

        yc_pct = None
        if yc is not None and not yc.empty:
            v = float(yc['value'].dropna().iloc[-1])
            yc_pct = self._series_percentile(yc['value'], v)

        hy_pct = None
        if hy is not None and not hy.empty:
            raw = float(hy['value'].dropna().iloc[-1])
            bps = raw * 100.0 if raw < 50 else raw
            hist_bps = hy['value'].dropna().astype(float)
            hist_bps = hist_bps * 100.0 if hist_bps.median() < 50 else hist_bps
            hy_pct = self._series_percentile(hist_bps, bps)

        usd_pct = None
        if usd is not None and not usd.empty:
            v = float(usd['value'].dropna().iloc[-1])
            usd_pct = self._series_percentile(usd['value'], v)

        vix_pct = None
        if vix_value is not None and vix_series is not None and len(vix_series) > 20:
            vix_pct = self._series_percentile(vix_series, float(vix_value))

        fsi_pct = None
        if fsi is not None and not fsi.empty:
            v = float(fsi['value'].dropna().iloc[-1])
            fsi_pct = self._series_percentile(fsi['value'], v)

        nfci_pct = None
        if nfci is not None and not nfci.empty:
            v = float(nfci['value'].dropna().iloc[-1])
            nfci_pct = self._series_percentile(nfci['value'], v)

        def inv(p: Optional[float]) -> Optional[float]:
            return (100.0 - p) if p is not None else None

        risk_on_parts = [inv(vix_pct), inv(hy_pct), yc_pct, inv(fsi_pct), inv(nfci_pct)]
        risk_on_vals = [p for p in risk_on_parts if p is not None]
        risk_on = float(np.mean(risk_on_vals)) if risk_on_vals else 50.0

        stress_parts = [vix_pct, hy_pct, inv(yc_pct), fsi_pct, nfci_pct]
        stress_vals = [p for p in stress_parts if p is not None]
        stress = float(np.mean(stress_vals)) if stress_vals else 50.0

        usd_strength = float(usd_pct) if usd_pct is not None else 50.0

        return {
            'macro_risk_on': float(min(100, max(0, risk_on))),
            'macro_stress': float(min(100, max(0, stress))),
            'macro_usd_strength': float(min(100, max(0, usd_strength))),
        }
