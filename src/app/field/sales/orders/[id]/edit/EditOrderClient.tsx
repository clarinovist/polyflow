'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { ArrowLeft, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { formatRupiah } from '@/lib/utils/utils';
import { updateFieldSalesOrder } from '@/actions/sales/field-actions';

interface EditableItem {
    id?: string;
    productVariantId: string;
    productName: string;
    variantName: string;
    quantity: number;
    unitPrice: number;
    discountPercent: number;
    taxPercent: number;
    dppOtherAmount: number | null;
    ppnMode: 'INCLUDE' | 'EXCLUDE';
    isFreeItem: boolean;
    deliveredQty: number;
}

interface ProductOption {
    id: string;
    name: string;
    productName: string;
    skuCode: string | null;
    sellPrice: number | null;
    displayUnit: string;
}

interface EditOrderClientProps {
    order: {
        id: string;
        orderNumber: string;
        status: string;
        customerName: string;
        customerId?: string;
        salesRepId: string | null;
        sourceLocationId: string;
        orderDate: string;
        expectedDate: string | null;
        notes: string;
        shippingCost: number;
        hasInvoices: boolean;
        items: EditableItem[];
    };
    products: ProductOption[];
}

export function EditOrderClient({ order, products }: EditOrderClientProps) {
    const router = useRouter();
    const [items, setItems] = useState<EditableItem[]>(order.items);
    const [isSaving, setIsSaving] = useState(false);
    const [pickerValue, setPickerValue] = useState('');

    const priceLocked = order.hasInvoices;

    const totals = useMemo(() => {
        let subtotal = 0;
        let discount = 0;
        let tax = 0;

        for (const item of items) {
            const gross = item.quantity * item.unitPrice;
            const disc = gross * ((item.discountPercent || 0) / 100);
            const afterDisc = gross - disc;
            const itemTax =
                item.ppnMode === 'INCLUDE'
                    ? 0
                    : afterDisc * ((item.taxPercent || 0) / 100);

            subtotal += gross;
            discount += disc;
            tax += itemTax;
        }

        const total = subtotal - discount + tax + (order.shippingCost || 0);
        return { subtotal, discount, tax, total };
    }, [items, order.shippingCost]);

    const updateQty = (index: number, raw: string) => {
        const value = Number(raw);
        setItems((prev) =>
            prev.map((item, i) =>
                i === index
                    ? { ...item, quantity: Number.isFinite(value) ? value : 0 }
                    : item,
            ),
        );
    };

    const updatePrice = (index: number, raw: string) => {
        const value = Number(raw);
        setItems((prev) =>
            prev.map((item, i) =>
                i === index
                    ? { ...item, unitPrice: Number.isFinite(value) ? value : 0 }
                    : item,
            ),
        );
    };

    const removeItem = (index: number) => {
        setItems((prev) => prev.filter((_, i) => i !== index));
    };

    const addProduct = (variantId: string) => {
        const product = products.find((p) => p.id === variantId);
        if (!product) return;

        setItems((prev) => [
            ...prev,
            {
                productVariantId: product.id,
                productName: product.productName,
                variantName: product.name,
                quantity: 1,
                unitPrice: product.sellPrice ?? 0,
                discountPercent: 0,
                taxPercent: 0,
                dppOtherAmount: null,
                ppnMode: 'EXCLUDE',
                isFreeItem: false,
                deliveredQty: 0,
            },
        ]);
        setPickerValue('');
    };

    const handleSave = async () => {
        if (items.length === 0) {
            toast.error('Minimal harus ada 1 item.');
            return;
        }

        const belowDelivered = items.find(
            (item) => item.deliveredQty > 0 && item.quantity < item.deliveredQty,
        );
        if (belowDelivered) {
            toast.error(
                `Qty ${belowDelivered.productName} tidak boleh kurang dari ${belowDelivered.deliveredQty} (sudah terkirim).`,
            );
            return;
        }

        if (items.some((item) => item.quantity <= 0)) {
            toast.error('Qty setiap item harus lebih dari 0.');
            return;
        }

        setIsSaving(true);
        try {
            // PENTING: kirim SELURUH item (lama + baru), bukan hanya yang
            // berubah. Backend memakai payload ini sebagai kebenaran penuh —
            // item yang tidak dikirim dan belum terkirim akan dihapus.
            // Plan: docs/plan/2026-08-22-edit-item-so-sales-field.md
            const result = await updateFieldSalesOrder({
                id: order.id,
                customerId: order.customerId,
                salesRepId: order.salesRepId,
                sourceLocationId: order.sourceLocationId,
                orderDate: new Date(order.orderDate),
                expectedDate: order.expectedDate
                    ? new Date(order.expectedDate)
                    : null,
                notes: order.notes,
                shippingCost: order.shippingCost,
                items: items.map((item) => ({
                    ...(item.id ? { id: item.id } : {}),
                    productVariantId: item.productVariantId,
                    quantity: item.quantity,
                    unitPrice: item.unitPrice,
                    discountPercent: item.discountPercent,
                    taxPercent: item.taxPercent,
                    dppOtherAmount: item.dppOtherAmount,
                    ppnMode: item.ppnMode,
                    isFreeItem: item.isFreeItem,
                })),
            } as Parameters<typeof updateFieldSalesOrder>[0]);

            if (result?.success) {
                toast.success('Perubahan tersimpan.');
                router.push(`/field/sales/orders/${order.id}`);
                router.refresh();
            } else {
                toast.error(
                    ('error' in (result ?? {}) && result.error) ||
                        'Gagal menyimpan perubahan.',
                );
            }
        } catch (error) {
            toast.error(
                error instanceof Error
                    ? error.message
                    : 'Gagal menyimpan perubahan.',
            );
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="pb-40">
            <div className="sticky top-0 z-30 bg-background border-b px-4 py-3 flex items-center gap-3">
                <Button variant="ghost" size="icon" asChild>
                    <Link href={`/field/sales/orders/${order.id}`}>
                        <ArrowLeft className="h-5 w-5" />
                    </Link>
                </Button>
                <div className="min-w-0">
                    <p className="font-semibold text-sm truncate">
                        Edit Item · {order.orderNumber}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                        {order.customerName}
                    </p>
                </div>
            </div>

            <div className="p-4 space-y-3">
                {priceLocked && (
                    <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 rounded-lg px-3 py-2">
                        Invoice sudah terbit — harga tidak bisa diubah. Qty
                        masih bisa disesuaikan.
                    </p>
                )}

                {items.map((item, index) => {
                    const isDelivered = item.deliveredQty > 0;
                    return (
                        <Card key={item.id ?? `new-${index}`}>
                            <CardContent className="p-3 space-y-2">
                                <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                        <p className="text-sm font-medium truncate">
                                            {item.productName}
                                        </p>
                                        <p className="text-xs text-muted-foreground truncate">
                                            {item.variantName}
                                        </p>
                                    </div>
                                    {isDelivered ? (
                                        <Badge
                                            variant="secondary"
                                            className="shrink-0 text-[11px]"
                                        >
                                            Terkirim: {item.deliveredQty}
                                        </Badge>
                                    ) : (
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="shrink-0 text-destructive"
                                            onClick={() => removeItem(index)}
                                            aria-label="Hapus item"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    )}
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <label className="text-[11px] text-muted-foreground">
                                            Qty
                                        </label>
                                        <Input
                                            type="number"
                                            inputMode="decimal"
                                            min={
                                                isDelivered
                                                    ? item.deliveredQty
                                                    : 0
                                            }
                                            value={item.quantity}
                                            onChange={(e) =>
                                                updateQty(index, e.target.value)
                                            }
                                            className="h-10"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[11px] text-muted-foreground">
                                            Harga
                                        </label>
                                        <Input
                                            type="number"
                                            inputMode="decimal"
                                            min={0}
                                            value={item.unitPrice}
                                            disabled={priceLocked}
                                            onChange={(e) =>
                                                updatePrice(
                                                    index,
                                                    e.target.value,
                                                )
                                            }
                                            className="h-10"
                                        />
                                    </div>
                                </div>

                                <p className="text-xs text-right text-muted-foreground">
                                    Subtotal:{' '}
                                    {formatRupiah(
                                        item.quantity * item.unitPrice,
                                    )}
                                </p>
                            </CardContent>
                        </Card>
                    );
                })}

                <div>
                    <label className="text-xs text-muted-foreground">
                        Tambah item
                    </label>
                    <Select value={pickerValue} onValueChange={addProduct}>
                        <SelectTrigger className="h-11">
                            <SelectValue placeholder="Pilih produk..." />
                        </SelectTrigger>
                        <SelectContent>
                            {products.map((p) => (
                                <SelectItem key={p.id} value={p.id}>
                                    {p.productName} — {p.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <div className="fixed bottom-16 left-0 right-0 bg-background border-t p-4 space-y-2 z-40 shadow-lg">
                <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Subtotal</span>
                    <span>{formatRupiah(totals.subtotal)}</span>
                </div>
                {totals.discount > 0 && (
                    <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Diskon</span>
                        <span>-{formatRupiah(totals.discount)}</span>
                    </div>
                )}
                {totals.tax > 0 && (
                    <div className="flex justify-between text-xs text-muted-foreground">
                        <span>PPN</span>
                        <span>{formatRupiah(totals.tax)}</span>
                    </div>
                )}
                <div className="flex justify-between text-sm font-semibold">
                    <span>Total</span>
                    <span>{formatRupiah(totals.total)}</span>
                </div>
                <Button
                    className="w-full h-11 rounded-xl font-semibold"
                    disabled={isSaving}
                    onClick={handleSave}
                >
                    <Save className="h-4.5 w-4.5 mr-1.5" />
                    {isSaving ? 'Menyimpan...' : 'Simpan Perubahan'}
                </Button>
            </div>
        </div>
    );
}
