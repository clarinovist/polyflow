import Link from 'next/link';
import { ChevronDown, ExternalLink } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { formatQuantity, formatRupiah } from '@/lib/utils/utils';
import { toBusinessDateString } from '@/lib/utils/timezone';
import type { FinanceReturnDetail } from '@/services/finance/sales-return-query-service';

export function ReturnInvoiceDetails({ row }: { row: FinanceReturnDetail }) {
    return (
        <Card className="gap-4 p-5 shadow-none">
            <h2 className="font-semibold">Rincian invoice</h2>
            {!row.invoices.length && (
                <p className="text-sm text-muted-foreground">
                    Belum ada invoice terkait. Periksa penerbitan invoice di
                    Finance.
                </p>
            )}
            {row.invoices.map((invoice) => (
                <section
                    key={invoice.id}
                    aria-label={`Rincian ${invoice.invoiceNumber}`}
                    className="space-y-3 border-t pt-3 first-of-type:border-0 first-of-type:pt-0"
                >
                    <Link
                        className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-primary underline-offset-4 hover:underline"
                        href={`/finance/invoices/sales/${invoice.id}`}
                    >
                        Lihat invoice {invoice.invoiceNumber}
                        <ExternalLink className="size-3.5" aria-hidden="true" />
                    </Link>
                    <dl className="space-y-3 text-sm">
                        {[
                            ['Total invoice asli', invoice.totalAmount],
                            [
                                'Penyesuaian harga',
                                invoice.priceAdjustmentAmount ?? '0',
                            ],
                            ['Pembayaran', invoice.paidAmount],
                            ['Kredit retur', invoice.creditedAmount],
                        ].map(([label, value]) => (
                            <div
                                key={label}
                                className="flex justify-between gap-4"
                            >
                                <dt className="text-muted-foreground">
                                    {label}
                                </dt>
                                <dd className="shrink-0 tabular-nums">
                                    {formatRupiah(Number(value))}
                                </dd>
                            </div>
                        ))}
                        <div className="flex justify-between gap-4 border-t pt-3 font-semibold">
                            <dt>Sisa tagihan</dt>
                            <dd className="tabular-nums">
                                {formatRupiah(Number(invoice.remaining))}
                            </dd>
                        </div>
                    </dl>
                    {invoice.status === 'DRAFT' && (
                        <p className="text-xs text-muted-foreground">
                            Invoice draft; belum diakui sebagai piutang.
                        </p>
                    )}
                </section>
            ))}
            <p className="text-xs text-muted-foreground">
                Total invoice asli tetap. Sisa tagihan = total asli +
                penyesuaian harga − pembayaran − kredit retur seluruh transaksi
                pada invoice ini.
            </p>
        </Card>
    );
}

export function ReturnCreditHistory({ row }: { row: FinanceReturnDetail }) {
    const credit = row.credit;
    return (
        <Card className="gap-4 p-5 shadow-none">
            <h2 className="font-semibold">Riwayat kredit</h2>
            {!credit?.postedAt &&
                !credit?.reversedAt &&
                !credit?.recoveries.length && (
                    <p className="text-sm text-muted-foreground">
                        Belum ada riwayat posting kredit piutang yang tercatat.
                    </p>
                )}
            <ol className="ml-1 space-y-5 border-l-2 pl-5 text-sm empty:hidden">
                {credit?.recoveries
                    .slice()
                    .reverse()
                    .map((event, index) => (
                        <li key={index} className="relative">
                            <TimelineDot />
                            <p className="font-medium">
                                {event.kind === 'REINSTATE'
                                    ? 'Pemulihan kredit retur'
                                    : 'Kompensasi pemulihan kredit'}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                                {toBusinessDateString(
                                    new Date(event.postingDate),
                                )}{' '}
                                · {event.journal.entryNumber}
                            </p>
                            <p className="mt-1 break-words text-muted-foreground">
                                {event.reason}
                            </p>
                        </li>
                    ))}
                {credit?.reversedAt && (
                    <li className="relative">
                        <TimelineDot />
                        <p className="font-medium">
                            Kredit dibalik ·{' '}
                            {formatRupiah(Number(credit.totalAmount))}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                            {toBusinessDateString(new Date(credit.reversedAt))}
                        </p>
                        <p className="mt-1 break-words text-muted-foreground">
                            {credit.reversalReason}
                        </p>
                    </li>
                )}
                {credit?.postedAt && (
                    <li className="relative">
                        <TimelineDot />
                        <p className="font-medium">
                            Kredit {formatRupiah(Number(credit.totalAmount))}{' '}
                            terposting
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                            {toBusinessDateString(new Date(credit.postedAt))} ·{' '}
                            {credit.mode === 'MANUAL'
                                ? 'Disetujui manual oleh Finance'
                                : 'Snapshot invoice asal'}
                        </p>
                        {credit.allocations.map((line, index) => (
                            <p
                                key={index}
                                className="mt-1 text-xs text-muted-foreground"
                            >
                                {line.invoiceNumber} ·{' '}
                                {formatRupiah(Number(line.totalAmount))} ·{' '}
                                {line.quantity === null
                                    ? 'Alokasi nominal manual'
                                    : `Qty ${formatQuantity(Number(line.quantity))}`}
                            </p>
                        ))}
                    </li>
                )}
            </ol>
        </Card>
    );
}

