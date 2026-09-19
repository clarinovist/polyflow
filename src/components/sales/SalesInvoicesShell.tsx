'use client';
import { useMemo, useState } from 'react';
import type { ComponentProps } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatRupiah, serializeData } from '@/lib/utils/utils';
import { InvoiceTable } from '@/components/sales/InvoiceTable';
import {
    BadgeDollarSign,
    AlertCircle,
    CheckCircle,
    Clock,
    FileText,
} from 'lucide-react';

import { hasAnyRole } from '@/lib/auth/roles';
import { isActionableInvoiceOverdue } from '@/lib/finance/payment-terms';

type FilterStatus =
    | 'all'
    | 'UNPAID'
    | 'PARTIAL'
    | 'OVERDUE'
    | 'PAID'
    | 'PENDING';

type Stats = {
    totalOutstanding: number;
    overdueCount: number;
    partialCount: number;
    paidCount: number;
    unpaidCount: number;
} | null;

/** 'PENDING' = belum lunas (UNPAID + PARTIAL + OVERDUE), dipakai deep-link dari dashboard */
const PENDING_STATUSES = ['UNPAID', 'PARTIAL', 'OVERDUE'];
const hasPositiveBalance = (invoice: Record<string, unknown>) => Number(invoice.totalAmount) + Number(invoice.priceAdjustmentAmount ?? 0) - Number(invoice.paidAmount) - Number(invoice.creditedAmount ?? 0) > 0;

function isActionableOverdueRecord(inv: Record<string, unknown>): boolean {
    return isActionableInvoiceOverdue({
        dueDate: inv.dueDate as string | Date | null | undefined,
        status: inv.status as string | null | undefined,
        totalAmount: inv.totalAmount as number | string | null | undefined,
        paidAmount: inv.paidAmount as number | string | null | undefined,
        creditedAmount: inv.creditedAmount as number | string | null | undefined,
        priceAdjustmentAmount: inv.priceAdjustmentAmount as number | string | null | undefined,
    });
}

function parseStatusFilter(raw?: string | null): FilterStatus {
    if (!raw) return 'all';
    const upper = raw.toUpperCase();
    if (
        upper === 'UNPAID' ||
        upper === 'PARTIAL' ||
        upper === 'OVERDUE' ||
        upper === 'PAID' ||
        upper === 'PENDING'
    ) {
        return upper;
    }
    return 'all';
}

