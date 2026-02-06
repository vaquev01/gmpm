import { Shell } from '../components/layout/Shell';
import { ErrorBoundary } from '../components/layout/ErrorBoundary';
import { useTerminal, type ViewId } from '../store/useTerminal';
import { ExecutiveDashboardView } from '../components/views/ExecutiveDashboardView';
import { MacroView } from '../components/views/MacroView';
import { MesoView } from '../components/views/MesoView';
import { MicroView } from '../components/views/MicroView';
import { CurrencyStrengthView } from '../components/views/CurrencyStrengthView';
import { LiquidityMapView } from '../components/views/LiquidityMapView';
import { SignalOutputView } from '../components/views/SignalOutputView';
import { RiskDashboardView } from '../components/views/RiskDashboardView';
import { IncubatorView } from '../components/views/IncubatorView';
import { ScannerView } from '../components/views/ScannerView';
import { LabView } from '../components/views/LabView';

const VIEW_MAP: Record<ViewId, { component: React.ComponentType; label: string }> = {
  executive: { component: ExecutiveDashboardView, label: 'Executive Dashboard' },
  macro: { component: MacroView, label: 'Macro Oracle' },
  meso: { component: MesoView, label: 'Meso Analysis' },
  micro: { component: MicroView, label: 'Micro Analysis' },
  currency: { component: CurrencyStrengthView, label: 'Currency Strength' },
  liquidity: { component: LiquidityMapView, label: 'Liquidity Map' },
  signals: { component: SignalOutputView, label: 'Signal Output' },
  risk: { component: RiskDashboardView, label: 'Risk Dashboard' },
  incubator: { component: IncubatorView, label: 'Incubator' },
  scanner: { component: ScannerView, label: 'Scanner' },
  lab: { component: LabView, label: 'Lab' },
};

export function App() {
  const { view } = useTerminal();
  const entry = VIEW_MAP[view] || VIEW_MAP.executive;
  const ViewComponent = entry.component;

  return (
    <Shell>
      <ErrorBoundary key={view} fallbackLabel={entry.label}>
        <ViewComponent />
      </ErrorBoundary>
    </Shell>
  );
}
