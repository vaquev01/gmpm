import { useEffect, useState } from 'react';
import { useTerminal, type ViewId } from '../../store/useTerminal';

const NAV_GROUPS = [
  {
    title: 'PIPELINE',
    items: [
      { id: 'executive' as ViewId, label: 'DASHBOARD' },
      { id: 'macro' as ViewId, label: 'MACRO' },
      { id: 'meso' as ViewId, label: 'MESO' },
      { id: 'micro' as ViewId, label: 'MICRO' },
    ],
  },
  {
    title: 'ANALYSIS',
    items: [
      { id: 'currency' as ViewId, label: 'FX STRENGTH' },
      { id: 'liquidity' as ViewId, label: 'LIQUIDITY' },
    ],
  },
  {
    title: 'EXECUTION',
    items: [
      { id: 'signals' as ViewId, label: 'SIGNALS' },
      { id: 'scanner' as ViewId, label: 'SCANNER' },
      { id: 'incubator' as ViewId, label: 'INCUBATOR' },
    ],
  },
  {
    title: 'RISK & LAB',
    items: [
      { id: 'risk' as ViewId, label: 'RISK' },
      { id: 'lab' as ViewId, label: 'LAB' },
    ],
  },
];

function LiveClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="text-right leading-tight hidden lg:block">
      <div className="text-white/80 font-bold text-sm tabular-nums font-mono">{now.toLocaleTimeString()}</div>
      <div className="text-white/30 text-[10px] uppercase tracking-widest">
        {now.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
      </div>
    </div>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const { view, setView } = useTerminal();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleNav = (id: ViewId) => {
    setView(id);
    setMobileOpen(false);
  };

  return (
    <div className="min-h-screen bg-[#08080c] text-white font-sans selection:bg-amber-500/30">
      <header className="sticky top-0 z-50 bg-[#08080c]/95 backdrop-blur-md border-b border-white/8 h-14 flex items-center justify-between px-4 md:px-6">
        <div className="flex items-center gap-3">
          <div className="bg-amber-600/20 p-1.5 rounded-lg border border-amber-600/30">
            <svg className="w-5 h-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25a2.25 2.25 0 01-2.25-2.25v-2.25z" />
            </svg>
          </div>
          <div className="flex flex-col leading-none">
            <span className="font-bold text-white tracking-tight">GMPM Terminal</span>
            <span className="text-[10px] text-white/30 font-mono">INSTITUTIONAL v8.1</span>
          </div>
        </div>

        <nav className="hidden md:flex items-center gap-0.5 bg-white/3 p-1 rounded-lg border border-white/6">
          {NAV_GROUPS.map((g, gi) => (
            <div key={g.title} className="flex items-center gap-0.5">
              {gi > 0 && <div className="w-px h-4 bg-white/10 mx-1" />}
              {g.items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleNav(item.id)}
                  className={`h-7 text-[11px] font-bold px-3 rounded-md transition-all ${
                    view === item.id
                      ? 'bg-white/10 text-amber-400 shadow-sm'
                      : 'text-white/40 hover:text-white/70 hover:bg-white/5'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-emerald-950/40 border border-emerald-900/50 px-3 py-1 rounded-full">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-emerald-400 text-[10px] font-bold tracking-wider">ONLINE</span>
          </div>
          <LiveClock />
          <button
            className="md:hidden p-1.5 rounded-md hover:bg-white/10 transition-colors"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle menu"
          >
            <svg className="w-5 h-5 text-white/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              {mobileOpen
                ? <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                : <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
              }
            </svg>
          </button>
        </div>
      </header>

      {/* Mobile nav drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-x-0 top-14 bottom-0 z-40 bg-[#08080c]/98 backdrop-blur-lg border-t border-white/6 overflow-y-auto p-4">
          {NAV_GROUPS.map((g) => (
            <div key={g.title} className="mb-4">
              <div className="text-[10px] text-white/20 font-bold uppercase tracking-wider mb-2 px-2">{g.title}</div>
              <div className="space-y-1">
                {g.items.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handleNav(item.id)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg text-sm font-bold transition-colors ${
                      view === item.id
                        ? 'bg-white/10 text-amber-400'
                        : 'text-white/50 hover:bg-white/5 hover:text-white/80'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <main className="max-w-[1920px] mx-auto p-4 lg:p-6 min-h-[calc(100vh-3.5rem)]">
        {children}
      </main>
    </div>
  );
}
