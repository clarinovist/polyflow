'use client';

import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { formatRupiah, toDecimalNumber } from '@/lib/utils/utils';
import { Copy, Save, Loader2 } from 'lucide-react';
import {
    getTargetsForPeriodAction,
    upsertTargetAction,
    bulkSetTargetsAction,
    copyTargetsFromPreviousMonthAction,
} from '@/actions/sales/sales-targets';
import { toast } from 'sonner';

// ── Types dari service (serialisasi) ──

type TargetRow = {
    id: string;
    userId: string;
    periodYear: number;
    periodMonth: number;
    revenueTarget: number | string | { toNumber?: () => number };
    visitTarget: number | null;
    orderTarget: number | null;
    notes: string | null;
    userName: string | null;
    revenueActual: number | string | { toNumber?: () => number };
    revenueAchievementPercent: number | null;
    visitActual: number;
    visitAchievementPercent: number | null;
};

type InitialData = TargetRow[];

const MONTH_NAMES = [
    'Januari',
    'Februari',
    'Maret',
    'April',
    'Mei',
    'Juni',
    'Juli',
    'Agustus',
    'September',
    'Oktober',
    'November',
    'Desember',
];

function resolveNum(v: unknown): number {
    if (v == null) return 0;
    return toDecimalNumber(v);
}

function progressColor(pct: number | null): string {
    if (pct == null) return 'bg-muted';
    if (pct >= 100) return 'bg-emerald-500';
    if (pct >= 80) return 'bg-blue-500';
    if (pct >= 50) return 'bg-amber-500';
    return 'bg-red-500';
}

function ClampedBar({ pct }: { pct: number | null }) {
    if (pct == null) {
        return (
            <span className="text-[10px] text-muted-foreground">No target</span>
        );
    }
    const clamped = Math.min(100, Math.max(0, pct));
    return (
        <div className="flex items-center gap-2 min-w-[120px]">
            <Progress
                value={clamped}
                className="h-1.5 flex-1"
                indicatorClassName={progressColor(pct)}
            />
            <span className="text-[11px] font-semibold tabular-nums w-[44px] text-right">
                {pct.toFixed(1)}%
            </span>
        </div>
    );
}

type TeamMember = {
    id: string;
    name: string | null;
};

type EditableField = {
    userId: string;
    revenueTarget?: number;
    visitTarget?: number | null;
    orderTarget?: number | null;
    notes?: string | null;
};

