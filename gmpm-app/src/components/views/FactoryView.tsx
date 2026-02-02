'use client';

import React, { useState } from 'react';
import { BacktestView } from './BacktestView';
import { PaperTradingView } from './PaperTradingView';
import { LearningInsightsView } from './LearningInsightsView';
import { RiskDashboardView } from './RiskDashboardView';
import { cn } from '@/lib/utils';
import { Factory, Play, Shield, FlaskConical, History } from 'lucide-react';

type FactoryTab = 'backtest' | 'paper' | 'learning' | 'risk';

export const FactoryView = () => {
    const [activeTab, setActiveTab] = useState<FactoryTab>('paper');

    const tabs = [
        { id: 'paper', label: 'Incubator (Paper)', icon: FlaskConical },
        { id: 'backtest', label: 'Backtest Engine', icon: History },
        { id: 'risk', label: 'Risk Manager', icon: Shield },
        { id: 'learning', label: 'Learning Loop', icon: Factory },
    ];

    const renderTab = () => {
        switch (activeTab) {
            case 'backtest': return <BacktestView />;
            case 'paper': return <PaperTradingView />;
            case 'learning': return <LearningInsightsView />;
            case 'risk': return <RiskDashboardView />;
            default: return <PaperTradingView />;
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-gray-100 flex items-center gap-2">
                    <Factory className="w-8 h-8 text-purple-500" />
                    THE FACTORY <span className="text-sm font-normal text-gray-500 ml-2">System Development & Optimization</span>
                </h2>
            </div>

            {/* Sub Navigation */}
            <div className="flex border-b border-gray-800">
                {tabs.map((tab) => {
                    const Icon = tab.icon;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as FactoryTab)}
                            className={cn(
                                "flex items-center gap-2 px-6 py-3 border-b-2 transition-colors text-sm font-medium",
                                activeTab === tab.id
                                    ? "border-purple-500 text-purple-400 bg-purple-500/5"
                                    : "border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-700"
                            )}
                        >
                            <Icon className="w-4 h-4" />
                            {tab.label}
                        </button>
                    )
                })}
            </div>

            <div className="mt-6">
                {renderTab()}
            </div>
        </div>
    );
};
