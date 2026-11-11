'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { getPayslipAttendanceBasis } from '@/actions/hrd/payroll-monthly';
import type { AttendanceBasis } from '@/services/hrd/payroll-monthly-service';
import { formatIdr } from './payslipFormat';

type BasisState =
    | { kind: 'loading' }
    | { kind: 'error'; message: string }
    | { kind: 'empty' }
    | { kind: 'ready'; basis: AttendanceBasis };

const FALLBACK_ERROR = 'Gagal memuat dasar absensi';

type DayKey =
    | 'workingDays'
    | 'absentDays'
    | 'deductibleLeaveDays'
    | 'paidLeaveDays'
    | 'missingDays';

const DAY_ROWS: Array<{ key: DayKey; label: string }> = [
    { key: 'workingDays', label: 'Hari kerja (Senin–Sabtu)' },
    { key: 'absentDays', label: 'Alpa' },
    { key: 'deductibleLeaveDays', label: 'Izin dipotong' },
    { key: 'paidLeaveDays', label: 'Izin dibayar' },
    { key: 'missingDays', label: 'Tanpa catatan absensi' },
];

function errorMessage(err: unknown): string {
    return err instanceof Error && err.message ? err.message : FALLBACK_ERROR;
}

async function fetchBasisState(payslipId: string): Promise<BasisState> {
    try {
        const res = await getPayslipAttendanceBasis(payslipId);
        if (!res.success) {
            return { kind: 'error', message: res.error || FALLBACK_ERROR };
        }
        return res.data
            ? { kind: 'ready', basis: res.data as AttendanceBasis }
            : { kind: 'empty' };
    } catch (err) {
        return { kind: 'error', message: errorMessage(err) };
    }
}

function Row({ id, label, value }: { id: string; label: string; value: string }) {
    return (
        <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">{label}</span>
            <span data-testid={`basis-${id}`}>{value}</span>
        </div>
    );
}

function BasisRows({ basis }: { basis: AttendanceBasis }) {
    return (
        <div className="space-y-1">
            {DAY_ROWS.map(({ key, label }) => (
                <Row
                    key={key}
                    id={key}
                    label={label}
                    value={`${basis[key]} hari`}
                />
            ))}
            <Row
                id="dailyRate"
                label="Tarif harian"
                value={formatIdr(basis.dailyRate)}
            />
            {basis.missingDays > 0 && (
                <p className="pt-1 text-amber-700">
                    {basis.missingDays} hari kerja tanpa catatan absensi tidak
                    dipotong otomatis.
                </p>
            )}
            {basis.unlinkedLeaveDays > 0 && (
                <p className="text-amber-700">
                    {basis.unlinkedLeaveDays} hari cuti tercatat tanpa
                    pengajuan izin; dihitung dibayar.
                </p>
            )}
        </div>
    );
}

function PanelBody({
    state,
    onRetry,
}: {
    state: BasisState;
    onRetry: () => void;
}) {
    if (state.kind === 'loading') {
        return <p className="text-muted-foreground">Memuat dasar absensi…</p>;
    }
    if (state.kind === 'error') {
        return (
            <div className="space-y-2">
                <p role="alert" className="text-red-600">
                    {state.message}
                </p>
                <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={onRetry}
                >
                    Coba lagi
                </Button>
            </div>
        );
    }
    if (state.kind === 'empty') {
        return (
            <p className="text-muted-foreground">
                Data dasar absensi tidak tersedia.
            </p>
        );
    }
    return <BasisRows basis={state.basis} />;
}

export function AttendanceBasisPanel({
    payslipId,
    refreshKey = 0,
}: {
    payslipId: string;
    refreshKey?: number;
}) {
    const [state, setState] = useState<BasisState>({ kind: 'loading' });
    const [retryCount, setRetryCount] = useState(0);

    useEffect(() => {
        let isStale = false;
        setState({ kind: 'loading' });
        fetchBasisState(payslipId).then((next) => {
            if (!isStale) setState(next);
        });
        return () => {
            isStale = true;
        };
    }, [payslipId, refreshKey, retryCount]);

    const handleRetry = useCallback(() => setRetryCount((c) => c + 1), []);

    return (
        <div className="space-y-1 text-xs">
            <p className="font-semibold uppercase tracking-tight text-muted-foreground">
                Dasar absensi
            </p>
            <p className="text-[10px] text-muted-foreground">
                Berdasarkan data absensi saat ini
            </p>
            <PanelBody state={state} onRetry={handleRetry} />
        </div>
    );
}
