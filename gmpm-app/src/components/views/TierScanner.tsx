'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
    ChevronDown, ChevronUp, Trophy, Star, AlertTriangle, Eye, Ban,
    TrendingUp, TrendingDown, Minus, CheckCircle2, XCircle, RefreshCw,
    Zap, Target, Shield, Brain, Activity
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type {
    ActionDecision,
    ConfidenceTier,
    DecisionEngineResponse,
    EvidenceItem,
} from '@/lib/decisionEngine';
import { TIER_CONFIG } from '@/lib/decisionEngine';

// ============================================================================
// TYPES
// ============================================================================

interface TierScannerProps {
    onSelectAsset?: (symbol: string) => void;
    onExecute?: (decision: ActionDecision) => void;
    className?: string;
}

interface TierSectionProps {
    tier: ConfidenceTier;
    decisions: ActionDecision[];
    expanded: boolean;
    onToggle: () => void;
    onSelectAsset?: (symbol: string) => void;
    onExecute?: (decision: ActionDecision) => void;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const TIER_STYLES: Record<ConfidenceTier, {
    bg: string;
    border: string;
    text: string;
    icon: React.ReactNode;
    buttonStyle: string;
}> = {
    A: {
        bg: 'bg-gradient-to-r from-green-950/40 to-emerald-950/30',
        border: 'border-green-500/50',
        text: 'text-green-400',
        icon: <Trophy className="w-5 h-5 text-green-400" />,
        buttonStyle: 'bg-green-600 hover:bg-green-500 text-white animate-pulse',
    },
    B: {
        bg: 'bg-gradient-to-r from-blue-950/40 to-cyan-950/30',
        border: 'border-blue-500/40',
        text: 'text-blue-400',
        icon: <Star className="w-5 h-5 text-blue-400" />,
        buttonStyle: 'bg-blue-600 hover:bg-blue-500 text-white',
    },
    C: {
        bg: 'bg-gradient-to-r from-yellow-950/30 to-amber-950/20',
        border: 'border-yellow-500/30',
        text: 'text-yellow-400',
        icon: <AlertTriangle className="w-5 h-5 text-yellow-400" />,
        buttonStyle: 'bg-yellow-600 hover:bg-yellow-500 text-black',
    },
    D: {
        bg: 'bg-gray-900/50',
        border: 'border-gray-700/50',
        text: 'text-gray-400',
        icon: <Eye className="w-5 h-5 text-gray-400" />,
        buttonStyle: 'bg-gray-600 hover:bg-gray-500 text-white',
    },
    F: {
        bg: 'bg-gray-950/30',
        border: 'border-gray-800/30',
        text: 'text-gray-500',
        icon: <Ban className="w-5 h-5 text-gray-500" />,
        buttonStyle: 'bg-gray-700 text-gray-400 cursor-not-allowed',
    },
};

// ============================================================================
// HELPER COMPONENTS
// ============================================================================

const DirectionBadge = ({ direction }: { direction: 'LONG' | 'SHORT' | 'NEUTRAL' }) => {
    if (direction === 'LONG') {
        return (
            <span className="flex items-center gap-1 text-xs font-bold text-green-400 bg-green-500/20 px-2 py-0.5 rounded">
                <TrendingUp className="w-3 h-3" /> LONG
            </span>
        );
    }
    if (direction === 'SHORT') {
        return (
            <span className="flex items-center gap-1 text-xs font-bold text-red-400 bg-red-500/20 px-2 py-0.5 rounded">
                <TrendingDown className="w-3 h-3" /> SHORT
            </span>
        );
    }
    return (
        <span className="flex items-center gap-1 text-xs font-bold text-gray-400 bg-gray-500/20 px-2 py-0.5 rounded">
            <Minus className="w-3 h-3" /> NEUTRAL
        </span>
    );
};

const CoverageBadge = ({ coverage }: { coverage: string }) => {
    const colors: Record<string, string> = {
        FULL: 'text-green-400 bg-green-500/20',
        HIGH: 'text-blue-400 bg-blue-500/20',
        MEDIUM: 'text-yellow-400 bg-yellow-500/20',
        LOW: 'text-orange-400 bg-orange-500/20',
        MINIMAL: 'text-red-400 bg-red-500/20',
    };
    return (
        <span className={cn("text-[10px] font-mono px-1.5 py-0.5 rounded", colors[coverage] || colors.MEDIUM)}>
            {coverage}
        </span>
    );
};

const AlignmentBadge = ({ alignment }: { alignment: string }) => {
    if (alignment === 'ALIGNED') {
        return <span className="text-[10px] text-green-400">✓ Aligned</span>;
    }
    if (alignment === 'CONFLICTING') {
        return <span className="text-[10px] text-red-400">✗ Conflicting</span>;
    }
    return <span className="text-[10px] text-gray-400">— Neutral</span>;
};

const EvidenceList = ({ items, type }: { items: EvidenceItem[]; type: 'supporting' | 'opposing' }) => {
    if (items.length === 0) return null;
    
    const color = type === 'supporting' ? 'text-green-400' : 'text-red-400';
    const bgColor = type === 'supporting' ? 'bg-green-500/10' : 'bg-red-500/10';
    const icon = type === 'supporting' ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />;
    
    return (
        <div className={cn("rounded p-2", bgColor)}>
            <div className={cn("text-[9px] uppercase font-bold mb-1 flex items-center gap-1", color)}>
                {icon} {type === 'supporting' ? 'Supporting' : 'Opposing'} ({items.length})
            </div>
            <div className="space-y-0.5">
                {items.slice(0, 4).map((item, i) => (
                    <div key={i} className="text-[10px] text-gray-300 flex items-center gap-1">
                        <span className={cn(
                            "w-1.5 h-1.5 rounded-full",
                            item.impact === 'STRONG' ? 'bg-current' :
                            item.impact === 'MODERATE' ? 'bg-current opacity-60' : 'bg-current opacity-30'
                        )} style={{ color: type === 'supporting' ? '#4ade80' : '#f87171' }} />
                        {item.factor}
                    </div>
                ))}
            </div>
        </div>
    );
};

const formatPrice = (price: number) => {
    if (!price || !Number.isFinite(price)) return '—';
    if (price < 0.01) return price.toFixed(6);
    if (price < 1) return price.toFixed(4);
    if (price < 10) return price.toFixed(3);
    if (price < 1000) return price.toFixed(2);
    return price.toLocaleString('en-US', { maximumFractionDigits: 2 });
};

// ============================================================================
// DECISION CARD
// ============================================================================

const DecisionCard = ({
    decision,
    onSelect,
    onExecute,
}: {
    decision: ActionDecision;
    onSelect?: () => void;
    onExecute?: () => void;
}) => {
    const [expanded, setExpanded] = useState(false);
    const tierStyle = TIER_STYLES[decision.tier];
    const config = TIER_CONFIG[decision.tier];
    
    const canExecute = decision.action.startsWith('EXECUTE') && decision.blockers.length === 0;
    
    return (
        <div
            className={cn(
                "rounded-lg border transition-all",
                tierStyle.border,
                expanded ? tierStyle.bg : 'bg-gray-900/60',
                "hover:bg-opacity-80"
            )}
        >
            {/* Header Row */}
            <div
                className="p-3 cursor-pointer"
                onClick={() => setExpanded(!expanded)}
            >
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        {/* Direction Icon */}
                        <div className={cn(
                            "w-10 h-10 rounded-lg flex items-center justify-center",
                            decision.direction === 'LONG' ? 'bg-green-500/20' :
                            decision.direction === 'SHORT' ? 'bg-red-500/20' : 'bg-gray-500/20'
                        )}>
                            {decision.direction === 'LONG' ? (
                                <TrendingUp className="w-5 h-5 text-green-400" />
                            ) : decision.direction === 'SHORT' ? (
                                <TrendingDown className="w-5 h-5 text-red-400" />
                            ) : (
                                <Minus className="w-5 h-5 text-gray-400" />
                            )}
                        </div>
                        
                        {/* Asset Info */}
                        <div>
                            <div className="flex items-center gap-2">
                                <span className="font-bold text-lg text-white">{decision.displaySymbol}</span>
                                <DirectionBadge direction={decision.direction} />
                                <CoverageBadge coverage={decision.coverageTier} />
                            </div>
                            <div className="text-[11px] text-gray-400 flex items-center gap-2">
                                <span>{decision.name || decision.assetClass}</span>
                                <span className="text-gray-600">•</span>
                                <AlignmentBadge alignment={decision.alignment} />
                                {decision.warnings.length > 0 && (
                                    <>
                                        <span className="text-gray-600">•</span>
                                        <span className="text-yellow-400">{decision.warnings.length} warning{decision.warnings.length > 1 ? 's' : ''}</span>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                    
                    {/* Right Side: Score + R:R + Action */}
                    <div className="flex items-center gap-4">
                        {/* Unified Score */}
                        <div className="text-center">
                            <div className={cn("text-2xl font-bold", tierStyle.text)}>
                                {decision.unifiedScore}
                            </div>
                            <div className="text-[9px] text-gray-500 uppercase">Score</div>
                        </div>
                        
                        {/* R:R */}
                        {decision.tradePlan && (
                            <div className="text-center">
                                <div className={cn(
                                    "text-xl font-bold",
                                    decision.tradePlan.riskReward >= 2.5 ? 'text-green-400' :
                                    decision.tradePlan.riskReward >= 2 ? 'text-blue-400' :
                                    decision.tradePlan.riskReward >= 1.5 ? 'text-yellow-400' : 'text-gray-400'
                                )}>
                                    {decision.tradePlan.riskReward.toFixed(1)}
                                </div>
                                <div className="text-[9px] text-gray-500 uppercase">R:R</div>
                            </div>
                        )}
                        
                        {/* Action Button */}
                        {canExecute && onExecute && (
                            <Button
                                size="sm"
                                className={cn("font-bold", tierStyle.buttonStyle)}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onExecute();
                                }}
                            >
                                <Zap className="w-4 h-4 mr-1" />
                                {decision.tier === 'A' ? 'EXECUTE NOW' : 'EXECUTE'}
                            </Button>
                        )}
                        
                        {!canExecute && decision.tier !== 'F' && (
                            <Button
                                size="sm"
                                variant="outline"
                                className="text-gray-400 border-gray-700"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onSelect?.();
                                }}
                            >
                                <Eye className="w-4 h-4 mr-1" /> View
                            </Button>
                        )}
                        
