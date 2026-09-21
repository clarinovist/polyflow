'use client';

import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription,
} from '@/components/ui/card';
import { History, ArrowRight } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import type { getStockMovements } from '@/actions/inventory/inventory';
import { warehouseComponentLabels } from '@/lib/labels';
import Link from 'next/link';

// Infer type from action return type
type GetStockMovementsResult = Awaited<ReturnType<typeof getStockMovements>>;
export type StockMovement = Extract<
    GetStockMovementsResult,
    { success: true }
>['data'][number];

interface RecentTransfersProps {
    movements: StockMovement[];
    loadError?: boolean;
}

export function RecentTransfers({
    movements,
    loadError = false,
}: RecentTransfersProps) {
    // Filter client-side to be safe, though server should handle it
    const transfers = movements
        .filter((m) => m.type === 'TRANSFER')
        .slice(0, 5);

    return (
        <Card className="shadow-sm border-border/60 bg-card">
            <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <History className="h-4 w-4 text-muted-foreground" />
                    {warehouseComponentLabels.recentTransfers}
                </CardTitle>
                <CardDescription className="text-xs">
                    Maksimal 5 transfer dari 10 mutasi terbaru yang dimuat.
                    Bukan seluruh histori transfer.
                </CardDescription>
            </CardHeader>
            <CardContent className="px-0">
                {loadError ? (
                    <p
                        role="alert"
                        className="px-4 py-3 text-sm text-destructive"
                    >
                        Gagal memuat ringkasan transfer. Muat ulang halaman
                        untuk mencoba lagi.
                    </p>
                ) : transfers.length === 0 ? (
                    <div className="text-center py-6 text-muted-foreground text-xs italic">
                        Tidak ada transfer dalam mutasi yang dimuat.
                    </div>
                ) : (
                    <div className="divide-y divide-border/40">
                        {transfers.map((movement) => (
                            <div
                                key={movement.id}
                                className="px-5 py-3 hover:bg-muted/30 transition-colors"
                            >
                                <div className="flex justify-between items-start mb-1">
                                    <span className="text-xs font-semibold text-foreground line-clamp-1 mr-2">
                                        {movement.productVariant.product.name}
                                    </span>
                                    <Badge
                                        variant="secondary"
                                        className="text-[10px] h-5 px-1.5 font-bold shrink-0"
                                    >
                                        {Number(movement.quantity)}
                                    </Badge>
                                </div>
                                <div className="flex items-center gap-2 text-[10px] text-muted-foreground mb-1.5">
                                    <span className="truncate max-w-[80px] text-foreground/80">
                                        {movement.fromLocation?.name}
                                    </span>
                                    <ArrowRight className="h-3 w-3 opacity-50" />
                                    <span className="truncate max-w-[80px] text-foreground/80">
                                        {movement.toLocation?.name}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center text-[10px] text-muted-foreground/60">
                                    <span>
                                        {movement.productVariant.skuCode}
                                    </span>
                                    <span>
                                        {formatDistanceToNow(
                                            new Date(movement.createdAt),
                                            { addSuffix: true },
                                        )}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
                <Link
                    href="/warehouse/inventory/history"
                    className="block px-4 py-3 text-sm text-primary underline"
                >
                    Telusuri mutasi stok
                </Link>
            </CardContent>
        </Card>
    );
}
