'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Save } from 'lucide-react';
import { toast } from 'sonner';
import { stockInSparePart } from '@/actions/inventory/sparepart-stock';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function SparePartStockInForm({
    locations,
    variants,
}: {
    locations: Array<{ id: string; name: string; slug: string }>;
    variants: Array<{ id: string; name: string; skuCode: string }>;
}) {
    const router = useRouter();
    const [locationId, setLocationId] = useState('');
    const [productVariantId, setProductVariantId] = useState('');
    const [quantity, setQuantity] = useState('');
    const [unitCost, setUnitCost] = useState('');
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState(false);

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (busy) return;
        if (!locationId || !productVariantId || !(Number.parseFloat(quantity) > 0)) {
            toast.error('Pilih lokasi, spare part, dan isi jumlah lebih dari 0.');
            return;
        }
        const parsedCost = unitCost === '' ? 0 : Number.parseFloat(unitCost);
        if (!Number.isFinite(parsedCost) || parsedCost < 0) {
            toast.error('Harga satuan harus berupa angka positif.');
            return;
        }
        setBusy(true);
        try {
            const result = await stockInSparePart({
                locationId,
                productVariantId,
                quantity: Number.parseFloat(quantity),
                unitCost: parsedCost,
                ...(note.trim() ? { note: note.trim() } : {}),
                clientRequestId: crypto.randomUUID(),
            });
            if (!result.success) {
                toast.error(result.error || 'Gagal mencatat stok masuk.');
                return;
            }
            toast.success('Stok masuk dan jurnal berhasil dicatat.');
            setQuantity('');
            setUnitCost('');
            setNote('');
            router.refresh();
        } catch (error) {
            toast.error(
                error instanceof Error
                    ? error.message
                    : 'Gagal mencatat stok masuk.',
            );
        } finally {
            setBusy(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
                <Label htmlFor="stock-location">Lokasi *</Label>
                <select
                    id="stock-location"
                    value={locationId}
                    onChange={(event) => setLocationId(event.target.value)}
                    className="min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                    <option value="">Pilih lokasi...</option>
                    {locations.map((location) => (
                        <option key={location.id} value={location.id}>
                            {location.name}
                        </option>
                    ))}
                </select>
            </div>
            <div className="space-y-1.5">
                <Label htmlFor="stock-part">Spare part *</Label>
                <select
                    id="stock-part"
                    value={productVariantId}
                    onChange={(event) => setProductVariantId(event.target.value)}
                    className="min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                    <option value="">Pilih spare part...</option>
                    {variants.map((variant) => (
                        <option key={variant.id} value={variant.id}>
                            {variant.name} ({variant.skuCode})
                        </option>
                    ))}
                </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                    <Label htmlFor="stock-quantity">Jumlah *</Label>
                    <Input
                        id="stock-quantity"
                        inputMode="decimal"
                        value={quantity}
                        onChange={(event) => setQuantity(event.target.value)}
                        placeholder="0"
                    />
                </div>
                <div className="space-y-1.5">
                    <Label htmlFor="stock-unit-cost">Harga satuan</Label>
                    <Input
                        id="stock-unit-cost"
                        inputMode="decimal"
                        value={unitCost}
                        onChange={(event) => setUnitCost(event.target.value)}
                        placeholder="0"
                    />
                </div>
            </div>
            <div className="space-y-1.5">
                <Label htmlFor="stock-note">Catatan</Label>
                <Input
                    id="stock-note"
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="Nomor nota atau keterangan"
                />
            </div>
            <Button
                disabled={busy}
                className="min-h-11 w-full bg-emerald-700 hover:bg-emerald-800"
            >
                <Save className="h-4 w-4" />
                {busy ? 'Menyimpan...' : 'Catat stok masuk'}
            </Button>
        </form>
    );
}
