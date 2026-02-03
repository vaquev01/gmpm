import React from 'react';
import { useStore } from '@/store/useStore';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ViewType } from '@/types';
import { LayoutDashboard, Settings } from 'lucide-react';
import Link from 'next/link';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface DashboardLayoutProps {
    children: React.ReactNode;
}

import { GlobalCommandPalette } from './GlobalCommandPalette';

export const DashboardLayout = ({ children }: DashboardLayoutProps) => {
    const { view, setView } = useStore();

    const menuGroups = [
        {
            title: '🔥 MAIN',
            items: [
                { id: 'command' as ViewType, label: 'WORKSPACE' },
                { id: 'macro' as ViewType, label: 'MACRO' },
                { id: 'meso' as ViewType, label: 'MESO' },
            ]
        },
        {
            title: '🧭 LAB',
            items: [
                { id: 'lab' as ViewType, label: 'ANALYST WORKSTATION' },
            ]
        },
        {
            title: '🏭 FACTORY',
            items: [
                { id: 'factory' as ViewType, label: 'ENGINEERING & RISK' },
                { id: 'incubator' as ViewType, label: 'INCUBATOR & PNL' },
            ]
        }
    ];

    return (
        <div className="min-h-screen bg-gray-950 text-gray-100 font-sans selection:bg-yellow-500/30">
            {/* COMPACT CONTROL BAR */}
            <header className="sticky top-0 z-50 bg-gray-950/90 border-b border-gray-800 h-14 flex items-center justify-between px-4 md:px-6">

                {/* Left: Branding */}
                <div className="flex items-center gap-3">
                    <div className="bg-yellow-600/20 p-1.5 rounded-lg border border-yellow-600/30">
                        <LayoutDashboard className="w-5 h-5 text-yellow-500" />
                    </div>
                    <div className="flex flex-col leading-none">
                        <span className="font-bold text-gray-100 tracking-tight">GMPM Terminal</span>
                        <span className="text-[10px] text-gray-500 font-mono">INSTITUTIONAL v8.1</span>
                    </div>
                </div>

                {/* Center: Navigation */}
                <nav className="hidden md:flex items-center gap-1 bg-gray-900/50 p-1 rounded-lg border border-gray-800">
                    {menuGroups.flatMap(g => g.items).map((item) => (
                        <Button
                            key={item.id}
                            variant="ghost"
                            onClick={() => setView(item.id)}
                            className={cn(
                                "h-8 text-xs font-bold px-4 rounded-md transition-all",
                                view === item.id
                                    ? "bg-gray-800 text-yellow-500 shadow-sm"
                                    : "text-gray-400 hover:text-gray-200 hover:bg-gray-800/50"
                            )}
                        >
                            {item.label}
                        </Button>
                    ))}
                </nav>

                {/* Right: System Status & Time */}
                <div className="flex items-center gap-6 text-xs font-mono">
                    <GlobalCommandPalette />

                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon-sm" aria-label="Settings">
                                <Settings className="w-4 h-4 text-gray-400" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-gray-950 border-gray-800 text-gray-200">
                            <DropdownMenuLabel className="text-xs text-gray-400">Settings</DropdownMenuLabel>
                            <DropdownMenuSeparator className="bg-gray-800" />
                            <DropdownMenuItem asChild>
                                <Link href="/logs" className="cursor-pointer">
                                    Logs
                                </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                                <Link href="/verify" className="cursor-pointer">
                                    Verification
                                </Link>
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>

                    <div className="hidden lg:flex items-center gap-4 pl-6 border-l border-gray-800 h-8">
                        {/* System Status Indicator */}
                        <div className="flex items-center gap-2 bg-green-950/30 border border-green-900/50 px-3 py-1 rounded-full">
                            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse box-shadow-green" />
                            <span className="text-green-400 font-bold tracking-wider">SYSTEM ONLINE</span>
                        </div>

                        {/* Clock (Client-side only to prevent hydration errors) */}
                        <Clock />
                    </div>
                </div>
            </header>

            {/* Main Content Area */}
            <div className="max-w-[1920px] mx-auto p-4 lg:p-6">
                <main className="animate-in fade-in slide-in-from-bottom-2 duration-300 min-h-[600px]">
                    {children}
                </main>
            </div>
        </div>
    );
};

// Client-side Clock Component
const Clock = () => {
    const [mounted, setMounted] = React.useState(false);
    const [time, setTime] = React.useState(new Date());

    React.useEffect(() => {
        setMounted(true);
        const timer = setInterval(() => setTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    if (!mounted) return null; // Avoid server rendering mismatch

    return (
        <div className="text-right leading-tight">
            <div className="text-gray-200 font-bold text-sm tabular-nums">{time.toLocaleTimeString()}</div>
            <div className="text-gray-500 text-[10px] uppercase tracking-widest">{time.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</div>
        </div>
    );
};
