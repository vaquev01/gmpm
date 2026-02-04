"use client";

import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { CommandView } from '@/components/views/CommandView';
import { LabView } from '@/components/views/LabView';
import { FactoryView } from '@/components/views/FactoryView';
import { IncubatorView } from '@/components/views/IncubatorView';
import { MacroView } from '@/components/views/MacroView';
import { MesoView } from '@/components/views/MesoView';
import { MicroView } from '@/components/views/MicroView';
import { LiquidityHeatmap } from '@/components/views/LiquidityHeatmap';
import { AssetUniverseView } from '@/components/views/AssetUniverseView';
import { useStore } from '@/store/useStore';

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
      case 'lab':
        return <LabView />;
      case 'factory':
        return <FactoryView />;
      case 'incubator':
        return <IncubatorView />;
      case 'universe':
        return <AssetUniverseView />;
      default:
        return <CommandView />;
    }
  };

  return (
    <DashboardLayout>
      {renderView()}
    </DashboardLayout>
  );
}
