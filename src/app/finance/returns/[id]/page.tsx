import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getFinanceSalesReturnDetail } from '@/actions/finance/sales-returns';
import { FinanceReturnCredit } from '@/components/finance/returns/FinanceReturnCredit';
import { PageHeader } from '@/components/ui/page-header';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import {
    financeReturnGuidance,
    financeReturnStatuses,
} from '@/components/finance/returns/return-status';
import { formatRupiah } from '@/lib/utils/utils';
import { toBusinessDateString } from '@/lib/utils/timezone';

export const dynamic = 'force-dynamic';

export default async function FinanceReturnDetailPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    const result = await getFinanceSalesReturnDetail(id);
    if (!result.success)
        return (
            <div role="alert" className="space-y-3 rounded-md border p-4">
                <p>
                    Detail retur tidak dapat dimuat. Periksa akses Anda atau
                    coba lagi.
                </p>
                <Link href="/finance/returns" className="underline">
                    Kembali ke daftar retur
                </Link>
            </div>
        );
    if (!result.data) notFound();
    const row = result.data;
    return (
        <div className="space-y-6">
            <Link
                href="/finance/returns"
                className="inline-flex min-h-11 items-center text-sm underline"
            >
                Kembali ke daftar retur
            </Link>
            <PageHeader
                title={row.returnNumber}
                description={`Retur Penjualan · ${toBusinessDateString(new Date(row.returnDate))}`}
            />
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">
                        Status dan tindak lanjut
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                    <Badge variant="secondary">
                        {financeReturnStatuses[row.status]}
                    </Badge>
                    <p>{financeReturnGuidance(row.status)}</p>
                    <p className="text-muted-foreground">
                        Konfirmasi dan penerimaan barang dilakukan di Penjualan
                        oleh petugas berwenang. Kredit piutang merupakan transaksi
                        Finance terpisah berdasarkan bukti invoice asal.
                    </p>
                </CardContent>
            </Card>
            <FinanceReturnCredit row={row} />
            <dl className="grid gap-4 rounded-md border p-4 text-sm sm:grid-cols-2">
                {[
                    ['Customer', row.customer?.name ?? 'Tanpa customer'],
                    ['Sales Order', row.salesOrder.orderNumber],
                    [
                        'Surat Jalan',
                        row.deliveryOrder?.orderNumber ?? 'Tidak ditautkan',
                    ],
                    ['Lokasi penerimaan', row.returnLocation.name],
                    ['Alasan', row.reason || '—'],
                    [
                        'Nilai dokumen (bukan kredit terposting)',
                        formatRupiah(row.totalAmount),
                    ],
                ].map(([label, value]) => (
                    <div key={label}>
                        <dt className="text-muted-foreground">{label}</dt>
                        <dd className="mt-1 break-words font-medium">
                            {value}
                        </dd>
                    </div>
                ))}
            </dl>
            {row.notes && (
                <p className="whitespace-pre-wrap break-words rounded-md border p-4 text-sm">
                    Catatan: {row.notes}
                </p>
            )}
            <p className="text-xs text-muted-foreground md:hidden">
                Geser tabel ke samping untuk melihat kuantitas dan harga.
            </p>
            <div className="overflow-x-auto rounded-md border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Produk</TableHead>
                            <TableHead>Kondisi</TableHead>
                            <TableHead className="text-right">
                                Qty retur
                            </TableHead>
                            <TableHead className="text-right">
                                Harga tercatat
                            </TableHead>
                            <TableHead className="text-right">
                                Subtotal tercatat
                            </TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {row.items.map((item) => (
                            <TableRow key={item.id}>
                                <TableCell>
                                    {item.productVariant.skuCode}
                                    <p className="text-xs text-muted-foreground">
                                        {item.productVariant.name}
                                    </p>
                                </TableCell>
                                <TableCell>
                                    {item.condition === 'GOOD'
                                        ? 'Baik'
                                        : 'Rusak'}
                                </TableCell>
                                <TableCell className="text-right tabular-nums">
                                    {item.returnedQty.toLocaleString('id-ID', {
                                        maximumFractionDigits: 4,
                                    })}
                                </TableCell>
                                <TableCell className="text-right tabular-nums">
                                    {formatRupiah(item.unitPrice)}
                                </TableCell>
                                <TableCell className="text-right tabular-nums">
                                    {formatRupiah(
                                        item.returnedQty * item.unitPrice,
                                    )}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
            <p className="text-xs text-muted-foreground">
                Harga dan nominal di atas adalah nilai yang dicatat pada dokumen
                retur, belum merupakan verifikasi pajak, diskon, HPP, atau
                pengurangan invoice.
            </p>
        </div>
    );
}
