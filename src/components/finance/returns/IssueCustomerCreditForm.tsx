'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { issueFinanceCustomerCredit } from '@/actions/finance/sales-returns';
import type { FinanceReturnDetail } from '@/services/finance/sales-return-query-service';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toBusinessDateString } from '@/lib/utils/timezone';
import { formatRupiah } from '@/lib/utils/utils';

export function IssueCustomerCreditForm({ row }: { row: FinanceReturnDetail }) {
    const router = useRouter();
    const [pending, start] = useTransition();
    const [invoiceId, setInvoice] = useState('');
    const [total, setTotal] = useState('');
    const [tax, setTax] = useState('0');
    const [reason, setReason] = useState('');
    const [evidence, setEvidence] = useState('');
    const [date, setDate] = useState(toBusinessDateString(new Date()));
    const [confirmed, setConfirmed] = useState(false);
    const [message, setMessage] = useState('');
    const [posted, setPosted] = useState(false);
    const eligible = row.invoices.filter(
        (i) =>
            i.status === 'PAID' &&
            Number(i.remaining) === 0 &&
            Number(i.paidAmount) === Number(i.totalAmount) &&
            Number(i.creditedAmount) === 0 &&
            Number(i.priceAdjustmentAmount ?? 0) === 0,
    );
    if (
        !eligible.length ||
        row.customerCredit ||
        (row.credit && row.credit.status !== 'REVIEW_REQUIRED')
    )
        return null;
    const submit = () =>
        start(async () => {
            setMessage('');
            try {
                const result = await issueFinanceCustomerCredit({
                    returnId: row.id,
                    invoiceId,
                    totalAmount: total,
                    taxAmount: tax,
                    postingDate: `${date}T00:00:00+07:00`,
                    reason,
                    evidence,
                    confirmed,
                });
                if (!result.success) {
                    setMessage(result.error ?? 'Penerbitan gagal.');
                    return;
                }
                setPosted(true);
                router.push(`/finance/returns/credits/${result.data.id}`);
                router.refresh();
            } catch {
                setMessage(
                    'Hasil belum dapat dipastikan. Muat ulang sebelum mencoba lagi; jangan membuat retur pengganti.',
                );
            }
        });
    return (
        <section
            className="space-y-3 rounded-lg border p-4"
            aria-label="Terbitkan saldo kredit pelanggan"
        >
            <h3 className="font-semibold">
                Retur invoice lunas → saldo kredit pelanggan
            </h3>
            <p>
                Pembayaran lama tetap utuh. Saldo dapat dipakai ke invoice lain,
                bukan refund otomatis. Periksa nominal dan pajak berdasarkan
                bukti; nilai dokumen retur {formatRupiah(row.totalAmount)} bukan
                persetujuan otomatis.
            </p>
            <fieldset disabled={pending || posted} className="space-y-3">
                <Label htmlFor="wallet-source">Invoice lunas sumber</Label>
                <select
                    id="wallet-source"
                    className="min-h-11 w-full rounded border p-2"
                    value={invoiceId}
                    onChange={(e) => {
                        setInvoice(e.target.value);
                        setConfirmed(false);
                    }}
                >
                    <option value="">Pilih invoice sumber</option>
                    {eligible.map((i) => (
                        <option key={i.id} value={i.id}>
                            {i.invoiceNumber}
                        </option>
                    ))}
                </select>
                <Label htmlFor="wallet-total">Total saldo kredit (Rp)</Label>
                <Input
                    id="wallet-total"
                    inputMode="decimal"
                    value={total}
                    onChange={(e) => {
                        setTotal(e.target.value);
                        setConfirmed(false);
                    }}
                />
                <Label htmlFor="wallet-tax">
                    Pajak yang termasuk dalam total (Rp)
                </Label>
                <Input
                    id="wallet-tax"
                    inputMode="decimal"
                    value={tax}
                    onChange={(e) => {
                        setTax(e.target.value);
                        setConfirmed(false);
                    }}
                />
                <Label htmlFor="wallet-reason">Alasan persetujuan</Label>
                <Input
                    id="wallet-reason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                />
                <Label htmlFor="wallet-evidence">
                    Referensi bukti invoice dan penerimaan
                </Label>
                <Input
                    id="wallet-evidence"
                    value={evidence}
                    onChange={(e) => setEvidence(e.target.value)}
                />
                <Label htmlFor="wallet-date">Tanggal penerbitan</Label>
                <Input
                    id="wallet-date"
                    type="date"
                    value={date}
                    onChange={(e) => {
                        setDate(e.target.value);
                        setConfirmed(false);
                    }}
                />
                <p>
                    Gunakan angka tanpa pemisah ribuan. Akun kewajiban{' '}
                    <strong>Saldo Kredit Pelanggan</strong> harus tersedia di
                    pemetaan akun Finance.
                </p>
                <label className="flex min-h-11 items-start gap-2">
                    <input
                        type="checkbox"
                        className="mt-1 size-5"
                        checked={confirmed}
                        onChange={(e) => setConfirmed(e.target.checked)}
                    />
                    <span>
                        Saya memverifikasi penerimaan dan menyetujui saldo{' '}
                        {formatRupiah(Number(total) || 0)} (termasuk pajak{' '}
                        {formatRupiah(Number(tax) || 0)}). Ini membentuk jurnal,
                        tidak mengubah pembayaran lama.
                    </span>
                </label>
                <Button
                    onClick={submit}
                    disabled={
                        !confirmed ||
                        !invoiceId ||
                        Number(total) <= 0 ||
                        !total ||
                        reason.trim().length < 10 ||
                        evidence.trim().length < 10
                    }
                >
                    {pending ? 'Memposting…' : 'Terbitkan saldo kredit'}
                </Button>
            </fieldset>
            {message && <p role="alert">{message}</p>}
        </section>
    );
}
