'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useStore } from '@/store/useStore';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ViewType } from '@/types';
import {
    LayoutDashboard, Settings, Menu, X,
    Globe, Layers, Crosshair, Droplets, DollarSign,
    FlaskConical, Factory, Rocket, BarChart3,
    Zap, Shield, FileText, MonitorCheck,
} from 'lucide-react';
import Link from 'next/link';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { GlobalCommandPalette } from './GlobalCommandPalette';

interface DashboardLayoutProps {
    children: React.ReactNode;
}

type NavItem = { id: ViewType; label: string; icon: React.ElementType; shortcut?: string };
type NavGroup = { title: string; items: NavItem[] };

const NAV_GROUPS: NavGroup[] = [
    {
        title: 'MARKET',
        items: [
            { id: 'command', label: 'Command', icon: LayoutDashboard, shortcut: '1' },
            { id: 'macro', label: 'Macro', icon: Globe, shortcut: '2' },
            { id: 'meso', label: 'Meso', icon: Layers, shortcut: '3' },
            { id: 'micro', label: 'Micro', icon: Crosshair, shortcut: '4' },
            { id: 'liquidity', label: 'Liquidity', icon: Droplets },
            { id: 'currency', label: 'FX', icon: DollarSign },
        ],
    },
    {
        title: 'ANALYSIS',
        items: [
            { id: 'lab', label: 'Lab', icon: FlaskConical, shortcut: '5' },
            { id: 'signals', label: 'Signals', icon: Zap },
            { id: 'executive', label: 'Executive', icon: MonitorCheck },
        ],
    },
    {
        title: 'OPERATIONS',
        items: [
            { id: 'factory', label: 'Factory', icon: Factory, shortcut: '6' },
            { id: 'incubator', label: 'Incubator', icon: Rocket },
        ],
    },
];

const ALL_NAV_ITEMS = NAV_GROUPS.flatMap(g => g.items);

