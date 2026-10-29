'use client';

import { AlertTriangle, Info } from 'lucide-react';
import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import { formatRupiah } from '@/lib/utils/utils';
import {
    compareHppPeriodSnapshot,
    type HppOrderChangeKind,
    type HppPeriodLockInfo,
} from '@/lib/finance/hpp-period-snapshot';
import type { HppReportData } from '@/lib/utils/hpp-report';

export interface HppLockChangeNoticeProps {
    lock: HppPeriodLockInfo | null;
    liveReport: Pick<HppReportData, 'summary' | 'orders'> | null;
}

const KIND_LABELS: Record<HppOrderChangeKind, string> = {
    CHANGED: 'berubah',
    ADDED: 'masuk',
    REMOVED: 'keluar',
};

function formatLockedDate(isoDate: string): string {
    const parsed = new Date(isoDate);
    if (Number.isNaN(parsed.getTime())) return isoDate;
    return format(parsed, 'dd MMM yyyy', { locale: idLocale });
}

function formatSignedRupiah(amount: number): string {
    const sign = amount > 0 ? '+' : amount < 0 ? '-' : '';
    return `${sign}${formatRupiah(Math.abs(amount))}`;
}

export function HppLockChangeNotice({
    lock,
    liveReport,
}: HppLockChangeNoticeProps) {
    if (!lock || !liveReport) return null;

    const comparison = compareHppPeriodSnapshot(lock.snapshot, liveReport);

    if (comparison.status === 'MISSING_SNAPSHOT') {
        return (
            <div
                role="status"
                className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700"
            >
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
                <p>
                    Dikunci sebelum snapshot tersedia; kunci ulang untuk
                    memantau perubahan
                </p>
            </div>
        );
    }

    if (!comparison.changed) {
        return null;
    }

    const lockedDateLabel = formatLockedDate(lock.lockedAt);

    return (
        <div
            role="alert"
            className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950"
        >
            <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <div className="space-y-2">
                    <p className="font-semibold">
                        Angka berubah sejak dikunci {lockedDateLabel}
                    </p>
                    <p className="text-xs text-amber-900">
                        Total COGM saat dikunci:{' '}
                        <span className="font-medium">
                            {formatRupiah(comparison.lockedTotalCogm ?? 0)}
                        </span>{' '}
                        • Live:{' '}
                        <span className="font-medium">
                            {formatRupiah(comparison.currentTotalCogm)}
                        </span>{' '}
                        • Selisih:{' '}
                        <span className="font-semibold">
                            {formatSignedRupiah(comparison.deltaCogm)}
                        </span>
                    </p>
                    {comparison.orderChanges.length > 0 && (
                        <ul className="list-disc space-y-1 pl-4 text-xs text-amber-900">
                            {comparison.orderChanges.map((item) => (
                                <li key={item.productionOrderId}>
                                    <span className="font-medium">
                                        {item.orderNumber}
                                    </span>{' '}
                                    ({KIND_LABELS[item.kind]}):{' '}
                                    {item.kind === 'CHANGED' && (
                                        <>
                                            {formatRupiah(item.lockedCost ?? 0)}{' '}
                                            →{' '}
                                            {formatRupiah(
                                                item.currentCost ?? 0,
                                            )}{' '}
                                            (
                                            {formatSignedRupiah(item.deltaCost)}
                                            )
                                        </>
                                    )}
                                    {item.kind === 'ADDED' && (
                                        <>
                                            +{formatRupiah(item.currentCost ?? 0)}
                                        </>
                                    )}
                                    {item.kind === 'REMOVED' && (
                                        <>
                                            -{formatRupiah(item.lockedCost ?? 0)}
                                        </>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>
        </div>
    );
}
