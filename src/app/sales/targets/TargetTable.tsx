'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { RupiahInput } from '@/components/ui/rupiah-input';
import { formatRupiah } from '@/lib/utils/utils';
import { Loader2 } from 'lucide-react';
import { paceStatus, type PaceStatus } from '@/lib/sales/target-pacing';
import type { EffectiveRow, EditableField } from './types';
import { MONTH_NAMES } from './types';

// ── Bar pencapaian — TIDAK di-clamp di 100% (fix T8: overachiever terlihat) ──

function barColor(pct: number | null, status: PaceStatus): string {
    if (pct == null) return 'bg-muted';
    if (pct > 100) return 'bg-indigo-500'; // overachiever — warna beda dari status ON biasa
    if (status === 'RISIKO') return 'bg-red-500';
    if (status === 'TIPIS') return 'bg-amber-500';
    return 'bg-emerald-500';
}

function AchievementBar({
    pct,
    expectedPct,
}: {
    pct: number | null;
    expectedPct: number;
}) {
    if (pct == null) {
        return (
            <span className="text-[10px] text-muted-foreground">No target</span>
        );
    }
    const status = paceStatus(pct, expectedPct);
    const width = Math.min(100, Math.max(0, pct));

    return (
        <div className="flex items-center gap-2 min-w-[130px]">
            <div className="relative flex-1">
                <Progress
                    value={width}
                    className="h-1.5"
                    indicatorClassName={barColor(pct, status)}
                />
                {expectedPct > 0 && expectedPct < 100 && (
                    <div
                        className="absolute top-[-2px] h-[9px] w-[2px] bg-foreground/50"
                        style={{ left: `${expectedPct}%` }}
                        title={`Ekspektasi pace hari ini: ${expectedPct.toFixed(0)}%`}
                    />
                )}
            </div>
            <span
                className={
                    'text-[11px] font-semibold tabular-nums w-[46px] text-right ' +
                    (pct > 100 ? 'text-indigo-600 dark:text-indigo-400' : '')
                }
            >
                {pct.toFixed(1)}%
            </span>
        </div>
    );
}

// ── Konteks historis read-only (T4) ──

function prevMonthLabel(year: number, month: number): string {
    const prevMonth = month === 1 ? 12 : month - 1;
    return MONTH_NAMES[prevMonth - 1];
}

function ContextHint({
    row,
    year,
    month,
}: {
    row: EffectiveRow;
    year: number;
    month: number;
}) {
    const ctx = row.context;
    if (!ctx) return null;
    const prevActual = ctx.prevMonthActual;
    const delta =
        prevActual > 0
            ? Math.round(
                  ((row.revenueTarget - prevActual) / prevActual) * 1000,
              ) / 10
            : null;

    return (
        <div className="text-[10px] text-muted-foreground leading-tight mb-1 space-y-0.5">
            <div>Bln lalu: {formatRupiah(prevActual)}</div>
            <div>Rata2 3bln: {formatRupiah(ctx.avg3MonthActual)}</div>
            <div>
                {year - 1} /{month}: {formatRupiah(ctx.sameMonthLastYearActual)}
            </div>
            {delta != null && (
                <div
                    className={
                        delta >= 0
                            ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                            : 'text-red-600 dark:text-red-400 font-medium'
                    }
                >
                    {delta >= 0 ? '+' : ''}
                    {delta}% vs {prevMonthLabel(year, month)}
                </div>
            )}
        </div>
    );
}

// ── Table ──

