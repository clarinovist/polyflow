'use client';

import Link from 'next/link';
import { Truck, Package, ArrowRight, Clock, ClipboardList } from 'lucide-react';

type HomeData = {
    loadingCount: number;
    pendingCount: number;
    receivableCount: number;
    openOpnameCount?: number;
    shippedTodayCount?: number;
    receivedTodayCount?: number;
    recentLoading: {
        id: string;
        orderNumber: string;
        deliveryDate: string;
        salesOrder?: { customer?: { name: string } };
    }[];
};

export function WarehouseMobileHomeClient({ data }: { data: HomeData }) {
    const totalOpen = data.loadingCount + data.pendingCount;

    return (
        <div className="p-4 space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-xl font-bold">Gudang Mobile</h1>
                <p className="text-sm text-muted-foreground">
                    Ringkasan shift hari ini
                </p>
            </div>

            {/* Today Completed Summary Strip */}
            <div className="p-3 border rounded-xl bg-card shadow-sm flex items-center justify-around text-center text-xs">
                <div>
                    <p className="text-base font-bold text-emerald-600 tabular-nums">
                        {data.shippedTodayCount ?? 0}
                    </p>
                    <p className="text-muted-foreground">DO Dikirim Hari Ini</p>
                </div>
                <div className="h-8 w-px bg-border" />
                <div>
                    <p className="text-base font-bold text-blue-600 tabular-nums">
                        {data.receivedTodayCount ?? 0}
                    </p>
                    <p className="text-muted-foreground">Penerimaan Selesai</p>
                </div>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-3 gap-3">
                <Link
                    href="/warehouse/mobile/outgoing"
                    className="p-4 border rounded-xl bg-card active:scale-[0.98] transition-all"
                >
                    <Truck className="h-6 w-6 text-primary mb-2" />
                    <p className="text-2xl font-bold">{totalOpen}</p>
                    <p className="text-xs text-muted-foreground">
                        Antrian Muat
                    </p>
                    {data.loadingCount > 0 && (
                        <p className="text-[10px] text-amber-600 mt-1">
                            {data.loadingCount} sedang diproses
                        </p>
                    )}
                </Link>

                <Link
                    href="/warehouse/mobile/incoming"
                    className="p-4 border rounded-xl bg-card active:scale-[0.98] transition-all"
                >
                    <Package className="h-6 w-6 text-emerald-600 mb-2" />
                    <p className="text-2xl font-bold">{data.receivableCount}</p>
                    <p className="text-xs text-muted-foreground">
                        Perlu Diterima
                    </p>
                </Link>

                <Link
                    href="/warehouse/mobile/opname"
                    className="p-4 border rounded-xl bg-card active:scale-[0.98] transition-all"
                >
                    <ClipboardList className="h-6 w-6 text-amber-600 mb-2" />
                    <p className="text-2xl font-bold">{data.openOpnameCount ?? 0}</p>
                    <p className="text-xs text-muted-foreground">
                        Opname Aktif
                    </p>
                </Link>
            </div>

            {/* Recent Loading */}
            {data.recentLoading.length > 0 && (
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <h2 className="text-sm font-semibold">Sedang Dimuat</h2>
                        <Link
                            href="/warehouse/mobile/outgoing"
                            className="text-xs text-primary flex items-center gap-1"
                        >
                            Lihat semua <ArrowRight className="h-3 w-3" />
                        </Link>
                    </div>
                    <div className="space-y-2">
                        {data.recentLoading.map((order) => (
                            <Link
                                key={order.id}
                                href={`/warehouse/mobile/outgoing/${order.id}`}
                                className="block p-3 border rounded-xl bg-card active:scale-[0.98] transition-all"
                            >
                                <div className="flex items-center justify-between">
                                    <div className="min-w-0">
                                        <p className="text-sm font-medium truncate">
                                            {order.orderNumber}
                                        </p>
                                        <p className="text-xs text-muted-foreground truncate">
                                            {order.salesOrder?.customer?.name ||
                                                '—'}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-1 text-xs text-amber-600 shrink-0">
                                        <Clock className="h-3 w-3" />
                                        Loading
                                    </div>
                                </div>
                            </Link>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
