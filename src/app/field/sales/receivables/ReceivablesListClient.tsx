'use client';

import { useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Search,
    ArrowLeft,
    AlertCircle,
    TrendingDown,
    CalendarClock,
    Clock,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import NextLink from 'next/link';
import { format } from 'date-fns';
import { formatRupiah } from '@/lib/utils/utils';

type Invoice = {
    id: string;
    invoiceNumber: string;
    invoiceDate: Date | string;
    dueDate: Date | string | null;
    totalAmount: number;
    paidAmount: number;
    status: string;
    customerName: string;
    orderNumber: string;
    daysOverdue?: number;
    lastPromise?: {
        id: string;
        promisedDate: Date | string | null;
        promisedAmount: number | null;
    } | null;
};

function overdueBadgeStyle(days?: number) {
    if (days == null) return 'bg-slate-100 text-slate-600';
    if (days < 0) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    if (days <= 7) return 'bg-amber-50 text-amber-700 border-amber-200';
    if (days <= 30) return 'bg-orange-50 text-orange-700 border-orange-200';
    return 'bg-red-50 text-red-700 border-red-200';
}

function overdueLabel(days?: number) {
    if (days == null) return null;
    if (days < 0) return `${Math.abs(days)}h lagi`;
    if (days === 0) return 'Jatuh tempo hari ini';
    return `${days}h overdue`;
}

interface ReceivablesListClientProps {
    invoices: Invoice[];
}

export function ReceivablesListClient({
    invoices,
}: ReceivablesListClientProps) {
    const router = useRouter();
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState<'ALL' | 'OVERDUE' | 'UNPAID'>('ALL');

    const filtered = useMemo(() => {
        return invoices.filter((inv) => {
            // 1. Filter by Status Tab
            const isOverdue =
                inv.status === 'OVERDUE' ||
                (inv.dueDate && new Date(inv.dueDate) < new Date());
            if (filter === 'OVERDUE' && !isOverdue) return false;
            if (filter === 'UNPAID' && isOverdue) return false; // purely unpaid and not overdue yet

            // 2. Filter by search query
            if (!search) return true;
            const q = search.toLowerCase();
            return (
                inv.invoiceNumber.toLowerCase().includes(q) ||
                inv.customerName.toLowerCase().includes(q) ||
                inv.orderNumber.toLowerCase().includes(q)
            );
        });
    }, [invoices, search, filter]);

    // Sum of outstanding amounts for the filtered list
    const totalOutstanding = useMemo(() => {
        return filtered.reduce(
            (sum, inv) => sum + (inv.totalAmount - inv.paidAmount),
            0,
        );
    }, [filtered]);

    return (
        <div className="p-4 space-y-4">
            {/* Header */}
            <div className="flex items-center gap-3">
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => router.push('/field/sales')}
                    className="shrink-0"
                >
                    <ArrowLeft className="h-5 w-5" />
                </Button>
                <div>
                    <h1 className="text-xl font-bold">Daftar Piutang</h1>
                    <p className="text-sm text-muted-foreground">
                        Faktur outstanding & jatuh tempo
                    </p>
                </div>
            </div>

            {/* Summary Widget */}
            <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/30 flex items-center justify-between">
                <div className="space-y-1">
                    <p className="text-xs font-semibold text-rose-800 dark:text-rose-300 uppercase tracking-wider">
                        Total Piutang Outstanding
                    </p>
                    <p className="text-2xl font-bold text-rose-600 dark:text-rose-400">
                        {formatRupiah(totalOutstanding)}
                    </p>
                </div>
                <div className="h-10 w-10 rounded-full bg-rose-100 dark:bg-rose-900/50 flex items-center justify-center">
                    <TrendingDown className="h-5 w-5 text-rose-600 dark:text-rose-400" />
                </div>
            </div>

            {/* Search & Filter Tabs */}
            <div className="space-y-3">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Cari invoice, customer, atau order..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-9 h-11"
                    />
                </div>

                {/* Tabs */}
                <div className="grid grid-cols-3 gap-2 bg-muted/50 p-1 rounded-xl text-xs font-medium">
                    <button
                        onClick={() => setFilter('ALL')}
                        className={`py-2 rounded-lg text-center transition-all ${
                            filter === 'ALL'
                                ? 'bg-background text-foreground shadow-sm font-semibold'
                                : 'text-muted-foreground'
                        }`}
                    >
                        Semua ({invoices.length})
                    </button>
                    <button
                        onClick={() => setFilter('OVERDUE')}
                        className={`py-2 rounded-lg text-center transition-all ${
                            filter === 'OVERDUE'
                                ? 'bg-rose-600 text-white shadow-sm font-semibold'
                                : 'text-muted-foreground'
                        }`}
                    >
                        Overdue (
                        {
                            invoices.filter(
                                (i) =>
                                    i.status === 'OVERDUE' ||
                                    (i.dueDate &&
                                        new Date(i.dueDate) < new Date()),
                            ).length
                        }
                        )
                    </button>
                    <button
                        onClick={() => setFilter('UNPAID')}
                        className={`py-2 rounded-lg text-center transition-all ${
                            filter === 'UNPAID'
                                ? 'bg-background text-foreground shadow-sm font-semibold'
                                : 'text-muted-foreground'
                        }`}
                    >
                        Unpaid (
                        {
                            invoices.filter(
                                (i) =>
                                    i.status !== 'OVERDUE' &&
                                    !(
                                        i.dueDate &&
                                        new Date(i.dueDate) < new Date()
                                    ),
                            ).length
                        }
                        )
                    </button>
                </div>
            </div>

            {/* List */}
            {filtered.length === 0 ? (
                <div className="text-center py-12">
                    <AlertCircle className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-50" />
                    <p className="text-sm text-muted-foreground">
                        {search
                            ? 'Piutang tidak ditemukan'
                            : 'Tidak ada piutang outstanding'}
                    </p>
                </div>
            ) : (
                <div className="space-y-3">
                    {filtered.map((inv) => {
                        const remaining = inv.totalAmount - inv.paidAmount;
                        const isOverdue =
                            inv.status === 'OVERDUE' ||
                            (inv.dueDate && new Date(inv.dueDate) < new Date());
                        const days = inv.daysOverdue;

                        return (
                            <div
                                key={inv.id}
                                className="p-4 border rounded-xl bg-card space-y-3 shadow-sm hover:shadow-md transition-shadow"
                            >
                                <div className="flex justify-between items-start gap-2">
                                    <div className="min-w-0">
                                        <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                                            {inv.invoiceNumber}
                                        </span>
                                        <h3 className="font-bold text-sm text-foreground truncate mt-0.5">
                                            {inv.customerName}
                                        </h3>
                                        <p className="text-xs text-muted-foreground">
                                            Order:{' '}
                                            <strong className="font-medium text-foreground">
                                                {inv.orderNumber}
                                            </strong>
                                        </p>
                                    </div>
                                    <div className="flex flex-col items-end gap-1 shrink-0">
                                        <Badge
                                            variant={
                                                isOverdue
                                                    ? 'destructive'
                                                    : 'secondary'
                                            }
                                            className="text-[9px] uppercase font-bold px-2 py-0.5"
                                        >
                                            {isOverdue ? 'Overdue' : inv.status}
                                        </Badge>
                                        {days != null && (
                                            <Badge
                                                variant="outline"
                                                className={`text-[9px] font-bold ${overdueBadgeStyle(days)}`}
                                            >
                                                <Clock className="h-2.5 w-2.5 mr-0.5" />
                                                {overdueLabel(days)}
                                            </Badge>
                                        )}
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-2 pt-2.5 border-t text-xs">
                                    <div>
                                        <p className="text-[10px] text-muted-foreground">
                                            Jatuh Tempo
                                        </p>
                                        <p
                                            className={`font-semibold ${isOverdue ? 'text-destructive' : 'text-foreground'}`}
                                        >
                                            {inv.dueDate
                                                ? format(
                                                      new Date(inv.dueDate),
                                                      'dd MMM yyyy',
                                                  )
                                                : '-'}
                                        </p>
                                        {inv.lastPromise?.promisedDate && (
                                            <p className="text-[10px] text-amber-700 dark:text-amber-400 flex items-center gap-1 mt-1">
                                                <CalendarClock className="h-3 w-3" />
                                                Janji:{' '}
                                                {format(
                                                    new Date(
                                                        inv.lastPromise
                                                            .promisedDate,
                                                    ),
                                                    'dd MMM yyyy',
                                                )}
                                                {inv.lastPromise
                                                    .promisedAmount != null
                                                    ? ` • ${formatRupiah(inv.lastPromise.promisedAmount)}`
                                                    : ''}
                                            </p>
                                        )}
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[10px] text-muted-foreground">
                                            Sisa Piutang
                                        </p>
                                        <p className="font-bold text-sm text-rose-600 dark:text-rose-400">
                                            {formatRupiah(remaining)}
                                        </p>
                                    </div>
                                </div>

                                <div className="flex gap-2">
                                    <Button
                                        asChild
                                        size="sm"
                                        variant="outline"
                                        className="flex-1 h-8 text-xs"
                                    >
                                        <NextLink
                                            href={`/field/sales/collection?invoiceId=${inv.id}`}
                                        >
                                            Catat Aktivitas
                                        </NextLink>
                                    </Button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