function TimelineDot() {
    return (
        <span
            aria-hidden="true"
            className="absolute -left-[27px] top-1 size-3 rounded-full border-2 border-card bg-muted-foreground"
        />
    );
}

export function ReturnAuditDetails({ row }: { row: FinanceReturnDetail }) {
    const credit = row.credit;
    return (
        <details className="group rounded-xl border bg-card">
            <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
                Detail audit & catatan sistem
                <ChevronDown
                    aria-hidden="true"
                    className="size-4 shrink-0 transition-transform group-open:rotate-180"
                />
            </summary>
            <div className="grid gap-6 border-t p-5 text-sm md:grid-cols-2">
                <div className="min-w-0 space-y-4">
                    <h3 className="font-semibold">Persetujuan & bukti</h3>
                    <dl className="space-y-3 [overflow-wrap:anywhere]">
                        <AuditField
                            label="Sumber nominal"
                            value={
                                credit
                                    ? credit.mode === 'MANUAL'
                                        ? 'Disetujui manual oleh Finance'
                                        : 'Snapshot invoice asal'
                                    : 'Belum tersedia'
                            }
                        />
                        <AuditField
                            label="Disetujui oleh"
                            value={credit?.approvedBy ?? '—'}
                        />
                        <AuditField
                            label="Tanggal persetujuan"
                            value={
                                credit?.approvedAt
                                    ? new Date(
                                          credit.approvedAt,
                                      ).toLocaleString('id-ID', {
                                          timeZone: 'Asia/Jakarta',
                                      }) + ' WIB'
                                    : '—'
                            }
                        />
                        <AuditField
                            label="Alasan persetujuan"
                            value={credit?.approvalReason ?? '—'}
                        />
                        <AuditField
                            label="Bukti"
                            value={credit?.evidenceReference ?? '—'}
                        />
                        <AuditField
                            label="Komponen pajak kredit"
                            value={
                                credit
                                    ? formatRupiah(Number(credit.taxAmount))
                                    : '—'
                            }
                        />
                        <AuditField label="Referensi retur" value={row.id} />
                        <AuditField
                            label="Referensi SO"
                            value={row.salesOrderId}
                        />
                        {credit?.manualRemainingBefore != null && (
                            <AuditField
                                label="Sisa tagihan sebelum persetujuan manual"
                                value={formatRupiah(
                                    Number(credit.manualRemainingBefore),
                                )}
                            />
                        )}
                    </dl>
                    {credit?.recoveries.map((event, index) => (
                        <div
                            key={index}
                            className="space-y-1 rounded-lg border p-3 [overflow-wrap:anywhere]"
                        >
                            <p className="font-medium">
                                {event.journal.entryNumber}
                            </p>
                            <p>Bukti: {event.evidence}</p>
                            <p>Riwayat kredit asli dan stok tidak diubah.</p>
                        </div>
                    ))}
                    {row.items
                        .filter((item) => item.receipt)
                        .map((item) => (
                            <p
                                key={item.id}
                                className="text-xs text-muted-foreground [overflow-wrap:anywhere]"
                            >
                                {item.productVariant.skuCode} · Bukti
                                penerimaan: {item.receipt?.sourceMovementId}
                            </p>
                        ))}
                </div>
                <div className="space-y-4">
                    <h3 className="font-semibold">Catatan sistem</h3>
                    <ul className="list-disc space-y-3 pl-4 text-muted-foreground">
                        <li>
                            Penerimaan barang dan kredit piutang dicatat
                            terpisah. Konfirmasi dan penerimaan dilakukan di
                            Penjualan oleh petugas berwenang.
                        </li>
                        <li>
                            Alokasi otomatis memakai snapshot invoice asal,
                            bukan harga formulir retur. Nominal manual
                            memerlukan pemeriksaan bukti dan persetujuan
                            Finance.
                        </li>
                        <li>
                            Harga dan subtotal barang adalah nilai dokumen;
                            bukan verifikasi pajak, diskon, HPP, atau
                            pengurangan invoice.
                        </li>
                        <li>
                            Invoice lunas, nilai berlebih, atau jurnal tidak
                            valid perlu diperiksa. Tidak ada refund otomatis.
                        </li>
                        <li>
                            Kredit yang dibalik tidak bisa diposting ulang.
                            Pemulihan, bila tercatat, ditampilkan terpisah tanpa
                            mengubah riwayat asli.
                        </li>
                    </ul>
                </div>
            </div>
        </details>
    );
}

function AuditField({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="mt-1">{value}</dd>
        </div>
    );
}
