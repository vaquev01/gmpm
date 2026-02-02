import React from 'react';
import { useStore } from '@/store/useStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';

interface ScoringViewProps {
    symbol: string;
}

export const ScoringView = ({ symbol }: ScoringViewProps) => {
    const { scoreComponents } = useStore();

    // Simulating dynamic scores for the asset
    const getScoreForComponent = (comp: string) => {
        const hash = symbol.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) + comp.length;
        return 40 + (hash % 60); // Random score 40-100
    };

    return (
        <Card className="bg-gray-900/50 border-gray-800 backdrop-blur-sm">
            <CardHeader>
                <CardTitle className="text-xl font-bold text-orange-400">
                    Asset Scoring System (0-100)
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="space-y-3">
                    {scoreComponents.map((score, i) => {
                        const val = getScoreForComponent(score.comp);
                        return (
                            <div
                                key={i}
                                className="bg-gray-800/50 rounded-lg p-3 flex flex-col md:flex-row md:items-center justify-between gap-2"
                            >
                                <span className="text-gray-100 font-medium md:w-1/3 text-xs">{score.comp}</span>

                                <div className="flex-1 flex items-center gap-3 w-full">
                                    <Progress
                                        value={val}
                                        className="h-2 bg-gray-700/50"
                                        indicatorClassName={val > 70 ? "bg-green-500" : val > 50 ? "bg-yellow-500" : "bg-red-500"}
                                    />
                                    <span className={`text-xs font-bold w-8 text-right ${val > 70 ? "text-green-400" : val > 50 ? "text-yellow-400" : "text-red-400"}`}>
                                        {val}
                                    </span>
                                </div>
                            </div>
                        )
                    })}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center text-sm pt-4 border-t border-gray-800">
                    <div className="bg-red-900/20 border border-red-900/30 rounded-lg p-4">
                        <div className="text-xl font-bold text-red-400 mb-1">0 - 54</div>
                        <div className="text-gray-500 font-medium tracking-wider">NO TRADE</div>
                    </div>
                    <div className="bg-yellow-900/20 border border-yellow-900/30 rounded-lg p-4">
                        <div className="text-xl font-bold text-yellow-400 mb-1">55 - 74</div>
                        <div className="text-gray-500 font-medium tracking-wider">MODERATE</div>
                    </div>
                    <div className="bg-green-900/20 border border-green-900/30 rounded-lg p-4">
                        <div className="text-xl font-bold text-green-400 mb-1">75 - 100</div>
                        <div className="text-gray-500 font-medium tracking-wider">STRONG</div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
};