export function SalesTargetsClient({
    initialData,
    initialYear,
    initialMonth,
    initialTeam,
}: {
    initialData: InitialData;
    initialYear: number;
    initialMonth: number;
    initialTeam: TeamMember[];
}) {
    const now = new Date();
    const [year, setYear] = useState(initialYear);
    const [month, setMonth] = useState(initialMonth);
    const [targets, setTargets] = useState<TargetRow[]>(initialData);
    const [team] = useState<TeamMember[]>(initialTeam);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    // edits keyed by userId
    const [edits, setEdits] = useState<Map<string, EditableField>>(new Map());

    const fetchTargets = useCallback(async (y: number, m: number) => {
        setLoading(true);
        try {
            const res = await getTargetsForPeriodAction(y, m);
            if (res?.success && res.data) {
                setTargets(res.data as InitialData);
                setEdits(new Map());
            } else {
                const err = (res as { error?: string })?.error;
                if (err) toast.error(err);
                setTargets([]);
            }
        } catch {
            toast.error('Gagal memuat target');
        } finally {
            setLoading(false);
        }
    }, []);

    const handlePeriodChange = (y: number, m: number) => {
        setYear(y);
        setMonth(m);
        void fetchTargets(y, m);
    };

    const targetMap = new Map(targets.map((t) => [t.userId, t]));

    // Merge team (source of truth for rows) + existing targets
    const rows: {
        userId: string;
        name: string;
        target: TargetRow | undefined;
    }[] = team.map((member) => ({
        userId: member.id,
        name: member.name ?? member.id.slice(0, 8),
        target: targetMap.get(member.id),
    }));

    const isDirty = edits.size > 0;

    const setEdit = (userId: string, patch: Partial<EditableField>) => {
        setEdits((prev) => {
            const next = new Map(prev);
            const cur = next.get(userId) ?? { userId };
            next.set(userId, { ...cur, ...patch });
            return next;
        });
    };

    const handleInlineSave = async (userId: string) => {
        const edit = edits.get(userId);
        if (!edit) return;
        setSaving(true);
        try {
            const existing = targetMap.get(userId);
            const payload = {
                userId,
                periodYear: year,
                periodMonth: month,
                revenueTarget:
                    edit.revenueTarget != null
                        ? edit.revenueTarget
                        : existing != null
                          ? resolveNum(existing.revenueTarget)
                          : 0,
                visitTarget:
                    edit.visitTarget !== undefined
                        ? edit.visitTarget
                        : (existing?.visitTarget ?? null),
                orderTarget:
                    edit.orderTarget !== undefined
                        ? edit.orderTarget
                        : (existing?.orderTarget ?? null),
                notes:
                    edit.notes !== undefined
                        ? edit.notes
                        : (existing?.notes ?? null),
            };
            const res = await upsertTargetAction(
                payload as unknown as Record<string, unknown>,
            );
            if (res?.success) {
                toast.success('Target tersimpan');
                await fetchTargets(year, month);
            } else {
                toast.error(
                    (res as { error?: string })?.error ?? 'Gagal simpan',
                );
            }
        } catch {
            toast.error('Gagal simpan target');
        } finally {
            setSaving(false);
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
                    successes: unknown[];
                    failures: { error: string; input: { userId: string } }[];
                };
                if (data.failures.length > 0) {
                    toast.warning(
                        `${data.successes.length} berhasil, ${data.failures.length} gagal: ${data.failures.map((f) => f.error).join('; ')}`,
                    );
                } else {
                    toast.success(
                        `Berhasil simpan ${data.successes.length} target`,
                    );
                }
                await fetchTargets(year, month);
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
                const data = res.data as {
                    created: number;
                    skipped: number;
                    errors: unknown[];
                };
                toast.success(
                    `Berhasil salin: ${data.created} dibuat, ${data.skipped} sudah ada (skip)`,
                );
                await fetchTargets(year, month);
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
            <div className="flex flex-wrap gap-3 items-end">
                <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-muted-foreground uppercase">
                        Tahun
                    </label>
                    <Select
                        value={String(year)}
                        onValueChange={(v) => {
                            const y = Number(v);
                            handlePeriodChange(y, month);
                        }}
                    >
                        <SelectTrigger className="h-9 w-[100px]">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {yearOptions.map((y) => (
                                <SelectItem key={y} value={String(y)}>
                                    {y}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-muted-foreground uppercase">
                        Bulan
                    </label>
                    <Select
                        value={String(month)}
                        onValueChange={(v) => {
                            const m = Number(v);
                            handlePeriodChange(year, m);
                        }}
                    >
                        <SelectTrigger className="h-9 w-[140px]">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {MONTH_NAMES.map((name, idx) => (
                                <SelectItem key={idx} value={String(idx + 1)}>
                                    {name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    className="h-9"
                    onClick={handleCopy}
                    disabled={saving || loading}
                >
                    {saving ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-1" />
                    ) : (
                        <Copy className="h-4 w-4 mr-1" />
                    )}
                    Salin dari bulan lalu
                </Button>
                <Button
                    size="sm"
                    className="h-9"
                    onClick={handleBulkSave}
                    disabled={!isDirty || saving || loading}
                >
                    {saving ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-1" />
                    ) : (
                        <Save className="h-4 w-4 mr-1" />
                    )}
                    Simpan Semua {isDirty ? `(${edits.size})` : ''}
                </Button>
            </div>

            <Card>
                <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between">
                    <CardTitle className="text-sm">
                        Target {MONTH_NAMES[month - 1]} {year}
                    </CardTitle>
                    <Badge variant="outline" className="text-[10px]">
                        {rows.length} sales
                    </Badge>
                </CardHeader>
                <CardContent className="p-0">
                    {loading ? (
                        <div className="p-8 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" />{' '}
                            Memuat...
                        </div>
                    ) : rows.length === 0 ? (
                        <div className="p-8 text-center text-sm text-muted-foreground">
                            Belum ada sales / target. Tambahkan user dengan role
                            SALES di manajemen user.
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                                <thead className="bg-muted/50 border-y text-[11px] text-muted-foreground uppercase">
                                    <tr>
                                        <th className="text-left px-3 py-2 font-semibold">
                                            Sales
                                        </th>
                                        <th className="text-left px-3 py-2 font-semibold w-[160px]">
                                            Target Omzet
                                        </th>
                                        <th className="text-left px-3 py-2 font-semibold min-w-[200px]">
                                            Realisasi vs %
                                        </th>
                                        <th className="text-left px-3 py-2 font-semibold w-[110px]">
                                            Target Kunjungan
                                        </th>
                                        <th className="text-left px-3 py-2 font-semibold min-w-[180px]">
                                            Kunjungan vs %
                                        </th>
                                        <th className="text-right px-3 py-2 font-semibold w-[90px]">
                                            Aksi
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {rows.map(({ userId, name, target }) => {
                                        const edit = edits.get(userId);
                                        const revenueTargetNum =
                                            edit?.revenueTarget != null
                                                ? edit.revenueTarget
                                                : target != null
                                                  ? resolveNum(
                                                        target.revenueTarget,
                                                    )
                                                  : 0;
                                        const visitTargetNum =
                                            edit?.visitTarget !== undefined
                                                ? edit.visitTarget
                                                : target?.visitTarget;
                                        const revenueActualNum =
                                            target != null
                                                ? resolveNum(
                                                      target.revenueActual,
                                                  )
                                                : 0;
                                        const visitActual =
                                            target?.visitActual ?? 0;
                                        const revPct =
                                            target?.revenueAchievementPercent ??
                                            null;
                                        const visitPct =
                                            target?.visitAchievementPercent ??
                                            null;

                                        // effektiv pct based on edit? jika edit revenue berubah, pct recompute lokal untuk preview
                                        const previewRevPct = (() => {
                                            if (edit?.revenueTarget != null) {
                                                if (
                                                    edit.revenueTarget === 0 ||
                                                    edit.revenueTarget == null
                                                )
                                                    return null;
                                                return (
                                                    Math.round(
                                                        (revenueActualNum /
                                                            edit.revenueTarget) *
                                                            10000,
                                                    ) / 100
                                                );
                                            }
                                            return revPct;
                                        })();
                                        const previewVisitPct = (() => {
                                            if (
                                                edit?.visitTarget !== undefined
                                            ) {
                                                if (
                                                    edit.visitTarget == null ||
                                                    edit.visitTarget === 0
                                                )
                                                    return null;
                                                return (
                                                    Math.round(
                                                        (visitActual /
                                                            edit.visitTarget) *
                                                            10000,
                                                    ) / 100
                                                );
                                            }
                                            return visitPct;
                                        })();

                                        return (
                                            <tr
                                                key={userId}
                                                className={
                                                    edit
                                                        ? 'bg-primary/5'
                                                        : 'hover:bg-muted/30'
                                                }
                                            >
                                                <td className="px-3 py-2 font-medium max-w-[160px] truncate">
                                                    {name}
                                                </td>
                                                <td className="px-3 py-2">
                                                    <Input
                                                        type="number"
                                                        min={0}
                                                        className="h-8 text-xs"
                                                        value={
                                                            edit?.revenueTarget !==
                                                            undefined
                                                                ? edit.revenueTarget
                                                                : target != null
                                                                  ? resolveNum(
                                                                        target.revenueTarget,
                                                                    )
                                                                  : ''
                                                        }
                                                        onChange={(e) => {
                                                            const v =
                                                                e.target
                                                                    .value ===
                                                                ''
                                                                    ? undefined
                                                                    : Number(
                                                                          e
                                                                              .target
                                                                              .value,
                                                                      );
                                                            if (v === undefined)
                                                                return;
                                                            setEdit(userId, {
                                                                revenueTarget:
                                                                    v,
                                                            });
                                                        }}
                                                        placeholder="0"
                                                    />
                                                </td>
                                                <td className="px-3 py-2">
                                                    <div className="flex flex-col gap-1">
                                                        <span className="font-semibold tabular-nums">
                                                            {formatRupiah(
                                                                revenueActualNum,
                                                            )}{' '}
                                                            /{' '}
                                                            {formatRupiah(
                                                                revenueTargetNum,
                                                            )}
                                                        </span>
                                                        <ClampedBar
                                                            pct={previewRevPct}
                                                        />
                                                    </div>
                                                </td>
                                                <td className="px-3 py-2">
                                                    <Input
                                                        type="number"
                                                        min={0}
                                                        className="h-8 text-xs w-[90px]"
                                                        value={
                                                            edit?.visitTarget !==
                                                            undefined
                                                                ? (edit.visitTarget ??
                                                                  '')
                                                                : (visitTargetNum ??
                                                                  '')
                                                        }
                                                        onChange={(e) => {
                                                            const raw =
                                                                e.target.value;
                                                            if (raw === '') {
                                                                setEdit(
                                                                    userId,
                                                                    {
                                                                        visitTarget:
                                                                            null,
                                                                    },
                                                                );
                                                                return;
                                                            }
                                                            setEdit(userId, {
                                                                visitTarget:
                                                                    Number(raw),
                                                            });
                                                        }}
                                                        placeholder="-"
                                                    />
                                                </td>
                                                <td className="px-3 py-2">
                                                    <div className="flex flex-col gap-1">
                                                        <span className="tabular-nums">
                                                            {visitActual} /{' '}
                                                            {visitTargetNum ??
                                                                '-'}
                                                        </span>
                                                        <ClampedBar
                                                            pct={
                                                                previewVisitPct
                                                            }
                                                        />
                                                    </div>
                                                </td>
                                                <td className="px-3 py-2 text-right">
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        className="h-7 text-[11px]"
                                                        disabled={
                                                            !edit || saving
                                                        }
                                                        onClick={() =>
                                                            void handleInlineSave(
                                                                userId,
                                                            )
                                                        }
                                                    >
                                                        Simpan
                                                    </Button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>

            <p className="text-[11px] text-muted-foreground">
                Omzet = nilai SalesOrder (status != CANCELLED) dalam bulan ini
                dengan basis SALES_ORDER dari revenue-basis.ts dikurangi retur
                di periode ini. Kunjungan = SalesVisit dengan reviewStatus !=
                REJECTED (Q3 supervision).
            </p>
        </div>
    );
}
