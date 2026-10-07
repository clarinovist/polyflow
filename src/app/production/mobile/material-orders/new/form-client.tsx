'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { createMaterialOrder, submitMaterialOrder } from '@/actions/production/material-orders';

interface BomItem { productVariantId: string; name: string; skuCode: string; quantity: number }
interface BomOption { id: string; name: string; productName: string; items: BomItem[] }
interface MaterialOption { id: string; name: string; skuCode: string }
interface Row { productVariantId: string; quantity: string; zakQuantity: string; note: string }

export function MaterialOrderForm({ data }: { data: { boms: BomOption[]; materials: MaterialOption[]; orderTypes: string[] } }) {
  const router = useRouter();
  const [orderType, setOrderType] = useState(data.orderTypes[0] || 'HD');
  const [notes, setNotes] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);

  const applyBom = (bomId: string) => {
    const bom = data.boms.find((b) => b.id === bomId);
    if (!bom) return;
    setRows(bom.items.map((it) => ({ productVariantId: it.productVariantId, quantity: String(it.quantity), zakQuantity: '', note: 'Ready' })));
  };

  const updateRow = (i: number, patch: Partial<Row>) => setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const removeRow = (i: number) => setRows((prev) => prev.filter((_, idx) => idx !== i));
  const addRow = () => setRows((prev) => [...prev, { productVariantId: '', quantity: '', zakQuantity: '', note: '' }]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const items = rows
      .filter((r) => r.productVariantId && parseFloat(r.quantity) > 0)
      .map((r) => ({
        productVariantId: r.productVariantId,
        quantity: parseFloat(r.quantity),
        ...(r.zakQuantity && parseFloat(r.zakQuantity) > 0 ? { zakQuantity: parseFloat(r.zakQuantity) } : {}),
        ...(r.note.trim() ? { note: r.note.trim() } : {}),
      }));
    if (!items.length) {
      toast.error('Isi minimal 1 bahan dengan jumlah > 0');
      return;
    }
    setBusy(true);
    try {
      const created = await createMaterialOrder({
        orderType: orderType.trim() || 'HD',
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        clientRequestId: crypto.randomUUID(),
        items,
      });
      if (!created.success) {
        toast.error(created.error || 'Gagal membuat order');
        return;
      }
      const submitted = await submitMaterialOrder(created.data.id);
      if (!submitted.success) {
        toast.error(submitted.error || 'Order dibuat tapi gagal submit');
        router.push('/device/desktop-required?from=' + encodeURIComponent('/production/material-orders/' + created.data.id));
        return;
      }
      toast.success('Terkirim ke Kepala Pabrik — ' + created.data.orderNumber);
      router.push('/device/desktop-required?from=' + encodeURIComponent('/production/material-orders/' + created.data.id));
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal mengirim order');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="rounded-xl border bg-card p-4 space-y-3">
        <div>
          <label className="text-xs font-semibold">Divisi / Tipe *</label>
          <input value={orderType} onChange={(e) => setOrderType(e.target.value.toUpperCase())} list="mo-types" className="mt-1 w-full rounded-md border px-3 py-2 text-sm" placeholder="HD" />
          <datalist id="mo-types">
            {data.orderTypes.map((t) => (<option key={t} value={t} />))}
          </datalist>
        </div>
        <div>
          <label className="text-xs font-semibold">Formula (isi otomatis)</label>
          <select onChange={(e) => applyBom(e.target.value)} defaultValue="" className="mt-1 w-full rounded-md border px-3 py-2 text-sm">
            <option value="">Pilih formula / isi manual...</option>
            {data.boms.map((b) => (<option key={b.id} value={b.id}>{b.productName} — {b.name}</option>))}
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold">Catatan</label>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1 w-full rounded-md border px-3 py-2 text-sm" placeholder="cth: F-HD UNGU" />
        </div>
      </div>
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="rounded-xl border bg-card p-3 space-y-2">
            <select value={r.productVariantId} onChange={(e) => updateRow(i, { productVariantId: e.target.value })} className="w-full rounded-md border px-3 py-2 text-sm">
              <option value="">Pilih bahan...</option>
              {data.materials.map((m) => (<option key={m.id} value={m.id}>{m.name} ({m.skuCode})</option>))}
            </select>
            <div className="flex gap-2">
              <input inputMode="decimal" value={r.quantity} onChange={(e) => updateRow(i, { quantity: e.target.value })} className="w-full rounded-md border px-3 py-2 text-sm" placeholder="Jumlah *" />
              <input inputMode="decimal" value={r.zakQuantity} onChange={(e) => updateRow(i, { zakQuantity: e.target.value })} className="w-full rounded-md border px-3 py-2 text-sm" placeholder="Zak" />
            </div>
            <div className="flex gap-2">
              <input value={r.note} onChange={(e) => updateRow(i, { note: e.target.value })} className="w-full rounded-md border px-3 py-2 text-sm" placeholder="Ket (cth: Ready / Kg)" />
              <button type="button" onClick={() => removeRow(i)} className="rounded-md border px-3 text-sm">✕</button>
            </div>
          </div>
        ))}
        <button type="button" onClick={addRow} className="w-full rounded-xl border border-dashed p-3 text-sm font-medium">+ Tambah bahan</button>
      </div>
      <button disabled={busy} className="w-full rounded-full bg-indigo-600 py-3 text-sm font-semibold text-white disabled:opacity-50">
        {busy ? 'Mengirim...' : 'Kirim ke Kepala Pabrik'}
      </button>
    </form>
  );
}
