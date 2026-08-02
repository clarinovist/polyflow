'use client';

import { useState, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { formatRupiah, toDecimalNumber } from '@/lib/utils/utils';
import { Download, Search, Loader2, AlertTriangle } from 'lucide-react';
import { calculateCommissionAction } from '@/actions/sales/sales-commission';
import { toast } from 'sonner';

type TierAppliedSerialized = {
    minAchievementPercent: number | string | { toNumber?: () => number };
    ratePercent: number | string | { toNumber?: () => number };
} | null;

type CommissionEntrySerialized = {
    userId: string;
    userName: string | null;
    paidRevenue: number | string | { toNumber?: () => number };
    revenueTarget: number | string | { toNumber?: () => number } | null;
    achievementPercent: number | null;
    tierApplied: TierAppliedSerialized;
    commissionAmount: number | string | { toNumber?: () => number } | null;
    warning: string | null;
};

type CommissionResultSerialized = {
    entries: CommissionEntrySerialized[];
    unattributed: number | string | { toNumber?: () => number };
    unattributedPaidRevenue: number | string | { toNumber?: () => number };
    scheme: { id: string; name: string; basis: string } | null;
    warnings: string[];
    period: {
        from: string;
        to: string;
        periodYear: number;
        periodMonth: number;
    };
};

type Props = {
    initialFrom: string;
    initialTo: string;
};

function resolveNum(v: unknown): number {
    if (v == null) return 0;
    return toDecimalNumber(v);
}

function resolveNumOrNull(v: unknown): number | null {
    if (v == null) return null;
    const n = toDecimalNumber(v);
    // 0 is valid for Decimal, but if original was null we already returned null
    // Keep 0 as number – caller distinguishes via warning field
    return n;
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
        return <span className="text-[10px] text-muted-foreground">-</span>;
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

function warningBadge(warning: string | null) {
    if (!warning) return null;
    const variant =
        warning === 'NO_TARGET_SET' || warning === 'TARGET_ZERO'
            ? 'secondary'
            : warning === 'NO_ACTIVE_SCHEME'
              ? 'destructive'
              : 'outline';
    const label =
        warning === 'NO_TARGET_SET'
            ? 'Tanpa target'
            : warning === 'NO_ACTIVE_SCHEME'
              ? 'Tanpa skema aktif'
              : warning === 'TARGET_ZERO'
                ? 'Target 0'
                : warning === 'MULTIPLE_ACTIVE_SCHEMES'
                  ? 'Multi-skema aktif'
                  : warning;
    return (
        <Badge variant={variant as never} className="text-[10px] gap-1">
            <AlertTriangle className="h-3 w-3" />
            {label}
        </Badge>
    );
}

export function CommissionReportClient({ initialFrom, initialTo }: Props) {
    const [fromDate, setFromDate] = useState(initialFrom);
    const [toDate, setToDate] = useState(initialTo);
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<CommissionResultSerialized | null>(
        null,
    );

    const fetchCommission = useCallback(async (f: string, t: string) => {
        setLoading(true);
        try {
            const res = await calculateCommissionAction({
                from: f,
                to: t,
            } as never);
            if (res?.success && (res as { data?: unknown }).data) {
                setResult((res as { data: CommissionResultSerialized }).data);
            } else {
                const err =
                    (res as { error?: string })?.error ?? 'Gagal hitung komisi';
                toast.error(err);
                setResult(null);
            }
        } catch {
            toast.error('Gagal hitung komisi');
        } finally {
            setLoading(false);
        }
    }, []);

    const handleSearch = () => {
        if (!fromDate || !toDate) {
            toast.error('Pilih periode dari & sampai');
            return;
        }
        void fetchCommission(fromDate, toDate);
    };

    const handleExportCSV = useCallback(() => {
        if (!result) return;
        // Reuse polyfill pattern from ShippingCostReportClient: Blob + createObjectURL + anchor click
        const rows: string[][] = [
            [
                'Sales',
                'Omzet Terbayar (PAID_INVOICE)',
                'Target Omzet',
                '% Pencapaian',
                'Tier Min %',
                'Rate %',
                'Nilai Komisi',
                'Warning',
            ],
            ...result.entries.map((e) => {
                const paid = resolveNum(e.paidRevenue);
                const target = resolveNumOrNull(e.revenueTarget);
                const pct = e.achievementPercent;
                const tierMin = e.tierApplied
                    ? resolveNum(e.tierApplied.minAchievementPercent)
                    : null;
                const rate = e.tierApplied
                    ? resolveNum(e.tierApplied.ratePercent)
                    : null;
                const commission = resolveNumOrNull(e.commissionAmount);
                return [
                    e.userName ?? e.userId,
                    String(paid),
                    target != null ? String(target) : '',
                    pct != null ? String(pct) : '',
                    tierMin != null ? String(tierMin) : '',
                    rate != null ? String(rate) : '',
                    commission != null ? String(commission) : '',
                    e.warning ?? '',
                ];
            }),
            // Unattributed row terpisah
            [
                'UNATTRIBUTED (SO tanpa salesRepId)',
                String(resolveNum(result.unattributed)),
                '',
                '',
                '',
                '',
                '',
                'UNATTRIBUTED — tidak dihitung komisi',
            ],
        ];

        // Escape helper: quote if contains comma/newline/quote
        const esc = (v: string) => {
            if (v.includes(',') || v.includes('"') || v.includes('\n')) {
                return `"${v.replace(/"/g, '""')}"`;
            }
            return v;
        };
        const csv = rows.map((r) => r.map(esc).join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `laporan-komisi-${fromDate}_to_${toDate}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success('CSV berhasil diunduh');
    }, [result, fromDate, toDate]);

    const totalCommission = useMemo(() => {
        if (!result) return 0;
        return result.entries.reduce(
            (sum, e) => sum + (resolveNumOrNull(e.commissionAmount) ?? 0),
            0,
        );
    }, [result]);

    const totalPaidRevenue = useMemo(() => {
        if (!result) return 0;
        return result.entries.reduce(
            (sum, e) => sum + resolveNum(e.paidRevenue),
            0,
        );
    }, [result]);

    return (
        <div className="space-y-4">
            <Card>
                <CardHeader className="p-4 pb-2">
                    <CardTitle className="text-sm">Filter Periode</CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-2">
                    <div className="flex flex-wrap gap-3 items-end">
                        <div className="space-y-1">
                            <Label className="text-xs">Dari</Label>
                            <Input
                                type="date"
                                value={fromDate}
                                onChange={(e) => setFromDate(e.target.value)}
                                className="h-9 w-[160px]"
                            />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs">Sampai</Label>
                            <Input
                                type="date"
                                value={toDate}
                                onChange={(e) => setToDate(e.target.value)}
                                className="h-9 w-[160px]"
                            />
                        </div>
                        <Button
                            size="sm"
                            className="h-9"
                            onClick={handleSearch}
                            disabled={loading}
                        >
                            {loading ? (
                                <Loader2 className="h-4 w-4 animate-spin mr-1" />
                            ) : (
                                <Search className="h-4 w-4 mr-1" />
                            )}
                            Hitung
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-9"
                            onClick={handleExportCSV}
                            disabled={!result || loading}
                        >
                            <Download className="h-4 w-4 mr-1" />
                            Export CSV
                        </Button>
                        {result?.scheme && (
                            <Badge
                                variant="outline"
                                className="ml-2 text-[11px]"
                            >
                                Skema: {result.scheme.name} (
                                {result.scheme.basis})
                            </Badge>
                        )}
                        {result?.warnings?.includes(
                            'MULTIPLE_ACTIVE_SCHEMES',
                        ) && (
                            <Badge
                                variant="destructive"
                                className="text-[10px] gap-1"
                            >
                                <AlertTriangle className="h-3 w-3" />
                                {result.warnings.join(', ')}
                            </Badge>
                        )}
                        {!result?.scheme && result && (
                            <Badge
                                variant="destructive"
                                className="text-[10px]"
                            >
                                Tidak ada skema aktif (NO_ACTIVE_SCHEME)
                            </Badge>
                        )}
                    </div>
                </CardContent>
            </Card>

            {!result ? (
                <Card>
                    <CardContent className="p-8 text-center text-sm text-muted-foreground">
                        Pilih periode lalu klik Hitung untuk melihat laporan
                        komisi.
                        <br />
                        <span className="text-[11px]">
                            Basis komisi = PAID_INVOICE (invoice terbayar) via
                            revenue-basis.ts. Periode target (SalesTarget)
                            diasumsikan = 1 bulan kalender, di-resolve dari
                            tanggal &apos;dari&apos;.
                        </span>
                    </CardContent>
                </Card>
            ) : (
                <>
                    <div className="grid gap-4 md:grid-cols-3">
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-xs font-medium text-muted-foreground uppercase">
                                    Total Omzet Terbayar
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-xl font-bold">
                                    {formatRupiah(totalPaidRevenue)}
                                </div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-xs font-medium text-muted-foreground uppercase">
                                    Total Komisi
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-xl font-bold">
                                    {formatRupiah(totalCommission)}
                                </div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-xs font-medium text-muted-foreground uppercase">
                                    Unattributed (tanpa sales)
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-xl font-bold">
                                    {formatRupiah(
                                        resolveNum(result.unattributed),
                                    )}
                                </div>
                                <p className="text-[11px] text-muted-foreground mt-1">
                                    Tidak dibagi rata, tidak dihitung komisi
                                </p>
                            </CardContent>
                        </Card>
                    </div>

                    <Card>
                        <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between">
                            <CardTitle className="text-sm">
                                Komisi per Sales — Periode {fromDate} s/d{' '}
                                {toDate}
                                {result.period?.periodYear
                                    ? ` (target bulan ${result.period.periodMonth}/${result.period.periodYear})`
                                    : ''}
                            </CardTitle>
                            <Badge variant="outline" className="text-[10px]">
                                {result.entries.length} sales
                            </Badge>
                        </CardHeader>
                        <CardContent className="p-0">
                            <div className="overflow-x-auto">
                                <table className="w-full text-xs">
                                    <thead className="bg-muted/50 border-y text-[11px] text-muted-foreground uppercase">
                                        <tr>
                                            <th className="text-left px-3 py-2 font-semibold">
                                                Sales
                                            </th>
                                            <th className="text-right px-3 py-2 font-semibold">
                                                Omzet Terbayar
                                            </th>
                                            <th className="text-right px-3 py-2 font-semibold">
                                                Target
                                            </th>
                                            <th className="text-left px-3 py-2 font-semibold min-w-[160px]">
                                                % Pencapaian
                                            </th>
                                            <th className="text-right px-3 py-2 font-semibold">
                                                Tier Min
                                            </th>
                                            <th className="text-right px-3 py-2 font-semibold">
                                                Rate
                                            </th>
                                            <th className="text-right px-3 py-2 font-semibold">
                                                Komisi
                                            </th>
                                            <th className="text-left px-3 py-2 font-semibold w-[120px]">
                                                Status
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {result.entries.length === 0 ? (
                                            <tr>
                                                <td
                                                    colSpan={8}
                                                    className="px-3 py-8 text-center text-muted-foreground"
                                                >
                                                    Tidak ada data komisi untuk
                                                    periode ini.
                                                </td>
                                            </tr>
                                        ) : (
                                            result.entries.map((e) => {
                                                const paid = resolveNum(
                                                    e.paidRevenue,
                                                );
                                                const target = resolveNumOrNull(
                                                    e.revenueTarget,
                                                );
                                                const commission =
                                                    resolveNumOrNull(
                                                        e.commissionAmount,
                                                    );
                                                const tierMin = e.tierApplied
                                                    ? resolveNum(
                                                          e.tierApplied
                                                              .minAchievementPercent,
                                                      )
                                                    : null;
                                                const rate = e.tierApplied
                                                    ? resolveNum(
                                                          e.tierApplied
                                                              .ratePercent,
                                                      )
                                                    : null;

                                                return (
                                                    <tr
                                                        key={e.userId}
                                                        className={
                                                            e.warning
                                                                ? 'bg-amber-50/50'
                                                                : 'hover:bg-muted/30'
                                                        }
                                                    >
                                                        <td className="px-3 py-2 font-medium max-w-[160px] truncate">
                                                            {e.userName ??
                                                                e.userId.slice(
                                                                    0,
                                                                    8,
                                                                )}
                                                        </td>
                                                        <td className="px-3 py-2 text-right tabular-nums font-semibold">
                                                            {formatRupiah(paid)}
                                                        </td>
                                                        <td className="px-3 py-2 text-right tabular-nums">
                                                            {target != null
                                                                ? formatRupiah(
                                                                      target,
                                                                  )
                                                                : '-'}
                                                        </td>
                                                        <td className="px-3 py-2">
                                                            <ClampedBar
                                                                pct={
                                                                    e.achievementPercent
                                                                }
                                                            />
                                                        </td>
                                                        <td className="px-3 py-2 text-right tabular-nums">
                                                            {tierMin != null
                                                                ? `${tierMin}%`
                                                                : '-'}
                                                        </td>
                                                        <td className="px-3 py-2 text-right tabular-nums">
                                                            {rate != null
                                                                ? `${rate}%`
                                                                : '-'}
                                                        </td>
                                                        <td className="px-3 py-2 text-right tabular-nums font-bold">
                                                            {commission != null
                                                                ? formatRupiah(
                                                                      commission,
                                                                  )
                                                                : '-'}
                                                        </td>
                                                        <td className="px-3 py-2">
                                                            {warningBadge(
                                                                e.warning,
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        )}
                                        {/* Unattributed row terpisah */}
                                        {resolveNum(result.unattributed) !==
                                            0 && (
                                            <tr className="bg-muted/30 border-t-2">
                                                <td className="px-3 py-2 font-medium text-muted-foreground">
                                                    Unattributed (tanpa atribusi
                                                    sales)
                                                </td>
                                                <td className="px-3 py-2 text-right tabular-nums font-semibold text-muted-foreground">
                                                    {formatRupiah(
                                                        resolveNum(
                                                            result.unattributed,
                                                        ),
                                                    )}
                                                </td>
                                                <td className="px-3 py-2 text-right text-muted-foreground">
                                                    -
                                                </td>
                                                <td className="px-3 py-2 text-muted-foreground">
                                                    -
                                                </td>
                                                <td className="px-3 py-2 text-right text-muted-foreground">
                                                    -
                                                </td>
                                                <td className="px-3 py-2 text-right text-muted-foreground">
                                                    -
                                                </td>
                                                <td className="px-3 py-2 text-right font-bold text-muted-foreground">
                                                    -
                                                </td>
                                                <td className="px-3 py-2">
                                                    <Badge
                                                        variant="outline"
                                                        className="text-[10px]"
                                                    >
                                                        Tidak dibagi rata
                                                    </Badge>
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </CardContent>
                    </Card>

                    <p className="text-[11px] text-muted-foreground">
                        Basis komisi = PAID_INVOICE (paidAmount dari Invoice
                        dengan status != DRAFT/CANCELLED, invoiceDate dalam
                        periode). Retur mengurangi omzet di periode retur
                        terjadi (Q5). Filter periode Invoice saat ini pakai
                        invoiceDate karena model Invoice tidak punya paidDate —{' '}
                        lihat komentar di commission-service.ts untuk follow-up
                        Payment.paymentDate. Bucket unattributed (SO tanpa
                        salesRepId) tampil terpisah dan tidak dibagi rata.
                    </p>
                </>
            )}
        </div>
    );
}
