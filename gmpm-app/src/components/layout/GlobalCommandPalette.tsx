"use client";

import * as React from "react";
import {
    Calendar,
    CreditCard,
    Settings,
    User,
    Calculator,
    Smile,
    LayoutDashboard,
    FlaskConical,
    Factory,
    Zap,
    TrendingUp,
    Search
} from "lucide-react";

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
import { ViewType } from "@/types";

export function GlobalCommandPalette() {
    const [open, setOpen] = React.useState(false);
    const { setView } = useStore();

    React.useEffect(() => {
        const down = (e: KeyboardEvent) => {
            if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                setOpen((open) => !open);
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
        <>
            {/* Hint for the user, hidden on mobile maybe or styled nicely */}
            <div className="fixed bottom-4 right-4 z-50 pointer-events-none hidden md:flex items-center gap-2 text-xs text-gray-600 bg-gray-900/80 px-3 py-1.5 rounded-full border border-gray-800 backdrop-blur-md">
                Press <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-gray-700 bg-gray-800 px-1.5 font-mono text-[10px] font-medium text-gray-400 opacity-100"><span className="text-xs">⌘</span>K</kbd> to command
            </div>

            <CommandDialog open={open} onOpenChange={setOpen}>
                <CommandInput placeholder="Type a command or search..." />
                <CommandList className="bg-gray-950 border-gray-800 text-gray-200">
                    <CommandEmpty>No results found.</CommandEmpty>

                    <CommandGroup heading="Navigation">
                        <CommandItem onSelect={() => runCommand(() => setView('command'))}>
                            <LayoutDashboard className="mr-2 h-4 w-4" />
                            <span>Cockpit (Command Center)</span>
                            <CommandShortcut>⌘1</CommandShortcut>
                        </CommandItem>
                        <CommandItem onSelect={() => runCommand(() => setView('lab'))}>
                            <FlaskConical className="mr-2 h-4 w-4" />
                            <span>Lab (Analysis)</span>
                            <CommandShortcut>⌘2</CommandShortcut>
                        </CommandItem>
                        <CommandItem onSelect={() => runCommand(() => setView('factory'))}>
                            <Factory className="mr-2 h-4 w-4" />
                            <span>Factory (Backtest)</span>
                            <CommandShortcut>⌘3</CommandShortcut>
                        </CommandItem>
                    </CommandGroup>

                    <CommandSeparator />

                    <CommandGroup heading="Quick Actions">
                        <CommandItem onSelect={() => runCommand(() => console.log('Simulating Buy...'))}>
                            <Zap className="mr-2 h-4 w-4 text-yellow-500" />
                            <span>Execute Buy (BTC)</span>
                        </CommandItem>
                        <CommandItem onSelect={() => runCommand(() => console.log('Running Backtest...'))}>
                            <TrendingUp className="mr-2 h-4 w-4 text-purple-500" />
                            <span>Run Quick Backtest</span>
                        </CommandItem>
                    </CommandGroup>
                </CommandList>
            </CommandDialog>
        </>
    );
}
