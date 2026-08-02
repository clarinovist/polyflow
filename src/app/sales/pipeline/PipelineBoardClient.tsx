'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatRupiah } from '@/lib/utils/utils';
import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import {
    FileText,
    Send,
    CheckCircle2,
    XCircle,
    Clock3,
    TrendingUp,
    AlertTriangle,
} from 'lucide-react';
import type { PipelineStageKey } from '@/services/sales/pipeline-service';
import { SALES_LOST_REASON_LABELS } from '@/lib/sales/order-phase';

type OrderCard = {
    id: string;
    orderNumber: string;
    status: string;
    customerId: string | null;
    customerName: string;
    totalAmount: number;
    createdAt: string | Date;
    updatedAt: string | Date;
    ageDays: number;
    lostReason: string | null;
};

type Stage = {
    key: PipelineStageKey;
    label: string;
    count: number;
    totalValue: number;
    avgAgeDays: number;
    orders: OrderCard[];
};

type LostBucket = {
    reason: string | null;
    label: string;
    count: number;
    totalValue: number;
};

type PipelineDataClient = {
    startDate: string | Date;
    endDate: string | Date;
    stages: Stage[];
    conversionRate: number;
    lostReasonBreakdown: LostBucket[];
    totalCount: number;
    totalValue: number;
};

const STAGE_META: Record<
    PipelineStageKey,
    { icon: React.ElementType; color: string; bg: string; border: string }
> = {
    QUOTATION: {
        icon: FileText,
        color: 'text-cyan-700 dark:text-cyan-400',
        bg: 'bg-cyan-50 dark:bg-cyan-950/20',
        border: 'border-cyan-200 dark:border-cyan-800/50',
    },
    QUOTATION_SENT: {
        icon: Send,
        color: 'text-sky-700 dark:text-sky-400',
        bg: 'bg-sky-50 dark:bg-sky-950/20',
        border: 'border-sky-200 dark:border-sky-800/50',
    },
    CONVERTED: {
        icon: CheckCircle2,
        color: 'text-emerald-700 dark:text-emerald-400',
        bg: 'bg-emerald-50 dark:bg-emerald-950/20',
        border: 'border-emerald-200 dark:border-emerald-800/50',
    },
    QUOTATION_REJECTED: {
        icon: XCircle,
        color: 'text-red-700 dark:text-red-400',
        bg: 'bg-red-50 dark:bg-red-950/20',
        border: 'border-red-200 dark:border-red-800/50',
    },
    QUOTATION_EXPIRED: {
        icon: Clock3,
        color: 'text-orange-700 dark:text-orange-400',
        bg: 'bg-orange-50 dark:bg-orange-950/20',
        border: 'border-orange-200 dark:border-orange-800/50',
    },
};

function formatAge(days: number): string {
    if (days < 1) return '<1 hari';
    const d = Math.floor(days);
    return `${d} hari`;
}

