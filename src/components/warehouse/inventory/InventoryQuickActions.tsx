'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ArrowLeftRight, PackagePlus, Clock, History, ClipboardCheck, MoreVertical } from 'lucide-react';

interface InventoryQuickActionsProps {
    lowStockCount?: number;
}

export function InventoryQuickActions({ lowStockCount }: InventoryQuickActionsProps) {
    return (
        <div className="flex flex-wrap items-center justify-end gap-2">
            {lowStockCount !== undefined && lowStockCount > 0 && (
                <Link href="/warehouse/inventory?lowStock=true">
                    <Button variant="outline" size="sm" className="text-xs gap-1.5 text-red-600 border-red-200 hover:bg-red-50 dark:hover:bg-red-950/30">
                        <span className="font-bold">{lowStockCount}</span> stok menipis
                    </Button>
                </Link>
            )}
            <Link href="/warehouse/inventory/transfer">
                <Button variant="default" size="sm" className="text-xs gap-1.5">
                    <ArrowLeftRight className="h-3.5 w-3.5" />
                    Transfer
                </Button>
            </Link>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="text-xs gap-1.5">
                        <MoreVertical className="h-3.5 w-3.5" />
                        Lainnya
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuItem asChild>
                        <Link href="/warehouse/inventory/adjustment" className="flex items-center gap-2">
                            <PackagePlus className="h-4 w-4" />
                            Penyesuaian
                        </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                        <Link href="/warehouse/inventory/aging" className="flex items-center gap-2">
                            <Clock className="h-4 w-4" />
                            Aging
                        </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                        <Link href="/warehouse/inventory/history" className="flex items-center gap-2">
                            <History className="h-4 w-4" />
                            Mutasi
                        </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                        <Link href="/warehouse/opname" className="flex items-center gap-2">
                            <ClipboardCheck className="h-4 w-4" />
                            Opname
                        </Link>
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
}
