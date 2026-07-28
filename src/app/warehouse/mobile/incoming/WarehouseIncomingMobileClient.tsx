'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
    Package,
    ArrowRight,
    CheckCircle,
    Building2,
    Calendar,
    Search,
    RefreshCw,
    FileText,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

type ReceivablePO = {
    id: string;
    orderNumber: string;
    orderDate: Date | string;
    expectedDate: Date | string | null;
    status: string;
    notes?: string | null;
    entrySource?: string | null;
    sourceReference?: string | null;
    supplier: { name: string; code: string | null };
    items: {
        id: string;
        quantity: number;
        receivedQty: number;
        productVariant: {
            name: string;
            skuCode: string;
            primaryUnit: string;
        };
    }[];
};

type TodayGR = {
    id: string;
    receiptNumber: string;
    receivedDate: Date | string;
    notes?: string | null;
    purchaseOrder: {
        id: string;
        orderNumber: string;
        supplier: { name: string };
    } | null;
};

export function WarehouseIncomingMobileClient({
    receivablePOs,
    todayReceipts,
}: {
    receivablePOs: ReceivablePO[];
    todayReceipts: TodayGR[];
}) {
    const router = useRouter();
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<'ALL' | 'PARTIAL' | 'SENT'>('ALL');
    const [isRefreshing, setIsRefreshing] = useState(false);

    const handleRefresh = () => {
        setIsRefreshing(true);
        router.refresh();
        setTimeout(() => setIsRefreshing(false), 600);
    };

    const filteredPOs = receivablePOs.filter((po) => {
        if (statusFilter === 'PARTIAL' && po.status !== 'PARTIAL_RECEIVED') return false;
        if (statusFilter === 'SENT' && po.status !== 'SENT') return false;

        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return (
            po.orderNumber.toLowerCase().includes(q) ||
            po.supplier.name.toLowerCase().includes(q) ||
            po.items.some(
                (item) =>
                    item.productVariant.name.toLowerCase().includes(q) ||
                    item.productVariant.skuCode.toLowerCase().includes(q),
            )
        );
    });

    return (
        <div className="p-4 space-y-4">
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h1 className="text-xl font-bold">Penerimaan Barang</h1>
                    <p className="text-sm text-muted-foreground">
                        {receivablePOs.length} PO menunggu diterima
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-9 text-xs border-amber-500/30 text-amber-700"
                        asChild
                    >
                        <Link href="/warehouse/mobile/incoming/from-nota">
                            <FileText className="h-3.5 w-3.5 mr-1" />
                            Terima dari Nota
                        </Link>
                    </Button>
                    <Button
                        variant="outline"
                        size="icon"
                        className="h-9 w-9 shrink-0"
                        onClick={handleRefresh}
                        disabled={isRefreshing}
                    >
                        <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                    </Button>
                </div>
            </div>

            {/* Search & Filters */}
            <div className="space-y-2">
                <div className="relative">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Cari no. PO, supplier, SKU, barang..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-9 h-10 text-sm"
                    />
                </div>
                <div className="flex gap-1.5 overflow-x-auto pb-1">
                    <Button
                        variant={statusFilter === 'ALL' ? 'default' : 'outline'}
                        size="sm"
                        className="h-7 text-xs px-2.5"
                        onClick={() => setStatusFilter('ALL')}
                    >
                        Semua ({receivablePOs.length})
                    </Button>
                    <Button
                        variant={statusFilter === 'SENT' ? 'default' : 'outline'}
                        size="sm"
                        className="h-7 text-xs px-2.5"
                        onClick={() => setStatusFilter('SENT')}
                    >
                        Menunggu ({receivablePOs.filter((p) => p.status === 'SENT').length})
                    </Button>
                    <Button
                        variant={statusFilter === 'PARTIAL' ? 'default' : 'outline'}
                        size="sm"
                        className="h-7 text-xs px-2.5"
                        onClick={() => setStatusFilter('PARTIAL')}
                    >
                        Parsial ({receivablePOs.filter((p) => p.status === 'PARTIAL_RECEIVED').length})
                    </Button>
                </div>
            </div>

            {/* Today Receipts */}
            {todayReceipts.length > 0 && !search && (
                <div className="space-y-2">
                    <h2 className="text-sm font-semibold">Diterima Hari Ini</h2>
                    <div className="space-y-2">
                        {todayReceipts.map((gr) => (
                            <div
                                key={gr.id}
                                className="p-3 border rounded-xl bg-emerald-50 dark:bg-emerald-950/20"
                            >
                                <div className="flex items-center gap-2 mb-1">
                                    <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" />
                                    <p className="text-sm font-medium truncate">
                                        {gr.receiptNumber}
                                    </p>
                                </div>
                                <p className="text-xs text-muted-foreground truncate">
                                    {gr.purchaseOrder?.supplier?.name || '—'} •{' '}
                                    {gr.purchaseOrder?.orderNumber || '—'}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Receivable POs */}
            <div className="space-y-2">
                <h2 className="text-sm font-semibold">
                    Perlu Diterima ({filteredPOs.length})
                </h2>
                {filteredPOs.length === 0 ? (
                    <div className="text-center py-12">
                        <Package className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-50" />
                        <p className="text-sm text-muted-foreground">
                            {search ? 'Tidak ada PO yang cocok dengan pencarian' : 'Tidak ada PO yang perlu diterima'}
                        </p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {filteredPOs.map((po) => {
                            const totalItems = po.items.length;
                            const receivedItems = po.items.filter(
                                (i) => i.receivedQty >= i.quantity,
                            ).length;

                            return (
                                <Link
                                    key={po.id}
                                    href={`/warehouse/mobile/incoming/${po.id}`}
                                    className="block p-4 border rounded-xl bg-card active:scale-[0.98] transition-all"
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-1.5">
                                                <p className="text-sm font-semibold truncate">
                                                    {po.orderNumber}
                                                </p>
                                                {po.entrySource === 'WALK_IN_RECEIPT' && (
                                                    <Badge
                                                        variant="outline"
                                                        className="text-[10px] shrink-0 border-amber-500/30 text-amber-700 bg-amber-500/10"
                                                    >
                                                        Dari Nota
                                                    </Badge>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-1 mt-0.5">
                                                <Building2 className="h-3 w-3 text-muted-foreground shrink-0" />
                                                <p className="text-xs text-muted-foreground truncate">
                                                    {po.supplier.name}
                                                </p>
                                            </div>
                                        </div>
                                        <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
                                    </div>

                                    <div className="flex items-center gap-3 mt-2 pt-2 border-t text-[10px] text-muted-foreground">
                                        <div className="flex items-center gap-1">
                                            <Package className="h-3 w-3" />
                                            {receivedItems}/{totalItems} item
                                        </div>
                                        {po.expectedDate && (
                                            <div className="flex items-center gap-1">
                                                <Calendar className="h-3 w-3" />
                                                {new Date(
                                                    po.expectedDate,
                                                ).toLocaleDateString('id-ID', {
                                                    day: 'numeric',
                                                    month: 'short',
                                                })}
                                            </div>
                                        )}
                                    </div>
                                </Link>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