export function PipelineBoardClient({
    data,
    periodLabel,
}: {
    data: PipelineDataClient;
    periodLabel: string;
}) {
    const conversionPct = useMemo(() => {
        return (data.conversionRate * 100).toFixed(1);
    }, [data.conversionRate]);

    const totalConverted = useMemo(() => {
        return data.stages.find((s) => s.key === 'CONVERTED');
    }, [data.stages]);

    return (
        <div className="space-y-6">
            {/* Ringkasan */}
            <div className="grid gap-4 md:grid-cols-3">
                <Card className="md:col-span-1 border-amber-200 bg-amber-50/40 dark:border-amber-800/50 dark:bg-amber-950/10">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <TrendingUp className="h-4 w-4 text-amber-600" />
                            Konversi Penawaran
                        </CardTitle>
                        <CardDescription className="text-xs">
                            Periode: {periodLabel}
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold">
                            {conversionPct}%
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                            {totalConverted?.count ?? 0} dari {data.totalCount}{' '}
                            penawaran terkonversi
                        </p>
                        <div className="mt-3 h-2 w-full rounded-full bg-amber-100 dark:bg-amber-900/30 overflow-hidden">
                            <div
                                className="h-full rounded-full bg-amber-500 transition-all"
                                style={{
                                    width: `${Math.min(data.conversionRate * 100, 100)}%`,
                                }}
                            />
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">
                            Total Pipeline
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {data.totalCount} SO
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                            {formatRupiah(data.totalValue)}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                            Nilai total semua stage dalam periode ini
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4 text-red-500" />
                            Alasan Kalah
                        </CardTitle>
                        <CardDescription className="text-xs">
                            Breakdown penawaran ditolak
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {data.lostReasonBreakdown.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                                Belum ada penawaran ditolak di periode ini.
                            </p>
                        ) : (
                            <div className="space-y-2">
                                {data.lostReasonBreakdown.map((b) => (
                                    <div
                                        key={b.reason ?? '__unknown__'}
                                        className="flex items-center justify-between gap-2 text-sm"
                                    >
                                        <div className="min-w-0">
                                            <p className="font-medium truncate">
                                                {b.label}
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                                {formatRupiah(b.totalValue)}
                                            </p>
                                        </div>
                                        <Badge
                                            variant="outline"
                                            className="shrink-0"
                                        >
                                            {b.count} SO
                                        </Badge>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Kanban columns — read-only */}
            <div className="grid gap-4 lg:grid-cols-5 md:grid-cols-3 grid-cols-1 items-start">
                {data.stages.map((stage) => {
                    const meta = STAGE_META[stage.key];
                    const Icon = meta.icon;
                    return (
                        <div
                            key={stage.key}
                            className={`rounded-xl border ${meta.border} ${meta.bg} flex flex-col min-h-[200px]`}
                        >
                            {/* Column header */}
                            <div className="px-3 py-3 border-b border-inherit flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                        <Icon
                                            className={`h-4 w-4 ${meta.color}`}
                                        />
                                        <span className="font-semibold text-sm">
                                            {stage.label}
                                        </span>
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        {stage.count} SO ·{' '}
                                        {formatRupiah(stage.totalValue)}
                                    </p>
                                    {stage.count > 0 && (
                                        <p className="text-[11px] text-muted-foreground mt-0.5">
                                            Rata-rata umur:{' '}
                                            {formatAge(stage.avgAgeDays)}
                                        </p>
                                    )}
                                </div>
                                <Badge
                                    variant="secondary"
                                    className="shrink-0 text-[11px]"
                                >
                                    {stage.count}
                                </Badge>
                            </div>

                            {/* Cards */}
                            <div className="p-2 space-y-2 flex-1 overflow-auto">
                                {stage.orders.length === 0 ? (
                                    <p className="text-xs text-muted-foreground text-center py-8 px-2">
                                        Tidak ada SO di tahap ini.
                                    </p>
                                ) : (
                                    stage.orders.map((order) => (
                                        <Link
                                            key={order.id}
                                            href={`/sales/orders/${order.id}`}
                                            className="block rounded-lg border bg-card p-3 shadow-sm hover:border-primary/40 hover:shadow transition-all"
                                        >
                                            <div className="flex items-start justify-between gap-2">
                                                <p className="font-medium text-sm truncate">
                                                    {order.orderNumber}
                                                </p>
                                                <span className="text-[11px] text-muted-foreground shrink-0">
                                                    {formatAge(order.ageDays)}
                                                </span>
                                            </div>
                                            <p className="text-xs text-muted-foreground truncate mt-1">
                                                {order.customerName}
                                            </p>
                                            <p className="text-sm font-semibold mt-2">
                                                {formatRupiah(
                                                    order.totalAmount,
                                                )}
                                            </p>
                                            {order.lostReason && (
                                                <p className="text-[11px] text-red-600 dark:text-red-400 mt-1 truncate">
                                                    {SALES_LOST_REASON_LABELS[
                                                        order.lostReason
                                                    ] ?? order.lostReason}
                                                </p>
                                            )}
                                        </Link>
                                    ))
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Detail breakdown alasan kalah — tabel kecil di bawah kolom REJECTED kalau diperlukan */}
            {data.lostReasonBreakdown.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-sm">
                            Rincian Alasan Kalah
                        </CardTitle>
                        <CardDescription className="text-xs">
                            Total{' '}
                            {data.stages.find(
                                (s) => s.key === 'QUOTATION_REJECTED',
                            )?.count ?? 0}{' '}
                            penawaran ditolak —{' '}
                            {format(
                                typeof data.startDate === 'string'
                                    ? new Date(data.startDate)
                                    : data.startDate,
                                'd MMM yyyy',
                                { locale: idLocale },
                            )}{' '}
                            sampai{' '}
                            {format(
                                typeof data.endDate === 'string'
                                    ? new Date(data.endDate)
                                    : data.endDate,
                                'd MMM yyyy',
                                { locale: idLocale },
                            )}
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="rounded-lg border overflow-hidden">
                            <table className="w-full text-sm">
                                <thead className="bg-muted/50 border-b">
                                    <tr>
                                        <th className="h-9 px-3 text-left font-medium">
                                            Alasan
                                        </th>
                                        <th className="h-9 px-3 text-right font-medium">
                                            Jumlah SO
                                        </th>
                                        <th className="h-9 px-3 text-right font-medium">
                                            Nilai
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.lostReasonBreakdown.map((b) => (
                                        <tr
                                            key={b.reason ?? '__unknown__'}
                                            className="border-b last:border-0"
                                        >
                                            <td className="px-3 py-2 font-medium">
                                                {b.label}
                                            </td>
                                            <td className="px-3 py-2 text-right">
                                                {b.count}
                                            </td>
                                            <td className="px-3 py-2 text-right">
                                                {formatRupiah(b.totalValue)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </CardContent>
                </Card>
            )}

            <p className="text-[11px] text-muted-foreground">
                Perpindahan status tetap lewat aksi resmi di halaman detail SO
                (Kirim, Terima, Tolak, Buka Kembali) agar audit trail &
                lifecycle rules tidak dilewati.
            </p>
        </div>
    );
}
