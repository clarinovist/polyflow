'use client';

import { useState, useTransition } from 'react';
import {
    inspectProductionCost,
    applyProductionCost,
} from '@/actions/finance/production-cost-recovery';
import type {
    ProductionCostRecoveryInspection,
    ProductionCostRecoveryResult,
} from '@/lib/production/cost-recovery';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ForwardCostPeriod } from './ForwardCostPeriod';
const rupiah = (value: string) =>
    new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(Number(value));

const titles = {
    eligible: 'Usulan koreksi terbatas tersedia',
    needs_review:
        'Perlu tinjauan Finance — gunakan bagian "Lanjutkan tanpa mengubah biaya lama"',
    unsupported: 'Koreksi riwayat ini belum didukung',
    already_applied: 'Koreksi terdahulu tercatat',
    no_repair: 'Tidak ada kandidat koreksi affal',
};

export function ProductionCostRecovery({ orderId }: { orderId?: string }) {
    const [pending, startTransition] = useTransition();
    const [number, setNumber] = useState('');
    const [inspection, setInspection] =
        useState<ProductionCostRecoveryInspection | null>(null);
    const [reason, setReason] = useState('');
    const [confirmed, setConfirmed] = useState(false);
    const [error, setError] = useState('');
    const [receipt, setReceipt] = useState<ProductionCostRecoveryResult | null>(
        null,
    );
    const [uncertain, setUncertain] = useState(false);

    function inspect() {
        startTransition(async () => {
            setError('');
            setConfirmed(false);
            setInspection(null);
            setReason('');
            try {
                const result = await inspectProductionCost(
                    orderId ? { orderId } : { orderNumber: number },
                );
                if (result.success) {
                    setInspection(result.data);
                    setUncertain(false);
                } else setError(result.error);
            } catch {
                setError(
                    'Pemeriksaan belum berhasil. Coba periksa ulang; tidak ada koreksi yang dikirim.',
                );
            }
        });
    }
    function apply() {
        if (!inspection?.proposal) return;
        const current = inspection;
        startTransition(async () => {
            setError('');
            try {
                const result = await applyProductionCost({
                    orderId: current.orderId,
                    fingerprint: current.proposal!.fingerprint,
                    reason,
                    confirmed,
                });
                if (result.success) {
                    setReceipt(result.data);
                    setInspection(null);
                    setConfirmed(false);
                    setUncertain(false);
                } else {
                    setError(
                        `${result.error} Periksa ulang sebelum mencoba lagi.`,
                    );
                    setInspection(null);
                    setConfirmed(false);
                }
            } catch {
                setUncertain(true);
                setError(
                    'Konfirmasi belum diterima. Periksa riwayat terlebih dahulu, atau ulangi permintaan yang sama; jangan membuat koreksi berbeda.',
                );
            }
        });
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Pemeriksaan & pemulihan biaya SPK</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                    Koreksi biaya tidak mengubah jumlah produksi, bahan, atau
                    affal. Pemeriksaan ini tidak menggantikan pemeriksaan
                    material saat menyimpan hasil baru.
                </p>
                {!orderId && (
                    <div className="space-y-2">
                        <Label htmlFor="recovery-order">Nomor SPK persis</Label>
                        <Input
                            id="recovery-order"
                            value={number}
                            disabled={pending}
                            onChange={(e) => {
                                setNumber(e.target.value);
                                setInspection(null);
                                setReceipt(null);
                                setConfirmed(false);
                                setUncertain(false);
                                setReason('');
                            }}
                        />
                    </div>
                )}
                <Button
                    type="button"
                    className="min-h-11"
                    onClick={inspect}
                    disabled={pending || (!orderId && !number.trim())}
                >
                    {pending ? 'Memproses…' : 'Periksa biaya'}
                </Button>
                {error && (
                    <p role="alert" className="text-sm text-destructive">
                        {error}
                    </p>
                )}
                {receipt && (
                    <div
                        role="status"
                        className="rounded-md border p-3 text-sm space-y-1"
                    >
                        <p>
                            {receipt.alreadyApplied
                                ? 'Permintaan yang sama sudah tercatat; tidak diterapkan dua kali.'
                                : 'Koreksi tersimpan. Jumlah, nilai persediaan, jurnal, dan sisa biaya diverifikasi di dalam transaksi.'}
                        </p>
                        <p className="break-all">
                            Bukti audit: {receipt.auditId}
                        </p>
                        <p>
                            Periksa biaya kembali untuk melihat kondisi SPK saat
                            ini. Hanya masukkan hasil baru yang belum tersimpan.
                        </p>
                    </div>
                )}
                {inspection && (
                    <section
                        aria-label="Hasil pemeriksaan biaya"
                        className="space-y-3"
                    >
                        <h3 className="font-semibold">
                            {inspection.orderNumber} —{' '}
                            {titles[inspection.status]}
                        </h3>
                        <p className="text-sm">
                            Sudah tersimpan:{' '}
                            <strong>
                                {inspection.savedQuantity} {inspection.unit}
                            </strong>{' '}
                            dari {inspection.outputEntries} pencatatan hasil.
                            Ini total kumulatif, bukan isian hasil baru.
                        </p>
                        <p className="text-xs text-muted-foreground">
                            Diperiksa:{' '}
                            {new Date(inspection.checkedAt).toLocaleString(
                                'id-ID',
                                { timeZone: 'Asia/Jakarta' },
                            )}{' '}
                            WIB · {inspection.nullCostScraps} catatan affal
                            dengan biaya kosong.
                        </p>
                        <ul className="list-disc pl-5 space-y-2 text-sm">
                            {inspection.findings.map((finding, i) => (
                                <li key={i}>{finding}</li>
                            ))}
                        </ul>
                        {inspection.wip.valid && (
                            <p className="text-sm">
                                Sisa biaya menurut sumber jurnal:{' '}
                                {rupiah(inspection.wip.remaining!)}. Bukan
                                nominal usulan jurnal koreksi.
                            </p>
                        )}
                        {inspection.previousAuditId && (
                            <p className="text-xs break-all">
                                Audit terdahulu: {inspection.previousAuditId}
                            </p>
                        )}
                        {['unsupported', 'needs_review'].includes(inspection.status) && <ForwardCostPeriod key={inspection.orderId} orderId={inspection.orderId} />}
                    {inspection.proposal && (
                            <div className="space-y-3 rounded-md border p-4">
                                <h4 className="font-medium">
                                    Preview: biaya affal kosong → Rp0
                                </h4>
                                <p className="text-sm">
                                    {inspection.proposal.scraps.length} catatan
                                    ditautkan ke hasil asal. Biaya bahan{' '}
                                    {rupiah(inspection.proposal.absorbedValue)}{' '}
                                    sudah terserap penuh. Perubahan jumlah
                                    fisik, nilai persediaan, dan jurnal:{' '}
                                    <strong>0</strong>.
                                </p>
                                <ul className="list-disc pl-5 text-xs space-y-1">
                                    {inspection.proposal.scraps.map((scrap) => (
                                        <li
                                            key={scrap.movementId}
                                            className="break-all"
                                        >
                                            Mutasi {scrap.movementId} · jumlah
                                            tetap {scrap.quantity}
                                        </li>
                                    ))}
                                </ul>
                                <p className="text-sm text-muted-foreground">
                                    Server harus menyimpan dan memverifikasi
                                    cadangan catatan asal sebelum menerapkan.
                                    Jika data berubah atau cadangan gagal,
                                    koreksi dibatalkan.
                                </p>
                                <Label htmlFor="recovery-reason">
                                    Alasan koreksi (minimal 12 karakter)
                                </Label>
                                <Textarea
                                    id="recovery-reason"
                                    value={reason}
                                    maxLength={1000}
                                    disabled={pending || uncertain}
                                    onChange={(e) => setReason(e.target.value)}
                                />
                                <label className="flex min-h-11 items-start gap-3 text-sm">
                                    <input
                                        type="checkbox"
                                        checked={confirmed}
                                        disabled={pending || uncertain}
                                        onChange={(e) =>
                                            setConfirmed(e.target.checked)
                                        }
                                        className="mt-1 h-5 w-5"
                                    />
                                    <span>
                                        Saya menyetujui perubahan pada preview
                                        ini, tanpa mengubah jumlah atau membuat
                                        jurnal penyeimbang.
                                    </span>
                                </label>
                                <Button
                                    type="button"
                                    className="min-h-11"
                                    onClick={apply}
                                    disabled={
                                        pending ||
                                        !confirmed ||
                                        reason.trim().length < 12 ||
                                        !inspection.proposal
                                            .recoveryStorageReady
                                    }
                                >
                                    {uncertain
                                        ? 'Ulangi permintaan yang sama'
                                        : 'Setujui & terapkan koreksi'}
                                </Button>
                            </div>
                        )}
                    </section>
                )}
            </CardContent>
        </Card>
    );
}
