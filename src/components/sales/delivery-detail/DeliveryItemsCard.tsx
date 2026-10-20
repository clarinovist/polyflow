import type { DeliveryOrderDetailData } from './types';
import type { Dispatch, SetStateAction } from 'react';
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { salesLabels } from '@/lib/labels';
import { getEnteredQuantityDisplay } from '@/lib/utils/production-units';

interface DeliveryItemsCardProps {
    items: DeliveryOrderDetailData['items'];
    canEditQty: boolean;
    editingQty: boolean;
    savingQty: boolean;
    qtyDraft: Record<string, string>;
    notesDraft: Record<string, string>;
    setQtyDraft: Dispatch<SetStateAction<Record<string, string>>>;
    setNotesDraft: Dispatch<SetStateAction<Record<string, string>>>;
    setEditingQty: Dispatch<SetStateAction<boolean>>;
    startEditQty: () => void;
    handleSaveQty: () => Promise<void>;
    onRevise?: () => void;
    residualByVariant?: Record<string, number>;
}

export function DeliveryItemsCard({
    items,
    canEditQty,
    editingQty,
    savingQty,
    qtyDraft,
    notesDraft,
    setQtyDraft,
    setNotesDraft,
    setEditingQty,
    startEditQty,
    handleSaveQty,
    onRevise,
    residualByVariant,
}: DeliveryItemsCardProps) {
    return (
        <Card>
            <CardHeader className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <CardTitle>Item Pengiriman</CardTitle>
                    <CardDescription>
                        {canEditQty
                            ? 'Ubah muatan sebelum dikirim. Perubahan perintah mengharuskan verifikasi ulang.'
                            : 'Item dalam pengiriman ini'}
                    </CardDescription>
                </div>
                {canEditQty && !editingQty && (
                    <Button
                        type="button"
                        variant="outline"
                        className="min-h-11"
                        onClick={startEditQty}
                    >
                        {salesLabels.editSjQty}
                    </Button>
                )}
            </CardHeader>
            <CardContent className="space-y-4">
                {editingQty && (
                    <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-2">
                        <p>
                            <strong>Ubah SJ saja:</strong> qty tidak boleh
                            melebihi sisa SO yang belum dikirim. Sisa pesanan
                            tetap terbuka; nilai SO tidak berubah.
                        </p>
                        <p>
                            <strong>Revisi SO + SJ:</strong> untuk melebihi sisa
                            SO, mengganti/menambah barang, atau membatalkan sisa
                            pesanan.
                        </p>
                        {!onRevise && (
                            <p>
                                Untuk revisi SO + SJ, minta Sales membuka Surat
                                Jalan ini dari Penjualan. Gudang tetap dapat
                                mencatat hitungan fisik.
                            </p>
                        )}
                        <p>
                            Qty di bawah menggunakan satuan utama, bukan jumlah
                            kemasan.
                        </p>
                    </div>
                )}
                <div
                    role="region"
                    aria-label="Item pengiriman"
                    tabIndex={0}
                    className="space-y-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                    {items.map((item) => {
                        const name =
                            item.productVariant?.name ||
                            item.productVariant?.product?.name ||
                            'Barang';
                        const unit = item.productVariant?.primaryUnit || '';
                        const residual = item.productVariantId
                            ? residualByVariant?.[item.productVariantId]
                            : undefined;
                        const exceeds =
                            residual != null &&
                            Number(qtyDraft[item.id]) > residual;
                        return (
                            <div
                                key={item.id}
                                className="min-w-0 rounded-lg border p-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(10rem,1fr)]"
                            >
                                <div className="min-w-0">
                                    <p className="font-medium break-words">
                                        {item.productVariant?.product?.name}
                                    </p>
                                    <p className="text-sm break-words">
                                        {item.productVariant?.name}
                                    </p>
                                    <p className="text-xs text-muted-foreground break-all">
                                        {item.productVariant?.skuCode}
                                    </p>
                                </div>
                                <div className="min-w-0 space-y-3">
                                    {editingQty ? (
                                        <label className="block text-sm">
                                            Qty kirim {name} ({unit})
                                            <Input
                                                type="number"
                                                step="0.0001"
                                                min="0"
                                                className="min-h-11 w-full"
                                                value={qtyDraft[item.id] ?? ''}
                                                onChange={(e) =>
                                                    setQtyDraft((prev) => ({
                                                        ...prev,
                                                        [item.id]:
                                                            e.target.value,
                                                    }))
                                                }
                                            />
                                            {residual != null && (
                                                <span
                                                    className={
                                                        exceeds
                                                            ? 'text-destructive'
                                                            : 'text-muted-foreground'
                                                    }
                                                >
                                                    Batas SJ:{' '}
                                                    {residual.toLocaleString(
                                                        'id-ID',
                                                    )}{' '}
                                                    {unit} (sisa SO).
                                                    {exceeds
                                                        ? ' Melebihi batas — gunakan revisi SO + SJ melalui Sales.'
                                                        : ''}
                                                </span>
                                            )}
                                        </label>
                                    ) : (
                                        <p className="font-medium">
                                            {getEnteredQuantityDisplay({
                                                ...item,
                                                ...item.productVariant,
                                            } as unknown as import('@/lib/utils/production-units').EnteredQuantitySnapshot)}
                                        </p>
                                    )}
                                    {editingQty ? (
                                        <label className="block text-sm">
                                            {salesLabels.sjItemNotesLabel}{' '}
                                            {name}
                                            <Input
                                                type="text"
                                                maxLength={200}
                                                className="min-h-11 w-full"
                                                placeholder={
                                                    salesLabels.sjItemNotesPlaceholder
                                                }
                                                value={
                                                    notesDraft[item.id] ?? ''
                                                }
                                                onChange={(e) =>
                                                    setNotesDraft((prev) => ({
                                                        ...prev,
                                                        [item.id]:
                                                            e.target.value,
                                                    }))
                                                }
                                            />
                                        </label>
                                    ) : (
                                        <p className="text-sm text-muted-foreground break-words">
                                            {item.notes || '-'}
                                        </p>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
                {canEditQty && editingQty && (
                    <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-3 [&_button]:min-h-11">
                        <Button
                            type="button"
                            variant="ghost"
                            disabled={savingQty}
                            onClick={() => setEditingQty(false)}
                        >
                            Batal
                        </Button>
                        {onRevise && (
                            <Button
                                type="button"
                                variant="outline"
                                disabled={savingQty}
                                onClick={onRevise}
                            >
                                Revisi SO + SJ
                            </Button>
                        )}
                        <Button
                            type="button"
                            disabled={savingQty}
                            onClick={handleSaveQty}
                        >
                            {savingQty ? 'Menyimpan…' : salesLabels.saveSjQty}
                        </Button>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
