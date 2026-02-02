# main.py
"""
Portfolio Manager v8.1 - Entry Point
"""

import sys
import time
from datetime import datetime
from pathlib import Path

# Add parent to path for imports
sys.path.insert(0, str(Path(__file__).parent))

from loguru import logger

# Config
from config.settings import settings, LOGS_DIR, OUTPUTS_DIR
from config.assets import ALL_ASSETS, TOTAL_ASSETS

# Data Fetchers
from data.fetchers import StockFetcher, CryptoFetcher, MacroFetcher

# Features
from features.calculator import FeatureCalculator

# Scoring
from scoring.calculator import ScoreCalculator

# Analysis
from analysis.regime import RegimeDetector
from analysis.scenario import ScenarioEngine
from analysis.meso import MesoAnalyzer

# Output
from output.generator import OutputGenerator

# Setup logging
LOGS_DIR.mkdir(exist_ok=True)
OUTPUTS_DIR.mkdir(exist_ok=True)
logger.add(LOGS_DIR / "system_{time}.log", rotation="1 day", level="INFO")


class PortfolioManagerSystem:
    """Main system orchestrator"""
    
    def __init__(self):
        logger.info("=" * 60)
        logger.info("Initializing Portfolio Manager System v8.1")
        logger.info(f"Total Assets: {TOTAL_ASSETS}")
        logger.info("=" * 60)
        
        # Initialize fetchers
        self.stock_fetcher = StockFetcher()
        self.crypto_fetcher = CryptoFetcher()
        self.macro_fetcher = MacroFetcher()
        
        # Initialize components
        self.feature_calc = FeatureCalculator({
            'stocks': self.stock_fetcher,
            'crypto': self.crypto_fetcher,
        })
        
        self.score_calc = ScoreCalculator()
        self.regime_detector = RegimeDetector(self.macro_fetcher)
        self.scenario_engine = ScenarioEngine(self.macro_fetcher)
        self.meso_analyzer = MesoAnalyzer()
        self.output_gen = OutputGenerator(
            capital=settings.INITIAL_CAPITAL,
            risk_per_trade=settings.MAX_RISK_PER_TRADE
        )
        
        logger.info("System initialized successfully")
    
    def fetch_market_data(self) -> dict:
        """Fetch data for all assets"""
        logger.info("Fetching market data...")
        all_data = {}
        
        # Stocks & ETFs
        stock_symbols = ALL_ASSETS.get('stocks', [])[:20] + ALL_ASSETS.get('etfs', [])[:10]
        for symbol in stock_symbols:
            try:
                df = self.stock_fetcher.fetch(symbol, 'D')
                if not df.empty:
                    all_data[symbol] = df
            except Exception as e:
                logger.debug(f"Skip {symbol}: {e}")
        
        # Crypto (if available)
        if self.crypto_fetcher.is_available():
            for symbol in ALL_ASSETS.get('crypto', [])[:5]:
                try:
                    df = self.crypto_fetcher.fetch(symbol, 'D')
                    if not df.empty:
                        all_data[symbol] = df
                except Exception as e:
                    logger.debug(f"Skip {symbol}: {e}")
        
        logger.info(f"Fetched data for {len(all_data)} assets")
        return all_data
    
    def run_cycle(self) -> str:
        """Run one complete analysis cycle"""
        logger.info("-" * 60)
        logger.info(f"Starting cycle at {datetime.now()}")
        
        try:
            # 1. Fetch market data
            market_data = self.fetch_market_data()
            if not market_data:
                logger.warning("No market data available")
                return "No data"
            
            # 2. Detect regime & scenario (macro snapshot)
            macro_snapshot = {}
            macro_flat = {}
            macro_features = {}
            try:
                macro_snapshot = self.macro_fetcher.get_macro_snapshot()
                if isinstance(macro_snapshot, dict):
                    macro_flat = macro_snapshot.get('flat', {}) or {}
                    macro_features = macro_snapshot.get('features', {}) or {}
            except Exception as e:
                logger.warning(f"Could not build macro snapshot: {e}")

            regime_state = self.regime_detector.detect(macro_flat)
            scenario_state = self.scenario_engine.determine(macro_flat)

            if isinstance(macro_snapshot, dict):
                macro_snapshot['states'] = {
                    'regime': {
                        'value': regime_state.regime,
                        'confidence': regime_state.confidence,
                    },
                    'scenario': {
                        'value': scenario_state.scenario,
                        'probability': scenario_state.probability,
                    },
                }

                try:
                    macro_snapshot['meso'] = self.meso_analyzer.analyze(macro_snapshot)
                except Exception as e:
                    logger.warning(f"Could not build meso analysis: {e}")
            
            logger.info(f"Regime: {regime_state.regime} | Scenario: {scenario_state.scenario}")
            
            # Update score calculator with regime
            self.score_calc.set_regime(regime_state.regime)
            
            # 3. Calculate features for all assets
            logger.info("Calculating features...")
            features = self.feature_calc.calculate_batch(market_data, macro_features)
            
            # 4. Calculate scores
            logger.info("Calculating scores...")
            scores = self.score_calc.calculate_batch(features)
            
            # 5. Get current prices
            prices = {s: df['close'].iloc[-1] for s, df in market_data.items() if len(df) > 0}
            
            # 6. Generate output
            output = self.output_gen.generate(
                scores=scores,
                prices=prices,
                regime=regime_state.regime,
                regime_conf=regime_state.confidence,
                scenario=scenario_state.scenario,
                scenario_prob=scenario_state.probability,
                macro_snapshot=macro_snapshot,
                min_score=55
            )
            
            # 7. Print output
            output_text = self.output_gen.to_text(output)
            print(output_text)
            
            # 8. Save to file
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            output_file = OUTPUTS_DIR / f"output_{timestamp}.json"
            output_file.write_text(self.output_gen.to_json(output))
            logger.info(f"Output saved to {output_file}")
            
            # 9. Summary
            logger.info(f"Cycle complete: {len(output.signals)} opportunities found")
            
            return output_text
            
        except Exception as e:
            logger.error(f"Cycle failed: {e}")
            raise
    
    def run_once(self):
        """Run a single cycle"""
        return self.run_cycle()
    
    def run_continuous(self, interval_minutes: int = 15):
        """Run continuously at specified interval"""
        logger.info(f"Starting continuous mode ({interval_minutes} min intervals)")
        
        try:
            import schedule
            
            # Run immediately
            self.run_cycle()
            
            # Schedule periodic runs
            schedule.every(interval_minutes).minutes.do(self.run_cycle)
            
            while True:
                schedule.run_pending()
                time.sleep(1)
                
        except ImportError:
            logger.error("schedule library not installed. Run: pip install schedule")
            # Fallback to simple loop
            while True:
                self.run_cycle()
                time.sleep(interval_minutes * 60)


def main():
    """Entry point"""
    print("""
    ╔═══════════════════════════════════════════════════════════╗
    ║     GLOBAL MULTI-ASSET PORTFOLIO MANAGER v8.1             ║
    ║                                                           ║
    ║     Scanning markets for opportunities...                 ║
    ╚═══════════════════════════════════════════════════════════╝
    """)
    
    system = PortfolioManagerSystem()
    
    # Check command line args
    if len(sys.argv) > 1 and sys.argv[1] == '--continuous':
        interval = int(sys.argv[2]) if len(sys.argv) > 2 else 15
        system.run_continuous(interval)
    else:
        system.run_once()


if __name__ == "__main__":
    main()
