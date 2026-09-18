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
import { toBusinessDateString } from '@/lib/utils/timezone';

/** Explicit quantities per invoice basis. No inferred first-invoice/FIFO allocation. */
export function FinanceReturnCredit({ row }: { row: FinanceReturnDetail }) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [quantities, setQuantities] = useState<Record<string, string>>({});
    const [date, setDate] = useState(toBusinessDateString(new Date()));
    const [reason, setReason] = useState('');
    const [message, setMessage] = useState('');
    const credit = row.credit;
    const eligible = ['RECEIVED', 'COMPLETED'].includes(row.status);
    const candidates = row.items.flatMap((item) =>
        row.invoices.flatMap((invoice) =>
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
    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">
                    Kredit retur & piutang
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
                <p>
                    Status keuangan:{' '}
                    <strong>
                        {credit?.status === 'POSTED'
                            ? 'Terposting'
                            : credit?.status === 'REVERSED'
                              ? 'Dibalik — perlu pemeriksaan'
                              : 'Belum mengurangi piutang'}
                    </strong>
                </p>
                {credit?.reviewReason && (
                    <p role="alert">{credit.reviewReason}</p>
                )}
                {credit && credit.status !== 'REVIEW_REQUIRED' && (
                    <div className="space-y-2 rounded border p-3">
                        <p>
                            Kredit asli: Rp {credit.totalAmount} · Posting:{' '}
                            {credit.postedAt
                                ? toBusinessDateString(
                                      new Date(credit.postedAt),
                                  )
                                : '—'}
                        </p>
                        {credit.allocations.map((line, index) => (
                            <p key={index}>
                                {line.invoiceNumber} · Qty {line.quantity} · Rp{' '}
                                {line.totalAmount}
                            </p>
                        ))}
                        {credit.reversedAt && (
                            <p>
                                Pembalikan:{' '}
                                {toBusinessDateString(
                                    new Date(credit.reversedAt),
                                )}{' '}
                                · {credit.reversalReason}
                            </p>
                        )}
                    </div>
                )}
                <p className="text-muted-foreground">
                    Penerimaan fisik terpisah dari kredit. Nilai memakai
                    snapshot invoice asal, bukan harga pada formulir retur.
                    Invoice lunas, nilai berlebih, atau sumber tidak
                    terverifikasi tetap diperiksa Finance; tidak ada refund
                    otomatis.
                </p>
                {row.items.map((item) => (
                    <p key={item.id}>
                        {item.productVariant.name}: qty retur {item.returnedQty}
                        ;{' '}
                        {item.receipt
                            ? `HPP penerimaan Rp ${item.receipt.restockValue}`
                            : 'bukti penerimaan historis belum tersedia'}
                    </p>
                ))}
                {eligible &&
                    (!credit || credit.status === 'REVIEW_REQUIRED') && (
                        <>
                            {row.invoices.map((invoice) => (
                                <div
                                    key={invoice.id}
                                    className="rounded border p-3"
                                >
                                    <p className="font-medium">
                                        {invoice.invoiceNumber} ·{' '}
                                        {invoice.status}
                                    </p>
                                    <p>
                                        Total Rp {invoice.totalAmount} −
                                        pembayaran Rp {invoice.paidAmount} −
                                        kredit Rp {invoice.creditedAmount} =
                                        sisa Rp {invoice.remaining}
                                    </p>
                                    {!invoice.basis.length && (
                                        <p role="status">
                                            Tidak ada snapshot historis. Tidak
                                            dapat dialokasikan otomatis.
                                        </p>
                                    )}
                                </div>
                            ))}
                            {!candidates.length && (
                                <p role="status">
                                    Tidak ada sumber invoice terverifikasi yang
                                    dapat dipilih. Pemeriksaan Finance
                                    diperlukan.
                                </p>
                            )}
                            {candidates.map(({ item, invoice, basis, key }) => (
                                <div
                                    key={key}
                                    className="space-y-2 rounded border p-3"
                                >
                                    <Label htmlFor={key}>
                                        {item.productVariant.name} (
                                        {item.condition}) →{' '}
                                        {invoice.invoiceNumber} · sumber{' '}
                                        {basis.sourceItemId}
                                    </Label>
                                    <p>
                                        Qty asal {basis.quantity}, sisa alokasi{' '}
                                        {basis.availableQuantity}; netto Rp{' '}
                                        {basis.netAmount}, pajak Rp{' '}
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
                                            pending ||
                                            invoice.status === 'DRAFT'
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
                                onChange={(event) =>
                                    setDate(event.target.value)
                                }
                                disabled={pending}
                            />
                            <Button
                                disabled={pending || !lines.length || !date}
                                onClick={() => submit(false)}
                            >
                                Posting kredit retur
                            </Button>
                        </>
                    )}
                {!eligible && (
                    <p>
                        Menunggu penerimaan barang oleh Penjualan.
                        Draft/confirmed/cancelled tidak mengurangi piutang.
                    </p>
                )}
                {credit?.status === 'POSTED' && (
                    <div className="space-y-3 rounded border border-destructive p-3">
                        <p>
                            Pembalikan mengembalikan piutang dengan jurnal
                            kompensasi. Riwayat asli dan stok tetap utuh. Kredit
                            yang dibalik tidak dapat diposting ulang.
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
                        <Button
                            variant="destructive"
                            disabled={
                                pending || reason.trim().length < 5 || !date
                            }
                            onClick={() => submit(true)}
                        >
                            Balikkan kredit — pulihkan piutang
                        </Button>
                    </div>
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