                        {/* Expand Icon */}
                        <div className={cn("transition-transform", expanded && "rotate-180")}>
                            <ChevronDown className="w-5 h-5 text-gray-500" />
                        </div>
                    </div>
                </div>
            </div>
            
            {/* Expanded Content */}
            {expanded && (
                <div className="border-t border-gray-800 p-4 bg-gray-950/50">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                        
                        {/* Column 1: Evidence */}
                        <div className="space-y-3">
                            <div className="text-[10px] text-purple-400 uppercase font-bold flex items-center gap-1">
                                <Brain className="w-3 h-3" /> Evidence Analysis
                            </div>
                            
                            <EvidenceList items={decision.evidence.supporting} type="supporting" />
                            <EvidenceList items={decision.evidence.opposing} type="opposing" />
                            
                            {decision.evidence.missing.length > 0 && (
                                <div className="bg-gray-800/50 rounded p-2">
                                    <div className="text-[9px] text-gray-500 uppercase font-bold mb-1">
                                        Missing Data ({decision.evidence.missing.length})
                                    </div>
                                    <div className="flex flex-wrap gap-1">
                                        {decision.evidence.missing.map((item, i) => (
                                            <span key={i} className="text-[10px] text-gray-400 bg-gray-700/50 px-1.5 py-0.5 rounded">
                                                {item}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                        
                        {/* Column 2: Trade Plan */}
                        {decision.tradePlan && (
                            <div className="space-y-3">
                                <div className="text-[10px] text-blue-400 uppercase font-bold flex items-center gap-1">
                                    <Target className="w-3 h-3" /> Trade Plan
                                </div>
                                
                                <div className="bg-blue-500/10 border border-blue-500/30 rounded p-3">
                                    <div className="flex justify-between items-center">
                                        <span className="text-blue-400 font-bold text-xs">ENTRY</span>
                                        <span className="font-mono text-white text-lg font-bold">
                                            {formatPrice(decision.tradePlan.entry.price)}
                                        </span>
                                    </div>
                                    <div className="text-[9px] text-gray-500 mt-1">
                                        Type: {decision.tradePlan.entry.type}
                                    </div>
                                </div>
                                
                                <div className="bg-red-500/10 border border-red-500/30 rounded p-3">
                                    <div className="flex justify-between items-center">
                                        <span className="text-red-400 font-bold text-xs">STOP LOSS</span>
                                        <span className="font-mono text-white text-lg font-bold">
                                            {formatPrice(decision.tradePlan.stopLoss.price)}
                                        </span>
                                    </div>
                                    <div className="text-[9px] text-gray-500 mt-1">
                                        Risk: {decision.tradePlan.stopLoss.riskPercent.toFixed(2)}%
                                    </div>
                                </div>
                                
                                <div className="bg-green-500/10 border border-green-500/30 rounded p-3 space-y-2">
                                    <div className="flex justify-between items-center">
                                        <span className="text-green-400 font-bold text-xs">TP1 (50%)</span>
                                        <span className="font-mono text-white font-bold">
                                            {formatPrice(decision.tradePlan.targets.tp1)}
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-green-400/70 text-xs">TP2 (30%)</span>
                                        <span className="font-mono text-gray-300">
                                            {formatPrice(decision.tradePlan.targets.tp2)}
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-green-400/50 text-xs">TP3 (20%)</span>
                                        <span className="font-mono text-gray-400">
                                            {formatPrice(decision.tradePlan.targets.tp3)}
                                        </span>
                                    </div>
                                </div>
                                
                                <div className="bg-gray-800/50 rounded p-2 text-center">
                                    <div className="text-[10px] text-gray-500">Position Size</div>
                                    <div className="text-sm font-bold text-white">
                                        {decision.tradePlan.positionSize.final.toFixed(2)}%
                                    </div>
                                    <div className="text-[9px] text-gray-500">
                                        ({config.label} → {(config.positionMultiplier * 100).toFixed(0)}% of base)
                                    </div>
                                </div>
                            </div>
                        )}
                        
                        {/* Column 3: Warnings & Decision Path */}
                        <div className="space-y-3">
                            <div className="text-[10px] text-amber-400 uppercase font-bold flex items-center gap-1">
                                <Shield className="w-3 h-3" /> Risk & Audit
                            </div>
                            
                            {decision.blockers.length > 0 && (
                                <div className="bg-red-500/10 border border-red-500/30 rounded p-2">
                                    <div className="text-[9px] text-red-400 uppercase font-bold mb-1 flex items-center gap-1">
                                        <XCircle className="w-3 h-3" /> Blockers
                                    </div>
                                    <div className="space-y-0.5">
                                        {decision.blockers.map((b, i) => (
                                            <div key={i} className="text-[10px] text-red-300">{b}</div>
                                        ))}
                                    </div>
                                </div>
                            )}
                            
                            {decision.warnings.length > 0 && (
                                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded p-2">
                                    <div className="text-[9px] text-yellow-400 uppercase font-bold mb-1 flex items-center gap-1">
                                        <AlertTriangle className="w-3 h-3" /> Warnings
                                    </div>
                                    <div className="space-y-0.5">
                                        {decision.warnings.map((w, i) => (
                                            <div key={i} className="text-[10px] text-yellow-300">{w}</div>
                                        ))}
                                    </div>
                                </div>
                            )}
                            
                            <div className="bg-gray-800/50 rounded p-2">
                                <div className="text-[9px] text-gray-500 uppercase font-bold mb-1 flex items-center gap-1">
                                    <Activity className="w-3 h-3" /> Decision Path
                                </div>
                                <div className="space-y-0.5">
                                    {decision.decisionPath.slice(-4).map((step, i) => (
                                        <div key={i} className="text-[10px] text-gray-400 font-mono">{step}</div>
                                    ))}
                                </div>
                            </div>
                            
                            <div className="text-[9px] text-gray-600 text-center">
                                Max Hold: {decision.tradePlan?.maxHoldTime || 'N/A'}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// ============================================================================
// TIER SECTION
// ============================================================================

const TierSection = ({
    tier,
    decisions,
    expanded,
    onToggle,
    onSelectAsset,
    onExecute,
}: TierSectionProps) => {
    const style = TIER_STYLES[tier];
    const config = TIER_CONFIG[tier];
    
    if (decisions.length === 0) return null;
    
    return (
        <div className="space-y-2">
            {/* Section Header */}
            <div
                className={cn(
                    "flex items-center justify-between px-4 py-2 rounded-lg cursor-pointer transition-all",
                    style.bg, style.border, "border"
                )}
                onClick={onToggle}
            >
                <div className="flex items-center gap-3">
                    {style.icon}
                    <div>
                        <div className={cn("text-sm font-bold uppercase tracking-wider", style.text)}>
                            TIER {tier} — {config.label}
                        </div>
                        <div className="text-[10px] text-gray-500">
                            {config.description}
                        </div>
                    </div>
                </div>
                
                <div className="flex items-center gap-3">
                    <div className={cn("text-xl font-bold", style.text)}>
                        {decisions.length}
                    </div>
                    {expanded ? (
                        <ChevronUp className="w-5 h-5 text-gray-500" />
                    ) : (
                        <ChevronDown className="w-5 h-5 text-gray-500" />
                    )}
                </div>
            </div>
            
            {/* Cards */}
            {expanded && (
                <div className="space-y-2 pl-2">
                    {decisions.map((decision) => (
                        <DecisionCard
                            key={decision.asset}
                            decision={decision}
                            onSelect={() => onSelectAsset?.(decision.displaySymbol)}
                            onExecute={() => onExecute?.(decision)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const TierScanner: React.FC<TierScannerProps> = ({
    onSelectAsset,
    onExecute,
    className,
}) => {
    const [data, setData] = useState<DecisionEngineResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
    
    const [expandedTiers, setExpandedTiers] = useState<Set<ConfidenceTier>>(
        new Set(['A', 'B']) // A and B expanded by default
    );
    
    const [filterClass, setFilterClass] = useState<string>('ALL');
    const [filterActionable, setFilterActionable] = useState(false);
    
    const fetchData = useCallback(async () => {
        try {
            setLoading(true);
            const res = await fetch('/api/decision-engine');
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = await res.json();
            setData(json);
            setError(null);
            setLastUpdate(new Date());
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to fetch');
        } finally {
            setLoading(false);
        }
    }, []);
    
    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 30000); // Refresh every 30s
        return () => clearInterval(interval);
    }, [fetchData]);
    
    const toggleTier = useCallback((tier: ConfidenceTier) => {
        setExpandedTiers(prev => {
            const next = new Set(prev);
            if (next.has(tier)) {
                next.delete(tier);
            } else {
                next.add(tier);
            }
            return next;
        });
    }, []);
    
    const filteredDecisions = useMemo(() => {
        if (!data?.decisions) return [];
        
        let filtered = data.decisions;
        
        if (filterClass !== 'ALL') {
            filtered = filtered.filter(d => d.assetClass === filterClass);
        }
        
        if (filterActionable) {
            filtered = filtered.filter(d => d.action.startsWith('EXECUTE'));
        }
        
        return filtered;
    }, [data?.decisions, filterClass, filterActionable]);
    
    const decisionsByTier = useMemo(() => {
        const tiers: Record<ConfidenceTier, ActionDecision[]> = {
            A: [], B: [], C: [], D: [], F: []
        };
        
        for (const d of filteredDecisions) {
            tiers[d.tier].push(d);
        }
        
        return tiers;
    }, [filteredDecisions]);
    
    const assetClasses = useMemo(() => {
        if (!data?.decisions) return [];
        const classes = new Set(data.decisions.map(d => d.assetClass));
        return Array.from(classes).sort();
    }, [data?.decisions]);
    
    return (
        <Card className={cn("bg-gray-900 border-gray-800", className)}>
            <CardHeader className="py-3 px-4 border-b border-gray-800">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Target className="w-5 h-5 text-purple-500" />
                        <CardTitle className="text-sm font-bold text-gray-200 uppercase tracking-wider">
                            Decision Engine Scanner
                        </CardTitle>
                        
                        {/* Market Bias */}
                        {data?.summary && (
                            <span className={cn(
                                "text-xs font-bold px-2 py-0.5 rounded",
                                data.summary.marketBias === 'RISK_ON' ? 'bg-green-500/20 text-green-400' :
                                data.summary.marketBias === 'RISK_OFF' ? 'bg-red-500/20 text-red-400' :
                                'bg-gray-500/20 text-gray-400'
                            )}>
                                {data.summary.marketBias}
                            </span>
                        )}
                    </div>
                    
                    <div className="flex items-center gap-4 text-[10px] font-mono text-gray-500">
                        {/* Tier Summary */}
                        {data?.summary && (
                            <>
                                <span className="text-green-400">A: {data.summary.tierA}</span>
                                <span className="text-blue-400">B: {data.summary.tierB}</span>
                                <span className="text-yellow-400">C: {data.summary.tierC}</span>
                                <span className="text-gray-400">D: {data.summary.tierD}</span>
                                <span className="text-gray-500">F: {data.summary.tierF}</span>
                            </>
                        )}
                        
                        {/* Filters */}
                        <select
                            value={filterClass}
                            onChange={(e) => setFilterClass(e.target.value)}
                            className="bg-gray-800 border border-gray-700 text-xs text-white px-2 py-1 rounded"
                        >
                            <option value="ALL">All Classes</option>
                            {assetClasses.map(c => (
                                <option key={c} value={c}>{c}</option>
                            ))}
                        </select>
                        
                        <label className="flex items-center gap-1 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={filterActionable}
                                onChange={(e) => setFilterActionable(e.target.checked)}
                                className="w-3 h-3"
                            />
                            <span>Actionable Only</span>
                        </label>
                        
                        {/* Status */}
                        <span className={cn(
                            "flex items-center gap-1",
                            loading ? 'text-yellow-500' : 
                            error ? 'text-red-500' : 
                            data?.dataHealth?.feedStatus === 'HEALTHY' ? 'text-green-500' : 'text-yellow-500'
                        )}>
                            <div className={cn(
                                "w-2 h-2 rounded-full",
                                loading ? 'bg-yellow-500 animate-pulse' :
                                error ? 'bg-red-500' :
                                'bg-green-500'
                            )} />
                            {loading ? 'LOADING...' : error ? 'ERROR' : 'LIVE'}
                        </span>
                        
                        <span>
                            {lastUpdate ? lastUpdate.toLocaleTimeString() : '—'}
                        </span>
                        
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={fetchData}
                            disabled={loading}
                        >
                            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
                        </Button>
                    </div>
                </div>
            </CardHeader>
            
            <CardContent className="p-4 space-y-3 max-h-[calc(100vh-300px)] overflow-y-auto">
                {error && (
                    <div className="bg-red-950/30 border border-red-500/30 rounded p-3 text-sm text-red-300">
                        Error: {error}
                    </div>
                )}
                
                {loading && !data && (
                    <div className="flex items-center justify-center py-8 text-gray-500">
                        <RefreshCw className="w-6 h-6 animate-spin mr-2" />
                        Loading Decision Engine...
                    </div>
                )}
                
                {data && (
                    <>
                        {/* Top Picks Banner */}
                        {data.summary.topPicks.length > 0 && (
                            <div className="bg-gradient-to-r from-green-950/40 to-blue-950/30 border border-green-500/30 rounded-lg p-3">
                                <div className="flex items-center gap-2 mb-2">
                                    <Trophy className="w-4 h-4 text-green-400" />
                                    <span className="text-xs font-bold text-green-400 uppercase">Top Picks</span>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {data.summary.topPicks.map(pick => (
                                        <Button
                                            key={pick}
                                            size="sm"
                                            variant="outline"
                                            className="text-xs border-green-500/30 text-green-300 hover:bg-green-950/30"
                                            onClick={() => onSelectAsset?.(pick)}
                                        >
                                            {pick}
                                        </Button>
                                    ))}
                                </div>
                            </div>
                        )}
                        
                        {/* Tier Sections */}
                        {(['A', 'B', 'C', 'D', 'F'] as ConfidenceTier[]).map(tier => (
                            <TierSection
                                key={tier}
                                tier={tier}
                                decisions={decisionsByTier[tier]}
                                expanded={expandedTiers.has(tier)}
                                onToggle={() => toggleTier(tier)}
                                onSelectAsset={onSelectAsset}
                                onExecute={onExecute}
                            />
                        ))}
                    </>
                )}
            </CardContent>
        </Card>
    );
};

export default TierScanner;
