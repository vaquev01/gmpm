'use client';

import React, { useState } from 'react';
import { useStore } from '@/store/useStore';
import { FractalSMCView } from './FractalSMCView';
import { ScoringView } from './ScoringView';
import { FeatureSetView } from './FeatureSetView';
import { MultiTimeframeView } from './MultiTimeframeView';
import { cn } from '@/lib/utils';
import { Brain, Globe, BarChart3, TrendingUp, Layers, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const LabView = () => {
    const { assetUniverse } = useStore();
    const [selectedAsset, setSelectedAsset] = useState('SPY'); // Default

    // Simple mock assets list based on categories
    const commonAssets = ['SPY', 'QQQ', 'BTC', 'ETH', 'GLD', 'EUR/USD', 'US10Y'];

    return (
        <div className="space-y-6 max-w-[1600px] mx-auto">

            {/* TOP BAR: ASSET SELECTION */}
            <div className="flex items-center justify-between border-b border-gray-800 pb-4">
                <div className="flex items-center gap-4">
                    <h2 className="text-2xl font-bold text-gray-100 flex items-center gap-2">
                        <Brain className="w-8 h-8 text-blue-500" />
                        LAB
                    </h2>
                    <div className="h-8 w-px bg-gray-800" />

                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" className="min-w-[200px] justify-between bg-gray-900 border-gray-700 text-lg h-10">
                                {selectedAsset}
                                <ChevronDown className="ml-2 h-4 w-4 opacity-50" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="bg-gray-900 border-gray-800">
                            {commonAssets.map((asset) => (
                                <DropdownMenuItem
                                    key={asset}
                                    onClick={() => setSelectedAsset(asset)}
                                    className="text-gray-200 focus:bg-gray-800 focus:text-white cursor-pointer"
                                >
                                    {asset}
                                </DropdownMenuItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>

                <div className="flex gap-2">
                    <span className="text-xs text-gray-500 uppercase tracking-widest self-center">
                        Analyst Workstation (v8.1)
                    </span>
                </div>
            </div>

            {/* MAIN CONTENT: UNIFIED PATIENT VIEW */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-200px)]">

                {/* LEFT ZONE: FRACTAL STRUCTURE (65%) */}
                <div className="lg:col-span-8 space-y-6 overflow-y-auto scrollbar-none pr-2">
                    <FractalSMCView symbol={selectedAsset} />
                </div>

                {/* RIGHT ZONE: VITALS & DATA (35%) */}
                <div className="lg:col-span-4 space-y-6 flex flex-col h-full overflow-y-auto scrollbar-none pb-12">
                    {/* Score DNA */}
                    <div className="flex-shrink-0">
                        <ScoringView symbol={selectedAsset} />
                    </div>

                    {/* MTF Alignment */}
                    <div className="flex-shrink-0">
                        <MultiTimeframeView symbol={selectedAsset} />
                    </div>

                    {/* Feature Vector Sample (Collapsible or Mini) */}
                    <div className="flex-shrink-0 opacity-80 hover:opacity-100 transition-opacity">
                        <div className="text-xs text-gray-500 uppercase font-bold mb-2 flex items-center gap-2">
                            <Brain className="w-3 h-3" /> Raw Feature Vector
                        </div>
                        <div className="bg-gray-900/50 p-4 rounded border border-gray-800 font-mono text-xs text-green-400 overflow-hidden">
                            [0.82, -0.45, 1.20, 0.05, -0.90, 0.33, ...]
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
