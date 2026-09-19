'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { postFinanceManualSalesReturnCredit } from '@/actions/finance/sales-returns';
import type { FinanceReturnDetail } from '@/services/finance/sales-return-query-service';
import { manualReturnCreditSchema } from '@/lib/finance/manual-return-credit';
import { toBusinessDateString } from '@/lib/utils/timezone';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';

const rupiah = (amount: number) =>
    new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 2,
    }).format(amount);

export function ManualReturnCreditForm({ row }: { row: FinanceReturnDetail }) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const submitting = useRef(false);
    const reviewButton = useRef<HTMLButtonElement>(null);
    const [invoiceId, setInvoiceId] = useState('');
    const [totalAmount, setTotal] = useState('');
    const [taxAmount, setTax] = useState('');
    const [reason, setReason] = useState('');
    const [evidence, setEvidence] = useState('');
    const [confirmed, setConfirmed] = useState(false);
    const [date, setDate] = useState(toBusinessDateString(new Date()));
    const [review, setReview] = useState(false);
    const [message, setMessage] = useState('');
    const [posted, setPosted] = useState(false);
    const invoice = row.invoices.find(
        (candidate) => candidate.id === invoiceId,
    );
    const input = {
        returnId: row.id,
        invoiceId,
        totalAmount,
        taxAmount,
        reason,
        evidence,
        confirmed,
        postingDate: `${date}T00:00:00+07:00`,
        expectedRemaining: invoice?.remaining,
    };
    const valid =
        manualReturnCreditSchema.safeParse(input).success &&
        !!invoice &&
        Number(totalAmount) <= Number(invoice.remaining);
    if (
        !['RECEIVED', 'COMPLETED'].includes(row.status) ||
        (row.credit && row.credit.status !== 'REVIEW_REQUIRED')
    )
        return null;
    const submit = () => {
        if (!valid || submitting.current || posted) return;
        submitting.current = true;
        startTransition(async () => {
            setMessage('');
            try {
                const result = await postFinanceManualSalesReturnCredit(input);
                if (!result.success) {
                    setMessage(
                        result.error ||
                            'Persetujuan gagal. Periksa sumber dan muat ulang saldo.',
                    );
                    return;
                }
                setPosted(true);
                setReview(false);
                setMessage(
                    'Kredit manual terposting. Piutang berkurang; stok dan pembayaran tidak berubah.',
                );
                router.refresh();
            } catch {
                setMessage(
                    'Hasil posting belum dapat dipastikan. Muat ulang sebelum mencoba lagi; jangan membuat transaksi pengganti.',
                );
            } finally {
                submitting.current = false;
            }
        });
    };
    return (
        <section
            className="space-y-4 rounded-lg border p-4"
            aria-labelledby="manual-credit-title"
        >
            <h3 id="manual-credit-title" className="font-semibold">
                Persetujuan kredit retur manual
            </h3>
            <p className="text-muted-foreground">
                Untuk nominal yang telah diperiksa Finance, termasuk invoice
                tanpa snapshot. Satu persetujuan untuk seluruh retur ke satu
                invoice pada SO yang sama. Bukan penerimaan barang atau refund.
            </p>
            <p>
                Retur {row.returnNumber} · SO {row.salesOrder?.orderNumber}
            </p>
            <fieldset disabled={pending || posted} className="space-y-4">
                <div className="space-y-2">
                    <Label htmlFor="manual-invoice">
                        Invoice yang dikreditkan
                    </Label>
                    <select
                        id="manual-invoice"
                        value={invoiceId}
                        onChange={(event) => {
                            setInvoiceId(event.target.value);
                            setConfirmed(false);
                        }}
                        className="border-input bg-background min-h-11 w-full rounded-md border px-3 text-sm"
                    >
                        <option value="">Pilih invoice secara eksplisit</option>
                        {row.invoices
                            .filter(
                                (candidate) =>
                                    ['UNPAID', 'PARTIAL', 'OVERDUE'].includes(
                                        candidate.status,
                                    ) && Number(candidate.remaining) > 0,
                            )
                            .map((candidate) => (
                                <option key={candidate.id} value={candidate.id}>
                                    {candidate.invoiceNumber} — sisa{' '}
                                    {rupiah(Number(candidate.remaining))}
                                </option>
                            ))}
                    </select>
                </div>
                {invoice && (
                    <p className="rounded bg-muted p-3">
                        Total {rupiah(Number(invoice.totalAmount))} + penyesuaian harga {rupiah(Number(invoice.priceAdjustmentAmount ?? 0))} − pembayaran{' '}
                        {rupiah(Number(invoice.paidAmount))} − kredit{' '}
                        {rupiah(Number(invoice.creditedAmount))} = sisa{' '}
                        {rupiah(Number(invoice.remaining))}
                    </p>
                )}
                <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                        <Label htmlFor="manual-total">
                            Total kredit termasuk pajak (Rp)
                        </Label>
                        <Input
                            id="manual-total"
                            inputMode="decimal"
                            value={totalAmount}
                            onChange={(event) => {
                                setTotal(event.target.value);
                                setConfirmed(false);
                            }}
                            placeholder="Contoh: 222000.00"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="manual-tax">
                            Komponen pajak kredit (Rp)
                        </Label>
                        <Input
                            id="manual-tax"
                            inputMode="decimal"
                            value={taxAmount}
                            onChange={(event) => {
                                setTax(event.target.value);
                                setConfirmed(false);
                            }}
                            placeholder="Isi 0 jika tidak ada pajak yang dikreditkan"
                        />
                    </div>
                </div>
                <p className="text-muted-foreground">
                    Gunakan titik untuk desimal, tanpa pemisah ribuan. Total
                    sudah setelah diskon. Pajak adalah bagian dari total, bukan
                    tambahan; isi sesuai bukti invoice.
                </p>
                <div className="space-y-2">
                    <Label htmlFor="manual-reason">Alasan persetujuan</Label>
                    <Textarea
                        id="manual-reason"
                        value={reason}
                        maxLength={1000}
                        onChange={(event) => setReason(event.target.value)}
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="manual-evidence">
                        Referensi bukti pemeriksaan
                    </Label>
                    <Textarea
                        id="manual-evidence"
                        value={evidence}
                        maxLength={1000}
                        onChange={(event) => setEvidence(event.target.value)}
                        placeholder="Nomor/tanggal invoice dan bukti penerimaan, serta dasar nominal/pajak yang disetujui"
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="manual-date">Tanggal posting manual</Label>
                    <Input
                        id="manual-date"
                        type="date"
                        value={date}
                        onChange={(event) => setDate(event.target.value)}
                    />
                </div>
                <label className="flex items-start gap-3">
                    <input
                        type="checkbox"
                        className="mt-1 size-5 shrink-0"
                        checked={confirmed}
                        onChange={(event) => setConfirmed(event.target.checked)}
                    />
                    <span>
                        Saya telah memeriksa SO, invoice, bukti penerimaan,
                        nominal dan pajak kredit ini. Saya menyetujui
                        pengurangan piutang untuk seluruh retur.
                    </span>
                </label>
                {invoice && Number(totalAmount) > Number(invoice.remaining) && (
                    <p role="alert">
                        Nominal melebihi sisa piutang. Periksa kembali; tidak
                        ada refund otomatis.
                    </p>
                )}
                <Button
                    type="button"
                    ref={reviewButton}
                    disabled={!valid || pending || posted}
                    onClick={() => {
                        setMessage('');
                        setReview(true);
                    }}
                >
                    Periksa kredit manual
                </Button>
            </fieldset>
            <Dialog
                open={review}
                onOpenChange={(open) => {
                    if (!pending) setReview(open);
                }}
            >
                <DialogContent
                    className="max-h-[90dvh] overflow-y-auto"
                    onCloseAutoFocus={(event) => {
                        if (!posted) {
                            event.preventDefault();
                            reviewButton.current?.focus();
                        }
                    }}
                >
                    <DialogHeader>
                        <DialogTitle>
                            Konfirmasi kredit retur manual
                        </DialogTitle>
                        <DialogDescription>
                            Persetujuan ini membentuk jurnal dan langsung
                            mengurangi piutang. Sistem memeriksa ulang saldo dan
                            duplikasi saat posting.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2 break-words text-sm">
                        <p>
                            Retur {row.returnNumber} · SO{' '}
                            {row.salesOrder?.orderNumber}
                        </p>
                        <p>Invoice: {invoice?.invoiceNumber}</p>
                        <p>
                            Sisa sebelum kredit:{' '}
                            {rupiah(Number(invoice?.remaining ?? 0))}
                        </p>
                        <p>
                            Kredit: {rupiah(Number(totalAmount))} (netto{' '}
                            {rupiah(Number(totalAmount) - Number(taxAmount))};
                            pajak {rupiah(Number(taxAmount))})
                        </p>
                        <p className="font-semibold">
                            Sisa setelah kredit:{' '}
                            {rupiah(
                                Number(invoice?.remaining ?? 0) -
                                    Number(totalAmount),
                            )}
                        </p>
                        <p>Alasan: {reason}</p>
                        <p>Bukti: {evidence}</p>
                        <p>Tanggal posting: {date}</p>
                    </div>
                    {message && (
                        <p role="alert" className="break-words text-sm">
                            {message}
                        </p>
                    )}
                    <div className="flex flex-wrap justify-end gap-2">
                        <Button
                            variant="outline"
                            disabled={pending}
                            onClick={() => setReview(false)}
                        >
                            Kembali periksa
                        </Button>
                        <Button
                            disabled={pending || !valid || posted}
                            onClick={submit}
                        >
                            {pending
                                ? 'Memposting…'
                                : 'Setujui & posting kredit manual'}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
            {message && !review && <p role="alert">{message}</p>}
        </section>
    );
}
