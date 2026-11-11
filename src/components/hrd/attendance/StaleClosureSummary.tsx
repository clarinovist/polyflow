'use client';

import { formatIdr } from './attendance-format';
import { formatWorkDate } from './stale-closure-format';
import { policyLabel, type ClosurePreview } from './stale-closure-types';

const UNDERPAYMENT_NOTE =
    'Selisih ini adalah KEKURANGAN UPAH bila minggu tersebut sudah dibayar. Keputusan membayar kekurangan dilakukan di luar sistem.';

/** Ringkasan total di atas tabel: jumlah layak/tidak layak dan total upah. */
export function StaleClosureTotals({ preview }: { preview: ClosurePreview }) {
    const { totals } = preview;
    return (
        <section
            aria-label="Ringkasan pratinjau"
            className="rounded-lg border bg-muted/30 p-3 space-y-1"
        >
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                <span className="font-medium text-emerald-600">
                    {totals.eligibleCount} layak
                </span>
                <span className="font-medium text-destructive">
                    {totals.ineligibleCount} tidak layak
                </span>
                <span className="font-semibold">
                    Total upah usulan: {formatIdr(totals.earnings)}
                </span>
            </div>
            <p className="text-xs text-muted-foreground">
                Kebijakan jam pulang: {policyLabel(preview.policy)}
            </p>
        </section>
    );
}

/** Subtotal per karyawan dan per minggu, dengan catatan kekurangan upah. */
export function StaleClosureSubtotals({
    preview,
}: {
    preview: ClosurePreview;
}) {
    return (
        <div className="grid gap-3 sm:grid-cols-2">
            <section
                aria-label="Subtotal per karyawan"
                className="rounded-lg border p-3 space-y-1"
            >
                <h3 className="text-sm font-semibold">Per karyawan</h3>
                <ul className="space-y-1 text-sm">
                    {preview.byEmployee.map((e) => (
                        <li
                            key={e.employeeId}
                            className="flex justify-between gap-3"
                        >
                            <span>
                                {e.employeeName}
                                <span className="text-xs text-muted-foreground">
                                    {' '}
                                    · {e.eligibleCount} sesi
                                </span>
                            </span>
                            <span className="font-medium">
                                {formatIdr(e.earnings)}
                            </span>
                        </li>
                    ))}
                </ul>
            </section>
            <section
                aria-label="Subtotal per minggu"
                className="rounded-lg border p-3 space-y-1"
            >
                <h3 className="text-sm font-semibold">Per minggu</h3>
                <ul className="space-y-1 text-sm">
                    {preview.byWeek.map((w) => (
                        <li
                            key={w.weekStart}
                            className="flex justify-between gap-3"
                        >
                            <span>
                                Minggu mulai {formatWorkDate(w.weekStart)}
                                <span className="text-xs text-muted-foreground">
                                    {' '}
                                    · {w.eligibleCount} sesi
                                </span>
                            </span>
                            <span className="font-medium">
                                {formatIdr(w.earnings)}
                            </span>
                        </li>
                    ))}
                </ul>
                <p className="text-xs text-amber-600">{UNDERPAYMENT_NOTE}</p>
            </section>
        </div>
    );
}
