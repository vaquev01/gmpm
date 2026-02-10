"use client";

import * as React from "react";
import {
    LayoutDashboard, Globe, Layers, Crosshair, Droplets, DollarSign,
    FlaskConical, Factory, Rocket, Zap, MonitorCheck,
    Shield, FileText, BarChart3,
} from "lucide-react";

import { useRouter } from "next/navigation";

import {
    CommandDialog,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
    CommandSeparator,
    CommandShortcut,
} from "@/components/ui/command";
import { useStore } from "@/store/useStore";

export function GlobalCommandPalette() {
    const [open, setOpen] = React.useState(false);
    const { setView, setFactoryTab } = useStore();
    const router = useRouter();

    React.useEffect(() => {
        const down = (e: KeyboardEvent) => {
            if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                setOpen((prev) => !prev);
            }
        };

        document.addEventListener("keydown", down);
        return () => document.removeEventListener("keydown", down);
    }, []);

    const runCommand = React.useCallback((command: () => unknown) => {
        setOpen(false);
        command();
    }, []);

    return (
        <CommandDialog open={open} onOpenChange={setOpen}>
            <CommandInput placeholder="Navigate, search, or run a command..." />
            <CommandList className="bg-gray-950 border-gray-800 text-gray-200">
                <CommandEmpty>No results found.</CommandEmpty>

                <CommandGroup heading="Market Views">
                    <CommandItem onSelect={() => runCommand(() => setView('command'))}>
                        <LayoutDashboard className="mr-2 h-4 w-4" />
                        <span>Command Center</span>
                        <CommandShortcut>⌘1</CommandShortcut>
                    </CommandItem>
                    <CommandItem onSelect={() => runCommand(() => setView('macro'))}>
                        <Globe className="mr-2 h-4 w-4" />
                        <span>Macro Dashboard</span>
                        <CommandShortcut>⌘2</CommandShortcut>
                    </CommandItem>
                    <CommandItem onSelect={() => runCommand(() => setView('meso'))}>
                        <Layers className="mr-2 h-4 w-4" />
                        <span>Meso Layer</span>
                        <CommandShortcut>⌘3</CommandShortcut>
                    </CommandItem>
                    <CommandItem onSelect={() => runCommand(() => setView('micro'))}>
                        <Crosshair className="mr-2 h-4 w-4" />
                        <span>Micro Setups</span>
                        <CommandShortcut>⌘4</CommandShortcut>
                    </CommandItem>
                    <CommandItem onSelect={() => runCommand(() => setView('liquidity'))}>
                        <Droplets className="mr-2 h-4 w-4" />
                        <span>Liquidity Map</span>
                    </CommandItem>
                    <CommandItem onSelect={() => runCommand(() => setView('currency'))}>
                        <DollarSign className="mr-2 h-4 w-4" />
                        <span>Currency Strength (FX)</span>
                    </CommandItem>
                </CommandGroup>

                <CommandSeparator />

                <CommandGroup heading="Analysis">
                    <CommandItem onSelect={() => runCommand(() => setView('lab'))}>
                        <FlaskConical className="mr-2 h-4 w-4" />
                        <span>Analyst Workstation (Lab)</span>
                        <CommandShortcut>⌘5</CommandShortcut>
                    </CommandItem>
                    <CommandItem onSelect={() => runCommand(() => setView('signals'))}>
                        <Zap className="mr-2 h-4 w-4" />
                        <span>Signal Output</span>
                    </CommandItem>
                    <CommandItem onSelect={() => runCommand(() => setView('executive'))}>
                        <MonitorCheck className="mr-2 h-4 w-4" />
                        <span>Executive Dashboard</span>
                    </CommandItem>
                </CommandGroup>

                <CommandSeparator />

                <CommandGroup heading="Operations">
                    <CommandItem onSelect={() => runCommand(() => setView('factory'))}>
                        <Factory className="mr-2 h-4 w-4" />
                        <span>Factory (Engineering & Risk)</span>
                        <CommandShortcut>⌘6</CommandShortcut>
                    </CommandItem>
                    <CommandItem onSelect={() => runCommand(() => setView('incubator'))}>
                        <Rocket className="mr-2 h-4 w-4" />
                        <span>Incubator (P&L Tracking)</span>
                    </CommandItem>
                    <CommandItem onSelect={() => runCommand(() => { setView('factory'); setFactoryTab('backtest'); })}>
                        <BarChart3 className="mr-2 h-4 w-4" />
                        <span>Run Backtest</span>
                    </CommandItem>
                    <CommandItem onSelect={() => runCommand(() => { setView('factory'); setFactoryTab('risk'); })}>
                        <Shield className="mr-2 h-4 w-4" />
                        <span>Risk Dashboard</span>
                    </CommandItem>
                </CommandGroup>

                <CommandSeparator />

                <CommandGroup heading="System">
                    <CommandItem onSelect={() => runCommand(() => router.push('/logs'))}>
                        <FileText className="mr-2 h-4 w-4" />
                        <span>Server Logs</span>
                    </CommandItem>
                    <CommandItem onSelect={() => runCommand(() => router.push('/verify'))}>
                        <Shield className="mr-2 h-4 w-4" />
                        <span>Verification</span>
                    </CommandItem>
                </CommandGroup>
            </CommandList>
        </CommandDialog>
    );
}
