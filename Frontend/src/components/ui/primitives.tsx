import React from 'react';

export function Card({ title, subtitle, children, className = '', action }: {
  title?: string; subtitle?: string; children: React.ReactNode; className?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className={`rounded-xl border border-white/8 bg-white/[0.03] backdrop-blur-sm p-5 ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between mb-4">
          <div>
            {title && <h3 className="text-xs font-bold uppercase tracking-wider text-white/40">{title}</h3>}
            {subtitle && <p className="text-[10px] text-white/25 mt-0.5">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

export function Badge({ text, variant = 'default' }: {
  text: string;
  variant?: 'success' | 'warning' | 'danger' | 'info' | 'default' | 'bullish' | 'bearish' | 'neutral';
}) {
  const colors: Record<string, string> = {
    success: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
    warning: 'bg-amber-500/15 text-amber-400 border-amber-500/25',
    danger: 'bg-red-500/15 text-red-400 border-red-500/25',
    info: 'bg-blue-500/15 text-blue-400 border-blue-500/25',
    default: 'bg-white/8 text-white/60 border-white/15',
    bullish: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
    bearish: 'bg-red-500/15 text-red-400 border-red-500/25',
    neutral: 'bg-white/8 text-white/50 border-white/15',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold border tracking-wide ${colors[variant] || colors.default}`}>
      {text}
    </span>
  );
}

export function Metric({ label, value, sub, color, small }: {
  label: string; value: string | number; sub?: string; color?: string; small?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] text-white/35 uppercase tracking-wider font-medium">{label}</span>
      <span className={`${small ? 'text-base' : 'text-lg'} font-bold tabular-nums ${color || 'text-white'}`}>{value}</span>
      {sub && <span className="text-[10px] text-white/25">{sub}</span>}
    </div>
  );
}

export function StatusDot({ ok, label }: { ok: boolean; label?: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`inline-block w-2 h-2 rounded-full ${ok ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
      {label && <span className="text-xs text-white/60">{label}</span>}
    </div>
  );
}

export function Spinner() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="w-6 h-6 border-2 border-white/10 border-t-amber-400 rounded-full animate-spin" />
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-4 flex items-center justify-between">
      <span className="text-sm text-red-400">{message}</span>
      {onRetry && (
        <button onClick={onRetry} className="text-xs text-red-300 hover:text-red-200 underline">Retry</button>
      )}
    </div>
  );
}

export function ProgressBar({ value, max = 100, color = 'bg-amber-500' }: { value: number; max?: number; color?: string }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
      <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function TabBar({ tabs, active, onChange }: {
  tabs: { id: string; label: string }[]; active: string; onChange: (id: string) => void;
}) {
  return (
    <div className="flex gap-1 bg-white/3 p-1 rounded-lg border border-white/6 w-fit">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`px-3 py-1.5 text-[11px] font-bold rounded-md transition-all ${
            active === t.id ? 'bg-white/10 text-amber-400' : 'text-white/35 hover:text-white/60'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function fmt(v: number | null | undefined, decimals = 2): string {
  if (v == null || !Number.isFinite(v)) return '--';
  return v.toFixed(decimals);
}

export function pctFmt(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '--';
  return `${v > 0 ? '+' : ''}${v.toFixed(2)}%`;
}

export function pctColor(v: number) {
  if (v > 0) return 'text-emerald-400';
  if (v < 0) return 'text-red-400';
  return 'text-white/40';
}

export function priceFmt(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '--';
  if (v >= 1000) return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (v >= 10) return v.toFixed(2);
  if (v >= 1) return v.toFixed(4);
  return v.toFixed(5);
}

export function cleanSymbol(s: string): string {
  return s.replace(/=X$/i, '').replace(/\.SA$/i, '');
}

export function trendBadgeVariant(t: string): 'success' | 'danger' | 'warning' | 'default' {
  const up = ['EXPANDING', 'STRONG', 'BULLISH', 'RISK_ON', 'NORMAL', 'OPTIMISTIC', 'COOLING', 'FALLING', 'UP', 'INFLOW'];
  const down = ['SLOWING', 'STRESSED', 'BEARISH', 'RISK_OFF', 'INVERTED', 'PESSIMISTIC', 'RISING', 'CRITICAL', 'DOWN', 'OUTFLOW'];
  if (up.includes(t)) return 'success';
  if (down.includes(t)) return 'danger';
  return 'default';
}
