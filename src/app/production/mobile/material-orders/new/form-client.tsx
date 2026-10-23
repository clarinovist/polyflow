'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { createMaterialOrder, submitMaterialOrder } from '@/actions/production/material-orders';

interface BomItem { productVariantId: string; name: string; skuCode: string; quantity: number; unit: string }
interface BomOption { id: string; name: string; productName: string; items: BomItem[] }
interface MaterialOption { id: string; name: string; skuCode: string; unit: string }
interface Row { productVariantId: string; quantity: string; zakQuantity: string; note: string }

export function MaterialOrderForm({ data }: { data: { boms: BomOption[]; materials: MaterialOption[]; orderTypes: string[] } }) {
  const router = useRouter();
  const [orderType, setOrderType] = useState(data.orderTypes[0] || 'HD');
  const [notes, setNotes] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const requestId = useRef<string | null>(null);
  const [draft, setDraft] = useState<{ id: string; orderNumber: string } | null>(null);
  const [requestStarted, setRequestStarted] = useState(false);

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
      requestId.current ??= crypto.randomUUID();
      setRequestStarted(true);
      let saved = draft;
      if (!saved) {
        const created = await createMaterialOrder({
          orderType: orderType.trim() || 'HD',
          ...(notes.trim() ? { notes: notes.trim() } : {}),
          clientRequestId: requestId.current,
          items,
        });
        if (!created.success) {
          toast.error(created.error || 'Gagal membuat permintaan');
          return;
        }
        saved = created.data;
        setDraft(saved);
      }
      const submitted = await submitMaterialOrder(saved.id);
      if (!submitted.success) {
        toast.error(submitted.error || 'Permintaan tersimpan tetapi belum terkirim. Coba kirim kembali.');
        return;
      }
      toast.success('Terkirim ke Kepala Pabrik — ' + saved.orderNumber);
      router.push('/production/mobile/material-orders/' + saved.id);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal mengirim order');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {draft && <p role="status" className="rounded-lg border p-3 text-sm">Permintaan {draft.orderNumber} sudah tersimpan. Kirim kembali tanpa membuat permintaan baru.</p>}
      {requestStarted && !draft && <p role="status" className="rounded-lg border p-3 text-sm">Pengiriman sudah dicoba. Isi dikunci agar percobaan ulang tidak mengubah atau menggandakan permintaan yang mungkin sudah tersimpan.</p>}
      <fieldset disabled={busy || requestStarted} className="space-y-4">
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
            <p className="text-xs text-muted-foreground">Jumlah dalam {data.materials.find((material) => material.id === r.productVariantId)?.unit ?? 'satuan dasar bahan yang dipilih'}. Zak dicatat terpisah.</p>
            <div className="flex gap-2">
              <input aria-label={`Jumlah bahan ${i + 1}`} inputMode="decimal" value={r.quantity} onChange={(e) => updateRow(i, { quantity: e.target.value })} className="w-full rounded-md border px-3 py-2 text-sm" placeholder="Jumlah *" />
              <input inputMode="decimal" value={r.zakQuantity} onChange={(e) => updateRow(i, { zakQuantity: e.target.value })} className="w-full rounded-md border px-3 py-2 text-sm" placeholder="Zak" />
            </div>
            <div className="flex gap-2">
              <input value={r.note} onChange={(e) => updateRow(i, { note: e.target.value })} className="w-full rounded-md border px-3 py-2 text-sm" placeholder="Ket (cth: Ready / Kg)" />
              <button type="button" aria-label={`Hapus bahan ${i + 1}`} onClick={() => removeRow(i)} className="rounded-md border px-3 text-sm">✕</button>
            </div>
          </div>
        ))}
        <button type="button" onClick={addRow} className="w-full rounded-xl border border-dashed p-3 text-sm font-medium">+ Tambah bahan</button>
      </div>
      </fieldset>
      <button disabled={busy} className="w-full rounded-full bg-indigo-600 py-3 text-sm font-semibold text-white disabled:opacity-50">
        {busy ? 'Mengirim...' : draft ? 'Kirim Ulang Permintaan' : 'Kirim ke Kepala Pabrik'}
      </button>
    </form>
  );
}
