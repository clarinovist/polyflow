import { SalesMetricInfo } from './SalesMetricInfo';
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
                <SalesMetricInfo label="Info total berat terkirim">
                    <p>
                        Berat dari Surat Jalan yang sudah dikirim, termasuk
                        kirim parsial. Berat bruto, belum dikurangi retur.
                    </p>
                    <p>
                        Dihitung kumulatif sampai saat ini dari pesanan dalam
                        periode dan customer terpilih, bukan berdasarkan tanggal
                        pengiriman atau filter tabel.
                    </p>
                    {stats && stats.unconvertedItemCount > 0 && (
                        <p>
                            {stats.unconvertedItemCount} baris barang belum
                            dapat dihitung dalam kg. Angka yang tampil belum
                            mencakup barang tersebut.
                        </p>
                    )}
                    {stats && stats.incompleteOrderCount > 0 && (
                        <p>
                            Rincian pengiriman {stats.incompleteOrderCount}{' '}
                            order belum lengkap. Angka yang tampil hanya berat
                            tercatat.
                        </p>
                    )}
                </SalesMetricInfo>
            </CardHeader>
            <CardContent>
                {incomplete && (
                    <p className="mb-1 text-xs font-medium text-amber-700 dark:text-amber-400">
                        Belum lengkap
                    </p>
                )}
                <div className="break-words text-2xl font-bold tabular-nums">
                    {stats
                        ? `${stats.shippedWeightKg.toLocaleString('id-ID', { maximumFractionDigits: 2 })} kg`
                        : '—'}
                </div>
                {stats ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                        Dari {stats.shippedOrderCount} order
                    </p>
                ) : (
                    <p
                        role="status"
                        className="mt-1 text-xs text-muted-foreground"
                    >
                        Data berat belum tersedia.
                    </p>
                )}
            </CardContent>
        </Card>
    );
}
