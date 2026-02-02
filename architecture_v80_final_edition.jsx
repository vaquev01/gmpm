import React, { useState } from 'react';

const ArchitectureV80 = () => {
  const [view, setView] = useState('universe');

  const assetUniverse = [
    { class: 'Forex', count: 28, examples: 'EUR/USD, GBP/JPY, USD/MXN...' },
    { class: 'Commodities', count: 25, examples: 'Gold, Oil, Copper, Wheat...' },
    { class: 'Indices', count: 30, examples: 'S&P 500, DAX, Nikkei, Hang Seng...' },
    { class: 'Fixed Income', count: 20, examples: '10Y Treasury, Bund, Credit Spreads...' },
    { class: 'ETFs', count: 50, examples: 'SPY, QQQ, GLD, TLT, XLF...' },
    { class: 'Crypto', count: 15, examples: 'BTC, ETH, SOL, LINK...' },
    { class: 'Stocks', count: 100, examples: 'AAPL, MSFT, GOOGL, JPM...' },
    { class: 'Volatility', count: 10, examples: 'VIX, VDAX, MOVE...' }
  ];

  const featureCategories = [
    { cat: 'Macro', count: 20, examples: 'Inflation, GDP, PMI, Fed stance' },
    { cat: 'Rates', count: 15, examples: 'Yields, curves, spreads, differentials' },
    { cat: 'Volatility', count: 15, examples: 'VIX, skew, IV/RV, term structure' },
    { cat: 'Flow', count: 15, examples: 'CFTC, ETF flows, gamma, sentiment' },
    { cat: 'Technical', count: 25, examples: 'Trend, momentum, structure, volume' },
    { cat: 'Fractal/SMC', count: 15, examples: 'Hurst, OB, FVG, BOS, liquidity' },
    { cat: 'Cross-Asset', count: 10, examples: 'Correlations, beta, factors' },
    { cat: 'Sentiment', count: 5, examples: 'News NLP, social, Fear/Greed' }
  ];

  const scoreComponents = [
    { comp: 'Macro Alignment', weight: '15%' },
    { comp: 'Trend Quality', weight: '15%' },
    { comp: 'Momentum', weight: '10%' },
    { comp: 'Volatility', weight: '10%' },
    { comp: 'Flow/Positioning', weight: '10%' },
    { comp: 'Technical Structure', weight: '10%' },
    { comp: 'Fractal/SMC', weight: '10%' },
    { comp: 'Cross-Asset', weight: '5%' },
    { comp: 'Timing/Seasonal', weight: '5%' },
    { comp: 'Risk/Reward', weight: '10%' }
  ];

  const timeframes = [
    { tf: 'Monthly', use: 'Macro trend', weight: '20%' },
    { tf: 'Weekly', use: 'Intermediate', weight: '20%' },
    { tf: 'Daily', use: 'Primary decision', weight: '30%' },
    { tf: '4H', use: 'Timing', weight: '15%' },
    { tf: '1H', use: 'Entry refinement', weight: '10%' },
    { tf: '15M/5M', use: 'Execution', weight: '5%' }
  ];

  const fractalConcepts = [
    { concept: 'Hurst Exponent', desc: 'H>0.5=trending, H<0.5=mean-revert' },
    { concept: 'Fractal Dimension', desc: 'D≈1=smooth, D≈2=choppy' },
    { concept: 'Order Blocks', desc: 'Last candle before strong move' },
    { concept: 'Fair Value Gaps', desc: 'Imbalances to fill' },
    { concept: 'Break of Structure', desc: 'HH/HL or LH/LL confirmation' },
    { concept: 'Liquidity', desc: 'Equal highs/lows as targets' },
    { concept: 'Harmonic Patterns', desc: 'Gartley, Bat, Crab, Butterfly' }
  ];

  const totalAssets = assetUniverse.reduce((sum, a) => sum + a.count, 0);
  const totalFeatures = featureCategories.reduce((sum, f) => sum + f.count, 0);

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-4">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center gap-3 mb-4">
          <h1 className="text-xl font-bold">Global Multi-Asset Portfolio Manager</h1>
          <span className="px-2 py-0.5 bg-yellow-600 text-xs font-bold rounded">v8.0</span>
          <span className="px-2 py-0.5 bg-amber-600 text-xs font-bold rounded">FINAL</span>
        </div>

        <div className="grid grid-cols-4 gap-2 mb-4">
          <div className="bg-gradient-to-r from-blue-900 to-blue-800 rounded p-3 text-center">
            <div className="text-3xl font-bold text-blue-300">{totalAssets}</div>
            <div className="text-xs text-blue-400">Total Assets</div>
          </div>
          <div className="bg-gradient-to-r from-purple-900 to-purple-800 rounded p-3 text-center">
            <div className="text-3xl font-bold text-purple-300">{totalFeatures}</div>
            <div className="text-xs text-purple-400">Total Features</div>
          </div>
          <div className="bg-gradient-to-r from-green-900 to-green-800 rounded p-3 text-center">
            <div className="text-3xl font-bold text-green-300">7</div>
            <div className="text-xs text-green-400">Timeframes</div>
          </div>
          <div className="bg-gradient-to-r from-orange-900 to-orange-800 rounded p-3 text-center">
            <div className="text-3xl font-bold text-orange-300">10</div>
            <div className="text-xs text-orange-400">Score Components</div>
          </div>
        </div>

        <div className="flex gap-2 mb-4 flex-wrap">
          {['universe', 'features', 'fractal', 'mtf', 'score'].map(v => (
            <button key={v} onClick={() => setView(v)}
              className={`px-3 py-1 rounded text-sm ${view === v ? 'bg-yellow-600' : 'bg-gray-800'}`}>
              {v === 'universe' ? 'Asset Universe' : 
               v === 'features' ? 'Features (120)' :
               v === 'fractal' ? 'Fractal/SMC' :
               v === 'mtf' ? 'Multi-Timeframe' : 'Scoring'}
            </button>
          ))}
        </div>

        {view === 'universe' && (
          <div className="bg-gray-900 rounded-xl p-4">
            <h2 className="text-lg font-bold text-blue-400 mb-4">Complete Asset Universe ({totalAssets} Assets)</h2>
            <div className="space-y-2">
              {assetUniverse.map((a, i) => (
                <div key={i} className="bg-gray-800 rounded p-3 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <span className="font-bold text-white w-28">{a.class}</span>
                    <span className="text-xs text-gray-400">{a.examples}</span>
                  </div>
                  <span className="text-lg font-bold text-blue-400">{a.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {view === 'features' && (
          <div className="bg-gray-900 rounded-xl p-4">
            <h2 className="text-lg font-bold text-purple-400 mb-4">Complete Feature Set ({totalFeatures} Features)</h2>
            <div className="space-y-2">
              {featureCategories.map((f, i) => (
                <div key={i} className="bg-gray-800 rounded p-3 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <span className="font-bold text-white w-28">{f.cat}</span>
                    <span className="text-xs text-gray-400">{f.examples}</span>
                  </div>
                  <span className="text-lg font-bold text-purple-400">{f.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {view === 'fractal' && (
          <div className="bg-gray-900 rounded-xl p-4">
            <h2 className="text-lg font-bold text-pink-400 mb-4">Fractal & Smart Money Concepts</h2>
            <div className="grid grid-cols-2 gap-2">
              {fractalConcepts.map((f, i) => (
                <div key={i} className="bg-gray-800 rounded p-3">
                  <div className="font-bold text-pink-400">{f.concept}</div>
                  <div className="text-xs text-gray-400 mt-1">{f.desc}</div>
                </div>
              ))}
            </div>
            <div className="mt-4 p-3 bg-pink-900/30 rounded-lg">
              <div className="text-center text-sm">
                <span className="text-pink-400">Análise fractal + ICT/SMC = </span>
                <span className="text-white font-bold">Institutional-grade entries</span>
              </div>
            </div>
          </div>
        )}

        {view === 'mtf' && (
          <div className="bg-gray-900 rounded-xl p-4">
            <h2 className="text-lg font-bold text-green-400 mb-4">Multi-Timeframe Confluence</h2>
            <div className="space-y-2">
              {timeframes.map((t, i) => (
                <div key={i} className="bg-gray-800 rounded p-3 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <span className="font-bold text-white w-20">{t.tf}</span>
                    <span className="text-gray-400">{t.use}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-24 bg-gray-700 rounded-full h-2">
                      <div className="h-2 bg-green-500 rounded-full" style={{ width: t.weight }}></div>
                    </div>
                    <span className="text-sm text-green-400 w-10">{t.weight}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 text-center text-xs text-gray-500">
              MONTHLY → WEEKLY → DAILY → H4 → H1 → M15 (Top-Down Analysis)
            </div>
          </div>
        )}

        {view === 'score' && (
          <div className="bg-gray-900 rounded-xl p-4">
            <h2 className="text-lg font-bold text-orange-400 mb-4">Asset Scoring System (0-100)</h2>
            <div className="space-y-2">
              {scoreComponents.map((s, i) => (
                <div key={i} className="bg-gray-800 rounded p-2 flex items-center justify-between">
                  <span className="text-white">{s.comp}</span>
                  <div className="flex items-center gap-2">
                    <div className="w-20 bg-gray-700 rounded-full h-2">
                      <div className="h-2 bg-orange-500 rounded-full" style={{ width: s.weight }}></div>
                    </div>
                    <span className="text-sm text-orange-400 w-10">{s.weight}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
              <div className="bg-red-900/30 rounded p-2">
                <div className="text-red-400">0-54</div>
                <div className="text-gray-500">NO TRADE</div>
              </div>
              <div className="bg-yellow-900/30 rounded p-2">
                <div className="text-yellow-400">55-74</div>
                <div className="text-gray-500">MODERATE</div>
              </div>
              <div className="bg-green-900/30 rounded p-2">
                <div className="text-green-400">75-100</div>
                <div className="text-gray-500">STRONG</div>
              </div>
            </div>
          </div>
        )}

        <div className="mt-4 p-4 bg-gradient-to-r from-yellow-900 to-amber-900 rounded-xl text-center">
          <div className="text-xl font-bold text-white mb-2">v8.0 FINAL EDITION</div>
          <div className="text-amber-300 text-sm">278 Assets × 120 Features × 7 Timeframes × 10 Score Components</div>
          <div className="text-amber-400 text-xs mt-2">The Complete System — Nothing More To Add</div>
        </div>
      </div>
    </div>
  );
};

export default ArchitectureV80;
