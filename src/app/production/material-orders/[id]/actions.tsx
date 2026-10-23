'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useRouter } from 'next/navigation';
import { approveMaterialOrder, rejectMaterialOrder } from '@/actions/production/material-orders';

export function MaterialOrderActions({ id, canApprove, canReject }: { id: string; canApprove: boolean; canReject: boolean }) {
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
  if (!canApprove && !canReject) return <p className="text-sm text-muted-foreground">Tidak ada tindakan persetujuan yang tersedia untuk status atau akses Anda.</p>;
  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      {canReject && <div className="space-y-2">
        <Label htmlFor="mo-rejection-reason">Alasan penolakan (wajib jika menolak)</Label>
        <Input id="mo-rejection-reason" value={reason} disabled={busy} onChange={(e) => setReason(e.target.value)} />
      </div>}
      <div className="flex flex-wrap gap-2">
        {canApprove && <Button disabled={busy} className="min-h-11" onClick={() => run(() => approveMaterialOrder(id), 'Permintaan disetujui.')}>Setujui</Button>}
        {canReject && <Button variant="destructive" className="min-h-11" disabled={busy || !reason.trim()} onClick={() => run(() => rejectMaterialOrder(id, reason), 'Permintaan ditolak.')}>Tolak</Button>}
      </div>
      {msg && <p role="status" className="text-sm">{msg}</p>}
    </div>
  );
}
