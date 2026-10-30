'use client';

import { useState, useTransition } from 'react';
import {
    previewAtkRecoveryAction,
    applyAtkRecoveryAction,
    getAtkRecoveryReceiptAction,
} from '@/actions/finance/inventory-reconciliation';
import type {
    AtkRecoveryApply,
    AtkRecoveryPreview,
    AtkRecoveryReceipt,
} from '@/types/atk-recovery';
import type { InventoryReconciliationDiagnosis } from '@/types/inventory-reconciliation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { savePendingAtkRecovery, clearPendingAtkRecovery } from './atk-recovery-pending';

const unitCost = (value: string) => new Intl.NumberFormat('id-ID', { minimumFractionDigits: 4, maximumFractionDigits: 4 }).format(Number(value));
const money = (value: string) =>
    new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
    }).format(Number(value));

export function AtkCostRecovery({
    data, recoveryScope,
}: {
    data: InventoryReconciliationDiagnosis;
    recoveryScope: string;
}) {
    const [source, setSource] = useState('');
    const [kind, setKind] = useState<'REFUND' | 'COMPENSATION'>('REFUND');
    const [preview, setPreview] = useState<AtkRecoveryPreview | null>(null);
    const [reason, setReason] = useState('');
    const [confirmed, setConfirmed] = useState(false);
    const [pending, startTransition] = useTransition();
    const [error, setError] = useState('');
    const [receipt, setReceipt] = useState<AtkRecoveryReceipt | null>(null);
    const [sent, setSent] = useState<AtkRecoveryApply | null>(null);
    const [uncertain, setUncertain] = useState(false);
    const [lookupId, setLookupId] = useState('');
    const [lookupMessage, setLookupMessage] = useState('');
    const sources = data.movements.filter(
        (m) => m.type === 'ADJUSTMENT' && m.from && !m.to,
    );
    const proposal = preview?.proposal;

    function reset() {
        setPreview(null);
        setReceipt(null);
        setError('');
        setConfirmed(false);
        setReason('');
        setSent(null);
    }
    function inspect() {
        reset();
        startTransition(async () => {
            try {
                const result = await previewAtkRecoveryAction({
                    sourceMovementId: source,
                    kind,
                });
                if (result.success) {
                    setPreview(result.data);
                    setReceipt(result.data.receipt ?? null);
                } else setError(result.error);
            } catch {
                setError(
                    'Preview belum dapat diperiksa. Tidak ada koreksi dikirim.',
                );
            }
        });
    }
    function apply(input?: AtkRecoveryApply) {
        if (!proposal && !input) return;
        const request = input ?? {
            sourceMovementId: source,
            kind,
            requestId: crypto.randomUUID(),
            fingerprint: proposal!.fingerprint,
            postingDate: proposal!.postingDate,
            reason,
            confirmed: true as const,
        };
        try { savePendingAtkRecovery(recoveryScope, request); }
        catch { setError('Nomor permintaan tidak dapat disimpan di browser. Koreksi belum dikirim.'); return; }
        setSent(request);
        setLookupId(request.requestId);
        setError('');
        startTransition(async () => {
            try {
                const result = await applyAtkRecoveryAction(request);
                if (result.success) {
                    clearPendingAtkRecovery(recoveryScope, request.requestId);
                    setReceipt(result.data);
                    setPreview(null);
                    setConfirmed(false);
                    setUncertain(false);
                } else {
                    setError(
                        `${result.error} Periksa nomor permintaan sebelum membuat koreksi lain.`,
                    );
                    const rejected = [
                        'ATK_RECOVERY_BLOCKED',
                        'PURCHASE_PRICE_CORRECTED',
                        'ATK_BACKUP_FAILED',
                        'VALIDATION_ERROR',
                        'AUTHORIZATION_ERROR',
                        'FISCAL_PERIOD_CLOSED',
                    ].includes(result.code ?? '');
                    setUncertain(!rejected);
                    if (rejected) {
                        clearPendingAtkRecovery(recoveryScope, request.requestId);
                        setPreview(null);
                        setConfirmed(false);
                    }
                }
            } catch {
                setUncertain(true);
                setError(
                    'Konfirmasi belum diterima. Status belum diketahui; periksa nomor permintaan atau ulangi permintaan yang sama.',
                );
            }
        });
    }
    function lookup() {
        setLookupMessage('');
        setError('');
        startTransition(async () => {
            try {
                const result = await getAtkRecoveryReceiptAction({
                    requestId: lookupId,
                });
                if (!result.success) {
                    setError(result.error);
                    return;
                }
                if (result.data) {
                    setReceipt(result.data);
                    if (!sent || lookupId === sent.requestId) {
                        clearPendingAtkRecovery(recoveryScope, lookupId);
                        setPreview(null);
                        setUncertain(false);
                        setConfirmed(false);
                    }
                } else {
                    setLookupMessage(
                        'Belum ada bukti untuk nomor ini. Permintaan lain mungkin masih berjalan; jangan langsung membuat permintaan baru.',
                    );
                }
            } catch {
                setError(
                    'Pemeriksaan bukti belum berhasil; jangan membuat koreksi berbeda.',
                );
            }
        });
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Pemulihan biaya ATK terbatas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4" aria-busy={pending}>
                <p className="text-sm">
                    Hanya kelebihan pembebanan loss dengan biaya penerimaan
                    konstan yang terbukti, satu lokasi, dan periode OPEN yang
                    sama. Tidak mengisi biaya nol atau menautkan saldo awal.
                    Kuantitas dan WAC tidak berubah.
                </p>
                <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-2">
                        <Label htmlFor="atk-source">Mutasi loss sumber</Label>
                        <select
                            id="atk-source"
                            className="min-h-11 w-full rounded-md border bg-background px-3"
                            value={source}
                            disabled={pending || uncertain}
                            onChange={(event) => {
                                setSource(event.target.value);
                                reset();
                            }}
                        >
                            <option value="">Pilih mutasi</option>
                            {sources.map((m) => (
                                <option key={m.id} value={m.id}>
                                    {new Date(m.createdAt).toLocaleDateString(
                                        'id-ID',
                                        { timeZone: 'Asia/Jakarta' },
                                    )}{' '}
                                    · {m.quantity} {data.variant.unit} · {m.id}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="atk-kind">Tindakan</Label>
                        <select
                            id="atk-kind"
                            className="min-h-11 w-full rounded-md border bg-background px-3"
                            value={kind}
                            disabled={pending || uncertain}
                            onChange={(event) => {
                                setKind(event.target.value as typeof kind);
                                reset();
                            }}
                        >
                            <option value="REFUND">
                                Kembalikan kelebihan pembebanan
                            </option>
                            <option value="COMPENSATION">
                                Balikkan koreksi yang tercatat
                            </option>
                        </select>
                    </div>
                </div>
                {!sources.length && (
                    <p>
                        Tidak ada loss pada cuplikan mutasi ini. Bukan bukti
                        tidak ada loss historis; cakupan riwayat tetap berlaku.
                    </p>
                )}
                <Button
                    type="button"
                    className="min-h-11"
                    disabled={pending || uncertain || !source}
                    onClick={inspect}
                >
                    Periksa usulan koreksi
                </Button>
                {error && (
                    <p role="alert" className="text-sm text-destructive">
                        {error}
                    </p>
                )}
                {preview && <p role="status">{preview.message}</p>}
                {proposal && (
                    <div className="space-y-3 rounded-md border p-4">
                        <h3 className="font-medium">
                            Preview{' '}
                            {kind === 'REFUND'
                                ? 'pengembalian kelebihan biaya'
                                : 'pembalikan koreksi'}
                        </h3>
                        <dl className="grid gap-2 sm:grid-cols-2">
                            <div>
                                <dt>Nilai loss jurnal asal</dt>
                                <dd>{money(proposal.originalLoss)}</dd>
                            </div>
                            <div>
                                <dt>Nilai loss berdasarkan sumber</dt>
                                <dd>{money(proposal.expectedLoss)}</dd>
                            </div>
                            <div>
                                <dt>Biaya historis per unit</dt>
                                <dd>Rp{unitCost(proposal.unitCost)}</dd>
                            </div>
                            <div>
                                <dt>Nilai koreksi</dt>
                                <dd>{money(proposal.amount)}</dd>
                            </div>
                        </dl>
                        <p>
                            Debit{' '}
                            {kind === 'REFUND'
                                ? proposal.inventoryAccount
                                : proposal.lossAccount}
                            ; kredit{' '}
                            {kind === 'REFUND'
                                ? proposal.lossAccount
                                : proposal.inventoryAccount}
                            : {money(proposal.amount)}. Posting{' '}
                            {proposal.postingDate} (WIB).
                        </p>
                        <p>
                            Perubahan kuantitas: 0. Perubahan WAC: 0. Basis SKU
                            dan saldo akun persediaan{' '}
                            {kind === 'REFUND' ? 'bertambah' : 'berkurang'}{' '}
                            {money(proposal.amount)}.
                        </p>
                        {!proposal.backupReady && (
                            <p role="alert">
                                Penyimpanan backup belum siap. Koreksi tidak
                                dapat diterapkan.
                            </p>
                        )}
                        <Label htmlFor="atk-reason">
                            Alasan dan bukti yang diperiksa (minimal 12
                            karakter)
                        </Label>
                        <Textarea
                            id="atk-reason"
                            value={reason}
                            maxLength={1000}
                            disabled={pending || uncertain}
                            onChange={(event) => {
                                setReason(event.target.value);
                                setConfirmed(false);
                            }}
                        />
                        <label className="flex min-h-11 items-center gap-2">
                            <input
                                type="checkbox"
                                checked={confirmed}
                                disabled={pending || uncertain}
                                onChange={(event) =>
                                    setConfirmed(event.target.checked)
                                }
                            />
                            Saya memeriksa sumber, akun, tanggal, dan dampak
                            koreksi ini.
                        </label>
                        <p className="text-sm text-muted-foreground">
                            Sumber akan dilindungi dari edit/hapus. Pembalikan
                            hanya bila belum ada perubahan stok/sumber setelah
                            koreksi dan periode masih sama/OPEN. Saat transaksi
                            lain aktif, koreksi dapat ditolak untuk diperiksa
                            ulang.
                        </p>
                        <Button
                            type="button"
                            className="min-h-11"
                            disabled={
                                pending ||
                                uncertain ||
                                !confirmed ||
                                reason.trim().length < 12 ||
                                !proposal.backupReady
                            }
                            onClick={() => apply()}
                        >
                            Setujui dan terapkan koreksi
                        </Button>
                    </div>
                )}
                {sent && (
                    <p className="break-all text-sm">
                        Nomor permintaan: {sent.requestId}. Simpan nomor ini
                        untuk memeriksa hasil setelah koneksi terputus.
                    </p>
                )}
                {uncertain && sent && (
                    <Button
                        type="button"
                        variant="outline"
                        disabled={pending}
                        onClick={() => apply(sent)}
                    >
                        Ulangi permintaan yang sama
                    </Button>
                )}
                <div className="space-y-2 border-t pt-3">
                    <Label htmlFor="atk-receipt">
                        Periksa nomor permintaan
                    </Label>
                    <Input
                        id="atk-receipt"
                        value={lookupId}
                        disabled={pending}
                        onChange={(event) => setLookupId(event.target.value)}
                    />
                    <Button
                        type="button"
                        variant="outline"
                        disabled={pending || !lookupId}
                        onClick={lookup}
                    >
                        Periksa bukti tersimpan
                    </Button>
                    {lookupMessage && <p role="status">{lookupMessage}</p>}
                </div>
                {receipt && (
                    <div
                        role="status"
                        className="space-y-2 rounded-md border p-3 text-sm"
                    >
                        <p>
                            {receipt.alreadyApplied
                                ? 'Koreksi ini sudah tercatat; tidak diterapkan dua kali.'
                                : 'Koreksi tersimpan dan diverifikasi atomik.'}
                        </p>
                        <p className="break-all">
                            Bukti {receipt.id} · jurnal {receipt.journalId} ·{' '}
                            {receipt.kind} · {money(receipt.amount)}
                        </p>
                        <p>
                            Periksa ulang diagnosis untuk angka terkini.
                            Kesiapan pemakaian tetap diperiksa terpisah; koreksi
                            tidak otomatis menyimpan transaksi gudang.
                        </p>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
