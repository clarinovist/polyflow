'use client';

import { useState } from 'react';
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Check, AlertTriangle, Lock, Copy } from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
    saveDeliveryLoadVerification,
    confirmDeliveryLoadVerified,
    correctDeliveryQtyToVerified,
} from '@/actions/inventory/deliveries';
import {
    getEnteredQuantityDisplay,
    formatQuantity,
    type EnteredQuantitySnapshot,
} from '@/lib/utils/production-units';

interface LoadVerifyItem {
    id: string;
    quantity: number | string;
    verifiedQuantity?: number | string | null;
    enteredQuantity?: number | string | null;
    enteredUnit?: string | null;
    conversionFactorSnapshot?: number | string | null;
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

function getDisplayUnit(item: LoadVerifyItem): string {
    const enteredUnit = item.enteredUnit;
    const primaryUnit = item.productVariant?.primaryUnit || 'KG';
    return enteredUnit && enteredUnit !== primaryUnit
        ? enteredUnit
        : primaryUnit;
}

function hasUnitConversion(item: LoadVerifyItem): boolean {
    const factor = item.conversionFactorSnapshot
        ? Number(item.conversionFactorSnapshot)
        : null;
    return Boolean(
        item.enteredUnit &&
        item.enteredUnit !== item.productVariant?.primaryUnit &&
        factor &&
        factor > 0,
    );
}

function getPlannedQtyInDisplayUnit(item: LoadVerifyItem): number {
    if (item.enteredQuantity != null && hasUnitConversion(item)) {
        return Number(item.enteredQuantity);
    }
    return Number(item.quantity);
}

function getPlannedDisplay(item: LoadVerifyItem): string {
    return getEnteredQuantityDisplay({
        quantity: item.quantity,
        enteredQuantity: item.enteredQuantity,
        enteredUnit: item.enteredUnit,
        primaryUnit: item.productVariant?.primaryUnit,
    } as EnteredQuantitySnapshot);
}

// Convert a value entered in the display unit (e.g. BAL) to primaryUnit (e.g. KG)
// for persistence — server compares verifiedQuantity against item.quantity in primaryUnit.
function toPrimaryUnitQty(item: LoadVerifyItem, displayValue: number): number {
    if (!hasUnitConversion(item)) return displayValue;
    const factor = Number(item.conversionFactorSnapshot);
    return Math.round(displayValue * factor * 10000) / 10000;
}

// Convert a primaryUnit quantity (e.g. verifiedQuantity stored in KG) back to the
// display unit (e.g. BAL) for showing in the input / read-only verified column.
function fromPrimaryUnitQty(
    item: LoadVerifyItem,
    primaryValue: number,
): number {
    if (!hasUnitConversion(item)) return primaryValue;
    const factor = Number(item.conversionFactorSnapshot);
    return Math.round((primaryValue / factor) * 10000) / 10000;
}

function getVerifiedDisplay(item: LoadVerifyItem): string {
    if (item.verifiedQuantity == null) return '-';
    const baseQty = Number(item.verifiedQuantity);
    const primaryUnit = item.productVariant?.primaryUnit || 'KG';
    if (!hasUnitConversion(item)) {
        return `${formatQuantity(baseQty)} ${primaryUnit}`;
    }
    const displayQty = fromPrimaryUnitQty(item, baseQty);
    return `${formatQuantity(displayQty)} ${getDisplayUnit(item)} (${formatQuantity(baseQty)} ${primaryUnit})`;
}

export function LoadVerifyPanel({
    deliveryOrderId,
    items,
    isVerified,
    canEdit,
}: LoadVerifyPanelProps) {
    const [verifyDraft, setVerifyDraft] = useState<Record<string, string>>(
        () => {
            const draft: Record<string, string> = {};
            for (const item of items) {
                draft[item.id] =
                    item.verifiedQuantity != null
                        ? String(
                              fromPrimaryUnitQty(
                                  item,
                                  Number(item.verifiedQuantity),
                              ),
                          )
                        : '';
            }
            return draft;
        },
    );
    const [saving, setSaving] = useState(false);
    const [confirming, setConfirming] = useState(false);
    const [correcting, setCorrecting] = useState(false);
    const router = useRouter();

    const buildVerifiedPayload = () =>
        Object.entries(verifyDraft)
            .filter(([, v]) => v !== '')
            .map(([id, v]) => {
                const item = items.find((i) => i.id === id);
                return {
                    id,
                    verifiedQuantity: item
                        ? toPrimaryUnitQty(item, Number(v))
                        : Number(v),
                };
            });

    const handleSave = async () => {
        const payload = buildVerifiedPayload();

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
            const payload = buildVerifiedPayload();
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
            draft[item.id] = String(getPlannedQtyInDisplayUnit(item));
        }
        setVerifyDraft(draft);
    };

