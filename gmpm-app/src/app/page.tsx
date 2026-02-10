"use client";

import { Suspense, lazy } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useStore } from '@/store/useStore';
import { Loader2 } from 'lucide-react';

const CommandView = lazy(() => import('@/components/views/CommandView').then(m => ({ default: m.CommandView })));
const MacroView = lazy(() => import('@/components/views/MacroView').then(m => ({ default: m.MacroView })));
const MesoView = lazy(() => import('@/components/views/MesoView').then(m => ({ default: m.MesoView })));
const MicroView = lazy(() => import('@/components/views/MicroView').then(m => ({ default: m.MicroView })));
const LiquidityHeatmap = lazy(() => import('@/components/views/LiquidityHeatmap').then(m => ({ default: m.LiquidityHeatmap })));
const CurrencyStrengthView = lazy(() => import('@/components/views/CurrencyStrengthView'));
const LabView = lazy(() => import('@/components/views/LabView').then(m => ({ default: m.LabView })));
const FactoryView = lazy(() => import('@/components/views/FactoryView').then(m => ({ default: m.FactoryView })));
const IncubatorView = lazy(() => import('@/components/views/IncubatorView').then(m => ({ default: m.IncubatorView })));
const SignalOutputView = lazy(() => import('@/components/views/SignalOutputView').then(m => ({ default: m.SignalOutputView })));
const ExecutiveDashboardView = lazy(() => import('@/components/views/ExecutiveDashboardView').then(m => ({ default: m.ExecutiveDashboardView })));
const AssetUniverseView = lazy(() => import('@/components/views/AssetUniverseView').then(m => ({ default: m.AssetUniverseView })));

function ViewLoader() {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="w-8 h-8 text-yellow-500 animate-spin" />
        <span className="text-sm text-gray-500 font-mono">Loading view...</span>
      </div>
    </div>
  );
}

export default function Home() {
  const { view } = useStore();

  const renderView = () => {
    switch (view) {
      case 'command':
        return <CommandView />;
      case 'macro':
        return <MacroView />;
      case 'meso':
        return <MesoView />;
      case 'micro':
        return <MicroView />;
      case 'liquidity':
        return <LiquidityHeatmap />;
      case 'currency':
        return <CurrencyStrengthView />;
      case 'lab':
        return <LabView />;
      case 'factory':
        return <FactoryView />;
      case 'incubator':
        return <IncubatorView />;
      case 'signals':
        return <SignalOutputView />;
      case 'executive':
        return <ExecutiveDashboardView />;
      case 'universe':
        return <AssetUniverseView />;
      default:
        return <CommandView />;
    }
  };

  return (
    <DashboardLayout>
      <Suspense fallback={<ViewLoader />}>
        {renderView()}
      </Suspense>
    </DashboardLayout>
  );
}
