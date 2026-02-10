import { Card, Badge, Metric, Spinner, ErrorBox, ProgressBar, fmt } from '../ui/primitives';
import { useRisk, type RiskReport, type CircuitBreaker, type KellyData, type DrawdownData, type RiskBudget } from '../../hooks/useApi';

const statusColor = (s: string) => {
  if (s === 'HEALTHY' || s === 'NORMAL' || s === 'OPTIMAL') return 'text-emerald-400';
  if (s === 'WARNING' || s === 'ELEVATED') return 'text-amber-400';
  return 'text-red-400';
};

const statusBadge = (s: string): 'success' | 'warning' | 'danger' | 'default' => {
  if (s === 'HEALTHY' || s === 'NORMAL' || s === 'OPTIMAL') return 'success';
  if (s === 'WARNING' || s === 'ELEVATED') return 'warning';
  if (s === 'CRITICAL' || s === 'HALT') return 'danger';
  return 'default';
};

function TradingStatusBanner({ report }: { report: RiskReport }) {
  const color = report.tradingStatus === 'NORMAL' ? 'border-emerald-500/30 bg-emerald-500/5' :
    report.tradingStatus === 'REDUCED' ? 'border-amber-500/30 bg-amber-500/5' : 'border-red-500/30 bg-red-500/5';

  return (
    <div className={`rounded-xl border p-5 ${color}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div>
            <div className="text-[10px] text-white/25 uppercase">Trading Status</div>
            <div className={`text-2xl font-black ${statusColor(report.tradingStatus)}`}>{report.tradingStatus}</div>
          </div>
          <Badge text={report.drawdown.status} variant={statusBadge(report.drawdown.status)} />
          <Badge text={`Budget: ${report.riskBudget.status}`} variant={statusBadge(report.riskBudget.status)} />
        </div>
        <div className="text-right">
          <div className="text-[10px] text-white/25">Equity</div>
          <div className="text-lg font-black font-mono">${fmt(report.drawdown.currentEquity, 0)}</div>
        </div>
      </div>

      {report.alerts.length > 0 && (
        <div className="mt-3 space-y-1">
          {report.alerts.map((a, i) => (
            <div key={i} className="text-[11px] text-red-400 bg-red-500/10 border border-red-500/15 px-3 py-1.5 rounded-lg">⚠️ {a}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function KellyPanel({ kelly }: { kelly: KellyData }) {
  return (
    <Card title="Kelly Criterion" subtitle={kelly.edgeQuality}>
      <div className="grid grid-cols-4 gap-3 text-center mb-4">
        <div className="p-3 rounded-lg bg-white/[0.03]">
          <div className="text-[9px] text-white/25">Full Kelly</div>
          <div className="text-xl font-black text-amber-400">{fmt(kelly.fullKelly * 100, 1)}%</div>
        </div>
        <div className="p-3 rounded-lg bg-white/[0.03]">
          <div className="text-[9px] text-white/25">Half Kelly</div>
          <div className="text-xl font-black text-emerald-400">{fmt(kelly.halfKelly * 100, 1)}%</div>
        </div>
        <div className="p-3 rounded-lg bg-white/[0.03]">
          <div className="text-[9px] text-white/25">Quarter Kelly</div>
          <div className="text-xl font-black">{fmt(kelly.quarterKelly * 100, 1)}%</div>
        </div>
        <div className="p-3 rounded-lg bg-white/[0.03]">
          <div className="text-[9px] text-white/25">Recommended</div>
          <div className="text-xl font-black text-blue-400">{fmt(kelly.recommended * 100, 1)}%</div>
        </div>
      </div>
      <div className="text-[11px] text-white/30 space-y-1">
        <div className="flex justify-between"><span>Max Position Size</span><span className="font-mono font-bold">{kelly.maxPosition}%</span></div>
        <div className="flex justify-between"><span>Edge Quality</span><Badge text={kelly.edgeQuality} variant={kelly.edgeQuality === 'STRONG' ? 'success' : kelly.edgeQuality === 'MODERATE' ? 'warning' : 'default'} /></div>
      </div>
      <div className="text-[10px] text-white/20 mt-3">{kelly.reasoning}</div>
    </Card>
  );
}

function DrawdownPanel({ dd }: { dd: DrawdownData }) {
  const ddPct = dd.peakEquity > 0 ? (dd.currentDrawdown / dd.peakEquity) * 100 : 0;

  return (
    <Card title="Drawdown Analysis">
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="p-3 rounded-lg bg-white/[0.03] text-center">
          <div className="text-[9px] text-white/25">Current DD</div>
          <div className={`text-xl font-black ${dd.currentDrawdown > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
            {fmt(dd.currentDrawdown, 1)}%
          </div>
        </div>
        <div className="p-3 rounded-lg bg-white/[0.03] text-center">
          <div className="text-[9px] text-white/25">Max DD (Historical)</div>
          <div className="text-xl font-black text-red-400">{fmt(dd.maxDrawdown, 1)}%</div>
        </div>
      </div>

      <div className="space-y-2 text-[11px]">
        <div className="flex justify-between"><span className="text-white/30">Peak Equity</span><span className="font-mono font-bold">${fmt(dd.peakEquity, 0)}</span></div>
        <div className="flex justify-between"><span className="text-white/30">Current Equity</span><span className="font-mono font-bold">${fmt(dd.currentEquity, 0)}</span></div>
        <div className="flex justify-between"><span className="text-white/30">DD Duration</span><span className="font-mono">{dd.drawdownDuration} periods</span></div>
        <div className="flex justify-between"><span className="text-white/30">Recovery Factor</span><span className="font-mono font-bold">{fmt(dd.recoveryFactor, 2)}</span></div>
        <div className="flex justify-between"><span className="text-white/30">Status</span><Badge text={dd.status} variant={statusBadge(dd.status)} /></div>
      </div>
    </Card>
  );
}

function RiskBudgetPanel({ budget }: { budget: RiskBudget }) {
  const utilizationPct = budget.utilizationRate * 100;

  return (
    <Card title="Risk Budget">
      <div className="mb-4">
        <div className="flex justify-between text-[10px] text-white/30 mb-1">
          <span>Utilization</span>
          <span className="font-mono">{fmt(utilizationPct, 0)}%</span>
        </div>
        <ProgressBar
          value={utilizationPct}
          color={utilizationPct > 80 ? 'bg-red-500' : utilizationPct > 60 ? 'bg-amber-500' : 'bg-emerald-500'}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 text-center mb-3">
        <div className="p-2 rounded bg-white/[0.03]">
          <div className="text-[9px] text-white/25">Total Budget</div>
          <div className="text-lg font-black">{budget.totalBudget}%</div>
        </div>
        <div className="p-2 rounded bg-white/[0.03]">
          <div className="text-[9px] text-white/25">Available</div>
          <div className="text-lg font-black text-emerald-400">{fmt(budget.availableBudget, 1)}%</div>
        </div>
      </div>

      <div className="space-y-1.5 text-[11px]">
        <div className="flex justify-between"><span className="text-white/30">Used</span><span className="font-mono">{fmt(budget.usedBudget, 1)}%</span></div>
        <div className="flex justify-between"><span className="text-white/30">Reserve Buffer</span><span className="font-mono">{budget.reserveBuffer}%</span></div>
        <div className="flex justify-between"><span className="text-white/30">Status</span><Badge text={budget.status} variant={statusBadge(budget.status)} /></div>
      </div>
    </Card>
  );
}

function CircuitBreakersPanel({ breakers }: { breakers: CircuitBreaker[] }) {
  return (
    <Card title="Circuit Breakers" subtitle={`${breakers.filter(b => b.triggered).length} triggered`}>
      <div className="space-y-2">
        {breakers.map((cb, i) => (
          <div key={i} className={`flex items-center justify-between p-3 rounded-lg border ${
            cb.triggered ? 'border-red-500/30 bg-red-500/5' : 'border-white/5 bg-white/[0.02]'
          }`}>
            <div>
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${cb.triggered ? 'bg-red-500 animate-pulse' : 'bg-emerald-500'}`} />
                <span className="text-sm font-bold">{cb.name.replace(/_/g, ' ')}</span>
              </div>
              <div className="text-[10px] text-white/30 mt-0.5">{cb.message}</div>
            </div>
            <div className="flex items-center gap-3 text-[11px]">
              <div className="text-right">
                <div className="text-[9px] text-white/20">Current / Limit</div>
                <div className="font-mono">
                  <span className={cb.triggered ? 'text-red-400' : 'text-white/60'}>{fmt(cb.currentValue, 1)}</span>
                  <span className="text-white/15"> / {cb.threshold}</span>
                </div>
              </div>
              {cb.triggered && <Badge text={cb.action.replace(/_/g, ' ')} variant="danger" />}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function RiskDashboardView() {
  const { data, isLoading, isError, refetch } = useRisk();

  if (isLoading) return <Spinner />;
  if (isError || !data?.success) return <ErrorBox message="Failed to load risk data" onRetry={() => refetch()} />;

  const report = data.report;

  return (
    <div className="space-y-5">
      <h2 className="text-xl font-black tracking-tight">Risk Dashboard</h2>

      <TradingStatusBanner report={report} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <KellyPanel kelly={report.kelly} />
        <DrawdownPanel dd={report.drawdown} />
        <RiskBudgetPanel budget={report.riskBudget} />
      </div>

      <CircuitBreakersPanel breakers={report.circuitBreakers} />

      {report.recommendations.length > 0 && (
        <Card title="Recommendations">
          <div className="space-y-1">
            {report.recommendations.map((r, i) => (
              <div key={i} className="text-[11px] text-white/50 p-2 rounded bg-white/[0.02] border border-white/5">{r}</div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
