'use client';

import { useState, useTransition } from 'react';
import { applyAtkRecoveryAction, getAtkRecoveryReceiptAction } from '@/actions/finance/inventory-reconciliation';
import { clearPendingAtkRecovery, usePendingAtkRecovery } from './atk-recovery-pending';
import { Button } from '@/components/ui/button';

/** Lives above the replaceable diagnosis. Restores the same request after refresh. */
export function AtkPendingRecovery({ scope }: { scope: string }) {
    const saved = usePendingAtkRecovery(scope);
    const [pending, startTransition] = useTransition();
    const [message, setMessage] = useState('');
    if (!saved.blocked) return message ? <p role="status">{message}</p> : null;
    const request = saved.request;
    if (!request) return <p role="alert">Catatan permintaan lokal tidak dapat dibaca. Jangan mengirim koreksi lain; minta admin memeriksa bukti tersimpan.</p>;
    function recover(retry: boolean) {
        if (!request) return;
        startTransition(async () => {
            try {
                const result = retry ? await applyAtkRecoveryAction(request) : await getAtkRecoveryReceiptAction({ requestId: request.requestId });
                if (result.success && result.data) {
                    clearPendingAtkRecovery(scope, request.requestId);
                    setMessage(`Koreksi tercatat: ${result.data.id}. Periksa ulang diagnosis sebelum transaksi berikutnya.`);
                } else if (result.success) setMessage('Bukti belum ditemukan. Permintaan mungkin masih berjalan; ulangi hanya permintaan yang sama.');
                else {
                    setMessage(result.error);
                    if (retry && ['ATK_RECOVERY_BLOCKED', 'ATK_BACKUP_FAILED', 'VALIDATION_ERROR', 'FISCAL_PERIOD_CLOSED'].includes(result.code ?? '')) clearPendingAtkRecovery(scope, request.requestId);
                }
            } catch { setMessage('Status belum diketahui. Nomor permintaan tetap disimpan; jangan membuat koreksi berbeda.'); }
        });
    }
    return <section aria-label="Permintaan koreksi belum terkonfirmasi" className="space-y-3 rounded-md border p-4">
        <p>Permintaan koreksi belum terkonfirmasi. Pencarian dan pergantian SKU dikunci sampai hasil diketahui.</p>
        <p className="break-all">Nomor permintaan: {request.requestId}</p>
        <Button type="button" disabled={pending} variant="outline" onClick={() => recover(false)}>Pulihkan bukti permintaan</Button>{' '}
        <Button type="button" disabled={pending} variant="outline" onClick={() => recover(true)}>Kirim ulang permintaan tersimpan</Button>
        {message && <p role="status">{message}</p>}
    </section>;
}
