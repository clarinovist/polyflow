import { Scale } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { ShippedWeightStats } from '@/services/sales/shipped-weight-service';

export function ShippedWeightCard({
    stats,
}: {
    stats: ShippedWeightStats | null;
}) {
    const incomplete =
        stats != null &&
        (stats.unconvertedItemCount > 0 || stats.incompleteOrderCount > 0);

    return (
        <Card className="min-w-0">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                    Total Berat Terkirim
                </CardTitle>
                <Scale
                    aria-hidden="true"
                    className="h-4 w-4 shrink-0 text-muted-foreground"
                />
            </CardHeader>
            <CardContent>
                {incomplete && (
                    <p className="mb-1 text-xs font-medium text-amber-700 dark:text-amber-400">
                        Berat tercatat (belum lengkap)
                    </p>
                )}
                <div className="break-words text-2xl font-bold tabular-nums">
                    {stats
                        ? `${stats.shippedWeightKg.toLocaleString('id-ID', { maximumFractionDigits: 2 })} kg`
                        : '—'}
                </div>
                {stats ? (
                    <>
                        <p className="mt-1 text-xs text-muted-foreground">
                            Dari {stats.shippedOrderCount} order · termasuk
                            kirim parsial
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                            Berat barang bruto · belum dikurangi retur
                        </p>
                        {stats.unconvertedItemCount > 0 && (
                            <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
                                {stats.unconvertedItemCount} baris barang belum
                                dapat dihitung dalam kg.
                            </p>
                        )}
                        {stats.incompleteOrderCount > 0 && (
                            <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
                                Rincian pengiriman {stats.incompleteOrderCount}{' '}
                                order belum lengkap.
                            </p>
                        )}
                    </>
                ) : (
                    <p
                        role="status"
                        className="mt-1 text-xs text-muted-foreground"
                    >
                        Data berat belum tersedia. Coba muat ulang halaman.
                    </p>
                )}
            </CardContent>
        </Card>
    );
}
