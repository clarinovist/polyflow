'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    getDeliveryRevisionEditor,
    findDeliveryRevisionProducts,
    reviseDeliveryLoad,
} from '@/actions/sales/delivery-revision';
import { deliveryRevisionSchema } from '@/lib/schemas/delivery-revision';
import type {
    getDeliveryRevision,
    searchRevisionProducts,
} from '@/services/sales/delivery-revision-service';

type Editor = Awaited<ReturnType<typeof getDeliveryRevision>>;
type Product = Awaited<ReturnType<typeof searchRevisionProducts>>[number];
type Addition = Product & {
    quantity: string;
    unitPrice: string;
    taxPercent: string;
    ppnMode: 'INCLUDE' | 'EXCLUDE';
};

export function DeliveryRevisionDialog({
    deliveryOrderId,
    onSaved,
}: {
    deliveryOrderId: string;
    onSaved?: () => void;
}) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [editor, setEditor] = useState<Editor | null>(null);
    const [quantities, setQuantities] = useState<Record<string, string>>({});
    const [additions, setAdditions] = useState<Addition[]>([]);
    const [reason, setReason] = useState('');
    const [remainder, setRemainder] = useState<'KEEP' | 'CLOSE'>('KEEP');
    const [search, setSearch] = useState('');
    const [results, setResults] = useState<Product[]>([]);
    const [error, setError] = useState('');
    const [confirming, setConfirming] = useState(false);

    async function start() {
        setOpen(true);
        setBusy(true);
        setError('');
        setEditor(null);
        setConfirming(false);
        setReason('');
        setRemainder('KEEP');
        setAdditions([]);
        setResults([]);
        setSearch('');
        try {
            const result = await getDeliveryRevisionEditor(deliveryOrderId);
            if (!result.success) {
                setError(result.error);
                return;
            }
            setEditor(result.data);
            setQuantities(
                Object.fromEntries(
                    result.data.items.map((item) => [
                        item.salesOrderItemId,
                        String(item.quantity),
                    ]),
                ),
            );
        } catch {
            setError('Gagal memuat revisi. Coba buka ulang.');
        } finally {
            setBusy(false);
        }
    }

    async function findProducts() {
        setBusy(true);
        setError('');
        try {
            const result = await findDeliveryRevisionProducts(search);
            if (!result.success) {
                setError(result.error);
                return;
            }
            setResults(result.data);
            if (!result.data.length)
                setError('Barang tidak ditemukan. Coba nama atau SKU lain.');
        } catch {
            setError('Gagal mencari barang. Coba lagi.');
        } finally {
            setBusy(false);
        }
    }

    function payload() {
        if (!editor) return null;
        return deliveryRevisionSchema.safeParse({
            deliveryOrderId,
            orderVersion: editor.orderVersion,
            deliveryVersion: editor.deliveryVersion,
            reason,
            remainder,
            items: editor.items.map((item) => ({
                salesOrderItemId: item.salesOrderItemId,
                quantity: quantities[item.salesOrderItemId]?.trim()
                    ? Number(quantities[item.salesOrderItemId])
                    : NaN,
            })),
            additions: additions.map((item) => ({
                productVariantId: item.id,
                quantity: item.quantity.trim() ? Number(item.quantity) : NaN,
                unitPrice: item.unitPrice.trim() ? Number(item.unitPrice) : NaN,
                taxPercent: Number(item.taxPercent),
                ppnMode: item.ppnMode,
            })),
        });
    }

    function review() {
        const parsed = payload();
        if (!parsed?.success) {
            setError(parsed?.error.issues[0]?.message ?? 'Data belum siap');
            return;
        }
        setError('');
        setConfirming(true);
    }

    async function save() {
        const parsed = payload();
        if (!parsed?.success) {
            setError('Data tidak valid. Periksa kembali.');
            return;
        }
        setBusy(true);
        setError('');
        try {
            const result = await reviseDeliveryLoad(parsed.data);
            if (!result.success) {
                setError(result.error);
                return;
            }
            toast.success(
                'SO dan Surat Jalan direvisi. Gudang wajib verifikasi muatan ulang.',
            );
            setOpen(false);
            onSaved?.();
            router.refresh();
        } catch {
            setError(
                'Gagal menyimpan revisi. Buka ulang untuk memastikan status sebelum mencoba lagi.',
            );
        } finally {
            setBusy(false);
        }
    }

    return (
        <>
            <Button type="button" variant="outline" onClick={start}>
                Revisi muatan / barang
            </Button>
            <Dialog
                open={open}
                onOpenChange={(value) => {
                    if (!busy) setOpen(value);
                }}
            >
                <DialogContent className="sm:max-w-3xl max-h-[90dvh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>
                            Revisi muatan {editor?.orderNumber}
                        </DialogTitle>
                        <DialogDescription>
                            Mengubah SO dan Surat Jalan sebelum dikirim. Qty dan
                            harga di sini menggunakan satuan utama, bukan jumlah
                            kemasan. Untuk mengganti barang, isi qty barang lama
                            0 lalu tambahkan barang pengganti.
                        </DialogDescription>
                    </DialogHeader>
                    {error && (
                        <p role="alert" className="text-sm text-destructive">
                            {error}
                        </p>
                    )}
                    {busy && (
                        <p
                            role="status"
                            className="text-sm text-muted-foreground"
                        >
                            Memproses…
                        </p>
                    )}
                    {editor && (
                        <>
                            <fieldset
                                disabled={busy || confirming}
                                className="space-y-4 min-w-0"
                            >
                                {editor.items.map((item) => (
                                    <div
                                        key={item.salesOrderItemId}
                                        className="rounded-lg border p-3 space-y-2"
                                    >
                                        <p className="font-medium break-words">
                                            {item.name}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            SO: {item.ordered} {item.unit} ·
                                            Sudah dikirim: {item.delivered}{' '}
                                            {item.unit} · Harga tetap: Rp{' '}
                                            {item.unitPrice.toLocaleString(
                                                'id-ID',
                                            )}
                                            /{item.unit}
                                        </p>
                                        <label className="block text-sm">
                                            Qty muat {item.name} ({item.unit})
                                            <Input
                                                type="number"
                                                min="0"
                                                step="0.0001"
                                                value={
                                                    quantities[
                                                        item.salesOrderItemId
                                                    ] ?? ''
                                                }
                                                onChange={(event) =>
                                                    setQuantities({
                                                        ...quantities,
                                                        [item.salesOrderItemId]:
                                                            event.target.value,
                                                    })
                                                }
                                            />
                                        </label>
                                    </div>
                                ))}
                                <div className="space-y-2 rounded-lg border p-3">
                                    <label className="block text-sm">
                                        Cari barang tambahan / pengganti
                                        <Input
                                            value={search}
                                            onChange={(event) =>
                                                setSearch(event.target.value)
                                            }
                                            placeholder="Nama atau SKU, minimal 2 karakter"
                                        />
                                    </label>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        disabled={search.trim().length < 2}
                                        onClick={findProducts}
                                    >
                                        Cari barang
                                    </Button>
                                    {results.map((product) => (
                                        <Button
                                            key={product.id}
                                            type="button"
                                            variant="outline"
                                            className="w-full h-auto min-h-11 justify-start whitespace-normal text-left"
                                            disabled={
                                                editor.items.some(
                                                    (item) =>
                                                        item.productVariantId ===
                                                        product.id,
                                                ) ||
                                                additions.some(
                                                    (item) =>
                                                        item.id === product.id,
                                                )
                                            }
                                            onClick={() => {
                                                setAdditions([
                                                    ...additions,
                                                    {
                                                        ...product,
                                                        quantity: '',
                                                        unitPrice: '',
                                                        taxPercent: '0',
                                                        ppnMode: 'EXCLUDE',
                                                    },
                                                ]);
                                                setResults([]);
                                            }}
                                        >
                                            Tambah {product.name} ·{' '}
                                            {product.skuCode} (
                                            {product.primaryUnit})
                                        </Button>
                                    ))}
                                </div>
                                {additions.map((item, index) => {
                                    function patch(value: Partial<Addition>) {
                                        setAdditions(
                                            additions.map((row, i) =>
                                                i === index
                                                    ? { ...row, ...value }
                                                    : row,
                                            ),
                                        );
                                    }
                                    return (
                                        <div
                                            key={item.id}
                                            className="rounded-lg border p-3 space-y-2"
                                        >
                                            <p className="font-medium">
                                                Barang baru: {item.name}
                                            </p>
                                            <div className="grid gap-3 sm:grid-cols-2">
                                                <label className="text-sm">
                                                    Qty {item.name} (
                                                    {item.primaryUnit})
                                                    <Input
                                                        type="number"
                                                        min="0.0001"
                                                        step="0.0001"
                                                        value={item.quantity}
                                                        onChange={(event) =>
                                                            patch({
                                                                quantity:
                                                                    event.target
                                                                        .value,
                                                            })
                                                        }
                                                    />
                                                </label>
                                                <label className="text-sm">
                                                    Harga {item.name} (Rp/
                                                    {item.primaryUnit})
                                                    <Input
                                                        type="number"
                                                        min="0.01"
                                                        step="0.01"
                                                        value={item.unitPrice}
                                                        onChange={(event) =>
                                                            patch({
                                                                unitPrice:
                                                                    event.target
                                                                        .value,
                                                            })
                                                        }
                                                    />
                                                </label>
                                                <label className="text-sm">
                                                    PPN {item.name} (%)
                                                    <Input
                                                        type="number"
                                                        min="0"
                                                        max="100"
                                                        step="0.01"
                                                        value={item.taxPercent}
                                                        onChange={(event) =>
                                                            patch({
                                                                taxPercent:
                                                                    event.target
                                                                        .value,
                                                            })
                                                        }
                                                    />
                                                </label>
                                                <label className="text-sm">
                                                    Mode PPN {item.name}
                                                    <select
                                                        className="block h-10 w-full rounded-md border bg-background px-3"
                                                        value={item.ppnMode}
                                                        onChange={(event) =>
                                                            patch({
                                                                ppnMode: event
                                                                    .target
                                                                    .value as Addition['ppnMode'],
                                                            })
                                                        }
                                                    >
                                                        <option value="EXCLUDE">
                                                            Belum termasuk PPN
                                                        </option>
                                                        <option value="INCLUDE">
                                                            Termasuk PPN
                                                        </option>
                                                    </select>
                                                </label>
                                            </div>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                onClick={() =>
                                                    setAdditions(
                                                        additions.filter(
                                                            (_, i) =>
                                                                i !== index,
                                                        ),
                                                    )
                                                }
                                            >
                                                Hapus tambahan {item.name}
                                            </Button>
                                        </div>
                                    );
                                })}
                                <label className="block text-sm font-medium">
                                    Sisa pesanan
                                    <select
                                        className="block h-11 w-full rounded-md border bg-background px-3 font-normal"
                                        value={remainder}
                                        onChange={(event) =>
                                            setRemainder(
                                                event.target.value as
                                                    | 'KEEP'
                                                    | 'CLOSE',
                                            )
                                        }
                                    >
                                        <option value="KEEP">
                                            Sisa dikirim nanti (default)
                                        </option>
                                        <option value="CLOSE">
                                            Batalkan sisa, selesai sesuai
                                            realisasi
                                        </option>
                                    </select>
                                </label>
                                <p className="text-sm text-muted-foreground">
                                    {remainder === 'KEEP'
                                        ? 'Kekurangan barang lama tetap menjadi pesanan terbuka, termasuk jika diganti barang lain.'
                                        : 'Seluruh sisa SO di luar muatan ini dibatalkan. Qty SO menjadi yang sudah dikirim + muatan baru.'}{' '}
                                    Perintah produksi dan ongkir tidak otomatis
                                    berubah; koordinasikan dengan produksi dan
                                    periksa tarif/berat pengiriman bila terkait.
                                </p>
                                <label className="block text-sm font-medium">
                                    Alasan revisi (wajib)
                                    <Textarea
                                        value={reason}
                                        maxLength={500}
                                        onChange={(event) =>
                                            setReason(event.target.value)
                                        }
                                    />
                                </label>
                            </fieldset>
                            {confirming && (
                                <div
                                    className="rounded-lg border border-amber-400 p-3 space-y-2"
                                    role="status"
                                >
                                    <p className="font-medium">
                                        Konfirmasi revisi muatan
                                    </p>
                                    <p className="text-sm">
                                        {remainder === 'CLOSE'
                                            ? 'Sisa pesanan akan dibatalkan sesuai qty di atas.'
                                            : 'Sisa pesanan akan tetap terbuka.'}{' '}
                                        SO dan Surat Jalan diperbarui bersama.
                                        Verifikasi muatan lama dihapus dan harus
                                        diulang. Stok belum dipotong.
                                    </p>
                                </div>
                            )}
                            <div className="sticky bottom-0 flex flex-wrap justify-end gap-2 border-t bg-background pt-3">
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="min-h-11"
                                    disabled={busy}
                                    onClick={() =>
                                        confirming
                                            ? setConfirming(false)
                                            : setOpen(false)
                                    }
                                >
                                    {confirming ? 'Kembali periksa' : 'Batal'}
                                </Button>
                                <Button
                                    type="button"
                                    className="min-h-11"
                                    disabled={busy}
                                    onClick={confirming ? save : review}
                                >
                                    {confirming
                                        ? 'Simpan revisi & verifikasi ulang'
                                        : 'Tinjau revisi'}
                                </Button>
                            </div>
                        </>
                    )}
                </DialogContent>
            </Dialog>
        </>
    );
}
