'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
    getFinancePurchasePriceCorrectionContext,
    previewFinancePurchasePriceCorrection,
    postFinancePurchasePriceCorrection,
} from '@/actions/finance/purchase-price-correction';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { formatQuantity } from '@/lib/utils/utils';

type Context = Extract<
    Awaited<ReturnType<typeof getFinancePurchasePriceCorrectionContext>>,
    { success: true }
>['data'];
type Preview = Extract<
    Awaited<ReturnType<typeof previewFinancePurchasePriceCorrection>>,
    { success: true }
>['data'];
type ReadyPreview = { data: Preview; idempotencyKey: string };
type PostRequest = {
    invoiceId: string;
    purchaseOrderItemId: string;
    newUnitPrice: string;
    sourceFingerprint: string;
    idempotencyKey: string;
    reason: string;
    confirmed: true;
};

const money = (value: string | number | null, unitPrice = false) => value === null
    ? 'Belum tersedia'
    : new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 2,
        maximumFractionDigits: unitPrice ? 4 : 2,
    }).format(Number(value));
const date = (value: string) => new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeZone: 'Asia/Jakarta',
}).format(new Date(value));

export function PurchasePriceCorrection({ invoiceId }: { invoiceId: string }) {
    // A different invoice must never inherit a preview or an uncertain posting request.
    return <PurchasePriceCorrectionForm key={invoiceId} invoiceId={invoiceId} />;
}

