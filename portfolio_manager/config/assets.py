# config/assets.py
"""
Portfolio Manager v8.1 - Asset Universe (278 Assets)
"""

from typing import Dict, List

# Complete Asset Universe
ALL_ASSETS: Dict[str, List[str]] = {
    # Forex Majors & Crosses (28)
    'forex': [
        'EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'AUDUSD', 'USDCAD', 'NZDUSD',
        'EURGBP', 'EURJPY', 'GBPJPY', 'AUDJPY', 'EURAUD', 'EURCHF', 'GBPCHF',
        'AUDCHF', 'CADJPY', 'CHFJPY', 'NZDJPY', 'GBPAUD', 'AUDNZD', 'EURCAD',
        'GBPCAD', 'AUDCAD', 'NZDCAD', 'EURNZD', 'GBPNZD', 'USDMXN', 'USDZAR'
    ],
    
    # Commodities (25)
    'commodities': [
        'XAUUSD',  # Gold
        'XAGUSD',  # Silver
        'XPTUSD',  # Platinum
        'XPDUSD',  # Palladium
        'CL=F',    # Crude Oil WTI
        'BZ=F',    # Brent
        'NG=F',    # Natural Gas
        'HG=F',    # Copper
        'ZC=F',    # Corn
        'ZS=F',    # Soybeans
        'ZW=F',    # Wheat
        'KC=F',    # Coffee
        'SB=F',    # Sugar
        'CC=F',    # Cocoa
        'CT=F',    # Cotton
        'LBS=F',   # Lumber
        'LE=F',    # Live Cattle
        'HE=F',    # Lean Hogs
        'GC=F',    # Gold Futures
        'SI=F',    # Silver Futures
        'PL=F',    # Platinum Futures
        'PA=F',    # Palladium Futures
        'RB=F',    # RBOB Gasoline
        'HO=F',    # Heating Oil
        'ALI=F',   # Aluminum
    ],
    
    # Major Indices (30)
    'indices': [
        '^GSPC',   # S&P 500
        '^DJI',    # Dow Jones
        '^IXIC',   # Nasdaq
        '^RUT',    # Russell 2000
        '^VIX',    # VIX
        '^GDAXI',  # DAX
        '^FTSE',   # FTSE 100
        '^FCHI',   # CAC 40
        '^STOXX50E', # Euro Stoxx 50
        '^N225',   # Nikkei 225
        '^HSI',    # Hang Seng
        '000001.SS', # Shanghai Composite
        '^AXJO',   # ASX 200
        '^BVSP',   # Bovespa
        '^MXX',    # IPC Mexico
        '^GSPTSE', # TSX Composite
        '^NSEI',   # Nifty 50
        '^KS11',   # KOSPI
        '^TWII',   # Taiwan Weighted
        '^STI',    # Straits Times
        '^KLSE',   # KLCI Malaysia
        '^JKSE',   # Jakarta Composite
        '^SET.BK', # SET Thailand
        '^MERV',   # MERVAL Argentina
        '^IPSA',   # IPSA Chile
        '^TA125.TA', # Tel Aviv 125
        '^ATX',    # ATX Austria
        '^BFX',    # BEL 20
        '^AEX',    # AEX Netherlands
        '^IBEX',   # IBEX 35
    ],
    
    # Fixed Income / Bonds (20)
    'bonds': [
        '^TNX',    # 10Y Treasury Yield
        '^TYX',    # 30Y Treasury Yield
        '^FVX',    # 5Y Treasury Yield
        '^IRX',    # 13W T-Bill
        'TLT',     # 20+ Year Treasury ETF
        'IEF',     # 7-10 Year Treasury ETF
        'SHY',     # 1-3 Year Treasury ETF
        'TIP',     # TIPS ETF
        'LQD',     # Investment Grade Corporate
        'HYG',     # High Yield Corporate
        'EMB',     # Emerging Market Bonds
        'MUB',     # Municipal Bonds
        'AGG',     # US Aggregate Bond
        'BND',     # Total Bond Market
        'BNDX',    # International Bond
        'GOVT',    # US Treasury Bond
        'VCSH',    # Short-Term Corporate
        'VCIT',    # Intermediate Corporate
        'VCLT',    # Long-Term Corporate
        'IGIB',    # Intermediate Corp Bond
    ],
    
    # ETFs (50)
    'etfs': [
        'SPY', 'QQQ', 'IWM', 'DIA', 'VOO',  # US Equity
        'VTI', 'VEA', 'VWO', 'EFA', 'EEM',  # Broad Market
        'XLF', 'XLK', 'XLE', 'XLV', 'XLI',  # Sector
        'XLU', 'XLP', 'XLY', 'XLB', 'XLRE', # Sector
        'GLD', 'SLV', 'USO', 'UNG', 'DBA',  # Commodities
        'FXE', 'FXY', 'FXB', 'UUP', 'FXA',  # Currency
        'VNQ', 'IYR', 'REIT', 'RWR', 'VNQI', # Real Estate
        'ARKK', 'ARKG', 'ARKW', 'ARKF', 'ARKQ', # Innovation
        'SMH', 'SOXX', 'XBI', 'IBB', 'XRT', # Thematic
        'KWEB', 'FXI', 'MCHI', 'GXC', 'ASHR', # China
    ],
    
    # Cryptocurrency (15)
    'crypto': [
        'BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'XRP/USDT', 'SOL/USDT',
        'ADA/USDT', 'AVAX/USDT', 'DOGE/USDT', 'DOT/USDT', 'MATIC/USDT',
        'LINK/USDT', 'UNI/USDT', 'ATOM/USDT', 'LTC/USDT', 'FIL/USDT'
    ],
    
    # Individual Stocks (100)
    'stocks': [
        # Tech
        'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'NVDA', 'TSLA', 'AMD', 'INTC', 'CRM',
        'ORCL', 'ADBE', 'CSCO', 'AVGO', 'TXN', 'QCOM', 'IBM', 'NOW', 'MU', 'AMAT',
        # Finance
        'JPM', 'BAC', 'WFC', 'GS', 'MS', 'C', 'AXP', 'BLK', 'SCHW', 'USB',
        'PNC', 'TFC', 'COF', 'AIG', 'MET', 'PRU', 'ALL', 'TRV', 'CB', 'CME',
        # Healthcare
        'JNJ', 'UNH', 'PFE', 'MRK', 'ABBV', 'LLY', 'TMO', 'ABT', 'BMY', 'AMGN',
        'GILD', 'CVS', 'CI', 'HUM', 'ISRG', 'SYK', 'MDT', 'DHR', 'BDX', 'ZTS',
        # Consumer
        'PG', 'KO', 'PEP', 'WMT', 'HD', 'MCD', 'NKE', 'SBUX', 'DIS', 'NFLX',
        'COST', 'LOW', 'TGT', 'TJX', 'ROST', 'YUM', 'CMG', 'MAR', 'HLT', 'BKNG',
        # Industrial
        'CAT', 'DE', 'HON', 'UNP', 'UPS', 'FDX', 'BA', 'LMT', 'RTX', 'GE',
        # Energy
        'XOM', 'CVX', 'COP', 'SLB', 'EOG', 'PXD', 'OXY', 'MPC', 'VLO', 'PSX',
    ],
    
    # Volatility Products (10)
    'volatility': [
        '^VIX',    # VIX Index
        'VXX',     # VIX Short-Term
        'VIXY',    # VIX Short-Term Futures
        'UVXY',    # Ultra VIX Short-Term
        'SVXY',    # Short VIX Short-Term
        '^VVIX',   # VIX of VIX
        '^V2X',    # VSTOXX
        '^MOVE',   # MOVE Index (bond vol)
        'OVX',     # Oil VIX
        'GVZ',     # Gold VIX
    ],
}


def get_all_symbols() -> List[str]:
    """Get flat list of all symbols"""
    symbols = []
    for asset_class, class_symbols in ALL_ASSETS.items():
        symbols.extend(class_symbols)
    return symbols


def get_asset_class(symbol: str) -> str:
    """Get asset class for a symbol"""
    for asset_class, symbols in ALL_ASSETS.items():
        if symbol in symbols:
            return asset_class
    return 'unknown'


def get_total_count() -> int:
    """Get total number of assets"""
    return sum(len(symbols) for symbols in ALL_ASSETS.values())


# Quick stats
ASSET_COUNTS = {k: len(v) for k, v in ALL_ASSETS.items()}
TOTAL_ASSETS = get_total_count()

# Print summary on import (for debugging)
if __name__ == "__main__":
    print(f"Total Assets: {TOTAL_ASSETS}")
    for asset_class, count in ASSET_COUNTS.items():
        print(f"  {asset_class}: {count}")
