'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createPackagingCustodyLocation, createProductionPackagingOption } from '@/actions/production/packaging';
import { Button } from '@/components/ui/button';

type Variant = { id: string; name: string; skuCode: string; productId: string; primaryUnit: string; product: { productType: string } };
export function PackagingSettings({ variants, customers }: { variants: Variant[]; customers: { id: string; name: string }[] }) {
    const router = useRouter();
    const [base, setBase] = useState('');
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('');
    const selectClass = 'mt-1 min-h-11 w-full rounded-md border bg-background px-3';
    return <div className="space-y-6">
        <form className="space-y-3 rounded-xl border p-4" onSubmit={async (event) => {
            event.preventDefault(); if (busy) return;
            const data = new FormData(event.currentTarget); setBusy(true); setMessage('');
            try {
                const result = await createProductionPackagingOption({ baseVariantId: base, outputVariantId: String(data.get('output')), labelVariantId: String(data.get('label') || '') || null });
                setMessage(result.success ? 'Pemetaan tersimpan.' : result.error ?? 'Gagal menyimpan.');
                if (result.success) router.refresh();
            } catch { setMessage('Gagal menghubungi server. Periksa pemetaan sebelum mencoba kembali.'); }
            finally { setBusy(false); }
        }}>
            <h2 className="font-semibold">Hubungkan SKU merek ke produk dasar</h2>
            <label className="block text-sm">Produk dasar BOM<select required className={selectClass} value={base} onChange={(event) => setBase(event.target.value)}><option value="">Pilih produk dasar</option>{variants.filter((v) => v.product.productType !== 'PACKAGING').map((v) => <option key={v.id} value={v.id}>{v.name} · {v.skuCode}</option>)}</select></label>
            <label className="block text-sm">SKU hasil bermerek<select key={base} required name="output" className={selectClass}><option value="">Pilih SKU hasil</option>{variants.filter((v) => v.productId === variants.find((x) => x.id === base)?.productId && v.id !== base).map((v) => <option key={v.id} value={v.id}>{v.name} · {v.skuCode}</option>)}</select></label>
            <label className="block text-sm">Etiket yang sesuai<select name="label" className={selectClass}><option value="">Tanpa etiket khusus</option>{variants.filter((v) => v.product.productType === 'PACKAGING' && v.primaryUnit === 'PCS').map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select></label>
            <Button className="min-h-11" disabled={busy} type="submit">Simpan pemetaan</Button>
        </form>
        <form className="space-y-3 rounded-xl border p-4" onSubmit={async (event) => {
            event.preventDefault(); if (busy) return;
            const data = new FormData(event.currentTarget); setBusy(true); setMessage('');
            try {
                const result = await createPackagingCustodyLocation({ customerId: String(data.get('customer')) });
                setMessage(result.success ? 'Lokasi titipan tersedia. Catat penerimaan kemasan ke lokasi ini.' : result.error ?? 'Gagal membuat lokasi.');
                if (result.success) router.refresh();
            } catch { setMessage('Gagal menghubungi server.'); }
            finally { setBusy(false); }
        }}>
            <h2 className="font-semibold">Lokasi stok titipan kemasan</h2>
            <label className="block text-sm">Pelanggan pemilik<select name="customer" required className={selectClass}><option value="">Pilih pelanggan</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
            <Button className="min-h-11" disabled={busy} type="submit">Siapkan lokasi titipan</Button>
        </form>
        {message && <p role="status" className="rounded-md border p-3 text-sm">{message}</p>}
    </div>;
}
