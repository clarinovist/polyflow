'use client';
import { useState, useTransition } from 'react';
import {
    inspectForwardCostPeriod,
    activateForwardCostPeriod,
} from '@/actions/finance/production-cost-recovery';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

type Preview = Extract<
    Awaited<ReturnType<typeof inspectForwardCostPeriod>>,
    { success: true }
>['data'];
export function ForwardCostPeriod({ orderId }: { orderId: string }) {
    const [preview, setPreview] = useState<Preview | null>(null),
        [reason, setReason] = useState(''),
        [confirmed, setConfirmed] = useState(false),
        [message, setMessage] = useState(''),
        [uncertain, setUncertain] = useState(false);
    const [pending, start] = useTransition();
    const inspect = () =>
        start(async () => {
            setPreview(null);
            setConfirmed(false);
            setMessage('');
            setUncertain(false);
            try {
                const r = await inspectForwardCostPeriod({ orderId });
                if (r.success) setPreview(r.data);
                else setMessage(r.error);
            } catch {
                setMessage(
                    'Pemeriksaan belum berhasil. Tidak ada aktivasi dikirim.',
                );
            }
        });
    const activate = () =>
        start(async () => {
            if (!preview) return;
            try {
                const r = await activateForwardCostPeriod({
                    orderId,
                    fingerprint: preview.fingerprint,
                    reason,
                    confirmed,
                });
                if (r.success) {
                    setMessage(
                        'Batas biaya sudah tercatat. Periksa biaya ulang sebelum mencatat hasil baru. Riwayat lama tidak diubah.',
                    );
                    setPreview(null);
                    setConfirmed(false);
                    setUncertain(false);
                } else {
                    setMessage(r.error);
                    setPreview(null);
                    setConfirmed(false);
                }
            } catch {
                setUncertain(true);
                setMessage(
                    'Konfirmasi belum diterima. Periksa ulang atau kirim permintaan yang sama; jangan buat batas berbeda.',
                );
            }
        });
    return (
        <section
            className="space-y-3 rounded-md border p-4"
            aria-label="Lanjutkan tanpa koreksi riwayat"
        >
            <h4 className="font-semibold">
                Lanjutkan tanpa mengubah biaya lama
            </h4>
            <p className="text-sm">
                Buat batas biaya yang disetujui Finance: hasil berikutnya hanya
                memakai biaya bahan setelah batas. Nilai stok, affal, HPP dan
                jurnal lama tetap utuh. Ini bukan rekonsiliasi biaya historis.
            </p>
            <Button
                type="button"
                variant="outline"
                className="min-h-11"
                disabled={pending}
                onClick={inspect}
            >
                Periksa kelayakan batas biaya
            </Button>
            {message && (
                <p role="status" className="text-sm">
                    {message}
                </p>
            )}
            {preview &&
                (preview.alreadyApplied ? (
                    <p>
                        Batas sudah aktif. Jangan aktifkan ulang; periksa
                        kondisi SPK terkini.
                    </p>
                ) : (
                    <div className="space-y-3">
                        <ul className="list-disc pl-5 space-y-2 text-sm">
                            <li>
                                {preview.outputCount} hasil dan{' '}
                                {preview.movementCount} mutasi lama tetap
                                tersimpan tanpa perubahan nilai.
                            </li>
                            <li>
                                Biaya lama Rp{preview.historicalAmount} tetap
                                tercatat terpisah dan tidak dibebankan ke hasil
                                baru.
                            </li>
                            <li>
                                Hasil lama tidak dibatalkan. Pembatalannya
                                memerlukan pemeriksaan khusus.
                            </li>
                        </ul>
                        {!preview.storageReady && (
                            <p role="alert">
                                Cadangan pemulihan belum tersedia. Aktivasi
                                diblokir.
                            </p>
                        )}
                        <Label htmlFor="period-reason">
                            Alasan batas biaya (minimal 12 karakter)
                        </Label>
                        <Textarea
                            id="period-reason"
                            value={reason}
                            maxLength={1000}
                            disabled={pending || uncertain}
                            onChange={(e) => setReason(e.target.value)}
                        />
                        <label className="flex items-start gap-3 min-h-11 text-sm">
                            <input
                                type="checkbox"
                                className="mt-1 h-5 w-5"
                                checked={confirmed}
                                disabled={pending || uncertain}
                                onChange={(e) => setConfirmed(e.target.checked)}
                            />
                            <span>
                                Saya menyetujui: catatan lama tetap utuh dan
                                biaya lama tidak dibebankan ke hasil baru. Ini
                                bukan penghapusan atau koreksi biaya lama.
                            </span>
                        </label>
                        <Button
                            type="button"
                            className="min-h-11"
                            onClick={activate}
                            disabled={
                                pending ||
                                !preview.storageReady ||
                                !confirmed ||
                                reason.trim().length < 12
                            }
                        >
                            {uncertain
                                ? 'Ulangi aktivasi yang sama'
                                : 'Aktifkan batas biaya baru'}
                        </Button>
                    </div>
                ))}
        </section>
    );
}
