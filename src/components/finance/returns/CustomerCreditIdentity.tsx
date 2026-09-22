'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
    approveFinanceCustomerCreditLink,
    revokeFinanceCustomerCreditLink,
    searchFinanceCreditCustomers,
} from '@/actions/finance/sales-returns';
import type { CustomerCreditDetail } from '@/services/finance/customer-credit-query-service';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function CustomerCreditIdentity({
    note,
}: {
    note: CustomerCreditDetail;
}) {
    const router = useRouter();
    const [pending, start] = useTransition();
    const [search, setSearch] = useState('');
    const [rows, setRows] = useState<
        { id: string; name: string; code: string | null }[]
    >([]);
    const [target, setTarget] = useState('');
    const [reason, setReason] = useState('');
    const [evidence, setEvidence] = useState('');
    const [confirmed, setConfirmed] = useState(false);
    const [message, setMessage] = useState('');
    const [revoke, setRevoke] = useState('');
    const find = () =>
        start(async () => {
            try {
                const r = await searchFinanceCreditCustomers(search);
                if (!r.success) {
                    setMessage(r.error ?? 'Pencarian gagal.');
                    return;
                }
                setRows(r.data.filter((c) => c.id !== note.customerId));
            } catch {
                setMessage('Pencarian gagal.');
            }
        });
    const submit = () =>
        start(async () => {
            try {
                const r = revoke
                    ? await revokeFinanceCustomerCreditLink({
                          id: revoke,
                          reason,
                          confirmed,
                      })
                    : await approveFinanceCustomerCreditLink({
                          fromCustomerId: note.customerId,
                          toCustomerId: target,
                          reason,
                          evidence,
                          confirmed,
                      });
                if (!r.success) {
                    setMessage(r.error ?? 'Verifikasi gagal.');
                    return;
                }
                setMessage(
                    'Verifikasi customer diperbarui. Muat ulang pencarian invoice tujuan.',
                );
                setConfirmed(false);
                setRevoke('');
                router.refresh();
            } catch {
                setMessage(
                    'Hasil belum pasti. Muat ulang dan periksa hubungan customer.',
                );
            }
        });
    return (
        <details className="rounded border p-4">
            <summary className="min-h-11 cursor-pointer font-semibold">
                Admin: verifikasi dua master pelanggan yang sama
            </summary>
            <div className="space-y-3 text-sm">
                <p>
                    Gunakan hanya bila ada bukti bahwa dua master mewakili
                    pelanggan yang sama. Ini mengizinkan penggunaan kredit di
                    kedua master, bukan penggabungan histori atau izin
                    antar-pelanggan.
                </p>
                {note.links.map((l) => (
                    <div key={l.id} className="rounded border p-2">
                        Terhubung: {l.customer} · {l.reason}
                        <Button
                            variant="outline"
                            className="ml-2"
                            disabled={pending}
                            onClick={() => {
                                setRevoke(l.id);
                                setReason('');
                                setConfirmed(false);
                            }}
                        >
                            Tinjau pencabutan
                        </Button>
                    </div>
                ))}
                {revoke ? (
                    <p role="alert">
                        Cabut izin penggunaan berikutnya. Pemakaian lama dan
                        buktinya tetap utuh.
                        <Button variant="outline" onClick={() => setRevoke('')}>
                            Batal
                        </Button>
                    </p>
                ) : (
                    <>
                        <Label htmlFor="identity-search">Cari customer</Label>
                        <Input
                            id="identity-search"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                        <Button
                            onClick={find}
                            disabled={pending || search.trim().length < 2}
                        >
                            Cari customer
                        </Button>
                        <Label htmlFor="identity-target">Master pasangan</Label>
                        <select
                            id="identity-target"
                            className="min-h-11 w-full rounded border p-2"
                            value={target}
                            onChange={(e) => {
                                setTarget(e.target.value);
                                setConfirmed(false);
                            }}
                        >
                            <option value="">Pilih customer</option>
                            {rows.map((c) => (
                                <option key={c.id} value={c.id}>
                                    {c.code} · {c.name}
                                </option>
                            ))}
                        </select>
                        <Label htmlFor="identity-evidence">
                            Bukti identitas yang sama
                        </Label>
                        <Input
                            id="identity-evidence"
                            value={evidence}
                            onChange={(e) => {
                                setEvidence(e.target.value);
                                setConfirmed(false);
                            }}
                        />
                    </>
                )}
                <Label htmlFor="identity-reason">
                    Alasan persetujuan/pencabutan
                </Label>
                <Input
                    id="identity-reason"
                    value={reason}
                    onChange={(e) => {
                        setReason(e.target.value);
                        setConfirmed(false);
                    }}
                />
                <label className="flex min-h-11 gap-2">
                    <input
                        className="size-5"
                        type="checkbox"
                        checked={confirmed}
                        onChange={(e) => setConfirmed(e.target.checked)}
                    />
                    <span>
                        {revoke
                            ? 'Saya menyetujui pencabutan izin untuk transaksi berikutnya.'
                            : `Saya memastikan ${note.customer} dan master terpilih adalah pelanggan yang sama berdasarkan bukti, dan menyetujui penggunaan kredit lintas kedua master.`}
                    </span>
                </label>
                <Button
                    disabled={
                        pending ||
                        !confirmed ||
                        reason.trim().length < 10 ||
                        (!revoke && (!target || evidence.trim().length < 10))
                    }
                    onClick={submit}
                >
                    {revoke ? 'Cabut verifikasi' : 'Setujui hubungan customer'}
                </Button>
                {message && <p role="alert">{message}</p>}
            </div>
        </details>
    );
}
