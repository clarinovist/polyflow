'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { createMaintenanceRequest, submitMaintenanceRequest } from '@/actions/production/maintenance';

interface Sp { name: string; spec: string; quantity: string; note: string; productVariantId: string; sourceLocationId: string }
interface Catalog { id: string; name: string; skuCode: string }
interface Loc { id: string; name: string; slug: string }

export function MaintenanceForm({ machines, spareCatalog, locations }: { machines: Array<{ id: string; name: string; code: string; status: string }>; spareCatalog: Catalog[]; locations: Loc[] }) {
  const router = useRouter();
  const [machineId, setMachineId] = useState('');
  const [complaint, setComplaint] = useState('');
  const [urgency, setUrgency] = useState<'LOW' | 'NORMAL' | 'URGENT'>('NORMAL');
  const [stopped, setStopped] = useState(false);
  const [sps, setSps] = useState<Sp[]>([]);
  const [busy, setBusy] = useState(false);

  const addSp = () => setSps((p) => [...p, { name: '', spec: '', quantity: '', note: '', productVariantId: '', sourceLocationId: '' }]);
  const pickCatalog = (i: number, vid: string) => {
    const c = spareCatalog.find((x) => x.id === vid);
    updSp(i, { productVariantId: vid, ...(c ? { name: c.name } : {}) });
  };
  const updSp = (i: number, patch: Partial<Sp>) => setSps((p) => p.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  const delSp = (i: number) => setSps((p) => p.filter((_, idx) => idx !== i));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!machineId) {
      toast.error('Pilih mesin dulu');
      return;
    }
    if (complaint.trim().length < 5) {
      toast.error('Tulis keluhan minimal 5 karakter');
      return;
    }
    const spareParts = sps
      .filter((s) => s.name.trim() && parseFloat(s.quantity) > 0)
      .map((s) => ({
        ...(s.productVariantId ? { productVariantId: s.productVariantId } : {}),
        ...(s.sourceLocationId ? { sourceLocationId: s.sourceLocationId } : {}),
        name: s.name.trim(),
        ...(s.spec.trim() ? { spec: s.spec.trim() } : {}),
        quantity: parseFloat(s.quantity),
        ...(s.note.trim() ? { note: s.note.trim() } : {}),
      }));
    setBusy(true);
    try {
      const created = await createMaintenanceRequest({
        machineId, complaint: complaint.trim(), urgency,
        machineStopped: stopped,
        clientRequestId: crypto.randomUUID(),
        spareParts,
      });
      if (!created.success) {
        toast.error(created.error || 'Gagal membuat laporan');
        return;
      }
      const submitted = await submitMaintenanceRequest(created.data.id);
      if (!submitted.success) {
        toast.error(submitted.error || 'Laporan dibuat tapi gagal submit');
        router.push('/production/maintenance/' + created.data.id);
        return;
      }
      toast.success('Terkirim — ' + created.data.orderNumber);
      router.push('/production/maintenance/' + created.data.id);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal mengirim laporan');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="rounded-xl border bg-card p-4 space-y-3">
        <div>
          <label className="text-xs font-semibold">Mesin *</label>
          <select value={machineId} onChange={(e) => setMachineId(e.target.value)} className="mt-1 w-full rounded-md border px-3 py-2 text-sm">
            <option value="">Pilih mesin...</option>
            {machines.map((m) => (<option key={m.id} value={m.id}>{m.code} — {m.name} ({m.status})</option>))}
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold">Keluhan *</label>
          <textarea value={complaint} onChange={(e) => setComplaint(e.target.value)} className="mt-1 w-full rounded-md border px-3 py-2 text-sm" rows={3} placeholder="cth: gear bunyi kasar, hasil potongan miring" />
        </div>
        <div className="flex gap-2">
          {(['LOW', 'NORMAL', 'URGENT'] as const).map((u) => (
            <button key={u} type="button" onClick={() => setUrgency(u)} className={'flex-1 rounded-full py-2 text-xs font-semibold ' + (urgency === u ? 'bg-indigo-600 text-white' : 'border')}>{u}</button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={stopped} onChange={(e) => setStopped(e.target.checked)} /> Mesin berhenti / tidak bisa jalan
        </label>
      </div>
      <div className="space-y-2">
        <p className="text-xs font-semibold">Butuh spare part (opsional):</p>
        {sps.map((s, i) => (
          <div key={i} className="rounded-xl border bg-card p-3 space-y-2">
            <select value={s.productVariantId} onChange={(e) => pickCatalog(i, e.target.value)} className="w-full rounded-md border px-3 py-2 text-sm">
              <option value="">Link stok (opsional — potong stok saat selesai)...</option>
              {spareCatalog.map((c) => (<option key={c.id} value={c.id}>{c.name} ({c.skuCode})</option>))}
            </select>
            <input value={s.name} onChange={(e) => updSp(i, { name: e.target.value })} className="w-full rounded-md border px-3 py-2 text-sm" placeholder="Nama part * (cth: Bearing 6205)" />
            <select value={s.sourceLocationId} onChange={(e) => updSp(i, { sourceLocationId: e.target.value })} className="w-full rounded-md border px-3 py-2 text-sm">
              <option value="">Lokasi (otomatis bila kosong)...</option>
              {locations.map((l) => (<option key={l.id} value={l.id}>{l.name}</option>))}
            </select>
            <div className="flex gap-2">
              <input value={s.spec} onChange={(e) => updSp(i, { spec: e.target.value })} className="w-full rounded-md border px-3 py-2 text-sm" placeholder="Spesifikasi" />
              <input inputMode="decimal" value={s.quantity} onChange={(e) => updSp(i, { quantity: e.target.value })} className="w-full rounded-md border px-3 py-2 text-sm" placeholder="Qty *" />
            </div>
            <div className="flex gap-2">
              <input value={s.note} onChange={(e) => updSp(i, { note: e.target.value })} className="w-full rounded-md border px-3 py-2 text-sm" placeholder="Catatan" />
              <button type="button" onClick={() => delSp(i)} className="rounded-md border px-3 text-sm">✕</button>
            </div>
          </div>
        ))}
        <button type="button" onClick={addSp} className="w-full rounded-xl border border-dashed p-3 text-sm font-medium">+ Tambah spare part</button>
      </div>
      <button disabled={busy} className="w-full rounded-full bg-indigo-600 py-3 text-sm font-semibold text-white disabled:opacity-50">
        {busy ? 'Mengirim...' : 'Kirim laporan'}
      </button>
    </form>
  );
}
