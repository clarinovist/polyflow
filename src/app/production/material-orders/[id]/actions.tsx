'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { approveMaterialOrder, rejectMaterialOrder } from '@/actions/production/material-orders';

export function MaterialOrderActions({ id }: { id: string }) {
  const router = useRouter();
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<{ success: boolean; error?: string }>, ok: string) => {
    if (busy) return;
    setBusy(true);
    setMsg('');
    try {
      const res = await fn();
      setMsg(res.success ? ok : res.error || 'Gagal.');
      if (res.success) router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Gagal.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <button disabled={busy} className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" onClick={() => run(() => approveMaterialOrder(id), 'Disetujui. Owner menerima FYI otomatis.')}>Setujui</button>
        <button disabled={busy} className="rounded-full border px-4 py-2 text-sm disabled:opacity-50" onClick={() => run(() => rejectMaterialOrder(id, reason), 'Ditolak.')}>Tolak</button>
      </div>
      <input className="rounded border px-3 py-2 text-sm" placeholder="Alasan tolak (wajib bila menolak)" value={reason} onChange={(e) => setReason(e.target.value)} />
      {msg && <p className="text-sm">{msg}</p>}
    </div>
  );
}