function PurchasePriceCorrectionForm({ invoiceId }: { invoiceId: string }) {
    const router = useRouter();
    const id = useId();
    const busy = useRef(false);
    const [context, setContext] = useState<Context | null>(null);
    const [loadError, setLoadError] = useState('');
    const [revision, setRevision] = useState(0);
    const [itemId, setItemId] = useState('');
    const [price, setPrice] = useState('');
    const [preview, setPreview] = useState<ReadyPreview | null>(null);
    const [reason, setReason] = useState('');
    const [confirmed, setConfirmed] = useState(false);
    const [error, setError] = useState('');
    const [pending, setPending] = useState<'preview' | 'post' | null>(null);
    const [retryRequest, setRetryRequest] = useState<PostRequest | null>(null);

    useEffect(() => {
        let cancelled = false;
        async function load() {
            try {
                const result = await getFinancePurchasePriceCorrectionContext(invoiceId);
                if (cancelled) return;
                if (result.success) setContext(result.data);
                else setLoadError(result.error);
            } catch {
                if (!cancelled) setLoadError('Gagal memuat konteks koreksi harga. Silakan coba muat ulang.');
            }
        }
        void load();
        return () => { cancelled = true; };
    }, [invoiceId, revision]);

    const normalizedPrice = price.trim().replace(',', '.');
    // Keep the price a decimal string; valuation and eligibility remain server-owned.
    const validPrice = /^(0|[1-9]\d{0,10})(\.\d{1,4})?$/.test(normalizedPrice)
        && Number(normalizedPrice) > 0;
    const validReason = reason.trim().length >= 5 && reason.trim().length <= 1000;
    const locked = pending !== null || retryRequest !== null;
    const selectedIndex = context?.eligible ? context.items.findIndex(item => item.purchaseOrderItemId === itemId) : -1;
    const selectedItem = context?.eligible ? context.items[selectedIndex] : undefined;
    const value = preview?.data;

    function clearPreview() {
        setPreview(null);
        setConfirmed(false);
    }

    function reloadContext() {
        if (busy.current || retryRequest) return;
        setContext(null);
        setLoadError('');
        setError('');
        clearPreview();
        setRevision(current => current + 1);
    }

    async function requestPreview() {
        if (busy.current || retryRequest || !context?.eligible || !selectedItem || !validPrice) return;
        busy.current = true;
        setPending('preview');
        setError('');
        clearPreview();
        try {
            const result = await previewFinancePurchasePriceCorrection({
                invoiceId,
                purchaseOrderItemId: itemId,
                newUnitPrice: normalizedPrice,
            });
            if (result.success) {
                setPreview({ data: result.data, idempotencyKey: crypto.randomUUID() });
            } else setError(result.error);
        } catch {
            setError('Gagal memuat pratinjau. Silakan coba lagi. Belum ada posting koreksi.');
        } finally {
            busy.current = false;
            setPending(null);
        }
    }

    async function post() {
        if (busy.current || !context?.eligible || !preview || !validReason || !confirmed) return;
        busy.current = true;
        setPending('post');
        setError('');
        const request: PostRequest = retryRequest ?? {
            invoiceId: preview.data.invoiceId,
            purchaseOrderItemId: preview.data.purchaseOrderItemId,
            newUnitPrice: preview.data.newUnitPrice,
            sourceFingerprint: preview.data.sourceFingerprint,
            idempotencyKey: preview.idempotencyKey,
            reason: reason.trim(),
            confirmed: true,
        };
        // Preserve the entire signed request, not just the key, after an uncertain result.
        setRetryRequest(request);
        try {
            const result = await postFinancePurchasePriceCorrection(request);
            if (!result.success) {
                setError(result.error);
                if (result.code !== 'INTERNAL_ERROR') setRetryRequest(null);
                if (result.code === 'PURCHASE_PRICE_SOURCE_CHANGED') clearPreview();
                return;
            }
        } catch {
            setError('Hasil posting belum dapat dipastikan karena koneksi terputus. Coba Posting koreksi lagi dengan instruksi yang sama; jangan membuat koreksi pengganti.');
            return;
        } finally {
            busy.current = false;
            setPending(null);
        }
        setRetryRequest(null);
        clearPreview();
        setItemId('');
        setPrice('');
        setReason('');
        setContext(null);
        setLoadError('');
        setRevision(current => current + 1);
        toast.success('Koreksi harga pembelian berhasil diposting. Tagihan dan nilai persediaan diperbarui.');
        router.refresh();
    }

    return (
        <Card className="min-w-0 max-w-full break-words">
            <CardHeader>
                <CardTitle><h2>Koreksi harga pembelian</h2></CardTitle>
                <CardDescription>
                    Koreksi harga per baris PO tanpa membatalkan penerimaan atau mengubah jumlah stok.
                    Periksa dampaknya pada tagihan, persediaan, dan HPP sebelum posting.
                </CardDescription>
            </CardHeader>
            <CardContent className="min-w-0 space-y-6 text-sm">
                {!context && !loadError && <p role="status">Memuat konteks koreksi harga…</p>}
                {loadError && (
                    <div role="alert" className="space-y-1 rounded-md border border-amber-500/40 bg-amber-500/10 p-3">
                        <p className="font-semibold">Koreksi harga belum tersedia</p>
                        <p>{loadError}</p>
                    </div>
                )}
                {context && !context.eligible && (
                    <div role="alert" className="space-y-1 rounded-md border border-amber-500/40 bg-amber-500/10 p-3">
                        <p className="font-semibold">Koreksi harga belum tersedia</p>
                        <p>{context.reasonMessage}</p>
                    </div>
                )}
                {context?.eligible && (
                    <>
                        <fieldset disabled={locked} className="min-w-0 space-y-4">
                            <legend className="mb-3 font-semibold">Pilih satu baris PO</legend>
                            {!context.items.length && <p>Belum ada baris PO yang dapat dikoreksi.</p>}
                            <div className="grid min-w-0 gap-3 md:grid-cols-2">
                                {context.items.map((item, index) => (
                                    <label key={item.purchaseOrderItemId} className="flex min-w-0 cursor-pointer gap-3 rounded-md border p-3 has-[:checked]:border-primary has-[:checked]:bg-muted/50">
                                        <input
                                            type="radio"
                                            name={`${id}-item`}
                                            value={item.purchaseOrderItemId}
                                            aria-label={`Baris ${index + 1}: ${item.name}`}
                                            checked={itemId === item.purchaseOrderItemId}
                                            disabled={locked}
                                            className="mt-1 size-5 shrink-0 accent-primary"
                                            onChange={() => {
                                                if (busy.current || retryRequest) return;
                                                setItemId(item.purchaseOrderItemId);
                                                setError('');
                                                clearPreview();
                                            }}
                                        />
                                        <span className="min-w-0 space-y-1 [overflow-wrap:anywhere]">
                                            <span className="block font-medium">Baris {index + 1}: {item.name}</span>
                                            {item.skuCode && <span className="block text-muted-foreground">SKU: {item.skuCode}</span>}
                                            <span className="block">Harga saat ini: {money(item.unitPrice, true)}</span>
                                            <span className="block">Qty diterima: {formatQuantity(Number(item.receivedQuantity))}</span>
                                            {item.inventory.map(stock => (
                                                <span key={stock.locationId} className="block text-muted-foreground">
                                                    Lokasi {stock.locationName || stock.locationId}: stok {formatQuantity(Number(stock.quantity))}
                                                </span>
                                            ))}
                                            {!item.inventory.length && <span className="block text-muted-foreground">Belum ada stok penerimaan.</span>}
                                        </span>
                                    </label>
                                ))}
                            </div>
                            {context.items.length > 0 && (
                                <div className="space-y-2">
                                    <Label htmlFor={`${id}-price`}>Harga baru per unit (Rp)</Label>
                                    <Input
                                        id={`${id}-price`}
                                        inputMode="decimal"
                                        autoComplete="off"
                                        className="min-h-11"
                                        value={price}
                                        disabled={locked}
                                        aria-describedby={`${id}-price-help`}
                                        aria-invalid={price !== '' && !validPrice}
                                        onChange={event => {
                                            if (busy.current || retryRequest) return;
                                            setPrice(event.target.value);
                                            setError('');
                                            clearPreview();
                                        }}
                                    />
                                    <p id={`${id}-price-help`} className={price && !validPrice ? 'text-destructive' : 'text-muted-foreground'}>
                                        Harga harus lebih dari nol, maksimal 11 angka sebelum desimal dan 4 desimal.
                                        Gunakan koma atau titik desimal tanpa pemisah ribuan. Diskon dan aturan PPN mengikuti PO.
                                    </p>
                                    <Button type="button" className="min-h-11 w-full sm:w-auto" disabled={locked || !selectedItem || !validPrice} onClick={requestPreview}>
                                        {pending === 'preview' ? 'Memuat pratinjau…' : 'Pratinjau'}
                                    </Button>
                                </div>
                            )}
                        </fieldset>
                        {value && (
                            <section aria-label="Pratinjau koreksi harga" className="min-w-0 space-y-4 rounded-md border bg-muted/30 p-3 sm:p-4">
                                <h3 className="font-semibold">Pratinjau koreksi harga</h3>
                                <p>Baris {selectedIndex + 1}: {value.name || selectedItem?.name}</p>
                                {value.skuCode && <p className="text-muted-foreground">SKU: {value.skuCode}</p>}
                                <dl className="grid min-w-0 gap-3 sm:grid-cols-2 [&>div]:min-w-0 [&_dd]:font-medium [&_dd]:[overflow-wrap:anywhere]">
                                    <div><dt>Harga per unit</dt><dd>{money(value.oldUnitPrice, true)} → {money(value.newUnitPrice, true)}</dd></div>
                                    <div><dt>Total tagihan (termasuk PPN)</dt><dd>{money(value.billTotalBefore)} → {money(value.billTotalAfter)}</dd></div>
                                    <div><dt>Δ tagihan (termasuk PPN)</dt><dd>{money(value.billTotalDelta)}</dd></div>
                                    <div><dt>Δ sebelum PPN / Δ PPN</dt><dd>{money(value.billNetDelta)} / {money(value.billTaxDelta)}</dd></div>
                                    <div><dt>Perubahan nilai penerimaan (R)</dt><dd>{money(value.receiptAmount)}</dd></div>
                                    <div><dt>Bagian persediaan</dt><dd>{money(value.inventoryAmount)}</dd></div>
                                    <div><dt>Bagian HPP (barang sudah terpakai)</dt><dd>{money(value.varianceAmount)}</dd></div>
                                </dl>
                                <p className="text-muted-foreground">
                                    Angka positif menambah nilai, angka negatif mengurangi nilai. R adalah selisih nilai barang yang sudah diterima,
                                    dibagi ke persediaan yang masih ada dan HPP untuk bagian yang sudah terpakai.
                                    Jumlah stok tidak berubah; harga rata-rata stok disesuaikan per lokasi.
                                </p>
                                <div
                                    role="region"
                                    aria-label="Alokasi persediaan per lokasi"
                                    tabIndex={0}
                                    className="max-w-full overflow-x-auto rounded-md border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                >
                                    <table className="w-full min-w-[680px] text-left text-sm">
                                        <thead className="bg-muted">
                                            <tr>
                                                <th scope="col" className="p-3">Lokasi</th>
                                                <th scope="col" className="p-3">Qty diterima / stok kini</th>
                                                <th scope="col" className="p-3">Qty dialokasikan ke persediaan</th>
                                                <th scope="col" className="p-3">Bagian persediaan</th>
                                                <th scope="col" className="p-3">Harga rata-rata lama → baru</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {value.locations.map(location => (
                                                <tr key={location.locationId} className="border-t">
                                                    <th scope="row" className="p-3 font-medium">{location.locationName || location.locationId}</th>
                                                    <td className="p-3">{formatQuantity(Number(location.receivedQuantity))} / {formatQuantity(Number(location.stockQuantity))}</td>
                                                    <td className="p-3">{formatQuantity(Number(location.retainedQuantity))}</td>
                                                    <td className="p-3">{money(location.inventoryAmount)}</td>
                                                    <td className="p-3">{money(location.oldAverageCost, true)} → {money(location.newAverageCost, true)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <fieldset disabled={locked} className="min-w-0 space-y-3">
                                    <legend className="mb-3 font-semibold">Konfirmasi koreksi</legend>
                                    <Label htmlFor={`${id}-reason`}>Alasan koreksi</Label>
                                    <Textarea
                                        id={`${id}-reason`}
                                        value={reason}
                                        maxLength={1000}
                                        disabled={locked}
                                        aria-describedby={`${id}-reason-help`}
                                        aria-invalid={reason !== '' && !validReason}
                                        onChange={event => {
                                            if (busy.current || retryRequest) return;
                                            setReason(event.target.value);
                                            setConfirmed(false);
                                        }}
                                    />
                                    <p id={`${id}-reason-help`} className="text-muted-foreground">Alasan wajib diisi, minimal 5 dan maksimal 1.000 karakter.</p>
                                    <div className="flex min-h-11 items-start gap-3">
                                        <Checkbox id={`${id}-confirm`} className="mt-1 size-5" checked={confirmed} disabled={locked} onCheckedChange={checked => setConfirmed(checked === true)} />
                                        <Label htmlFor={`${id}-confirm`} className="min-h-11 leading-relaxed">
                                            Saya menyetujui harga, alasan, serta dampak tagihan, persediaan, dan HPP di atas.
                                        </Label>
                                    </div>
                                </fieldset>
                                {retryRequest && pending !== 'post' && (
                                    <p role="status">Instruksi dikunci untuk percobaan ulang. Tombol Posting koreksi akan memakai kunci transaksi dan isi permintaan yang sama.</p>
                                )}
                                <Button type="button" className="min-h-11 w-full sm:w-auto" disabled={pending !== null || !validReason || !confirmed} onClick={post}>
                                    {pending === 'post' ? 'Memposting koreksi…' : 'Posting koreksi'}
                                </Button>
                            </section>
                        )}
                        {error && <p role="alert" className="rounded-md border border-destructive/40 p-3 text-destructive">{error}</p>}
                    </>
                )}
                {context && (
                    <section aria-label="Riwayat koreksi harga" className="min-w-0 space-y-3">
                        <h3 className="font-semibold">Riwayat koreksi harga</h3>
                        {!context.history.length && <p className="text-muted-foreground">Belum ada koreksi harga.</p>}
                        {context.history.length > 0 && (
                            <div role="region" aria-label="Tabel riwayat koreksi harga" tabIndex={0} className="max-w-full overflow-x-auto rounded-md border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                                <table className="w-full min-w-[680px] text-left text-sm">
                                    <thead className="bg-muted">
                                        <tr>
                                            <th scope="col" className="p-3">Tanggal (WIB)</th>
                                            <th scope="col" className="p-3">Baris PO</th>
                                            <th scope="col" className="p-3">Harga lama → baru</th>
                                            <th scope="col" className="p-3">Dampak nilai</th>
                                            <th scope="col" className="p-3">Alasan</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {context.history.map(entry => {
                                            const index = context.items.findIndex(item => item.purchaseOrderItemId === entry.purchaseOrderItemId);
                                            const item = context.items[index];
                                            return (
                                                <tr key={entry.id} className="border-t [overflow-wrap:anywhere]">
                                                    <td className="p-3">{date(entry.postingDate)}</td>
                                                    <th scope="row" className="p-3 font-medium">
                                                        {item ? `Baris ${index + 1}: ${item.name}` : `Baris ${entry.purchaseOrderItemId}`}
                                                        {item?.skuCode && <span className="block text-muted-foreground">SKU: {item.skuCode}</span>}
                                                    </th>
                                                    <td className="p-3">{money(entry.oldUnitPrice, true)} → {money(entry.newUnitPrice, true)}</td>
                                                    <td className="p-3">R: {money(entry.receiptAmount)} · Persediaan: {money(entry.inventoryAmount)} · HPP: {money(entry.varianceAmount)}</td>
                                                    <td className="whitespace-pre-wrap p-3">{entry.reason}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </section>
                )}
                {(context || loadError) && (
                    <Button type="button" variant="outline" className="min-h-11 w-full sm:w-auto" disabled={locked} onClick={reloadContext}>
                        Muat ulang konteks
                    </Button>
                )}
            </CardContent>
        </Card>
    );
}