export function TargetTable({
    rows,
    year,
    month,
    loading,
    expectedPacePercent,
    onEdit,
}: {
    rows: EffectiveRow[];
    year: number;
    month: number;
    loading: boolean;
    expectedPacePercent: number;
    onEdit: (userId: string, patch: Partial<EditableField>) => void;
}) {
    const totals = rows.reduce(
        (acc, r) => {
            acc.revenueTarget += r.revenueTarget;
            acc.revenueActual += r.revenueActual;
            return acc;
        },
        { revenueTarget: 0, revenueActual: 0 },
    );
    const totalPct =
        totals.revenueTarget > 0
            ? Math.round(
                  (totals.revenueActual / totals.revenueTarget) * 10000,
              ) / 100
            : null;

    return (
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
                        <Loader2 className="h-4 w-4 animate-spin" /> Memuat...
                    </div>
                ) : rows.length === 0 ? (
                    <div className="p-8 text-center text-sm text-muted-foreground">
                        Belum ada sales aktif. Tambahkan user dengan role
                        SALES/MARKETING di manajemen user.
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                            <thead className="bg-muted/50 border-y text-[11px] text-muted-foreground uppercase">
                                <tr>
                                    <th className="text-left px-3 py-2 font-semibold">
                                        Sales
                                    </th>
                                    <th className="text-left px-3 py-2 font-semibold w-[170px]">
                                        Target Omzet
                                    </th>
                                    <th className="text-left px-3 py-2 font-semibold min-w-[190px]">
                                        Realisasi vs %
                                    </th>
                                    <th className="text-left px-3 py-2 font-semibold w-[100px]">
                                        Target Kunjungan
                                    </th>
                                    <th className="text-left px-3 py-2 font-semibold min-w-[170px]">
                                        Kunjungan vs %
                                    </th>
                                    <th className="text-left px-3 py-2 font-semibold w-[90px]">
                                        Target Order
                                    </th>
                                    <th className="text-left px-3 py-2 font-semibold min-w-[170px]">
                                        Order vs %
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {rows.map((row) => (
                                    <tr
                                        key={row.userId}
                                        className={
                                            row.isEdited
                                                ? 'bg-primary/5'
                                                : 'hover:bg-muted/30'
                                        }
                                    >
                                        <td className="px-3 py-2 font-medium max-w-[140px] truncate align-top">
                                            {row.name}
                                            {row.isEdited && (
                                                <Badge
                                                    variant="secondary"
                                                    className="ml-1.5 text-[9px] px-1 py-0"
                                                >
                                                    diedit
                                                </Badge>
                                            )}
                                        </td>
                                        <td className="px-3 py-2 align-top">
                                            <ContextHint
                                                row={row}
                                                year={year}
                                                month={month}
                                            />
                                            <RupiahInput
                                                className="h-8 text-xs"
                                                value={row.revenueTarget}
                                                onValueChange={(v) =>
                                                    onEdit(row.userId, {
                                                        revenueTarget: v ?? 0,
                                                    })
                                                }
                                            />
                                        </td>
                                        <td className="px-3 py-2 align-top">
                                            <div className="flex flex-col gap-1">
                                                <span className="font-semibold tabular-nums">
                                                    {formatRupiah(
                                                        row.revenueActual,
                                                    )}{' '}
                                                    /{' '}
                                                    {formatRupiah(
                                                        row.revenueTarget,
                                                    )}
                                                </span>
                                                <AchievementBar
                                                    pct={
                                                        row.revenueAchievementPercent
                                                    }
                                                    expectedPct={
                                                        expectedPacePercent
                                                    }
                                                />
                                            </div>
                                        </td>
                                        <td className="px-3 py-2 align-top">
                                            <Input
                                                type="number"
                                                min={0}
                                                className="h-8 text-xs w-[85px]"
                                                value={row.visitTarget ?? ''}
                                                onChange={(e) => {
                                                    const raw = e.target.value;
                                                    onEdit(row.userId, {
                                                        visitTarget:
                                                            raw === ''
                                                                ? null
                                                                : Number(raw),
                                                    });
                                                }}
                                                placeholder="-"
                                            />
                                        </td>
                                        <td className="px-3 py-2 align-top">
                                            <div className="flex flex-col gap-1">
                                                <span className="tabular-nums">
                                                    {row.visitActual} /{' '}
                                                    {row.visitTarget ?? '-'}
                                                </span>
                                                <AchievementBar
                                                    pct={
                                                        row.visitAchievementPercent
                                                    }
                                                    expectedPct={
                                                        expectedPacePercent
                                                    }
                                                />
                                            </div>
                                        </td>
                                        <td className="px-3 py-2 align-top">
                                            <Input
                                                type="number"
                                                min={0}
                                                className="h-8 text-xs w-[80px]"
                                                value={row.orderTarget ?? ''}
                                                onChange={(e) => {
                                                    const raw = e.target.value;
                                                    onEdit(row.userId, {
                                                        orderTarget:
                                                            raw === ''
                                                                ? null
                                                                : Number(raw),
                                                    });
                                                }}
                                                placeholder="-"
                                            />
                                        </td>
                                        <td className="px-3 py-2 align-top">
                                            <div className="flex flex-col gap-1">
                                                <span className="tabular-nums">
                                                    {row.orderActual} /{' '}
                                                    {row.orderTarget ?? '-'}
                                                </span>
                                                <AchievementBar
                                                    pct={
                                                        row.orderAchievementPercent
                                                    }
                                                    expectedPct={
                                                        expectedPacePercent
                                                    }
                                                />
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot className="border-t bg-muted/30 font-semibold">
                                <tr>
                                    <td className="px-3 py-2">TOTAL</td>
                                    <td className="px-3 py-2 tabular-nums">
                                        {formatRupiah(totals.revenueTarget)}
                                    </td>
                                    <td className="px-3 py-2">
                                        <div className="flex flex-col gap-1">
                                            <span className="tabular-nums">
                                                {formatRupiah(
                                                    totals.revenueActual,
                                                )}
                                            </span>
                                            <AchievementBar
                                                pct={totalPct}
                                                expectedPct={
                                                    expectedPacePercent
                                                }
                                            />
                                        </div>
                                    </td>
                                    <td colSpan={4} />
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