    const handleCorrectToPhysical = async () => {
        setCorrecting(true);
        try {
            // Save current verified quantities first
            const payload = buildVerifiedPayload();

            if (payload.length === 0) {
                toast.error('Isi minimal satu qty verifikasi sebelum koreksi');
                setCorrecting(false);
                return;
            }

            const saveResult = await saveDeliveryLoadVerification({
                deliveryOrderId,
                items: payload,
            });
            if (!saveResult.success) {
                toast.error(saveResult.error || 'Gagal menyimpan verifikasi');
                setCorrecting(false);
                return;
            }

            // Now correct DO qty to match verified and lock
            const result = await correctDeliveryQtyToVerified(deliveryOrderId);
            if (result.success) {
                toast.success(
                    'DO dikoreksi ke qty fisik & verifikasi terkunci. Siap Tandai Dikirim.',
                );
                router.refresh();
            } else {
                toast.error(result.error || 'Gagal mengoreksi qty');
            }
        } catch {
            toast.error('Gagal mengoreksi qty');
        } finally {
            setCorrecting(false);
        }
    };

    const getItemStatus = (item: LoadVerifyItem) => {
        const verified = verifyDraft[item.id];
        if (verified === '') return 'pending';
        const planned = getPlannedQtyInDisplayUnit(item);
        const physical = Number(verified);
        if (Math.abs(planned - physical) < 0.0001) return 'match';
        return 'mismatch';
    };

    const allItemsVerified = items.every((item) => verifyDraft[item.id] !== '');
    const allItemsMatch = items.every((item) => {
        const verified = verifyDraft[item.id];
        if (verified === '') return false;
        const planned = getPlannedQtyInDisplayUnit(item);
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
                        <Badge
                            variant="secondary"
                            className="bg-green-100 text-green-800"
                        >
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
                                <th className="h-10 px-4 text-left font-medium">
                                    Produk
                                </th>
                                <th className="h-10 px-4 text-right font-medium">
                                    Perintah (qty)
                                </th>
                                <th className="h-10 px-4 text-right font-medium">
                                    Dihitung / Dimuat
                                </th>
                                <th className="h-10 px-4 text-center font-medium">
                                    Status
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {items.map((item) => {
                                const status = getItemStatus(item);
                                return (
                                    <tr
                                        key={item.id}
                                        className="hover:bg-muted/50"
                                    >
                                        <td className="p-4">
                                            <div className="font-medium">
                                                {
                                                    item.productVariant?.product
                                                        ?.name
                                                }
                                            </div>
                                            <div className="text-xs text-muted-foreground">
                                                {item.productVariant?.name}
                                            </div>
                                        </td>
                                        <td className="p-4 text-right font-medium">
                                            {getPlannedDisplay(item)}
                                        </td>
                                        <td className="p-4 text-right">
                                            {canEdit ? (
                                                <div className="inline-flex items-center gap-1.5 justify-end">
                                                    <Input
                                                        type="number"
                                                        step="0.01"
                                                        min="0"
                                                        className="h-8 w-28 text-right"
                                                        value={
                                                            verifyDraft[
                                                                item.id
                                                            ] ?? ''
                                                        }
                                                        onChange={(e) =>
                                                            setVerifyDraft(
                                                                (prev) => ({
                                                                    ...prev,
                                                                    [item.id]:
                                                                        e.target
                                                                            .value,
                                                                }),
                                                            )
                                                        }
                                                        placeholder="0"
                                                    />
                                                    <span className="text-xs text-muted-foreground">
                                                        {getDisplayUnit(item)}
                                                    </span>
                                                </div>
                                            ) : (
                                                <span className="font-medium">
                                                    {getVerifiedDisplay(item)}
                                                </span>
                                            )}
                                        </td>
                                        <td className="p-4 text-center">
                                            {status === 'match' && (
                                                <Badge
                                                    variant="secondary"
                                                    className="bg-green-100 text-green-800"
                                                >
                                                    <Check className="h-3 w-3 mr-1" />{' '}
                                                    Sesuai
                                                </Badge>
                                            )}
                                            {status === 'mismatch' && (
                                                <Badge
                                                    variant="secondary"
                                                    className="bg-amber-100 text-amber-800"
                                                >
                                                    <AlertTriangle className="h-3 w-3 mr-1" />{' '}
                                                    Selisih
                                                </Badge>
                                            )}
                                            {status === 'pending' && (
                                                <Badge
                                                    variant="secondary"
                                                    className="bg-gray-100 text-gray-600"
                                                >
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
                                disabled={saving || correcting}
                            >
                                <Copy className="h-3.5 w-3.5 mr-1" />
                                Samakan semua ke perintah
                            </Button>
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="border-amber-300 text-amber-700 hover:bg-amber-50"
                                onClick={handleCorrectToPhysical}
                                disabled={
                                    correcting ||
                                    saving ||
                                    isVerified ||
                                    !allItemsVerified ||
                                    allItemsMatch
                                }
                                title="Koreksi qty perintah muat ke qty fisik yang dihitung"
                            >
                                <AlertTriangle className="h-3.5 w-3.5 mr-1" />
                                {correcting
                                    ? 'Mengoreksi...'
                                    : 'Koreksi Perintah ke Qty Fisik'}
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
                                disabled={
                                    confirming || !allItemsMatch || isVerified
                                }
                                onClick={handleConfirm}
                            >
                                <Lock className="h-3.5 w-3.5 mr-1" />
                                {confirming
                                    ? 'Mengunci...'
                                    : 'Kunci Verifikasi'}
                            </Button>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
