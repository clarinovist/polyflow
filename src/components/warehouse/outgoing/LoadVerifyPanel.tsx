'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Check, AlertTriangle, Lock, Copy } from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
    saveDeliveryLoadVerification,
    confirmDeliveryLoadVerified,
} from '@/actions/inventory/deliveries';
import {
    getEnteredQuantityDisplay,
    type EnteredQuantitySnapshot,
} from '@/lib/utils/production-units';

interface LoadVerifyItem {
    id: string;
    quantity: number | string;
    verifiedQuantity?: number | string | null;
    enteredQuantity?: number | string | null;
    enteredUnit?: string | null;
    productVariant?: {
        name?: string;
        skuCode?: string;
        primaryUnit?: string | null;
        product?: { name?: string };
    } | null;
}

interface LoadVerifyPanelProps {
    deliveryOrderId: string;
    items: LoadVerifyItem[];
    isVerified: boolean;
    canEdit: boolean;
}

export function LoadVerifyPanel({ deliveryOrderId, items, isVerified, canEdit }: LoadVerifyPanelProps) {
    const [verifyDraft, setVerifyDraft] = useState<Record<string, string>>(() => {
        const draft: Record<string, string> = {};
        for (const item of items) {
            draft[item.id] = item.verifiedQuantity != null ? String(item.verifiedQuantity) : '';
        }
        return draft;
    });
    const [saving, setSaving] = useState(false);
    const [confirming, setConfirming] = useState(false);
    const router = useRouter();

    const handleSave = async () => {
        const payload = Object.entries(verifyDraft)
            .filter(([, v]) => v !== '')
            .map(([id, v]) => ({
                id,
                verifiedQuantity: Number(v),
            }));

        if (payload.length === 0) {
            toast.error('Isi minimal satu qty verifikasi');
            return;
        }

        setSaving(true);
        try {
            const result = await saveDeliveryLoadVerification({
                deliveryOrderId,
                items: payload,
            });
            if (result.success) {
                toast.success('Qty verifikasi tersimpan');
                router.refresh();
            } else {
                toast.error(result.error || 'Gagal menyimpan verifikasi');
            }
        } catch {
            toast.error('Gagal menyimpan verifikasi');
        } finally {
            setSaving(false);
        }
    };

    const handleConfirm = async () => {
        if (!allItemsMatch) {
            toast.error('Semua baris harus sesuai perintah sebelum dikunci');
            return;
        }
        setConfirming(true);
        try {
            // Persist draft first — confirm reads from DB
            const payload = Object.entries(verifyDraft).map(([id, v]) => ({
                id,
                verifiedQuantity: Number(v),
            }));
            const saveResult = await saveDeliveryLoadVerification({
                deliveryOrderId,
                items: payload,
            });
            if (!saveResult.success) {
                toast.error(saveResult.error || 'Gagal menyimpan verifikasi');
                return;
            }

            const result = await confirmDeliveryLoadVerified(deliveryOrderId);
            if (result.success) {
                toast.success('Verifikasi terkunci. Siap Tandai Dikirim.');
                router.refresh();
            } else {
                toast.error(result.error || 'Gagal mengunci verifikasi');
            }
        } catch {
            toast.error('Gagal mengunci verifikasi');
        } finally {
            setConfirming(false);
        }
    };

    const handleMatchAll = () => {
        const draft: Record<string, string> = {};
        for (const item of items) {
            draft[item.id] = String(Number(item.quantity));
        }
        setVerifyDraft(draft);
    };

    const getItemStatus = (item: LoadVerifyItem) => {
        const verified = verifyDraft[item.id];
        if (verified === '') return 'pending';
        const planned = Number(item.quantity);
        const physical = Number(verified);
        if (Math.abs(planned - physical) < 0.0001) return 'match';
        return 'mismatch';
    };

    const allItemsVerified = items.every((item) => verifyDraft[item.id] !== '');
    const allItemsMatch = items.every((item) => {
        const verified = verifyDraft[item.id];
        if (verified === '') return false;
        const planned = Number(item.quantity);
        const physical = Number(verified);
        return Math.abs(planned - physical) < 0.0001;
    });

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle>Verifikasi Muat</CardTitle>
                        <CardDescription>
                            {canEdit
                                ? 'Cek qty fisik vs perintah muat. Kunci verifikasi sebelum Tandai Dikirim.'
                                : 'Verifikasi sudah terkunci.'}
                        </CardDescription>
                    </div>
                    {isVerified && (
                        <Badge variant="secondary" className="bg-green-100 text-green-800">
                            <Check className="h-3 w-3 mr-1" /> Terverifikasi
                        </Badge>
                    )}
                </div>
            </CardHeader>
            <CardContent>
                <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/50 border-b">
                            <tr>
                                <th className="h-10 px-4 text-left font-medium">Produk</th>
                                <th className="h-10 px-4 text-right font-medium">Perintah (qty)</th>
                                <th className="h-10 px-4 text-right font-medium">Dihitung / Dimuat</th>
                                <th className="h-10 px-4 text-center font-medium">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {items.map((item) => {
                                const status = getItemStatus(item);
                                return (
                                    <tr key={item.id} className="hover:bg-muted/50">
                                        <td className="p-4">
                                            <div className="font-medium">{item.productVariant?.product?.name}</div>
                                            <div className="text-xs text-muted-foreground">
                                                {item.productVariant?.name}
                                            </div>
                                        </td>
                                        <td className="p-4 text-right font-medium">
                                            {getEnteredQuantityDisplay({
                                                quantity: item.quantity,
                                                enteredUnit: item.enteredUnit,
                                                primaryUnit: item.productVariant?.primaryUnit,
                                            } as EnteredQuantitySnapshot)}
                                        </td>
                                        <td className="p-4 text-right">
                                            {canEdit ? (
                                                <div className="inline-flex items-center gap-1.5 justify-end">
                                                    <Input
                                                        type="number"
                                                        step="0.01"
                                                        min="0"
                                                        className="h-8 w-28 text-right"
                                                        value={verifyDraft[item.id] ?? ''}
                                                        onChange={(e) =>
                                                            setVerifyDraft((prev) => ({
                                                                ...prev,
                                                                [item.id]: e.target.value,
                                                            }))
                                                        }
                                                        placeholder="0"
                                                    />
                                                    <span className="text-xs text-muted-foreground">
                                                        {item.enteredUnit ||
                                                            item.productVariant?.primaryUnit ||
                                                            ''}
                                                    </span>
                                                </div>
                                            ) : (
                                                <span className="font-medium">
                                                    {item.verifiedQuantity != null
                                                        ? getEnteredQuantityDisplay({
                                                              quantity: item.verifiedQuantity,
                                                              enteredUnit: item.enteredUnit,
                                                              primaryUnit: item.productVariant?.primaryUnit,
                                                          } as EnteredQuantitySnapshot)
                                                        : '-'}
                                                </span>
                                            )}
                                        </td>
                                        <td className="p-4 text-center">
                                            {status === 'match' && (
                                                <Badge variant="secondary" className="bg-green-100 text-green-800">
                                                    <Check className="h-3 w-3 mr-1" /> Sesuai
                                                </Badge>
                                            )}
                                            {status === 'mismatch' && (
                                                <Badge variant="secondary" className="bg-amber-100 text-amber-800">
                                                    <AlertTriangle className="h-3 w-3 mr-1" /> Selisih
                                                </Badge>
                                            )}
                                            {status === 'pending' && (
                                                <Badge variant="secondary" className="bg-gray-100 text-gray-600">
                                                    Belum dicek
                                                </Badge>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {canEdit && (
                    <div className="flex items-center justify-between mt-4">
                        <div className="flex items-center gap-2">
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={handleMatchAll}
                                disabled={saving}
                            >
                                <Copy className="h-3.5 w-3.5 mr-1" />
                                Samakan semua ke perintah
                            </Button>
                        </div>
                        <div className="flex items-center gap-2">
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={saving || !allItemsVerified}
                                onClick={handleSave}
                            >
                                {saving ? 'Menyimpan...' : 'Simpan Verifikasi'}
                            </Button>
                            <Button
                                type="button"
                                size="sm"
                                className="bg-green-600 hover:bg-green-700 text-white"
                                disabled={confirming || !allItemsMatch || isVerified}
                                onClick={handleConfirm}
                            >
                                <Lock className="h-3.5 w-3.5 mr-1" />
                                {confirming ? 'Mengunci...' : 'Kunci Verifikasi'}
                            </Button>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
