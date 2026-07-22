'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowLeftRight, PackagePlus, Clock, History, ClipboardCheck } from 'lucide-react';

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
                <Button variant="outline" size="sm" className="text-xs gap-1.5">
                    <ArrowLeftRight className="h-3.5 w-3.5" />
                    Transfer
                </Button>
            </Link>
            <Link href="/warehouse/inventory/adjustment">
                <Button variant="outline" size="sm" className="text-xs gap-1.5">
                    <PackagePlus className="h-3.5 w-3.5" />
                    Penyesuaian
                </Button>
            </Link>
            <Link href="/warehouse/inventory/aging">
                <Button variant="outline" size="sm" className="text-xs gap-1.5">
                    <Clock className="h-3.5 w-3.5" />
                    Aging
                </Button>
            </Link>
            <Link href="/warehouse/inventory/history">
                <Button variant="outline" size="sm" className="text-xs gap-1.5">
                    <History className="h-3.5 w-3.5" />
                    Mutasi
                </Button>
            </Link>
            <Link href="/warehouse/opname">
                <Button variant="outline" size="sm" className="text-xs gap-1.5">
                    <ClipboardCheck className="h-3.5 w-3.5" />
                    Opname
                </Button>
            </Link>
        </div>
    );
}
