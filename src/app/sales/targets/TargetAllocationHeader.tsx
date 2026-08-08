'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { RupiahInput } from '@/components/ui/rupiah-input';
import { Input } from '@/components/ui/input';
import { formatRupiah } from '@/lib/utils/utils';
import { Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import type { EffectiveRow } from './types';

// ── Distribusi (T6) — HANYA mengisi field edit, tidak menyimpan sendiri.
// User tetap wajib klik "Simpan Semua" — tidak ada aksi destruktif satu klik. ──

function distributeEqual(
    rows: EffectiveRow[],
    companyTarget: number,
): Record<string, number> {
    if (rows.length === 0) return {};
    const share = Math.round(companyTarget / rows.length);
    return Object.fromEntries(rows.map((r) => [r.userId, share]));
}

function distributeProportional(
    rows: EffectiveRow[],
    companyTarget: number,
): Record<string, number> {
    const weights = rows.map((r) => r.context?.avg3MonthActual ?? 0);
    const sum = weights.reduce((a, b) => a + b, 0);
    if (sum <= 0) return distributeEqual(rows, companyTarget);
    return Object.fromEntries(
        rows.map((r, i) => [
            r.userId,
            Math.round(companyTarget * (weights[i] / sum)),
        ]),
    );
}

function distributeYoY(
    rows: EffectiveRow[],
    growthPercent: number,
): Record<string, number> {
    return Object.fromEntries(
        rows.map((r) => [
            r.userId,
            Math.round(
                (r.context?.sameMonthLastYearActual ?? 0) *
                    (1 + growthPercent / 100),
            ),
        ]),
    );
}

export function TargetAllocationHeader({
    companyTarget,
    totalAllocated,
    rows,
    savingCompanyTarget,
    disabled,
    onSaveCompanyTarget,
    onDistribute,
}: {
    companyTarget: number | null;
    totalAllocated: number;
    rows: EffectiveRow[];
    savingCompanyTarget: boolean;
    disabled: boolean;
    onSaveCompanyTarget: (value: number) => void;
    onDistribute: (targetsByUserId: Record<string, number>) => void;
}) {
    const [draft, setDraft] = useState<number | null>(companyTarget);
    const [yoyPercent, setYoyPercent] = useState(10);

    // draft mengikuti nilai tersimpan setiap kali periode berganti (companyTarget
    // berubah dari luar — mis. ganti bulan). useEffect (bukan perbandingan saat
    // render) supaya efek sampingnya eksplisit terikat ke satu dependency.
    useEffect(() => {
        setDraft(companyTarget);
    }, [companyTarget]);

    const effectiveTarget = draft ?? companyTarget ?? 0;
    const allocatedPct =
        effectiveTarget > 0
            ? Math.min(
                  100,
                  Math.round((totalAllocated / effectiveTarget) * 100),
              )
            : 0;
    const remaining = effectiveTarget - totalAllocated;

    const requireCompanyTarget = (): number | null => {
        if (!effectiveTarget || effectiveTarget <= 0) {
            toast.warning('Isi target perusahaan dulu sebelum distribusi');
            return null;
        }
        return effectiveTarget;
    };

    return (
        <Card>
            <CardContent className="p-4 space-y-3">
                <div className="flex flex-wrap items-end gap-3">
                    <div className="space-y-1">
                        <label className="text-[11px] font-semibold text-muted-foreground uppercase">
                            Target Perusahaan
                        </label>
                        <div className="flex gap-2">
                            <RupiahInput
                                className="h-9 w-[180px]"
                                value={draft}
                                onValueChange={setDraft}
                            />
                            <Button
                                size="sm"
                                variant="outline"
                                className="h-9"
                                disabled={
                                    savingCompanyTarget ||
                                    draft == null ||
                                    draft === companyTarget
                                }
                                onClick={() =>
                                    draft != null && onSaveCompanyTarget(draft)
                                }
                            >
                                {savingCompanyTarget ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <Save className="h-4 w-4" />
                                )}
                            </Button>
                        </div>
                    </div>

                    <div className="flex-1 min-w-[220px] space-y-1">
                        <label className="text-[11px] font-semibold text-muted-foreground uppercase">
                            Teralokasi vs Sisa
                        </label>
                        <div className="flex items-center gap-2">
                            <Progress
                                value={allocatedPct}
                                className="h-2 flex-1"
                            />
                            <span className="text-[11px] tabular-nums whitespace-nowrap">
                                {allocatedPct}%
                            </span>
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                            {formatRupiah(totalAllocated)} teralokasi ·{' '}
                            {remaining >= 0
                                ? `sisa ${formatRupiah(remaining)}`
                                : `lebih ${formatRupiah(-remaining)}`}
                        </div>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1 border-t">
                    <span className="text-[11px] font-semibold text-muted-foreground uppercase mr-1">
                        Distribusi (isi field, belum simpan)
                    </span>
                    <Button
                        size="sm"
                        variant="secondary"
                        className="h-8 text-[11px]"
                        disabled={disabled || rows.length === 0}
                        onClick={() => {
                            const target = requireCompanyTarget();
                            if (target == null) return;
                            onDistribute(distributeEqual(rows, target));
                        }}
                    >
                        Bagi rata
                    </Button>
                    <Button
                        size="sm"
                        variant="secondary"
                        className="h-8 text-[11px]"
                        disabled={disabled || rows.length === 0}
                        onClick={() => {
                            const target = requireCompanyTarget();
                            if (target == null) return;
                            onDistribute(distributeProportional(rows, target));
                        }}
                    >
                        Bagi proporsional realisasi 3 bulan
                    </Button>
                    <div className="flex items-center gap-1">
                        <Button
                            size="sm"
                            variant="secondary"
                            className="h-8 text-[11px]"
                            disabled={disabled || rows.length === 0}
                            onClick={() =>
                                onDistribute(distributeYoY(rows, yoyPercent))
                            }
                        >
                            +{yoyPercent}% YoY
                        </Button>
                        <Input
                            type="number"
                            className="h-8 w-[60px] text-[11px]"
                            value={yoyPercent}
                            onChange={(e) =>
                                setYoyPercent(Number(e.target.value) || 0)
                            }
                        />
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
