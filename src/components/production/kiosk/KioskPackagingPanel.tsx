'use client';

import { Button } from '@/components/ui/button';
import { packagingUnitLabel } from '@/lib/production/packaging-material';
import {
    estimateUsageNeeds,
    type KioskPackagingContext,
} from '@/lib/production/kiosk-packaging';

interface KioskPackagingPanelProps {
    context: KioskPackagingContext | null;
    isLoading: boolean;
    error: string;
    onRetry: () => void;
    /** Target minus posted output, in the base unit. */
    remainingBaseQty: number;
}

const formatNumber = (value: number) =>
    value.toLocaleString('id-ID', { maximumFractionDigits: 4 });

/** Fokus SPK: packaging and labels used on this SPK and whether stock will last. */
export function KioskPackagingPanel({
    context,
    isLoading,
    error,
    onRetry,
    remainingBaseQty,
}: KioskPackagingPanelProps) {
    const rows = context ? estimateUsageNeeds(context, remainingBaseQty) : [];
    const isShort = rows.some((row) => row.sufficient === false);
    const isEnough =
        rows.length > 0 &&
        rows.every((row) => row.sufficient !== false) &&
        rows.some((row) => row.sufficient);

    return (
        <section
            aria-labelledby="kiosk-packaging-title"
            className="space-y-3 rounded-xl border-2 border-t-4 border-t-kiosk-tag bg-card p-4"
        >
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                    <h3
                        id="kiosk-packaging-title"
                        className="text-sm font-bold uppercase tracking-wider text-muted-foreground"
                    >
                        Kemasan & etiket
                    </h3>
                    <p className="font-semibold">
                        Dicatat di setiap Catat Hasil
                    </p>
                </div>
                {isShort && (
                    <span className="rounded-full bg-kiosk-warn-soft px-3 py-1 text-sm font-semibold text-kiosk-warn-ink">
                        Stok menipis
                    </span>
                )}
                {isEnough && (
                    <span className="rounded-full bg-kiosk-go-soft px-3 py-1 text-sm font-semibold text-kiosk-go-ink">
                        Stok cukup
                    </span>
                )}
            </div>

            {error ? (
                <div className="space-y-2">
                    <p
                        role="alert"
                        className="text-sm font-semibold text-destructive"
                    >
                        {error}
                    </p>
                    <Button
                        type="button"
                        variant="outline"
                        className="h-12"
                        onClick={onRetry}
                    >
                        Coba lagi
                    </Button>
                </div>
            ) : !context || isLoading ? (
                <p role="status" className="text-sm text-muted-foreground">
                    Memuat data kemasan…
                </p>
            ) : rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                    Belum ada pemakaian kemasan di SPK ini. Isi jumlahnya saat
                    Catat Hasil.
                </p>
            ) : (
                <ul className="divide-y">
                    {rows.map((row) => (
                        <li
                            key={row.productVariantId}
                            aria-label={row.name}
                            className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3"
                        >
                            <div className="min-w-0">
                                <p className="font-semibold">{row.name}</p>
                                <p className="text-sm text-muted-foreground">
                                    Stok {formatNumber(row.stockTotal)}{' '}
                                    {packagingUnitLabel(row.unit)}
                                    {row.need !== null && (
                                        <>
                                            {' '}
                                            · perkiraan sisa butuh ±
                                            {formatNumber(Math.ceil(row.need))}
                                        </>
                                    )}
                                </p>
                                {row.sufficient === false && (
                                    <p className="text-sm font-semibold text-kiosk-warn-ink">
                                        Stok kurang untuk sisa target
                                    </p>
                                )}
                            </div>
                            <p className="text-right tabular-nums">
                                <span className="text-xl font-black">
                                    {formatNumber(row.quantity)}
                                </span>{' '}
                                <span className="text-sm text-muted-foreground">
                                    terpakai
                                </span>
                            </p>
                        </li>
                    ))}
                </ul>
            )}
            <p className="text-sm text-muted-foreground">
                Perkiraan dari rata-rata pemakaian SPK ini, hanya untuk cek
                stok. Jumlah sebenarnya tetap dihitung saat Catat Hasil.
            </p>
        </section>
    );
}
