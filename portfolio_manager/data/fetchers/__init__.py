# data/fetchers/__init__.py
from .base import BaseFetcher
from .stocks import StockFetcher
from .crypto import CryptoFetcher
from .macro import MacroFetcher

__all__ = ['BaseFetcher', 'StockFetcher', 'CryptoFetcher', 'MacroFetcher']
