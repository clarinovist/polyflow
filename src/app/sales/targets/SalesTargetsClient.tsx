'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toDecimalNumber } from '@/lib/utils/utils';
import {
    getTargetsForPeriodAction,
    bulkSetTargetsAction,
    copyTargetsFromPreviousMonthAction,
    getTargetContextAction,
    getCompanyTargetAction,
    setCompanyTargetAction,
} from '@/actions/sales/sales-targets';
import { toast } from 'sonner';
import { expectedPacePercent } from '@/lib/sales/target-pacing';
import { TargetAllocationHeader } from './TargetAllocationHeader';
import { TargetTable } from './TargetTable';
import { TargetToolbar } from './TargetToolbar';
import { buildEffectiveRows } from './build-effective-rows';
import type {
    TargetRow,
    TargetContextRow,
    TeamMember,
    EditableField,
} from './types';
import { MONTH_NAMES } from './types';

function resolveNum(v: unknown): number {
    if (v == null) return 0;
    return toDecimalNumber(v);
}

function periodEndDate(year: number, month: number): Date {
    return new Date(year, month, 0, 23, 59, 59, 999);
}

function periodStartDate(year: number, month: number): Date {
    return new Date(year, month - 1, 1);
}

export function SalesTargetsClient({
    initialData,
    initialYear,
    initialMonth,
    initialTeam,
    initialContext,
    initialCompanyTarget,
}: {
    initialData: TargetRow[];
    initialYear: number;
    initialMonth: number;
    initialTeam: TeamMember[];
    initialContext: TargetContextRow[];
    initialCompanyTarget: number | null;
}) {
    const now = new Date();
    const [year, setYear] = useState(initialYear);
    const [month, setMonth] = useState(initialMonth);
    const [targets, setTargets] = useState<TargetRow[]>(initialData);
    const [team] = useState<TeamMember[]>(initialTeam);
    const [context, setContext] = useState<TargetContextRow[]>(initialContext);
    const [companyTarget, setCompanyTargetState] = useState<number | null>(
        initialCompanyTarget,
    );
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [savingCompanyTarget, setSavingCompanyTarget] = useState(false);
    // edits keyed by userId (T1 — satu-satunya sumber perubahan belum tersimpan)
    const [edits, setEdits] = useState<Map<string, EditableField>>(new Map());

    const isDirty = edits.size > 0;

    // T1 fix: peringatkan sebelum menutup tab kalau ada edit belum tersimpan
    useEffect(() => {
        if (!isDirty) return;
        const handler = (e: BeforeUnloadEvent) => {
            e.preventDefault();
            e.returnValue = '';
        };
        window.addEventListener('beforeunload', handler);
        return () => window.removeEventListener('beforeunload', handler);
    }, [isDirty]);

    const fetchAll = useCallback(
        async (y: number, m: number) => {
            setLoading(true);
            try {
                const teamIds = team.map((t) => t.id);
                const [targetsRes, contextRes, companyRes] = await Promise.all([
                    getTargetsForPeriodAction(y, m),
                    getTargetContextAction(teamIds, y, m),
                    getCompanyTargetAction(y, m),
                ]);

                if (targetsRes?.success && targetsRes.data) {
                    setTargets(targetsRes.data as TargetRow[]);
                } else {
                    const err = (targetsRes as { error?: string })?.error;
                    if (err) toast.error(err);
                    setTargets([]);
                }

                if (contextRes?.success && contextRes.data) {
                    setContext(contextRes.data as TargetContextRow[]);
                } else {
                    setContext([]);
                }

                if (companyRes?.success && companyRes.data) {
                    setCompanyTargetState(
                        (companyRes.data as { value: number | null }).value,
                    );
                } else {
                    setCompanyTargetState(null);
                }
            } catch {
                toast.error('Gagal memuat target');
            } finally {
                setLoading(false);
            }
        },
        [team],
    );

    const handlePeriodChange = (y: number, m: number) => {
        setYear(y);
        setMonth(m);
        void fetchAll(y, m);
    };

    const targetMap = useMemo(
        () => new Map(targets.map((t) => [t.userId, t])),
        [targets],
    );
    const contextMap = useMemo(
        () => new Map(context.map((c) => [c.userId, c])),
        [context],
    );

    // Baris gabungan tim + target + edit + konteks — dipakai Header (distribusi,
    // total teralokasi) dan Table (render per baris). Satu sumber kebenaran,
    // logikanya di build-effective-rows.ts (pure, supaya file ini <400 baris).
    const rows = useMemo(
        () => buildEffectiveRows(team, targetMap, edits, contextMap),
        [team, targetMap, edits, contextMap],
    );

    const totalAllocated = rows.reduce((sum, r) => sum + r.revenueTarget, 0);

    const expectedPacePercentValue = useMemo(() => {
        const today = new Date();
        // Periode lampau/masa depan (ganti tahun/bulan di selector) tetap pakai
        // "today" sungguhan, bukan asumsi hari terakhir — expectedPacePercent
        // sendiri yang menangani periode lampau (return 100) & masa depan (0).
        return expectedPacePercent(
            today,
            periodStartDate(year, month),
            periodEndDate(year, month),
        );
    }, [year, month]);

    const setEdit = (userId: string, patch: Partial<EditableField>) => {
        setEdits((prev) => {
            const next = new Map(prev);
            const cur = next.get(userId) ?? { userId };
            next.set(userId, { ...cur, ...patch });
            return next;
        });
    };

    const handleDistribute = (targetsByUserId: Record<string, number>) => {
        for (const [userId, value] of Object.entries(targetsByUserId)) {
            setEdit(userId, { revenueTarget: value });
        }
        toast.info(
            'Field target diisi dari distribusi — cek lalu klik Simpan Semua',
        );
    };

    const handleSaveCompanyTarget = async (value: number) => {
        setSavingCompanyTarget(true);
        try {
            const res = await setCompanyTargetAction(year, month, value);
            if (res?.success) {
                setCompanyTargetState(value);
                toast.success('Target perusahaan tersimpan');
            } else {
                toast.error(
                    (res as { error?: string })?.error ??
                        'Gagal simpan target perusahaan',
                );
            }
        } catch {
            toast.error('Gagal simpan target perusahaan');
        } finally {
            setSavingCompanyTarget(false);
        }
    };

    const handleBulkSave = async () => {
        if (!isDirty) {
            toast.info('Tidak ada perubahan');
            return;
        }
        setSaving(true);
        try {
            const items = Array.from(edits.values()).map((e) => {
                const existing = targetMap.get(e.userId);
                return {
                    userId: e.userId,
                    periodYear: year,
                    periodMonth: month,
                    revenueTarget:
                        e.revenueTarget != null
                            ? e.revenueTarget
                            : existing != null
                              ? resolveNum(existing.revenueTarget)
                              : 0,
                    visitTarget:
                        e.visitTarget !== undefined
                            ? e.visitTarget
                            : (existing?.visitTarget ?? null),
                    orderTarget:
                        e.orderTarget !== undefined
                            ? e.orderTarget
                            : (existing?.orderTarget ?? null),
                    notes:
                        e.notes !== undefined
                            ? e.notes
                            : (existing?.notes ?? null),
                };
            });
            const res = await bulkSetTargetsAction(
                items as unknown as Record<string, unknown>[],
                year,
                month,
            );
            if (res?.success) {
                const data = res.data as {
                    successes: { input: { userId: string } }[];
                    failures: { error: string; input: { userId: string } }[];
                };
                if (data.failures.length > 0) {
                    // T1 fix: HANYA hapus edit baris yang sukses. Baris gagal
                    // tetap ter-edit supaya user tidak kehilangan input.
                    const failedUserIds = new Set(
                        data.failures.map((f) => f.input.userId),
                    );
                    setEdits((prev) => {
                        const next = new Map(prev);
                        for (const key of prev.keys()) {
                            if (!failedUserIds.has(key)) next.delete(key);
                        }
                        return next;
                    });
                    toast.warning(
                        `${data.successes.length} berhasil, ${data.failures.length} gagal: ${data.failures.map((f) => f.error).join('; ')}`,
                    );
                } else {
                    setEdits(new Map());
                    toast.success(
                        `Berhasil simpan ${data.successes.length} target`,
                    );
                }
                await fetchAll(year, month);
            } else {
                toast.error(
                    (res as { error?: string })?.error ?? 'Gagal simpan semua',
                );
            }
        } catch {
            toast.error('Gagal simpan semua');
        } finally {
            setSaving(false);
        }
    };

    const handleCopy = async () => {
        if (
            !confirm(
                `Salin target dari bulan lalu ke ${MONTH_NAMES[month - 1]} ${year}? Target yang sudah ada tidak akan ditimpa.`,
            )
        )
            return;
        setSaving(true);
        try {
            const res = await copyTargetsFromPreviousMonthAction(year, month);
            if (res?.success) {
                const data = res.data as { created: number; skipped: number };
                toast.success(
                    `Berhasil salin: ${data.created} dibuat, ${data.skipped} sudah ada (skip)`,
                );
                await fetchAll(year, month);
            } else {
                toast.error(
                    (res as { error?: string })?.error ?? 'Gagal salin',
                );
            }
        } catch {
            toast.error('Gagal salin dari bulan lalu');
        } finally {
            setSaving(false);
        }
    };

    const yearOptions = Array.from(
        { length: 5 },
        (_, i) => now.getFullYear() - 2 + i,
    );

    return (
        <div className="space-y-4">
            <TargetToolbar
                year={year}
                month={month}
                yearOptions={yearOptions}
                saving={saving}
                loading={loading}
                isDirty={isDirty}
                editCount={edits.size}
                onPeriodChange={handlePeriodChange}
                onCopy={() => void handleCopy()}
                onBulkSave={() => void handleBulkSave()}
            />

            <TargetAllocationHeader
                companyTarget={companyTarget}
                totalAllocated={totalAllocated}
                rows={rows}
                savingCompanyTarget={savingCompanyTarget}
                disabled={saving || loading}
                onSaveCompanyTarget={(v) => void handleSaveCompanyTarget(v)}
                onDistribute={handleDistribute}
            />

            <TargetTable
                rows={rows}
                year={year}
                month={month}
                loading={loading}
                expectedPacePercent={expectedPacePercentValue}
                onEdit={setEdit}
            />

            <p className="text-[11px] text-muted-foreground">
                Omzet = nilai SalesOrder (status != CANCELLED) dalam bulan ini
                dengan basis SALES_ORDER dari revenue-basis.ts dikurangi retur
                di periode ini. Kunjungan = SalesVisit dengan reviewStatus !=
                REJECTED (Q3 supervision). Order = jumlah SalesOrder
                non-CANCELLED di periode ini.
            </p>
        </div>
    );
}
