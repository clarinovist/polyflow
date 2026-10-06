'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { stockInSparePart } from '@/actions/inventory/sparepart-stock';

export function SparePartStockInForm({ locations, variants }: { locations: Array<{ id: string; name: string; slug: string }>; variants: Array<{ id: string; name: string; skuCode: string }> }) {
  const router = useRouter();
  const [locationId, setLocationId] = useState('');
  const [productVariantId, setProductVariantId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!locationId || !productVariantId || !(parseFloat(quantity) > 0)) {
      toast.error('Pilih lokasi, part, dan jumlah > 0');
      return;
    }
    setBusy(true);
    try {
      const res = await stockInSparePart({
        locationId,
        productVariantId,
        quantity: parseFloat(quantity),
        unitCost: unitCost === '' ? 0 : parseFloat(unitCost),
        ...(note.trim() ? { note: note.trim() } : {}),
        clientRequestId: crypto.randomUUID(),
      });
      if (!res.success) {
        toast.error(res.error || 'Gagal catat stok masuk');
        return;
      }
      toast.success('Stok masuk tercatat + jurnal otomatis');
      setQuantity('');
      setUnitCost('');
      setNote('');
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal catat stok masuk');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border bg-card p-4 space-y-3">
      <p className="text-sm font-semibold">Stok masuk (pembelian / stok awal)</p>
      <select value={locationId} onChange={(e) => setLocationId(e.target.value)} className="w-full rounded-md border px-3 py-2 text-sm">
        <option value="">Lokasi...</option>
        {locations.map((l) => (<option key={l.id} value={l.id}>{l.name}</option>))}
      </select>
      <select value={productVariantId} onChange={(e) => setProductVariantId(e.target.value)} className="w-full rounded-md border px-3 py-2 text-sm">
        <option value="">Spare part (OPERATIONAL)...</option>
        {variants.map((v) => (<option key={v.id} value={v.id}>{v.name} ({v.skuCode})</option>))}
      </select>
      <div className="flex gap-2">
        <input inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} className="w-full rounded-md border px-3 py-2 text-sm" placeholder="Qty *" />
        <input inputMode="decimal" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} className="w-full rounded-md border px-3 py-2 text-sm" placeholder="Harga satuan" />
      </div>
      <input value={note} onChange={(e) => setNote(e.target.value)} className="w-full rounded-md border px-3 py-2 text-sm" placeholder="Catatan (no. nota dsb)" />
      <button disabled={busy} className="w-full rounded-full bg-indigo-600 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Menyimpan...' : 'Catat masuk'}</button>
    </form>
  );
}
