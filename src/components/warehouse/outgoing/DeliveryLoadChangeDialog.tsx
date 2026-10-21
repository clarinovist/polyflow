'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { updateDeliveryItemQuantities } from '@/actions/inventory/deliveries';
import { DeliveryRevisionDialog } from '@/components/sales/DeliveryRevisionDialog';

export interface DeliveryLoadChangeItem {
    id: string;
    productVariantId?: string;
    quantity: number;
    productVariant?: { name?: string; primaryUnit?: string | null } | null;
}

/** Uses the same audited SJ-only action and Sales-only revision dialog as desktop. */
export function DeliveryLoadChangeDialog({
    deliveryOrderId,
    orderNumber,
    items,
    residualByVariant,
    initialQuantities,
    canReviseOrder,
    onClose,
    onSaved,
}: {
    deliveryOrderId: string;
    orderNumber: string;
    items: DeliveryLoadChangeItem[];
    residualByVariant: Record<string, number>;
    initialQuantities: Record<string, number>;
    canReviseOrder: boolean;
    onClose: () => void;
    onSaved: () => void;
}) {
    const [draft, setDraft] = useState<Record<string, string>>(() =>
        Object.fromEntries(
            items.map((item) => [
                item.id,
                String(initialQuantities[item.id] ?? item.quantity),
            ]),
        ),
    );
    const [reviewing, setReviewing] = useState(false);
    const contentRef = useRef<HTMLDivElement>(null);
    const titleRef = useRef<HTMLHeadingElement>(null);
    useEffect(() => {
        if (reviewing) {
            if (contentRef.current) contentRef.current.scrollTop = 0;
            titleRef.current?.focus({ preventScroll: true });
        }
    }, [reviewing]);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [revision, setRevision] = useState<Record<string, number> | null>(
        null,
    );
    const payload = items.map((item) => ({
        id: item.id,
        quantity: Number(draft[item.id]),
    }));
    const valid =
        items.length > 0 &&
        items.every(
            (item) =>
                draft[item.id]?.trim() &&
                Number.isFinite(Number(draft[item.id])) &&
                Number(draft[item.id]) >= 0,
        );
    const exceeds = items.some((item) => {
        const residual = item.productVariantId
            ? residualByVariant[item.productVariantId]
            : undefined;
        return residual != null && Number(draft[item.id]) > residual + 0.000001;
    });
    const number = (value: number) =>
        value.toLocaleString('id-ID', { maximumFractionDigits: 4 });

    async function save() {
        if (!valid || exceeds || saving) return;
        setSaving(true);
        setError('');
        try {
            const result = await updateDeliveryItemQuantities({
                deliveryOrderId,
                items: payload,
            });
            if (!result.success) {
                setError(
                    result.error || 'Gagal menyimpan muatan. Periksa kembali.',
                );
                return;
            }
            onSaved();
        } catch {
            setError(
                'Gagal menyimpan muatan. Muat ulang untuk memastikan status sebelum mencoba lagi.',
            );
        } finally {
            setSaving(false);
        }
    }

    if (revision) {
        return (
            <DeliveryRevisionDialog
                deliveryOrderId={deliveryOrderId}
                defaultOpen
                hideTrigger
                initialQuantities={revision}
                onClosed={() => setRevision(null)}
                onSaved={onSaved}
            />
        );
    }

    return (
        <Dialog
            open
            onOpenChange={(open) => {
                if (!open && !saving) onClose();
            }}
        >
            <DialogContent
                ref={contentRef}
                showCloseButton={false}
                className="max-h-[85dvh] sm:max-w-xl"
            >
                <DialogHeader>
                    <DialogTitle ref={titleRef} tabIndex={-1}>
                        {reviewing ? 'Tinjau perubahan muatan' : 'Ubah muatan'}
                    </DialogTitle>
                    <DialogDescription>
                        {orderNumber} · Ubah SJ saja. Sisa pesanan tetap terbuka
                        dan nilai SO tidak berubah.
                    </DialogDescription>
                </DialogHeader>
                <p className="text-sm text-muted-foreground">
                    Qty memakai satuan utama, bukan jumlah kemasan. Menyimpan
                    perubahan akan membuka verifikasi; hitung dan kunci ulang
                    sebelum dikirim.
                </p>
                <div className="space-y-3">
                    {items.map((item) => {
                        const name = item.productVariant?.name || 'Barang';
                        const unit = item.productVariant?.primaryUnit || 'KG';
                        const residual = item.productVariantId
                            ? residualByVariant[item.productVariantId]
                            : undefined;
                        return (
                            <div
                                key={item.id}
                                className="min-w-0 rounded-lg border p-3 space-y-2"
                            >
                                <p className="font-medium break-words">
                                    {name}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                    Perintah saat ini: {number(item.quantity)}{' '}
                                    {unit}
                                </p>
                                {reviewing ? (
                                    <p className="font-semibold">
                                        Muatan baru:{' '}
                                        {number(Number(draft[item.id]))} {unit}
                                    </p>
                                ) : (
                                    <label className="block text-sm space-y-1">
                                        <span>
                                            Qty kirim {name} ({unit})
                                        </span>
                                        <Input
                                            type="number"
                                            inputMode="decimal"
                                            min="0"
                                            step="0.0001"
                                            className="min-h-11"
                                            value={draft[item.id] ?? ''}
                                            onChange={(event) => {
                                                setError('');
                                                setDraft({
                                                    ...draft,
                                                    [item.id]:
                                                        event.target.value,
                                                });
                                            }}
                                        />
                                    </label>
                                )}
                                {residual != null && (
                                    <p className="text-sm text-muted-foreground">
                                        Batas SJ: {number(residual)} {unit}{' '}
                                        (sisa SO).
                                    </p>
                                )}
                            </div>
                        );
                    })}
                </div>
                {exceeds && (
                    <p role="alert" className="text-sm text-destructive">
                        Muatan melebihi sisa SO. Kurangi qty atau gunakan revisi
                        SO + SJ melalui Sales/Admin.
                    </p>
                )}
                {error && (
                    <p role="alert" className="text-sm text-destructive">
                        {error}
                    </p>
                )}
                <div className="rounded-lg border bg-muted/30 p-3 space-y-2 text-sm">
                    <p>
                        Untuk tambah/ganti barang, melebihi sisa SO, atau
                        membatalkan sisa pesanan, gunakan revisi SO + SJ.
                    </p>
                    {canReviseOrder ? (
                        <Button
                            variant="outline"
                            className="min-h-11 w-full"
                            disabled={saving || !valid}
                            onClick={() =>
                                setRevision(
                                    Object.fromEntries(
                                        items.flatMap((item) =>
                                            item.productVariantId
                                                ? [
                                                      [
                                                          item.productVariantId,
                                                          Number(
                                                              draft[item.id],
                                                          ),
                                                      ],
                                                  ]
                                                : [],
                                        ),
                                    ),
                                )
                            }
                        >
                            Revisi SO + SJ
                        </Button>
                    ) : (
                        <p>
                            Minta Sales/Admin merevisi Surat Jalan{' '}
                            <strong>{orderNumber}</strong>. Anda tetap bisa
                            menyimpan hitungan fisik dari panel Verifikasi Muat;
                            jumlah lebih belum diizinkan untuk dikirim.
                        </p>
                    )}
                </div>
                <div className="flex flex-col gap-2 [&_button]:min-h-11">
                    {reviewing ? (
                        <>
                            <Button
                                onClick={save}
                                disabled={saving || !valid || exceeds}
                            >
                                {saving
                                    ? 'Menyimpan...'
                                    : 'Simpan perubahan SJ'}
                            </Button>
                            <Button
                                variant="outline"
                                disabled={saving}
                                onClick={() => {
                                    setReviewing(false);
                                    setError('');
                                }}
                            >
                                Kembali mengedit
                            </Button>
                        </>
                    ) : (
                        <Button
                            disabled={!valid || exceeds}
                            onClick={() => setReviewing(true)}
                        >
                            Tinjau perubahan
                        </Button>
                    )}
                    <Button variant="ghost" disabled={saving} onClick={onClose}>
                        Batal
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
