import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatWibDate } from '@/lib/utils/timezone';
import type { InternalUsageRecord } from '@/types/internal-usage';

export function InternalUsageDetail({
    record,
}: {
    record: InternalUsageRecord;
}) {
    const quantity = new Intl.NumberFormat('id-ID', {
        maximumFractionDigits: 4,
    });
    const rows = [
        ['Barang', `${record.productName} · ${record.skuCode}`],
        ['Jumlah', `${quantity.format(record.quantity)} ${record.unit}`],
        ['Gudang asal', record.locationName],
        ['Penerima', record.recipient],
        ['Bagian', record.department],
        ['Tanggal', formatWibDate(record.createdAt)],
        ['Dicatat oleh', record.recordedByName],
    ];
    return (
        <Card>
            <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <CardTitle>Bukti pemakaian internal</CardTitle>
                    <Badge variant="secondary">Tercatat</Badge>
                </div>
                <p className="font-mono text-sm text-muted-foreground">
                    {record.number}
                </p>
            </CardHeader>
            <CardContent className="space-y-6">
                <dl className="space-y-4">
                    {rows.map(([label, value]) => (
                        <div
                            key={label}
                            className="grid gap-1 sm:grid-cols-[160px_1fr]"
                        >
                            <dt className="text-sm text-muted-foreground">
                                {label}
                            </dt>
                            <dd className="break-words text-sm font-medium">
                                {value}
                            </dd>
                        </div>
                    ))}
                </dl>
                <div>
                    <h2 className="text-sm text-muted-foreground">Keperluan</h2>
                    <p className="mt-1 whitespace-pre-wrap break-words">
                        {record.purpose}
                    </p>
                </div>
                <div className="flex flex-wrap justify-between gap-3 rounded-lg border bg-muted/40 p-4">
                    <span>Stok saat pencatatan</span>
                    <strong className="font-mono">
                        {quantity.format(record.stockBefore)} →{' '}
                        {quantity.format(record.stockAfter)} {record.unit}
                    </strong>
                </div>
                <p className="text-sm text-muted-foreground">
                    Bukti tersimpan bersama mutasi stok dan jurnal pemakaian
                    internal, bukan SPK produksi. Stok di atas adalah snapshot
                    saat pencatatan, bukan saldo terkini.
                </p>
            </CardContent>
        </Card>
    );
}