export function SalesInvoicesShell({
    initialInvoices,
    stats,
    periodLabel,
    initialStatus,
}: {
    initialInvoices: Record<string, unknown>[];
    stats: Stats;
    periodLabel: string;
    /** Deep-link from command board: ?status=OVERDUE */
    initialStatus?: string | null;
}) {
    const { data: session } = useSession();
    const canAccessFinance = hasAnyRole(session?.user, ['ADMIN', 'FINANCE']);
    const [filter, setFilter] = useState<FilterStatus>(() =>
        parseStatusFilter(initialStatus),
    );

    const filteredInvoices = useMemo(() => {
        if (filter === 'all') return initialInvoices;
        if (filter === 'PENDING') {
            return initialInvoices.filter((inv) =>
                PENDING_STATUSES.includes(
                    (inv as { status?: string }).status ?? '',
                ) && hasPositiveBalance(inv),
            );
        }
        if (filter === 'OVERDUE') {
            return initialInvoices.filter(isActionableOverdueRecord);
        }
        return initialInvoices.filter(
            (inv) => (inv as { status?: string }).status === filter && (!PENDING_STATUSES.includes(filter) || hasPositiveBalance(inv)),
        );
    }, [initialInvoices, filter]);

    const filterCounts = useMemo(
        () => ({
            all: initialInvoices.length,
            UNPAID: initialInvoices.filter(
                (inv) => (inv as { status?: string }).status === 'UNPAID' && hasPositiveBalance(inv),
            ).length,
            PARTIAL: initialInvoices.filter(
                (inv) => (inv as { status?: string }).status === 'PARTIAL' && hasPositiveBalance(inv),
            ).length,
            OVERDUE: initialInvoices.filter(isActionableOverdueRecord).length,
            PAID: initialInvoices.filter(
                (inv) => (inv as { status?: string }).status === 'PAID',
            ).length,
        }),
        [initialInvoices],
    );

    const serialized = useMemo(
        () => serializeData(filteredInvoices),
        [filteredInvoices],
    );

    const filterButtons: {
        label: string;
        value: FilterStatus;
        count: number;
        icon: typeof FileText;
    }[] = [
        {
            label: 'Semua',
            value: 'all',
            count: filterCounts.all,
            icon: FileText,
        },
        {
            label: 'Belum Bayar',
            value: 'UNPAID',
            count: filterCounts.UNPAID,
            icon: Clock,
        },
        {
            label: 'Partial',
            value: 'PARTIAL',
            count: filterCounts.PARTIAL,
            icon: Clock,
        },
        {
            label: 'Jatuh Tempo',
            value: 'OVERDUE',
            count: filterCounts.OVERDUE,
            icon: AlertCircle,
        },
        {
            label: 'Lunas',
            value: 'PAID',
            count: filterCounts.PAID,
            icon: CheckCircle,
        },
    ];

    return (
        <>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            Outstanding (all-time)
                        </CardTitle>
                        <BadgeDollarSign className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {formatRupiah(stats?.totalOutstanding ?? 0)}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Total piutang belum lunas (global)
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            Jatuh Tempo
                        </CardTitle>
                        <AlertCircle className="h-4 w-4 text-red-500 dark:text-red-400" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                            {stats?.overdueCount ?? 0}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Perlu segera ditagih
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            Partial
                        </CardTitle>
                        <Clock className="h-4 w-4 text-amber-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-amber-600">
                            {stats?.partialCount ?? 0}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Bayar sebagian
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            Lunas
                        </CardTitle>
                        <CheckCircle className="h-4 w-4 text-green-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-green-600">
                            {stats?.paidCount ?? 0}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Invoice terbayar
                        </p>
                    </CardContent>
                </Card>
            </div>

            <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm flex flex-wrap items-center justify-between gap-2">
                <span className="text-muted-foreground">
                    Periode daftar:{' '}
                    <span className="font-medium text-foreground">
                        {periodLabel}
                    </span>{' '}
                    • invoiceDate
                </span>
                {canAccessFinance && (
                    <Link
                        href="/finance/aging"
                        className="text-xs text-blue-600 hover:underline"
                    >
                        Lihat Aging Piutang →
                    </Link>
                )}
            </div>

            <div className="flex flex-wrap gap-2">
                {filterButtons.map((fb) => {
                    const Icon = fb.icon;
                    return (
                        <Button
                            key={fb.value}
                            variant={
                                filter === fb.value ? 'default' : 'outline'
                            }
                            size="sm"
                            onClick={() => setFilter(fb.value)}
                            className="h-7 text-xs"
                        >
                            <Icon className="h-3 w-3 mr-1" />
                            {fb.label}
                            <span className="ml-1 text-muted-foreground">
                                ({fb.count})
                            </span>
                        </Button>
                    );
                })}
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>
                        Daftar Invoice ({filteredInvoices.length})
                    </CardTitle>
                    <CardDescription>
                        {filter === 'all'
                            ? `Periode ${periodLabel}`
                            : `Invoice status: ${filter} — periode ${periodLabel}`}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <InvoiceTable
                        invoices={
                            serialized as unknown as ComponentProps<
                                typeof InvoiceTable
                            >['invoices']
                        }
                        // SalesInvoicesShell already filtered `invoices` above (including
                        // the synthetic 'PENDING' bucket) — force InvoiceTable to show all
                        // of it instead of re-reading the raw ?status= URL param and
                        // double-filtering by literal equality (breaks on non-enum values
                        // like 'PENDING').
                        initialStatus="ALL"
                        canDelete={canAccessFinance}
                    />
                </CardContent>
            </Card>
        </>
    );
}
