'use client';

import { useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, FileText, ChevronRight, ShoppingBag } from 'lucide-react';
import Link from 'next/link';
import { format } from 'date-fns';
import { formatRupiah } from '@/lib/utils/utils';
import {
    getMobileStatusColor,
    getMobileStatusLabel,
    filterOrders,
    type StatusFilter,
    type MobileOrder,
} from '../lib/status-helpers';

export type FieldMobileOrder = MobileOrder & {
    nextFollowUpDate?: string | null;
    validUntil?: string | null;
};

export type OrderListFilter = StatusFilter | 'FOLLOW_UP';

const FILTER_OPTIONS: { value: OrderListFilter; label: string }[] = [
    { value: 'ALL', label: 'Semua' },
    { value: 'FOLLOW_UP', label: 'Butuh Follow-up' },
    { value: 'PIPELINE', label: 'Penawaran' },
    { value: 'DRAFT', label: 'Draft' },
    { value: 'ACTIVE', label: 'Berjalan' },
    { value: 'DONE', label: 'Selesai' },
    { value: 'CANCELLED', label: 'Ditolak/Batal' },
];

interface OrderListClientProps {
    orders: FieldMobileOrder[];
    initialFollowUpDue?: boolean;
}

export function OrderListClient({ orders, initialFollowUpDue }: OrderListClientProps) {
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<OrderListFilter>(
        initialFollowUpDue ? 'FOLLOW_UP' : 'ALL',
    );

    const filtered = useMemo(() => {
        if (statusFilter === 'FOLLOW_UP') {
            const now = new Date();
            const todayEnd = new Date(
                now.getFullYear(),
                now.getMonth(),
                now.getDate(),
                23,
                59,
                59,
                999,
            );
            let result = orders.filter((o) => {
                if (!o.nextFollowUpDate) return false;
                if (
                    [
                        'CANCELLED',
                        'DELIVERED',
                        'QUOTATION_REJECTED',
                        'QUOTATION_EXPIRED',
                    ].includes(o.status)
                ) {
                    return false;
                }
                const d = new Date(o.nextFollowUpDate);
                return !isNaN(d.getTime()) && d <= todayEnd;
            });
            if (search) {
                const q = search.toLowerCase();
                result = result.filter(
                    (o) =>
                        o.orderNumber.toLowerCase().includes(q) ||
                        o.customerName.toLowerCase().includes(q),
                );
            }
            return result;
        }
        return filterOrders(orders, search, statusFilter) as FieldMobileOrder[];
    }, [orders, search, statusFilter]);

    return (
        <div className="p-4 space-y-4">
            <div>
                <h1 className="text-xl font-bold">Order</h1>
                <p className="text-sm text-muted-foreground">
                    {orders.length} order
                </p>
            </div>

            {/* Search */}
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                    placeholder="Cari no order atau customer..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9 h-11"
                />
            </div>

            {/* Status Filter Pills */}
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4">
                {FILTER_OPTIONS.map((opt) => (
                    <button
                        key={opt.value}
                        type="button"
                        onClick={() => setStatusFilter(opt.value)}
                        className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                            statusFilter === opt.value
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-muted text-muted-foreground'
                        }`}
                    >
                        {opt.label}
                    </button>
                ))}
            </div>

            {/* Order List */}
            {filtered.length === 0 ? (
                <div className="text-center py-12">
                    <ShoppingBag className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-50" />
                    <p className="text-sm text-muted-foreground">
                        {statusFilter === 'FOLLOW_UP'
                            ? 'Tidak ada order yang butuh follow-up saat ini'
                            : search || statusFilter !== 'ALL'
                              ? 'Order tidak ditemukan'
                              : 'Belum ada order'}
                    </p>
                </div>
            ) : (
                <div className="space-y-2">
                    {filtered.map((order) => (
                        <Link
                            key={order.id}
                            href={`/field/sales/orders/${order.id}`}
                            className="block p-3 border rounded-xl active:scale-[0.98] transition-transform"
                        >
                            <div className="flex items-start gap-3">
                                <div className="bg-primary/10 p-2 rounded-lg shrink-0">
                                    <FileText className="h-4 w-4 text-primary" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <h3 className="font-medium text-sm">
                                            {order.orderNumber}
                                        </h3>
                                        <Badge
                                            variant="secondary"
                                            className={`text-xs px-1.5 h-4 ${getMobileStatusColor(order.status)}`}
                                        >
                                            {getMobileStatusLabel(
                                                order.status,
                                                order.orderType,
                                            )}
                                        </Badge>
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        {order.customerName} •{' '}
                                        {format(
                                            new Date(order.orderDate),
                                            'd MMM yyyy',
                                        )}
                                    </p>
                                    {order.nextFollowUpDate && (
                                        <p className="text-[11px] text-amber-700 dark:text-amber-400 font-medium mt-0.5">
                                            Follow-up:{' '}
                                            {format(
                                                new Date(order.nextFollowUpDate),
                                                'd MMM yyyy',
                                            )}
                                        </p>
                                    )}
                                    <div className="flex items-center justify-between mt-1">
                                        <span className="text-xs text-muted-foreground">
                                            {order.itemCount} item
                                        </span>
                                        <span className="text-sm font-semibold text-primary">
                                            {order.totalAmount
                                                ? formatRupiah(
                                                      order.totalAmount,
                                                  )
                                                : '-'}
                                        </span>
                                    </div>
                                </div>
                                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
                            </div>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}
