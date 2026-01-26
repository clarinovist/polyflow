'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Calculator, Settings, Search, Package, Warehouse, FileText, Factory, MonitorPlay } from 'lucide-react';

import {
    CommandDialog,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
    CommandSeparator,
    CommandShortcut,
} from '@/components/ui/command';
import { Button, ButtonProps } from '@/components/ui/button';
import { cn } from '@/lib/utils';
// import { DialogProps } from '@radix-ui/react-dialog'; // Removing DialogProps to avoid confusion

export type GlobalSearchProps = ButtonProps;

export function GlobalSearch({ className, ...props }: GlobalSearchProps) {
    const router = useRouter();
    const [open, setOpen] = React.useState(false);

    React.useEffect(() => {
        const down = (e: KeyboardEvent) => {
            if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                setOpen((open) => !open);
            }
        };

        document.addEventListener('keydown', down);
        return () => document.removeEventListener('keydown', down);
    }, []);

    const runCommand = React.useCallback((command: () => unknown) => {
        setOpen(false);
        command();
    }, []);

    return (
        <>
            <Button
                variant="outline"
                className={cn(
                    "relative h-10 w-full justify-start rounded-lg bg-muted/50 px-4 text-sm font-normal text-muted-foreground shadow-none",
                    className
                )}
                onClick={() => setOpen(true)}
                {...props}
            >
                <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                <span className="hidden lg:inline-flex truncate">Search...</span>
                <span className="inline-flex lg:hidden truncate">Search...</span>
            </Button>
            <CommandDialog open={open} onOpenChange={setOpen}>
                <CommandInput placeholder="Search..." />
                <CommandList>
                    <CommandEmpty>No results found.</CommandEmpty>
                    <CommandGroup heading="Switch Application">
                        <CommandItem onSelect={() => runCommand(() => router.push('/kiosk'))}>
                            <MonitorPlay className="mr-2 h-4 w-4" />
                            <span>Operator Kiosk</span>
                        </CommandItem>
                        <CommandItem onSelect={() => runCommand(() => router.push('/warehouse'))}>
                            <Warehouse className="mr-2 h-4 w-4" />
                            <span>Warehouse Portal</span>
                        </CommandItem>
                        <CommandItem onSelect={() => runCommand(() => router.push('/production'))}>
                            <Factory className="mr-2 h-4 w-4" />
                            <span>Production Floor</span>
                        </CommandItem>
                    </CommandGroup>
                    <CommandSeparator />
                    <CommandGroup heading="Quick Navigation">
                        <CommandItem onSelect={() => runCommand(() => router.push('/warehouse/inventory'))}>
                            <Warehouse className="mr-2 h-4 w-4" />
                            <span>Inventory</span>
                        </CommandItem>
                        <CommandItem onSelect={() => runCommand(() => router.push('/dashboard/products'))}>
                            <Package className="mr-2 h-4 w-4" />
                            <span>Products</span>
                        </CommandItem>
                        <CommandItem onSelect={() => runCommand(() => router.push('/warehouse/opname'))}>
                            <Calculator className="mr-2 h-4 w-4" />
                            <span>Stock Opname</span>
                        </CommandItem>
                        <CommandItem onSelect={() => runCommand(() => router.push('/warehouse/inventory/history'))}>
                            <FileText className="mr-2 h-4 w-4" />
                            <span>Stock History</span>
                        </CommandItem>
                    </CommandGroup>
                    <CommandSeparator />
                    <CommandGroup heading="Settings">
                        <CommandItem onSelect={() => runCommand(() => router.push('/dashboard/settings'))}>
                            <Settings className="mr-2 h-4 w-4" />
                            <span>Settings</span>
                            <CommandShortcut>⌘S</CommandShortcut>
                        </CommandItem>
                    </CommandGroup>
                </CommandList>
            </CommandDialog>
        </>
    );
}