export const DashboardLayout = ({ children }: DashboardLayoutProps) => {
    const { view, setView } = useStore();
    const [mobileOpen, setMobileOpen] = useState(false);
    const [health, setHealth] = useState<'online' | 'offline' | 'checking'>('checking');

    // Health check
    useEffect(() => {
        let alive = true;
        const check = async () => {
            try {
                const res = await fetch('/api/health', { cache: 'no-store', signal: AbortSignal.timeout(5000) });
                if (alive) setHealth(res.ok ? 'online' : 'offline');
            } catch {
                if (alive) setHealth('offline');
            }
        };
        check();
        const interval = setInterval(check, 30000);
        return () => { alive = false; clearInterval(interval); };
    }, []);

    // Keyboard shortcuts: Ctrl/Cmd + 1-6
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (!e.metaKey && !e.ctrlKey) return;
            const num = parseInt(e.key);
            if (num >= 1 && num <= 9) {
                const item = ALL_NAV_ITEMS.find(i => i.shortcut === e.key);
                if (item) {
                    e.preventDefault();
                    setView(item.id);
                }
            }
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [setView]);

    const handleNav = useCallback((id: ViewType) => {
        setView(id);
        setMobileOpen(false);
    }, [setView]);

    const statusConfig = {
        online: { dot: 'bg-emerald-400', ring: 'ring-emerald-400/20', text: 'text-emerald-400', label: 'ONLINE' },
        offline: { dot: 'bg-red-400', ring: 'ring-red-400/20', text: 'text-red-400', label: 'OFFLINE' },
        checking: { dot: 'bg-yellow-400 animate-pulse', ring: 'ring-yellow-400/20', text: 'text-yellow-400', label: 'CHECKING' },
    }[health];

    return (
        <div className="min-h-screen bg-gray-950 text-gray-100 font-sans selection:bg-yellow-500/30">
            {/* HEADER */}
            <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-gray-950/80 backdrop-blur-xl backdrop-saturate-150">
                <div className="flex h-14 items-center justify-between px-4 lg:px-6">

                    {/* Left: Brand + Mobile toggle */}
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setMobileOpen(!mobileOpen)}
                            className="lg:hidden p-1.5 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-white/5 transition-colors"
                            aria-label="Toggle navigation"
                        >
                            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                        </button>

                        <div className="flex items-center gap-2.5">
                            <div className="relative">
                                <div className="absolute inset-0 bg-yellow-500/20 rounded-lg blur-sm" />
                                <div className="relative bg-yellow-500/10 p-1.5 rounded-lg border border-yellow-500/20">
                                    <LayoutDashboard className="w-4.5 h-4.5 text-yellow-500" />
                                </div>
                            </div>
                            <div className="flex flex-col leading-none">
                                <span className="font-bold text-[13px] text-gray-100 tracking-tight">GMPM</span>
                                <span className="text-[9px] text-gray-500 font-mono tracking-widest">v2.1 TERMINAL</span>
                            </div>
                        </div>
                    </div>

                    {/* Center: Desktop Navigation */}
                    <nav className="hidden lg:flex items-center">
                        <div className="flex items-center gap-0.5 bg-white/[0.03] p-1 rounded-xl border border-white/[0.06]">
                            {NAV_GROUPS.map((group, gi) => (
                                <React.Fragment key={group.title}>
                                    {gi > 0 && <div className="w-px h-5 bg-white/[0.06] mx-1" />}
                                    {group.items.map((item) => {
                                        const Icon = item.icon;
                                        const isActive = view === item.id;
                                        return (
                                            <button
                                                key={item.id}
                                                onClick={() => handleNav(item.id)}
                                                className={cn(
                                                    "flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold transition-all duration-200",
                                                    isActive
                                                        ? "bg-white/[0.08] text-yellow-400 shadow-sm shadow-yellow-500/5"
                                                        : "text-gray-400 hover:text-gray-200 hover:bg-white/[0.04]"
                                                )}
                                            >
                                                <Icon className={cn("w-3.5 h-3.5", isActive && "text-yellow-400")} />
                                                {item.label}
                                            </button>
                                        );
                                    })}
                                </React.Fragment>
                            ))}
                        </div>
                    </nav>

                    {/* Right: Status + Settings + Clock */}
                    <div className="flex items-center gap-3">
                        <GlobalCommandPalette />

                        {/* System Status */}
                        <div className={cn("hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-white/[0.06] bg-white/[0.02]")}>
                            <div className={cn("w-1.5 h-1.5 rounded-full ring-2", statusConfig.dot, statusConfig.ring)} />
                            <span className={cn("text-[10px] font-bold tracking-wider", statusConfig.text)}>{statusConfig.label}</span>
                        </div>

                        {/* Settings */}
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" className="h-8 w-8 p-0 text-gray-400 hover:text-gray-200 hover:bg-white/5" aria-label="Settings">
                                    <Settings className="w-4 h-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="bg-gray-950 border-gray-800 text-gray-200 min-w-[180px]">
                                <DropdownMenuLabel className="text-xs text-gray-500 font-mono">System</DropdownMenuLabel>
                                <DropdownMenuSeparator className="bg-gray-800" />
                                <DropdownMenuItem asChild>
                                    <Link href="/logs" className="cursor-pointer flex items-center gap-2">
                                        <FileText className="w-3.5 h-3.5" /> Server Logs
                                    </Link>
                                </DropdownMenuItem>
                                <DropdownMenuItem asChild>
                                    <Link href="/verify" className="cursor-pointer flex items-center gap-2">
                                        <Shield className="w-3.5 h-3.5" /> Verification
                                    </Link>
                                </DropdownMenuItem>
                                <DropdownMenuSeparator className="bg-gray-800" />
                                <DropdownMenuItem onClick={() => handleNav('universe')} className="cursor-pointer flex items-center gap-2">
                                    <BarChart3 className="w-3.5 h-3.5" /> Asset Universe
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>

                        {/* Clock */}
                        <div className="hidden xl:block">
                            <Clock />
                        </div>
                    </div>
                </div>

                {/* Mobile Navigation Drawer */}
                {mobileOpen && (
                    <div className="lg:hidden border-t border-white/[0.06] bg-gray-950/95 backdrop-blur-xl animate-in slide-in-from-top-2 duration-200">
                        <div className="px-4 py-3 space-y-4 max-h-[60vh] overflow-y-auto">
                            {NAV_GROUPS.map((group) => (
                                <div key={group.title}>
                                    <div className="text-[10px] font-bold text-gray-500 tracking-widest mb-2">{group.title}</div>
                                    <div className="grid grid-cols-2 gap-1.5">
                                        {group.items.map((item) => {
                                            const Icon = item.icon;
                                            const isActive = view === item.id;
                                            return (
                                                <button
                                                    key={item.id}
                                                    onClick={() => handleNav(item.id)}
                                                    className={cn(
                                                        "flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                                                        isActive
                                                            ? "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20"
                                                            : "text-gray-400 hover:text-gray-200 bg-white/[0.02] border border-white/[0.04] hover:bg-white/[0.05]"
                                                    )}
                                                >
                                                    <Icon className="w-4 h-4" />
                                                    {item.label}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </header>

            {/* Main Content */}
            <div className="max-w-[1920px] mx-auto px-4 py-4 lg:px-6 lg:py-6">
                <main className="animate-in fade-in duration-300 min-h-[calc(100vh-4rem)]">
                    {children}
                </main>
            </div>
        </div>
    );
};

const Clock = () => {
    const mountedRef = React.useRef(false);
    const [time, setTime] = useState(() => new Date());

    useEffect(() => {
        mountedRef.current = true;
        const timer = setInterval(() => setTime(new Date()), 1000);
        return () => { mountedRef.current = false; clearInterval(timer); };
    }, []);

    if (typeof window === 'undefined') return null;

    return (
        <div className="text-right leading-tight pl-3 border-l border-white/[0.06]">
            <div className="text-gray-200 font-bold text-sm tabular-nums font-mono">{time.toLocaleTimeString()}</div>
            <div className="text-gray-500 text-[9px] uppercase tracking-widest">{time.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</div>
        </div>
    );
};
