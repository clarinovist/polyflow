'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
    postFinanceSalesReturnCredit,
    reverseFinanceSalesReturnCredit,
} from '@/actions/finance/sales-returns';
import type { FinanceReturnDetail } from '@/services/finance/sales-return-query-service';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Undo2 } from 'lucide-react';
import { toBusinessDateString } from '@/lib/utils/timezone';
import { ManualReturnCreditForm } from './ManualReturnCreditForm';
import { ReturnCreditConfirmation } from './ReturnCreditConfirmation';
import Link from 'next/link';
import { formatQuantity, formatRupiah } from '@/lib/utils/utils';
import { IssueCustomerCreditForm } from './IssueCustomerCreditForm';

/** Explicit quantities per invoice basis. No inferred first-invoice/FIFO allocation. */
export function FinanceReturnCredit({ row }: { row: FinanceReturnDetail }) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [quantities, setQuantities] = useState<Record<string, string>>({});
    const [date, setDate] = useState(toBusinessDateString(new Date()));
    const [reason, setReason] = useState('');
    const [message, setMessage] = useState('');
    const [reversalOpen, setReversalOpen] = useState(false);
    const credit = row.credit;
    const eligible = ['RECEIVED', 'COMPLETED'].includes(row.status);
    const awaitingCredit =
        eligible &&
        !row.customerCredit &&
        (!credit || credit.status === 'REVIEW_REQUIRED');
    const receivableInvoices = row.invoices.filter(
        (invoice) =>
            ['UNPAID', 'PARTIAL', 'OVERDUE'].includes(invoice.status) &&
            Number(invoice.remaining) > 0,
    );
    const canPrepareCredit = awaitingCredit && receivableInvoices.length > 0;
    const candidates = row.items.flatMap((item) =>
        receivableInvoices.flatMap((invoice) =>
            invoice.basis
                .filter(
                    (basis) => basis.productVariantId === item.productVariantId,
                )
                .map((basis) => ({
                    item,
                    invoice,
                    basis,
                    key: `${item.id}:${basis.id}`,
                })),
        ),
    );
    const lines = candidates
        .filter((candidate) => Number(quantities[candidate.key]) > 0)
        .map((candidate) => ({
            returnItemId: candidate.item.id,
            basisLineId: candidate.basis.id,
            quantity: quantities[candidate.key],
        }));
    const submit = (reverse: boolean) =>
        startTransition(async () => {
            setMessage('');
            try {
                const result = reverse
                    ? await reverseFinanceSalesReturnCredit({
                          returnId: row.id,
                          reversalDate: `${date}T00:00:00+07:00`,
                          reason,
                      })
                    : await postFinanceSalesReturnCredit({
                          returnId: row.id,
                          postingDate: `${date}T00:00:00+07:00`,
                          lines,
                      });
                if (!result.success) {
                    setMessage(
                        result.error ||
                            'Transaksi gagal. Muat ulang dan periksa sumber.',
                    );
                    return;
                }
                setMessage(
                    result.data.status === 'REVIEW_REQUIRED'
                        ? (result.data.reviewReason ??
                              'Perlu pemeriksaan Finance; piutang belum berubah.')
                        : reverse
                          ? 'Kredit dibalik dengan jurnal kompensasi. Tidak ada refund atau perubahan stok.'
                          : 'Kredit terposting. Pembayaran dan total invoice asli tidak berubah.',
                );
                router.refresh();
            } catch {
                setMessage(
                    'Hasil transaksi belum dapat dipastikan. Muat ulang sebelum mencoba lagi; jangan membuat transaksi pengganti.',
                );
            }
        });
    if (credit?.status === 'POSTED')
        return (
            <Dialog
                open={reversalOpen}
                onOpenChange={(open) => {
                    if (!pending) setReversalOpen(open);
                }}
            >
                <DialogTrigger asChild>
                    <Button variant="outline" className="min-h-11">
                        <Undo2 aria-hidden="true" />
                        Balikkan kredit
                    </Button>
                </DialogTrigger>
                <DialogContent showCloseButton={!pending}>
                    <DialogHeader>
                        <DialogTitle>Balikkan kredit retur?</DialogTitle>
                        <DialogDescription>
                            Pembalikan mengembalikan piutang dengan jurnal
                            kompensasi. Riwayat asli dan stok tetap utuh. Kredit
                            yang dibalik tidak dapat diposting ulang.
                        </DialogDescription>
                    </DialogHeader>
                    <p className="text-sm font-medium">
                        Kredit yang akan dibalik:{' '}
                        {formatRupiah(Number(credit.totalAmount))}
                    </p>
                    <Label htmlFor="credit-reversal-reason">
                        Alasan koreksi (minimal 5 karakter)
                    </Label>
                    <Input
                        id="credit-reversal-reason"
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                        disabled={pending}
                    />
                    <Label htmlFor="credit-reversal-date">
                        Tanggal pembalikan
                    </Label>
                    <Input
                        id="credit-reversal-date"
                        type="date"
                        value={date}
                        onChange={(event) => setDate(event.target.value)}
                        disabled={pending}
                    />
                    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                        <Button
                            variant="outline"
                            disabled={pending}
                            onClick={() => setReversalOpen(false)}
                        >
                            Batal
                        </Button>
                        <Button
                            variant="destructive"
                            className="h-auto min-h-11 whitespace-normal"
                            disabled={
                                pending || reason.trim().length < 5 || !date
                            }
                            onClick={() => submit(true)}
                        >
                            Balikkan kredit — pulihkan piutang
                        </Button>
                    </div>
                    {pending && (
                        <p role="status" className="text-sm">
                            Memproses transaksi…
                        </p>
                    )}
                    {message && (
                        <p role="alert" className="break-words text-sm">
                            {message}
                        </p>
                    )}
                </DialogContent>
            </Dialog>
        );
    return (
        <Card className="gap-4 py-5 shadow-none">
            <CardHeader>
                <CardTitle className="text-base">Langkah berikutnya</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
                <p>
                    Status keuangan:{' '}
                    <strong>
                        {row.customerCredit
                            ? 'Saldo kredit pelanggan diterbitkan — lihat rinciannya'
                            : credit?.recoveryActive
                              ? 'Kredit dipulihkan — mengurangi piutang'
                              : credit?.status === 'REVERSED'
                                ? 'Dibalik — perlu pemeriksaan'
                                : 'Belum mengurangi piutang'}
                    </strong>
                </p>
                {row.customerCredit && (
                    <Link
                        className="inline-flex min-h-11 items-center font-medium underline"
                        href={`/finance/returns/credits/${row.customerCredit.id}`}
                    >
                        Lihat saldo dan pemakaian kredit pelanggan
                    </Link>
                )}
                {eligible && <IssueCustomerCreditForm row={row} />}
                {canPrepareCredit && (
                    <ReturnCreditConfirmation key={row.id} returnId={row.id} />
                )}
                {awaitingCredit && !canPrepareCredit && (
                    <section
                        className="space-y-3 rounded-lg border p-4"
                        aria-label="Pemeriksaan invoice sebelum kredit retur"
                    >
                        <p role="status" className="font-medium">
                            {!row.invoices.length
                                ? 'Belum ada invoice tujuan. Periksa penerbitan invoice di Finance.'
                                : row.invoices.every(
                                        (invoice) =>
                                            invoice.status === 'PAID' &&
                                            Number(invoice.remaining) === 0,
                                    )
                                  ? 'Invoice tercatat lunas di sistem. Gunakan saldo kredit pelanggan untuk tagihan lain; jangan mengubah pembayaran lama.'
                                  : row.invoices.every(
                                          (invoice) =>
                                              invoice.status === 'DRAFT',
                                      )
                                    ? 'Invoice belum diakui. Periksa dan konfirmasi invoice di Finance terlebih dahulu.'
                                    : row.invoices.every(
                                            (invoice) =>
                                                invoice.status === 'DRAFT' ||
                                                (invoice.status === 'PAID' &&
                                                    Number(
                                                        invoice.remaining,
                                                    ) === 0),
                                        )
                                      ? 'Belum ada invoice dengan piutang yang dapat dikreditkan. Periksa invoice tujuan di Finance.'
                                      : 'Status dan sisa tagihan invoice tidak konsisten. Perlu pemeriksaan Finance sebelum kredit retur.'}
                        </p>
                        {row.invoices.map((invoice) => (
                            <div
                                key={invoice.id}
                                className="space-y-1 break-words"
                            >
                                <Link
                                    className="inline-flex min-h-11 items-center font-medium underline"
                                    href={`/finance/invoices/sales/${invoice.id}`}
                                >
                                    Periksa invoice {invoice.invoiceNumber}
                                </Link>
                                <p>
                                    Pembayaran tercatat:{' '}
                                    {formatRupiah(Number(invoice.paidAmount))} ·
                                    Sisa tagihan:{' '}
                                    {formatRupiah(Number(invoice.remaining))}
                                </p>
                            </div>
                        ))}
                        <p className="text-muted-foreground">
                            Jika sebenarnya belum lunas, cocokkan rincian
                            pembayaran dan jurnal dengan bukti transaksi
                            terlebih dahulu. Mengisi retur ulang atau formulir
                            manual tidak memperbaiki saldo pembayaran. Tidak ada
                            perubahan pembayaran, refund, atau pemotongan
                            otomatis.
                        </p>
                        <Button
                            variant="outline"
                            className="h-auto min-h-11 whitespace-normal"
                            onClick={() => router.refresh()}
                        >
                            Muat ulang saldo invoice
                        </Button>
                    </section>
                )}
                {credit?.reviewReason && (
                    <p role="alert">{credit.reviewReason}</p>
                )}
                {canPrepareCredit && (
                    <details>
                        <summary className="min-h-11 cursor-pointer py-3 font-medium">
                            Opsi lanjutan: alokasi snapshot per item
                        </summary>
                        {row.invoices.map((invoice) => (
                            <div
                                key={invoice.id}
                                className="rounded border p-3"
                            >
                                <p className="font-medium">
                                    {invoice.invoiceNumber} · {invoice.status}
                                </p>
                                <p>
                                    Total Rp {invoice.totalAmount} + penyesuaian
                                    harga Rp{' '}
                                    {invoice.priceAdjustmentAmount ?? '0.00'} −
                                    pembayaran Rp {invoice.paidAmount} − kredit
                                    Rp {invoice.creditedAmount} = sisa Rp{' '}
                                    {invoice.remaining}
                                </p>
                                {!invoice.basis.length && (
                                    <p role="status">
                                        Tidak ada snapshot historis. Tidak dapat
                                        dialokasikan otomatis.
                                    </p>
                                )}
                            </div>
                        ))}
                        {!candidates.length && (
                            <p role="status">
                                Tidak ada sumber invoice terverifikasi yang
                                dapat dipilih. Pemeriksaan Finance diperlukan.
                            </p>
                        )}
                        {candidates.map(({ item, invoice, basis, key }) => (
                            <div
                                key={key}
                                className="space-y-2 rounded border p-3"
                            >
                                <Label htmlFor={key}>
                                    {item.productVariant.name} ({item.condition}
                                    ) → {invoice.invoiceNumber} · sumber{' '}
                                    {basis.sourceItemId}
                                </Label>
                                <p>
                                    Qty asal{' '}
                                    {formatQuantity(Number(basis.quantity))},
                                    sisa alokasi{' '}
                                    {formatQuantity(
                                        Number(basis.availableQuantity),
                                    )}
                                    ; netto Rp {basis.netAmount}, pajak Rp{' '}
                                    {basis.taxAmount}, diskon asal Rp{' '}
                                    {basis.discountAmount}
                                </p>
                                <Input
                                    id={key}
                                    type="number"
                                    min="0"
                                    step="0.0001"
                                    max={basis.availableQuantity}
                                    value={quantities[key] ?? ''}
                                    disabled={
                                        pending || invoice.status === 'DRAFT'
                                    }
                                    onChange={(event) =>
                                        setQuantities({
                                            ...quantities,
                                            [key]: event.target.value,
                                        })
                                    }
                                    placeholder="Qty yang dialokasikan (pilih eksplisit)"
                                />
                            </div>
                        ))}
                        <Label htmlFor="credit-posting-date">
                            Tanggal posting
                        </Label>
                        <Input
                            id="credit-posting-date"
                            type="date"
                            value={date}
                            onChange={(event) => setDate(event.target.value)}
                            disabled={pending}
                        />
                        <Button
                            disabled={pending || !lines.length || !date}
                            onClick={() => submit(false)}
                        >
                            Posting kredit retur
                        </Button>
                    </details>
                )}
                {canPrepareCredit && (
                    <details>
                        <summary className="min-h-11 cursor-pointer py-3 font-medium">
                            Periksa atau ubah nominal secara manual
                        </summary>
                        <ManualReturnCreditForm
                            key={`${row.id}:${row.credit?.status ?? 'new'}`}
                            row={row}
                        />
                    </details>
                )}
                {!eligible && (
                    <p>
                        {row.status === 'CANCELLED'
                            ? 'Retur dibatalkan; tidak ada penerimaan yang perlu dilanjutkan.'
                            : 'Konfirmasi dan penerimaan barang dilakukan oleh petugas Penjualan.'}{' '}
                        Draft/confirmed/cancelled tidak mengurangi piutang.
                    </p>
                )}

                {pending && <p role="status">Memproses transaksi…</p>}
                {message && (
                    <p role="alert" className="break-words">
                        {message}
                    </p>
                )}
            </CardContent>
        </Card>
    );
}
