import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { getFinanceSalesReturnDetail } from '@/actions/finance/sales-returns';
import { FinanceReturnCredit } from '@/components/finance/returns/FinanceReturnCredit';
import { ReturnDetailOverview } from '@/components/finance/returns/ReturnDetailOverview';
import {
    ReturnAuditDetails,
    ReturnCreditHistory,
    ReturnInvoiceDetails,
} from '@/components/finance/returns/ReturnDetailRecords';
import {
    ReturnBadge,
    ReturnOperationalBadge,
    returnCreditPresentation,
} from '@/components/finance/returns/ReturnStatusBadge';
import { Card } from '@/components/ui/card';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { formatQuantity, formatRupiah } from '@/lib/utils/utils';
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
            <div role="alert" className="space-y-3 rounded-xl border p-5">
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
    const credit = returnCreditPresentation(row);
    return (
        <div className="min-w-0 space-y-6">
            <Link
                href="/finance/returns"
                className="inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
                <ChevronLeft className="size-4" aria-hidden="true" />
                Daftar retur
            </Link>
            <header className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-3">
                        <h1 className="break-words text-2xl font-bold tracking-tight md:text-3xl">
                            {row.returnNumber}
                        </h1>
                        <ReturnOperationalBadge status={row.status} />
                        <ReturnBadge label={credit.label} tone={credit.tone} />
                    </div>
                    <p className="text-sm text-muted-foreground">
                        {row.customer?.name ?? 'Tanpa customer'} ·{' '}
                        <span>{row.salesOrder.orderNumber}</span> ·{' '}
                        {toBusinessDateString(new Date(row.returnDate))}
                    </p>
                </div>
                {row.credit?.status === 'POSTED' && (
                    <FinanceReturnCredit key={`${row.id}:POSTED`} row={row} />
                )}
            </header>
            <ReturnDetailOverview row={row} />
            <Card className="gap-0 overflow-hidden py-0 shadow-none">
                <div className="flex items-center justify-between gap-4 border-b px-5 py-4">
                    <h2 className="font-semibold">Barang retur</h2>
                    <span className="text-xs text-muted-foreground">
                        {row.items.length} item
                    </span>
                </div>
                <p className="px-5 pt-3 text-xs text-muted-foreground md:hidden">
                    Geser tabel ke samping untuk melihat kuantitas dan harga.
                </p>
                <Table aria-label="Barang retur" className="min-w-[800px]">
                    <TableHeader className="bg-muted/40">
                        <TableRow>
                            <TableHead className="px-5">Produk</TableHead>
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
                            <TableHead className="pr-5 text-right">
                                HPP terima
                            </TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {row.items.map((item) => (
                            <TableRow key={item.id}>
                                <TableCell className="max-w-64 whitespace-normal px-5 py-4">
                                    <p className="font-medium">
                                        {item.productVariant.name}
                                    </p>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        {item.productVariant.skuCode}
                                    </p>
                                </TableCell>
                                <TableCell>
                                    {item.condition === 'GOOD'
                                        ? 'Baik'
                                        : 'Rusak'}
                                </TableCell>
                                <TableCell className="text-right tabular-nums">
                                    {formatQuantity(item.returnedQty)}
                                </TableCell>
                                <TableCell className="text-right tabular-nums">
                                    {formatRupiah(item.unitPrice)}
                                </TableCell>
                                <TableCell className="text-right tabular-nums">
                                    {formatRupiah(
                                        item.returnedQty * item.unitPrice,
                                    )}
                                </TableCell>
                                <TableCell className="pr-5 text-right tabular-nums">
                                    {item.receipt ? (
                                        formatRupiah(
                                            Number(item.receipt.restockValue),
                                        )
                                    ) : (
                                        <span
                                            aria-label="Bukti penerimaan belum tersedia"
                                            className="text-muted-foreground"
                                        >
                                            —
                                        </span>
                                    )}
                                </TableCell>
                            </TableRow>
                        ))}
                        {!row.items.length && (
                            <TableRow>
                                <TableCell
                                    colSpan={6}
                                    className="py-8 text-center text-muted-foreground"
                                >
                                    Tidak ada item retur yang tercatat.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
                <div className="flex flex-wrap justify-between gap-3 border-t px-5 py-4 text-sm">
                    <span className="text-muted-foreground">
                        Nilai dokumen (bukan kredit terposting)
                    </span>
                    <span className="font-semibold tabular-nums">
                        {formatRupiah(row.totalAmount)}
                    </span>
                </div>
            </Card>
            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
                <div className="min-w-0 space-y-6">
                    {row.credit?.status !== 'POSTED' && (
                        <FinanceReturnCredit
                            key={`${row.id}:${row.credit?.status ?? 'new'}`}
                            row={row}
                        />
                    )}
                    <ReturnInvoiceDetails row={row} />
                    <ReturnCreditHistory row={row} />
                </div>
                <Card className="gap-4 p-5 shadow-none">
                    <h2 className="font-semibold">Info retur</h2>
                    <dl className="space-y-4 text-sm">
                        {[
                            [
                                'Surat jalan',
                                row.deliveryOrder?.orderNumber ??
                                    'Tidak ditautkan',
                            ],
                            ['Lokasi penerimaan', row.returnLocation.name],
                            ['Alasan', row.reason || '—'],
                            ['Catatan', row.notes || '—'],
                        ].map(([label, value]) => (
                            <div key={label}>
                                <dt className="text-xs text-muted-foreground">
                                    {label}
                                </dt>
                                <dd className="mt-1 whitespace-pre-wrap break-words">
                                    {value}
                                </dd>
                            </div>
                        ))}
                    </dl>
                </Card>
            </div>
            <ReturnAuditDetails row={row} />
        </div>
    );
}
