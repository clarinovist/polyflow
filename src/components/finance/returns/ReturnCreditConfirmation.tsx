'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
    getFinanceReturnCreditProposal,
    postFinanceProposedReturnCredit,
} from '@/actions/finance/sales-returns';
import type { ReturnCreditProposal } from '@/services/finance/return-credit-proposal-service';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toBusinessDateString } from '@/lib/utils/timezone';
import { formatRupiah } from '@/lib/utils/utils';

export function ReturnCreditConfirmation({ returnId }: { returnId: string }) {
    const router = useRouter();
    const [proposal, setProposal] = useState<ReturnCreditProposal | null>(null);
    const [message, setMessage] = useState('');
    const [date, setDate] = useState(toBusinessDateString(new Date()));
    const [pending, startTransition] = useTransition();
    const [reload, setReload] = useState(0);
    const [posted, setPosted] = useState(false);
    const sending = useRef(false);
    useEffect(() => {
        let cancelled = false;
        getFinanceReturnCreditProposal(returnId)
            .then((result) => {
                if (cancelled) return;
                if (result.success) setProposal(result.data);
                else
                    setMessage(
                        result.error ||
                            'Usulan kredit gagal dimuat. Coba muat ulang.',
                    );
            })
            .catch(() => {
                if (!cancelled)
                    setMessage('Usulan kredit gagal dimuat. Coba muat ulang.');
            });
        return () => {
            cancelled = true;
        };
    }, [returnId, reload]);
    const submit = () => {
        if (!proposal?.ready || sending.current || posted || !date) return;
        sending.current = true;
        startTransition(async () => {
            setMessage('');
            try {
                const result = await postFinanceProposedReturnCredit({
                    returnId,
                    fingerprint: proposal.fingerprint,
                    postingDate: `${date}T00:00:00+07:00`,
                    confirmed: true,
                });
                if (!result.success) {
                    setMessage(
                        result.error ||
                            'Posting gagal. Piutang belum berubah; periksa kembali.',
                    );
                    return;
                }
                setPosted(true);
                setMessage(
                    'Kredit terposting dan sisa piutang invoice sudah berkurang.',
                );
                router.refresh();
            } catch {
                setMessage(
                    'Hasil posting belum dapat dipastikan. Muat ulang sebelum mencoba lagi; jangan membuat transaksi pengganti.',
                );
            } finally {
                sending.current = false;
            }
        });
    };
    return (
        <section
            aria-labelledby="return-confirm-title"
            className="space-y-3 rounded-lg border p-4"
        >
            <h3 id="return-confirm-title" className="font-semibold">
                Konfirmasi pengurangan piutang
            </h3>
            {!proposal && !message && (
                <p role="status">
                    Menyiapkan invoice dan nominal dari dokumen terkait…
                </p>
            )}
            {proposal?.ready === false && (
                <p role="status">
                    {proposal.reason} Gunakan opsi pemeriksaan manual di bawah
                    bila diperlukan.
                </p>
            )}
            {proposal?.ready && (
                <>
                    <dl className="grid gap-3 break-words text-sm sm:grid-cols-2">
                        <div>
                            <dt className="text-muted-foreground">
                                SO → Invoice tujuan
                            </dt>
                            <dd>
                                {proposal.orderNumber} →{' '}
                                {proposal.invoiceNumber}
                            </dd>
                        </div>
                        <div>
                            <dt className="text-muted-foreground">
                                Sisa tagihan saat ini
                            </dt>
                            <dd>{formatRupiah(Number(proposal.remaining))}</dd>
                        </div>
                        <div>
                            <dt className="text-muted-foreground">
                                Kredit retur (termasuk pajak)
                            </dt>
                            <dd className="font-semibold">
                                {formatRupiah(Number(proposal.totalAmount))}
                            </dd>
                            <dd className="text-xs text-muted-foreground">
                                Pajak {formatRupiah(Number(proposal.taxAmount))}{' '}
                                sudah termasuk, tidak ditambahkan lagi.
                            </dd>
                        </div>
                        <div>
                            <dt className="text-muted-foreground">
                                Sisa tagihan setelah posting
                            </dt>
                            <dd className="text-lg font-bold">
                                {formatRupiah(Number(proposal.remainingAfter))}
                            </dd>
                        </div>
                    </dl>
                    <p className="text-xs text-muted-foreground">
                        {proposal.source === 'SNAPSHOT'
                            ? 'Nominal disiapkan dari snapshot invoice asal dan jumlah barang retur.'
                            : 'Snapshot historis tidak tersedia. Nominal ini usulan dari rincian SO saat ini yang cocok dengan total/pajak invoice. Periksa kesesuaiannya sebelum menyetujui.'}{' '}
                        Alasan dan referensi dokumen dicatat otomatis saat Anda
                        menyetujui.
                    </p>
                    <div className="space-y-1">
                        <Label htmlFor="proposed-posting-date">
                            Tanggal posting
                        </Label>
                        <Input
                            id="proposed-posting-date"
                            type="date"
                            value={date}
                            disabled={pending || posted}
                            onChange={(event) => setDate(event.target.value)}
                            className="max-w-xs"
                        />
                    </div>
                    <p className="text-sm">
                        Dengan menekan tombol di bawah, Finance menyetujui
                        invoice dan nominal tersebut. Sisa piutang langsung
                        berkurang setelah posting berhasil; stok dan pembayaran
                        tidak berubah.
                    </p>
                    <Button
                        onClick={submit}
                        className="h-auto min-h-11 whitespace-normal"
                        disabled={pending || posted || !date}
                    >
                        {pending
                            ? 'Memposting…'
                            : posted
                              ? 'Kredit sudah terposting'
                              : 'Konfirmasi & posting kredit retur'}
                    </Button>
                </>
            )}
            {message && (
                <p role="alert" className="break-words">
                    {message}
                </p>
            )}
            {!posted && !pending && (
                <Button
                    variant="outline"
                    onClick={() => {
                        setProposal(null);
                        setMessage('');
                        setReload((value) => value + 1);
                    }}
                >
                    Muat ulang usulan
                </Button>
            )}
        </section>
    );
}
