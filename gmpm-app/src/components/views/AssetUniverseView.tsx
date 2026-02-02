import React from 'react';
import { useStore } from '@/store/useStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export const AssetUniverseView = () => {
    const { assetUniverse } = useStore();
    const totalAssets = assetUniverse.reduce((sum, a) => sum + a.count, 0);

    return (
        <Card className="bg-gray-900/50 border-gray-800 backdrop-blur-sm">
            <CardHeader>
                <CardTitle className="text-xl font-bold text-blue-400">
                    Complete Asset Universe ({totalAssets} Assets)
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
                {assetUniverse.map((asset, i) => (
                    <div
                        key={i}
                        className="group bg-gray-800/50 hover:bg-gray-800 border border-gray-700/50 hover:border-blue-900/50 rounded-lg p-4 flex flex-col md:flex-row md:items-center justify-between transition-all duration-200"
                    >
                        <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-6">
                            <span className="font-bold text-lg text-gray-100 w-32 group-hover:text-blue-300 transition-colors">
                                {asset.class}
                            </span>
                            <span className="text-sm text-gray-400 font-mono">
                                {asset.examples}
                            </span>
                        </div>
                        <div className="mt-2 md:mt-0 bg-blue-900/20 px-3 py-1 rounded-full border border-blue-900/30">
                            <span className="text-lg font-bold text-blue-400">{asset.count}</span>
                        </div>
                    </div>
                ))}
            </CardContent>
        </Card>
    );
};
