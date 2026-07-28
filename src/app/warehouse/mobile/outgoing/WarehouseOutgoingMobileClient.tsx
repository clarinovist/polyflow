'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Clock, Package, ArrowRight, CheckCircle, Lock, Search, RefreshCw, Zap } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

type Order = {
    id: string;
    orderNumber: string;
    status: string;
    deliveryDate: string;
    loadVerifiedAt?: string | null;
    entrySource?: string | null;
    sourceLocation?: { name: string };
    salesOrder?: { customer?: { name: string }; entrySource?: string | null };
    items?: { id: string; verifiedQuantity?: number | null }[];
};

export function WarehouseOutgoingMobileClient({ orders }: { orders: Order[] }) {
    const router = useRouter();
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'LOADING' | 'VERIFIED'>('ALL');
    const [isRefreshing, setIsRefreshing] = useState(false);

    const handleRefresh = () => {
        setIsRefreshing(true);
        router.refresh();
        setTimeout(() => setIsRefreshing(false), 600);
    };

    const filteredOrders = orders.filter((order) => {
        const isVerified = order.loadVerifiedAt != null;
        if (statusFilter === 'PENDING' && order.status !== 'PENDING') return false;
        if (statusFilter === 'LOADING' && (order.status !== 'LOADING' || isVerified)) return false;
        if (statusFilter === 'VERIFIED' && !isVerified) return false;

        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return (
            order.orderNumber.toLowerCase().includes(q) ||
            order.salesOrder?.customer?.name?.toLowerCase().includes(q) ||
            order.sourceLocation?.name?.toLowerCase().includes(q)
        );
    });

    return (
        <div className="p-4 space-y-4">
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h1 className="text-xl font-bold">Antrian Muat</h1>
                    <p className="text-sm text-muted-foreground">
                        {orders.length} surat jalan menunggu
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-9 text-xs border-amber-500/30 text-amber-700"
                        asChild
                    >
                        <Link href="/warehouse/mobile/outgoing/walk-in">
                            <Zap className="h-3.5 w-3.5 mr-1" />
                            Pesanan Dadakan
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

            {/* Search & Filter */}
            <div className="space-y-2">
                <div className="relative">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Cari no. SJ, customer, gudang..."
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
                        Semua ({orders.length})
                    </Button>
                    <Button
                        variant={statusFilter === 'PENDING' ? 'default' : 'outline'}
                        size="sm"
                        className="h-7 text-xs px-2.5"
                        onClick={() => setStatusFilter('PENDING')}
                    >
                        Pending ({orders.filter((o) => o.status === 'PENDING').length})
                    </Button>
                    <Button
                        variant={statusFilter === 'LOADING' ? 'default' : 'outline'}
                        size="sm"
                        className="h-7 text-xs px-2.5"
                        onClick={() => setStatusFilter('LOADING')}
                    >
                        Muat ({orders.filter((o) => o.status === 'LOADING' && o.loadVerifiedAt == null).length})
                    </Button>
                    <Button
                        variant={statusFilter === 'VERIFIED' ? 'default' : 'outline'}
                        size="sm"
                        className="h-7 text-xs px-2.5"
                        onClick={() => setStatusFilter('VERIFIED')}
                    >
                        Terkunci ({orders.filter((o) => o.loadVerifiedAt != null).length})
                    </Button>
                </div>
            </div>

            {filteredOrders.length === 0 ? (
                <div className="text-center py-12">
                    <Package className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-50" />
                    <p className="text-sm text-muted-foreground">
                        {search ? 'Tidak ada antrian yang cocok dengan pencarian' : 'Tidak ada antrian muat saat ini'}
                    </p>
                </div>
            ) : (
                <div className="space-y-2">
                    {filteredOrders.map((order) => {
                        const totalItems = order.items?.length ?? 0;
                        const verifiedCount =
                            order.items?.filter(
                                (i) => i.verifiedQuantity != null,
                            ).length ?? 0;
                        const isVerified = order.loadVerifiedAt != null;

                        return (
                            <Link
                                key={order.id}
                                href={`/warehouse/mobile/outgoing/${order.id}`}
                                className="block p-4 border rounded-xl bg-card active:scale-[0.98] transition-all"
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                            <p className="text-sm font-semibold truncate">
                                                {order.orderNumber}
                                            </p>
                                            {isVerified ? (
                                                <Badge
                                                    variant="secondary"
                                                    className="text-[10px] shrink-0 bg-green-100 text-green-800"
                                                >
                                                    <Lock className="h-2.5 w-2.5 mr-0.5" />
                                                    Terkunci
                                                </Badge>
                                            ) : order.status === 'LOADING' ? (
                                                <Badge
                                                    variant="default"
                                                    className="text-[10px] shrink-0"
                                                >
                                                    Loading
                                                </Badge>
                                            ) : (
                                                <Badge
                                                    variant="secondary"
                                                    className="text-[10px] shrink-0"
                                                >
                                                    Pending
                                                </Badge>
                                            )}
                                        </div>
                                        <p className="text-xs text-muted-foreground truncate">
                                            {order.salesOrder?.customer?.name ||
                                                '—'}
                                        </p>
                                        {order.sourceLocation && (
                                            <p className="text-[10px] text-muted-foreground mt-0.5">
                                                Gudang:{' '}
                                                {order.sourceLocation.name}
                                            </p>
                                        )}
                                    </div>
                                    <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
                                </div>

                                {/* Progress & delivery date */}
                                <div className="flex items-center justify-between mt-2 pt-2 border-t text-[10px] text-muted-foreground">
                                    <div className="flex items-center gap-1">
                                        <Clock className="h-3 w-3" />
                                        {new Date(
                                            order.deliveryDate,
                                        ).toLocaleDateString('id-ID', {
                                            day: 'numeric',
                                            month: 'short',
                                        })}
                                    </div>
                                    {order.status === 'LOADING' &&
                                        totalItems > 0 && (
                                            <div className="flex items-center gap-1">
                                                {verifiedCount ===
                                                totalItems ? (
                                                    <CheckCircle className="h-3 w-3 text-emerald-500" />
                                                ) : (
                                                    <span className="h-3 w-3 rounded-full border border-muted-foreground/40" />
                                                )}
                                                {verifiedCount}/{totalItems}{' '}
                                                diverifikasi
                                            </div>
                                        )}
                                </div>
                            </Link>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
