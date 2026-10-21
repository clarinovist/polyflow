'use client';

import { useEffect, useState } from 'react';
import { getProductionPackagingOptions } from '@/actions/production/packaging';
import type { PackagedOutputValues } from '@/lib/schemas/production-packaging';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Options = { options: { id: string; name: string; labelVariantId: string | null }[]; stock: {
    id: string; productVariantId: string; name: string; locationId: string; locationName: string;
    ownerCustomerId: string | null; ownerName: string | null; quantity: number;
}[] };

export function PackagingOutputFields({ baseVariantId, baseName, unit, value, onChange }: {
    baseVariantId: string; baseName: string; unit: string;
    value: PackagedOutputValues; onChange: (value: PackagedOutputValues) => void;
}) {
    const [options, setOptions] = useState<Options | null>(null);
    const [error, setError] = useState('');
    useEffect(() => {
        let active = true;
        getProductionPackagingOptions(baseVariantId).then((result) => {
            if (!active) return;
            if (result.success) setOptions(result.data);
            else setError(result.error ?? 'Pilihan kemasan tidak dapat dimuat.');
        }).catch(() => { if (active) setError('Gagal memuat stok kemasan. Buka ulang form.'); });
        return () => { active = false; };
    }, [baseVariantId]);
    const updateGroup = (index: number, changes: Partial<PackagedOutputValues['groups'][number]>) => {
        onChange({ ...value, groups: value.groups.map((group, i) => i === index ? { ...group, ...changes } : group) });
    };
    if (error) return <p role="alert" className="text-sm text-destructive">{error}</p>;
    if (!options) return <p role="status" className="text-sm text-muted-foreground">Memuat sumber stok kemasan…</p>;
    return <section className="space-y-4 rounded-xl border p-4">
        <h3 className="font-semibold">Hasil & pemakaian kemasan aktual</h3>
        <p className="text-sm text-muted-foreground">Jumlah hasil dalam {unit}, terpisah dari jumlah lembar/pcs kemasan. Untuk KG, gunakan berat neto timbang aktual.</p>
        {value.groups.map((group, index) => <fieldset key={index} className="space-y-3 rounded-lg border p-3">
            <legend className="px-1 text-sm font-medium">Kelompok hasil {index + 1}</legend>
            <label className="block text-sm">Produk / merek hasil
                <select aria-label={`Merek hasil ${index + 1}`} className="mt-1 min-h-11 w-full rounded-md border bg-background px-3" value={group.productVariantId} onChange={(event) => updateGroup(index, { productVariantId: event.target.value })}>
                    <option value={baseVariantId}>{baseName} — produk dasar</option>
                    {options.options.filter((option) => option.id !== baseVariantId).map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
                </select>
            </label>
            <label className="block text-sm">Jumlah hasil ({unit})
                <Input aria-label={`Jumlah hasil kelompok ${index + 1}`} className="mt-1 min-h-11" type="number" min="0" step="0.0001" value={group.quantity || ''} onChange={(event) => updateGroup(index, { quantity: Number(event.target.value) })} />
            </label>
            {group.packaging.map((row, rowIndex) => {
                const selected = options.stock.find((item) => item.productVariantId === row.productVariantId && item.locationId === row.sourceLocationId);
                const updateRow = (changes: Partial<typeof row>) => updateGroup(index, { packaging: group.packaging.map((item, i) => i === rowIndex ? { ...item, ...changes } : item) });
                return <div key={rowIndex} className="space-y-2 rounded-md bg-muted/40 p-3">
                    <label className="block text-sm">Kemasan & sumber stok
                        <select aria-label={`Kemasan ${index + 1}-${rowIndex + 1}`} className="mt-1 min-h-11 w-full rounded-md border bg-background px-2" value={selected?.id ?? ''} onChange={(event) => {
                            const stock = options.stock.find((item) => item.id === event.target.value);
                            if (stock) updateRow({ productVariantId: stock.productVariantId, sourceLocationId: stock.locationId, ownerCustomerId: stock.ownerCustomerId });
                        }}>
                            <option value="">Pilih kemasan dan pemilik stok</option>
                            {options.stock.map((stock) => <option key={stock.id} value={stock.id}>{stock.name} · {stock.ownerName ? `Titipan ${stock.ownerName}` : 'Milik sendiri'} · {stock.locationName} · {stock.quantity} pcs</option>)}
                        </select>
                    </label>
                    <label className="block text-sm">Terpakai (pcs / lembar)
                        <Input aria-label={`Jumlah kemasan ${index + 1}-${rowIndex + 1}`} className="mt-1 min-h-11" type="number" min="1" step="1" value={row.quantity || ''} onChange={(event) => updateRow({ quantity: Number(event.target.value) })} />
                    </label>
                    {selected && <p className="break-words text-xs text-muted-foreground">{selected.name} · {selected.ownerName ? `Titipan ${selected.ownerName}` : 'Milik sendiri'} · {selected.locationName}</p>}
                    <Button className="min-h-11" type="button" variant="ghost" onClick={() => updateGroup(index, { packaging: group.packaging.filter((_, i) => i !== rowIndex) })}>Hapus kemasan {rowIndex + 1}</Button>
                </div>;
            })}
            <Button className="min-h-11" type="button" variant="outline" disabled={group.packaging.length >= 10} onClick={() => updateGroup(index, { packaging: [...group.packaging, { productVariantId: '', sourceLocationId: '', ownerCustomerId: null, quantity: 0 }] })}>Tambah kemasan</Button>
            {index > 0 && <Button className="min-h-11" type="button" variant="ghost" onClick={() => onChange({ ...value, groups: value.groups.filter((_, i) => i !== index) })}>Hapus kelompok kedua</Button>}
        </fieldset>)}
        <Button className="min-h-11" type="button" variant="outline" disabled={value.groups.length >= 2} onClick={() => onChange({ ...value, groups: [...value.groups, { productVariantId: '', quantity: 0, packaging: [] }] })}>Tambah merek kedua</Button>
        <p className="text-sm">Total hasil: <strong>{value.groups.reduce((sum, group) => sum + group.quantity, 0).toLocaleString('id-ID')} {unit}</strong></p>
        <a href="/production/packaging" className="text-sm underline">Pengaturan SKU merek & stok titipan (Planning)</a>
    </section>;
}
