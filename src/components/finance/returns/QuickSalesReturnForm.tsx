'use client';

import { useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
const money = (value: string) =>
    new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(Number(value));
import {
    quickReturnSelectionSchema,
    type QuickReturnPreview,
} from '@/lib/finance/quick-sales-return';
import {
    getFinanceQuickReturnOrders,
    getFinanceQuickReturnItems,
    previewFinanceQuickReturn,
    postFinanceQuickReturn,
} from '@/actions/finance/sales-returns';

type Order = { id: string; orderNumber: string };
type Item = {
    productVariantId: string;
    name: string;
    skuCode: string;
    unit: string;
};
export function QuickSalesReturnForm({
    initialOrders,
}: {
    initialOrders: Order[];
}) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [orders, setOrders] = useState(initialOrders);
    const [search, setSearch] = useState('');
    const [orderId, setOrderId] = useState('');
    const [items, setItems] = useState<Item[]>([]);
    const [quantities, setQuantities] = useState<Record<string, string>>({});
    const [preview, setPreview] = useState<QuickReturnPreview | null>(null);
    const [confirmed, setConfirmed] = useState(false);
    const [error, setError] = useState('');
    const [saved, setSaved] = useState<{
        id: string;
        returnNumber: string;
    } | null>(null);
    const requestId = useRef<string | null>(null);
    const posting = useRef(false);
    const invalidate = () => {
        setPreview(null);
        setConfirmed(false);
        requestId.current = null;
        setError('');
    };
    const selection = () =>
        quickReturnSelectionSchema.parse({
            salesOrderId: orderId,
            items: items
                .filter(
                    (item) =>
                        quantities[item.productVariantId] &&
                        Number(quantities[item.productVariantId]) !== 0,
                )
                .map((item) => ({
                    productVariantId: item.productVariantId,
                    quantity: quantities[item.productVariantId],
                })),
        });
    const run = (task: () => Promise<void>) =>
        startTransition(async () => {
            setError('');
            try {
                await task();
            } catch (error) {
                setError(
                    error instanceof Error
                        ? error.message
                        : 'Proses gagal. Silakan coba lagi.',
                );
            }
        });
    const loadOrder = (id: string) => {
        invalidate();
        setOrderId(id);
        setItems([]);
        setQuantities({});
        if (!id) return;
        run(async () => {
            const result = await getFinanceQuickReturnItems(id);
            if (!result.success) {
                setError(result.error);
                return;
            }
            setItems(result.data ?? []);
        });
    };
    const review = () =>
        run(async () => {
            invalidate();
            const parsed = quickReturnSelectionSchema.safeParse({
                salesOrderId: orderId,
                items: items
                    .filter(
                        (item) =>
                            quantities[item.productVariantId] &&
                            Number(quantities[item.productVariantId]) !== 0,
                    )
                    .map((item) => ({
                        productVariantId: item.productVariantId,
                        quantity: quantities[item.productVariantId],
                    })),
            });
            if (!parsed.success) {
                setError(parsed.error.issues[0].message);
                return;
            }
            const result = await previewFinanceQuickReturn(parsed.data);
            if (!result.success || !result.data) {
                setError(
                    !result.success
                        ? result.error
                        : 'Ringkasan tidak tersedia.',
                );
                return;
            }
            setPreview(result.data);
            requestId.current = crypto.randomUUID();
        });
    const post = () => {
        if (!preview || !confirmed || posting.current || !requestId.current)
            return;
        posting.current = true;
        run(async () => {
            try {
                const result = await postFinanceQuickReturn({
                    selection: selection(),
                    requestId: requestId.current,
                    fingerprint: preview.fingerprint,
                    confirmed: true,
                });
                if (!result.success || !result.data) {
                    setError(
                        !result.success
                            ? result.error
                            : 'Hasil belum tersedia. Coba lagi dengan permintaan yang sama.',
                    );
                    return;
                }
                setSaved(result.data);
                router.refresh();
            } finally {
                posting.current = false;
            }
        });
    };
    if (saved)
        return (
            <section role="status" className="space-y-4 rounded-lg border p-5">
                <h2 className="text-lg font-semibold">
                    Retur tersimpan, stok bertambah, tagihan berkurang.
                </h2>
                <p className="break-all text-sm">{saved.returnNumber}</p>
                <Button asChild>
                    <Link href={`/finance/returns/${saved.id}`}>
                        Lihat retur & potongan
                    </Link>
                </Button>
            </section>
        );
    return (
        <div className="space-y-6">
            <p className="text-sm text-muted-foreground">
                Untuk barang baik yang sudah diterima kembali. Pilih SO, lalu
                isi satu kolom jumlah per produk. Harga, pajak, pelanggan, dan
                gudang diambil dari dokumen sumber.
            </p>
            <fieldset
                disabled={pending}
                className="space-y-5 disabled:opacity-70"
            >
                <form
                    className="flex flex-wrap items-end gap-2"
                    onSubmit={(event) => {
                        event.preventDefault();
                        run(async () => {
                            const result =
                                await getFinanceQuickReturnOrders(search);
                            if (!result.success) {
                                setError(result.error);
                                return;
                            }
                            setOrders(result.data ?? []);
                        });
                    }}
                >
                    <label
                        htmlFor="quick-return-search"
                        className="min-w-0 flex-1 space-y-1 text-sm"
                    >
                        Cari nomor SO
                        <Input
                            id="quick-return-search"
                            value={search}
                            maxLength={100}
                            onChange={(event) => setSearch(event.target.value)}
                        />
                    </label>
                    <Button type="submit" variant="outline">
                        Cari
                    </Button>
                </form>
                <label
                    htmlFor="quick-return-order"
                    className="block space-y-1 text-sm"
                >
                    Referensi SO
                    <select
                        id="quick-return-order"
                        value={orderId}
                        onChange={(event) => loadOrder(event.target.value)}
                        className="h-11 w-full rounded-md border bg-background px-3"
                    >
                        <option value="">
                            Pilih SO yang masih memiliki tagihan
                        </option>
                        {orderId &&
                            !orders.some((order) => order.id === orderId) && (
                                <option value={orderId}>SO terpilih</option>
                            )}
                        {orders.map((order) => (
                            <option key={order.id} value={order.id}>
                                {order.orderNumber}
                            </option>
                        ))}
                    </select>
                </label>
                {!orders.length && (
                    <p className="text-sm">
                        Tidak ada SO sesuai pencarian dengan invoice belum
                        lunas. Invoice yang tercatat lunas perlu diperiksa di
                        Finance, bukan dibuatkan retur ulang.
                    </p>
                )}
                {orderId && !items.length && !pending && (
                    <p className="text-sm">
                        Tidak ada produk barang jadi yang dapat diretur pada SO
                        ini.
                    </p>
                )}
                {items.length > 0 && (
                    <section
                        className="space-y-3"
                        aria-label="Jumlah produk retur"
                    >
                        <p className="text-sm text-muted-foreground">
                            Kosongkan atau isi 0 untuk produk yang tidak
                            diretur. Gunakan satuan yang tercantum.
                        </p>
                        {items.map((item) => (
                            <div
                                key={item.productVariantId}
                                className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
                            >
                                <div className="min-w-0 flex-1">
                                    <p className="break-words font-medium">
                                        {item.name}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        {item.skuCode}
                                    </p>
                                </div>
                                <label
                                    htmlFor={`qty-${item.productVariantId}`}
                                    className="w-36 space-y-1 text-sm"
                                >
                                    Jumlah retur ({item.unit})
                                    <Input
                                        id={`qty-${item.productVariantId}`}
                                        inputMode="decimal"
                                        value={
                                            quantities[item.productVariantId] ??
                                            ''
                                        }
                                        placeholder="0"
                                        onChange={(event) => {
                                            invalidate();
                                            setQuantities((current) => ({
                                                ...current,
                                                [item.productVariantId]:
                                                    event.target.value.replace(
                                                        ',',
                                                        '.',
                                                    ),
                                            }));
                                        }}
                                    />
                                </label>
                            </div>
                        ))}
                        <Button
                            type="button"
                            onClick={review}
                            variant="outline"
                        >
                            Periksa potongan
                        </Button>
                    </section>
                )}
                {preview && (
                    <section
                        className="space-y-4 rounded-lg border bg-muted/30 p-4"
                        aria-label="Ringkasan retur"
                    >
                        <h2 className="font-semibold">
                            Potongan {preview.invoiceNumber}
                        </h2>
                        <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                            <dt>Tagihan sebelum retur</dt>
                            <dd className="font-medium">
                                {money(preview.remaining)}
                            </dd>
                            <dt>Potongan retur (termasuk pajak)</dt>
                            <dd className="font-medium">
                                {money(preview.totalAmount)}
                            </dd>
                            <dt>Sisa tagihan setelah retur</dt>
                            <dd className="font-semibold">
                                {money(preview.remainingAfter)}
                            </dd>
                            <dt>Stok barang jadi masuk ke</dt>
                            <dd>{preview.locationName}</dd>
                        </dl>
                        {preview.source === 'SO_REVIEW' && (
                            <p className="text-sm">
                                Invoice lama tanpa snapshot: nominal diusulkan
                                dari SO yang cocok dengan jurnal invoice.
                                Periksa ringkasan sebelum menyetujui.
                            </p>
                        )}
                        <label className="flex min-h-11 items-start gap-3 text-sm">
                            <input
                                type="checkbox"
                                checked={confirmed}
                                onChange={(event) =>
                                    setConfirmed(event.target.checked)
                                }
                                className="mt-1 size-5 shrink-0"
                            />
                            Barang dalam kondisi baik sudah diterima sesuai
                            jumlah di atas. Saya menyetujui penambahan stok dan
                            pemotongan tagihan ini.
                        </label>
                        <Button
                            type="button"
                            onClick={post}
                            disabled={!confirmed}
                            className="h-auto min-h-11 whitespace-normal"
                        >
                            Simpan retur & potong tagihan
                        </Button>
                    </section>
                )}
            </fieldset>
            {pending && (
                <p role="status" className="text-sm">
                    Memproses…
                </p>
            )}
            {error && (
                <p
                    role="alert"
                    className="rounded-md border border-destructive p-3 text-sm text-destructive"
                >
                    {error}
                </p>
            )}
            <p className="text-sm text-muted-foreground">
                Retur yang sudah pernah diterima jangan dimasukkan ulang di
                sini. Barang rusak, beberapa invoice/pengiriman, atau nilai yang
                perlu rekonsiliasi tetap memakai pemeriksaan terpisah.
            </p>
        </div>
    );
}
