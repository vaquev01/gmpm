import React from 'react';
import { useStore } from '@/store/useStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';

interface MultiTimeframeViewProps {
    symbol: string;
}

export const MultiTimeframeView = ({ symbol }: MultiTimeframeViewProps) => {
    const { timeframes } = useStore();

    const getAlignment = (tf: string) => {
        const hash = symbol.length + tf.length;
        return hash % 2 === 0 ? 'BULLISH' : 'NEUTRAL'; // Simple mock
    };

    return (
        <Card className="bg-gray-900/50 border-gray-800 backdrop-blur-sm">
            <CardHeader>
                <CardTitle className="text-xl font-bold text-green-400">
                    Multi-Timeframe Confluence
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                {timeframes.map((tf, i) => (
                    <div
                        key={i}
                        className="group bg-gray-800/50 hover:bg-gray-800 border border-gray-700/50 hover:border-green-900/50 rounded-lg p-4 transition-all duration-200"
                    >
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 mb-2">
                            <div className="flex items-center gap-4">
                                <span className="font-bold text-lg text-white w-20 group-hover:text-green-300 transition-colors">
                                    {tf.tf}
                                </span>
                                <span className="text-sm text-gray-400">
                                    {tf.use}
                                </span>
                            </div>
                            <span className="text-sm font-bold text-green-400 self-end md:self-auto">
                                {tf.weight}% Weight
                            </span>
                        </div>

                        <div className="relative pt-1">
                            <Progress value={tf.weight} className="h-2 bg-gray-700/50" indicatorClassName="bg-green-500" />
                        </div>
                    </div>
                ))}

                <div className="mt-8 text-center bg-gray-800/30 p-4 rounded-lg border border-gray-700/30">
                    <div className="flex items-center justify-center gap-2 text-xs md:text-sm font-mono text-gray-400 overflow-x-auto">
                        <span>MONTHLY</span>
                        <span>→</span>
                        <span>WEEKLY</span>
                        <span>→</span>
                        <span>DAILY</span>
                        <span>→</span>
                        <span className="text-green-400 font-bold">H4 (Timing)</span>
                        <span>→</span>
                        <span>H1</span>
                        <span>→</span>
                        <span>M15</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">Top-Down Analysis Flow</p>
                </div>
            </CardContent>
        </Card>
    );
};
