'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { approveMaintenanceRequest, rejectMaintenanceRequest, startMaintenanceRequest, completeMaintenanceRequest } from '@/actions/production/maintenance';

type Res = { success: boolean; error?: string };

export function MaintenanceActions({ id, status, spareParts }: { id: string; status: string; spareParts: Array<{ id: string; name: string; fulfilled: boolean }> }) {
  const router = useRouter();
  const [text, setText] = useState('');
  const [assignee, setAssignee] = useState('');
  const [checked, setChecked] = useState<string[]>(spareParts.filter((s) => s.fulfilled).map((s) => s.id));
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<Res>, ok: string) => {
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
  const toggle = (sid: string) => setChecked((prev) => (prev.includes(sid) ? prev.filter((x) => x !== sid) : [...prev, sid]));
  return (
    <div className="flex flex-col gap-3">
      {status === 'PENDING' && (
        <>
          <input value={assignee} onChange={(e) => setAssignee(e.target.value)} className="rounded border px-3 py-2 text-sm" placeholder="Teknisi pelaksana (nama)" />
          <div className="flex gap-2">
            <button disabled={busy} onClick={() => run(() => approveMaintenanceRequest(id, assignee), 'Disetujui + teknisi ditunjuk.')} className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Setujui</button>
            <button disabled={busy} onClick={() => run(() => rejectMaintenanceRequest(id, text), 'Ditolak.')} className="rounded-full border px-4 py-2 text-sm disabled:opacity-50">Tolak</button>
          </div>
          <input value={text} onChange={(e) => setText(e.target.value)} className="rounded border px-3 py-2 text-sm" placeholder="Alasan tolak (wajib bila menolak)" />
        </>
      )}
      {status === 'APPROVED' && (
        <button disabled={busy} onClick={() => run(() => startMaintenanceRequest(id), 'Dikerjakan.')} className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Mulai kerjakan</button>
      )}
      {status === 'IN_PROGRESS' && (
        <>
          {spareParts.length > 0 && (
            <div className="rounded-xl border p-3 space-y-1">
              <p className="text-xs font-semibold">Spare part terpasang:</p>
              {spareParts.map((s) => (
                <label key={s.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={checked.includes(s.id)} onChange={() => toggle(s.id)} /> {s.name}
                </label>
              ))}
            </div>
          )}
          <textarea value={text} onChange={(e) => setText(e.target.value)} className="rounded border px-3 py-2 text-sm" placeholder="Hasil perbaikan (wajib)" />
          <button disabled={busy} onClick={() => run(() => completeMaintenanceRequest(id, text, checked), 'Selesai. Owner menerima FYI.')} className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Selesaikan</button>
        </>
      )}
      {msg && <p className="text-sm">{msg}</p>}
    </div>
  );
}
