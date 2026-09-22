'use client';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
    applyFinanceCustomerCredit,
    getFinanceCustomerCreditTargets,
    reverseFinanceCustomerCreditApplication,
    reverseFinanceCustomerCreditNote,
} from '@/actions/finance/sales-returns';
import type {
    CustomerCreditDetail as Detail,
    CustomerCreditTargets,
} from '@/services/finance/customer-credit-query-service';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatRupiah } from '@/lib/utils/utils';
import { toBusinessDateString } from '@/lib/utils/timezone';
import { CustomerCreditIdentity } from './CustomerCreditIdentity';

export function CustomerCreditDetail({
    note,
    canLink,
}: {
    note: Detail;
    canLink: boolean;
}) {
    const router = useRouter();
    const [pending, start] = useTransition();
    const [targets, setTargets] = useState<CustomerCreditTargets>({
        rows: [],
        truncated: false,
    });
    const [search, setSearch] = useState('');
    const [invoiceId, setInvoice] = useState('');
    const [amount, setAmount] = useState('');
    const [date, setDate] = useState(toBusinessDateString(new Date()));
    const [reason, setReason] = useState('');
    const [confirmed, setConfirmed] = useState(false);
    const [message, setMessage] = useState('');
    const [requestId, setRequest] = useState(() => crypto.randomUUID());
    const [reversal, setReversal] = useState<{
        id: string;
        type: 'note' | 'application';
        amount: string;
    } | null>(null);
    const invoice = targets.rows.find((i) => i.id === invoiceId);
    const refresh = () => {
        setConfirmed(false);
        setInvoice('');
        setTargets({ rows: [], truncated: false });
        setRequest(crypto.randomUUID());
        setReversal(null);
        router.refresh();
    };
    const find = () =>
        start(async () => {
            try {
                const result = await getFinanceCustomerCreditTargets({
                    noteId: note.id,
                    search,
                });
                if (!result.success) {
                    setMessage(result.error ?? 'Gagal mencari invoice.');
                    return;
                }
                setTargets(result.data);
                setMessage('');
                setInvoice('');
                setConfirmed(false);
            } catch {
                setMessage('Pencarian gagal. Coba lagi.');
            }
        });
    const submit = () =>
        start(async () => {
            setMessage('');
            try {
                const result = reversal
                    ? await (
                          reversal.type === 'note'
                              ? reverseFinanceCustomerCreditNote
                              : reverseFinanceCustomerCreditApplication
                      )({
                          id: reversal.id,
                          reversalDate: `${date}T00:00:00+07:00`,
                          reason,
                          confirmed,
                      })
                    : await applyFinanceCustomerCredit({
                          noteId: note.id,
                          invoiceId,
                          totalAmount: amount,
                          expectedBalance: note.remaining,
                          expectedInvoiceBalance: invoice?.remaining,
                          postingDate: `${date}T00:00:00+07:00`,
                          reason,
                          confirmed,
                          idempotencyKey: requestId,
                      });
                if (!result.success) {
                    setMessage(result.error ?? 'Transaksi gagal.');
                    return;
                }
                setMessage(
                    reversal
                        ? 'Pembalikan tercatat dengan jurnal kompensasi.'
                        : 'Kredit digunakan. Piutang berkurang; tidak ada pembayaran kas.',
                );
                refresh();
            } catch {
                setMessage(
                    'Hasil belum dapat dipastikan. Muat ulang untuk memeriksa riwayat sebelum mencoba lagi.',
                );
            }
        });
    return (
        <div className="space-y-5">
            <Link
                href="/finance/returns/credits"
                className="inline-flex min-h-11 items-center underline"
            >
                Daftar saldo kredit
            </Link>
            <h1 className="text-2xl font-semibold">
                Saldo kredit · {note.customer}
            </h1>
            <div className="space-y-2 rounded-lg border p-4">
                <p>
                    Sumber:{' '}
                    <Link
                        className="underline"
                        href={`/finance/returns/${note.returnId}`}
                    >
                        {note.returnNumber}
                    </Link>{' '}
                    · {note.sourceInvoice}
                </p>
                <p>Status: {note.status === 'POSTED' ? 'Aktif' : 'Dibalik'}</p>
                <p>Diterbitkan: {formatRupiah(Number(note.total))}</p>
                <p className="text-xl font-semibold">
                    Sisa kredit: {formatRupiah(Number(note.remaining))}
                </p>
                <p>{note.reason}</p>
                <p className="break-words">Bukti: {note.evidence}</p>
                {note.reversalReason && (
                    <p>Pembalikan: {note.reversalReason}</p>
                )}
            </div>
            {note.status === 'POSTED' &&
                Number(note.remaining) > 0 &&
                !reversal && (
                    <section
                        className="space-y-3 rounded-lg border p-4"
                        aria-label="Gunakan saldo kredit"
                    >
                        <h2 className="font-semibold">
                            Gunakan untuk tagihan lain
                        </h2>
                        <p>
                            Hanya pelanggan sama atau hubungan dua master yang
                            sudah disetujui Admin. Kelebihan kredit tetap
                            tersimpan.
                        </p>
                        <Label htmlFor="credit-search">
                            Cari nomor SO / invoice
                        </Label>
                        <div className="flex gap-2">
                            <Input
                                id="credit-search"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                            <Button
                                variant="outline"
                                onClick={find}
                                disabled={pending}
                            >
                                Cari tagihan
                            </Button>
                        </div>
                        <Label htmlFor="credit-target">Invoice tujuan</Label>
                        <select
                            id="credit-target"
                            className="min-h-11 w-full rounded border p-2"
                            value={invoiceId}
                            onChange={(e) => {
                                setInvoice(e.target.value);
                                setConfirmed(false);
                                setRequest(crypto.randomUUID());
                                setAmount('');
                            }}
                        >
                            <option value="">Pilih tagihan</option>
                            {targets.rows.map((i) => (
                                <option key={i.id} value={i.id}>
                                    {i.orderNumber} · {i.invoiceNumber} ·{' '}
                                    {i.customer} ·{' '}
                                    {formatRupiah(Number(i.remaining))}
                                </option>
                            ))}
                        </select>
                        {targets.truncated && (
                            <p>
                                Hasil dibatasi 25 tagihan; persempit pencarian.
                            </p>
                        )}
                        <Label htmlFor="credit-amount">
                            Kredit yang digunakan (Rp)
                        </Label>
                        <Input
                            id="credit-amount"
                            inputMode="decimal"
                            value={amount}
                            onChange={(e) => {
                                setAmount(e.target.value);
                                setConfirmed(false);
                                setRequest(crypto.randomUUID());
                            }}
                        />
                        {invoice && (
                            <p>
                                Sisa tagihan{' '}
                                {formatRupiah(Number(invoice.remaining))} →{' '}
                                {formatRupiah(
                                    Number(invoice.remaining) -
                                        (Number(amount) || 0),
                                )}
                                . Sisa kredit setelah pemakaian:{' '}
                                {formatRupiah(
                                    Number(note.remaining) -
                                        (Number(amount) || 0),
                                )}
                                .
                            </p>
                        )}
                    </section>
                )}
            {reversal && (
                <div
                    role="alert"
                    className="rounded border border-destructive p-4"
                >
                    Pembalikan{' '}
                    {reversal.type === 'note'
                        ? 'menghapus kewajiban kredit yang belum digunakan'
                        : 'mengembalikan piutang invoice dan saldo kredit'}{' '}
                    sebesar {formatRupiah(Number(reversal.amount))}. Riwayat dan
                    pembayaran tetap utuh.
                    <Button
                        variant="outline"
                        className="ml-3"
                        onClick={() => {
                            setReversal(null);
                            setConfirmed(false);
                        }}
                    >
                        Batal
                    </Button>
                </div>
            )}
            {note.status === 'POSTED' && (reversal || invoice) && (
                <fieldset
                    disabled={pending}
                    className="space-y-3 rounded-lg border p-4"
                >
                    <Label htmlFor="credit-date">Tanggal transaksi</Label>
                    <Input
                        id="credit-date"
                        type="date"
                        value={date}
                        onChange={(e) => {
                            setDate(e.target.value);
                            setConfirmed(false);
                        }}
                    />
                    <Label htmlFor="credit-reason">
                        Alasan (minimal 10 karakter)
                    </Label>
                    <Input
                        id="credit-reason"
                        value={reason}
                        onChange={(e) => {
                            setReason(e.target.value);
                            setConfirmed(false);
                        }}
                    />
                    <label className="flex min-h-11 gap-2">
                        <input
                            type="checkbox"
                            className="size-5"
                            checked={confirmed}
                            onChange={(e) => setConfirmed(e.target.checked)}
                        />
                        <span>
                            Saya telah memeriksa nominal, customer, tanggal dan
                            dampak transaksi ini. Tidak ada kas yang
                            diterima/dikembalikan.
                        </span>
                    </label>
                    <Button
                        variant={reversal ? 'destructive' : 'default'}
                        disabled={
                            !confirmed ||
                            reason.trim().length < 10 ||
                            !date ||
                            (!reversal &&
                                (!amount ||
                                    Number(amount) <= 0 ||
                                    Number(amount) > Number(note.remaining) ||
                                    Number(amount) >
                                        Number(invoice?.remaining ?? 0)))
                        }
                        onClick={submit}
                    >
                        {pending
                            ? 'Memproses…'
                            : reversal
                              ? 'Konfirmasi pembalikan'
                              : 'Konfirmasi pemakaian kredit'}
                    </Button>
                </fieldset>
            )}
            {message && <p role="alert">{message}</p>}
            <section className="space-y-3">
                <h2 className="font-semibold">Riwayat pemakaian</h2>
                {!note.applications.length && <p>Belum ada pemakaian.</p>}
                {note.applications.map((a) => (
                    <div key={a.id} className="space-y-1 rounded border p-3">
                        <p>
                            {a.orderNumber} · {a.invoiceNumber} · {a.customer}
                        </p>
                        <p>
                            {formatRupiah(Number(a.total))} ·{' '}
                            {a.status === 'POSTED' ? 'Terpakai' : 'Dibalik'}
                        </p>
                        <p>
                            {toBusinessDateString(new Date(a.date))} ·{' '}
                            {a.reason}
                        </p>
                        {a.reversalReason && (
                            <p>Pembalikan: {a.reversalReason}</p>
                        )}
                        {a.status === 'POSTED' && (
                            <Button
                                variant="outline"
                                disabled={pending}
                                onClick={() => {
                                    setReversal({
                                        id: a.id,
                                        type: 'application',
                                        amount: a.total,
                                    });
                                    setReason('');
                                    setConfirmed(false);
                                }}
                            >
                                Koreksi: balikkan pemakaian
                            </Button>
                        )}
                    </div>
                ))}
            </section>
            {note.status === 'POSTED' &&
                !note.applications.some((a) => a.status === 'POSTED') && (
                    <details>
                        <summary className="min-h-11 cursor-pointer py-3">
                            Koreksi penerbitan saldo kredit
                        </summary>
                        <p>
                            Hanya bila penerbitan salah. Bukan langkah untuk
                            memakai saldo.
                        </p>
                        <Button
                            variant="destructive"
                            disabled={pending}
                            onClick={() => {
                                setReversal({
                                    id: note.id,
                                    type: 'note',
                                    amount: note.total,
                                });
                                setReason('');
                                setConfirmed(false);
                            }}
                        >
                            Tinjau pembalikan saldo kredit
                        </Button>
                    </details>
                )}
            {canLink && <CustomerCreditIdentity note={note} />}
        </div>
    );
}
