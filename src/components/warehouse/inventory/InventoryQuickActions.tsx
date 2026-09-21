'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    ArrowLeftRight,
    PackagePlus,
    Clock,
    History,
    ClipboardCheck,
    MoreVertical,
    TableProperties,
} from 'lucide-react';

interface InventoryQuickActionsProps {
    lowStockCount?: number;
    historical?: boolean;
    lowStockHref?: string;
    liveHref?: string;
}
export function InventoryQuickActions({
    lowStockCount,
    historical = false,
    lowStockHref = '/warehouse/inventory?lowStock=true',
    liveHref = '/warehouse/inventory',
}: InventoryQuickActionsProps) {
    return (
        <div className="flex flex-wrap items-center gap-2">
            {!historical && !!lowStockCount && (
                <Button
                    asChild
                    variant="outline"
                    className="min-h-11 text-destructive"
                >
                    <Link href={lowStockHref}>
                        {lowStockCount} stok menipis
                    </Link>
                </Button>
            )}
            <Button asChild variant="outline" className="min-h-11 gap-1.5">
                <Link href="/warehouse/inventory/balance">
                    <TableProperties className="h-4 w-4" />
                    Neraca Stok
                </Link>
            </Button>
            {historical ? (
                <Button asChild variant="outline" className="min-h-11">
                    <Link href={liveHref}>Stok saat ini</Link>
                </Button>
            ) : (
                <Button asChild className="min-h-11 gap-1.5">
                    <Link href="/warehouse/inventory/transfer">
                        <ArrowLeftRight className="h-4 w-4" />
                        Transfer
                    </Link>
                </Button>
            )}
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="min-h-11 gap-1.5">
                        <MoreVertical className="h-4 w-4" />
                        Lihat & tindakan
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Lihat & telusuri</DropdownMenuLabel>
                    <DropdownMenuItem asChild>
                        <Link href="/warehouse/inventory/history">
                            <History className="h-4 w-4" />
                            Mutasi · catatan perubahan
                        </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                        <Link href="/warehouse/inventory/aging">
                            <Clock className="h-4 w-4" />
                            Aging · umur persediaan
                        </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel>
                        Tindakan stok saat ini
                    </DropdownMenuLabel>
                    {historical ? (
                        <DropdownMenuItem asChild>
                            <Link href={liveHref}>
                                Kembali ke stok saat ini untuk mutasi
                            </Link>
                        </DropdownMenuItem>
                    ) : (
                        <>
                            <DropdownMenuItem asChild>
                                <Link href="/warehouse/inventory/adjustment">
                                    <PackagePlus className="h-4 w-4" />
                                    Penyesuaian · koreksi saldo
                                </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                                <Link href="/warehouse/opname">
                                    <ClipboardCheck className="h-4 w-4" />
                                    Opname · hitung fisik
                                </Link>
                            </DropdownMenuItem>
                        </>
                    )}
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
}
