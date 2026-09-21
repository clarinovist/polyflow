'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { Loader2, Factory } from 'lucide-react';
import {
    createSpkFromDemand,
    previewSpkFromDemand,
} from '@/actions/production/production-demand';
import { isRiskyOutputLocation } from '@/lib/locations/resolve-location';

type CreationPreview =
    | { kind: 'order'; orderCount: number }
    | { kind: 'run'; routeName: string; orderCount: number };

type Machine = {
    id: string;
    name: string;
    code: string;
    type: string;
    status: string;
};

type Location = {
    id: string;
    name: string;
    slug?: string;
    locationPurpose?: string | null;
};

interface CreateSpkFromDemandDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    productVariantId: string;
    productName: string;
    variantName: string;
    skuCode: string;
    unit: string;
    /** Default qty hint (uncoveredNeed) */
    defaultQuantity: number;
    machines: Machine[];
    locations: Location[];
    onCreated?: () => void;
}

export function CreateSpkFromDemandDialog({
    open,
    onOpenChange,
    productVariantId,
    productName,
    variantName,
    skuCode,
    unit,
    defaultQuantity,
    machines,
    locations,
    onCreated,
}: CreateSpkFromDemandDialogProps) {
    const router = useRouter();
    const [quantity, setQuantity] = useState('');
    const [selectedMachineId, setSelectedMachineId] = useState('');
    const [selectedLocationId, setSelectedLocationId] = useState('');
    const [priority, setPriority] = useState<'URGENT' | 'NORMAL' | 'LOW'>(
        'NORMAL',
    );
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [preview, setPreview] = useState<{
        productVariantId: string;
        data: CreationPreview;
    } | null>(null);
    const [previewError, setPreviewError] = useState<string | null>(null);
    const [previewAttempt, setPreviewAttempt] = useState(0);
    const currentPreview =
        open && preview?.productVariantId === productVariantId
            ? preview.data
            : null;

    useEffect(() => {
        let cancelled = false;
        setPreview(null);
        setPreviewError(null);
        if (open) {
            previewSpkFromDemand(productVariantId)
                .then((result) => {
                    if (cancelled) return;
                    if (result.success)
                        setPreview({ productVariantId, data: result.data });
                    else
                        setPreviewError(
                            result.error || 'Gagal memeriksa hasil pembuatan.',
                        );
                })
                .catch(() => {
                    if (!cancelled)
                        setPreviewError(
                            'Gagal memeriksa hasil pembuatan. Silakan coba lagi.',
                        );
                });
        }
        return () => {
            cancelled = true;
        };
    }, [open, productVariantId, previewAttempt]);
    // Reuse the same key across timeout/retry; rotate only after a committed run.
    const idempotencyKeyRef = useRef(`demand-${crypto.randomUUID()}`);

    // Filter locations to FG/production relevant ones
    const fgLocations = useMemo(() => {
        return locations.filter(
            (l) =>
                l.locationPurpose === 'FINISHED_GOOD' ||
                l.locationPurpose === 'GENERAL_PURPOSE' ||
                l.locationPurpose === 'WIP' ||
                l.locationPurpose === 'PACKING',
        );
    }, [locations]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!currentPreview || isSubmitting) return;

        const qty = parseFloat(quantity) || defaultQuantity;
        if (qty <= 0) {
            toast.error('Jumlah harus lebih dari 0');
            return;
        }
        if (!selectedLocationId) {
            toast.error('Pilih lokasi output');
            return;
        }

        setIsSubmitting(true);
        try {
            const machineId =
                !selectedMachineId || selectedMachineId === '__none'
                    ? undefined
                    : selectedMachineId;

            const result = await createSpkFromDemand({
                productVariantId,
                plannedQuantity: qty,
                machineId,
                locationId: selectedLocationId,
                priority,
                notes: `Dari Papan Permintaan FG — ${productName} ${variantName}`,
                idempotencyKey: idempotencyKeyRef.current,
            });

            if (result.success) {
                const created = result.data;
                if ('run' in created) {
                    toast.success(
                        'Rangkaian Produksi berhasil dibuat beserta SPK tahapannya',
                    );
                    router.push(`/production/runs/${created.run.id}`);
                } else {
                    toast.success(
                        `SPK berhasil dibuat untuk ${productName} ${variantName}`,
                    );
                    router.push(`/production/orders/${created.order.id}`);
                }
                onOpenChange(false);
                onCreated?.();
                // Reset
                setQuantity('');
                setSelectedMachineId('');
                setSelectedLocationId('');
                setPriority('NORMAL');
                idempotencyKeyRef.current = `demand-${crypto.randomUUID()}`;
            } else {
                toast.error(result.error || 'Gagal membuat dokumen produksi');
            }
        } catch {
            toast.error('Gagal membuat dokumen produksi. Silakan coba lagi.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[480px] max-h-[90dvh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Factory className="h-5 w-5" />
                        Produksi dari Permintaan FG
                    </DialogTitle>
                    <DialogDescription>
                        {productName} — {variantName} ({skuCode})
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div
                        className="rounded-lg border bg-muted/40 p-3 text-sm"
                        role="status"
                    >
                        {currentPreview ? (
                            <>
                                <p className="font-medium">
                                    {currentPreview.kind === 'run'
                                        ? `Akan membuat rangkaian dengan ${currentPreview.orderCount} SPK.`
                                        : 'Akan membuat 1 SPK.'}
                                </p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                    {currentPreview.kind === 'run'
                                        ? `Routing: ${currentPreview.routeName}. Satu SPK per tahap; mesin dan lokasi mengikuti routing.`
                                        : 'Menggunakan BOM default aktif untuk satu tahap.'}{' '}
                                    Berdasarkan konfigurasi saat ini; hasil
                                    akhir mengikuti konfigurasi saat disimpan.
                                </p>
                            </>
                        ) : previewError ? (
                            <>
                                <p className="text-destructive">
                                    {previewError}
                                </p>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="mt-2"
                                    onClick={() =>
                                        setPreviewAttempt(
                                            (attempt) => attempt + 1,
                                        )
                                    }
                                >
                                    Coba lagi
                                </Button>
                            </>
                        ) : (
                            'Memeriksa hasil pembuatan…'
                        )}
                    </div>

                    {/* Quantity */}
                    <div className="space-y-2">
                        <Label htmlFor="quantity">Jumlah ({unit})</Label>
                        <Input
                            id="quantity"
                            type="number"
                            placeholder={defaultQuantity.toString()}
                            value={quantity}
                            onChange={(e) => setQuantity(e.target.value)}
                            min="0"
                            step="any"
                        />
                        <p className="text-xs text-muted-foreground">
                            Belum di-SPK:{' '}
                            {defaultQuantity.toLocaleString('id-ID')} {unit}
                        </p>
                    </div>

                    {/* Machine selection (optional) */}
                    <div className="space-y-2">
                        <Label htmlFor="machine">
                            Mesin (opsional, untuk SPK satu tahap)
                        </Label>
                        <Select
                            value={selectedMachineId}
                            onValueChange={setSelectedMachineId}
                            disabled={currentPreview?.kind === 'run'}
                        >
                            <SelectTrigger id="machine">
                                <SelectValue placeholder="Pilih mesin..." />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="__none">
                                    Tanpa Mesin
                                </SelectItem>
                                {machines
                                    .filter((m) => m.status === 'ACTIVE')
                                    .map((machine) => (
                                        <SelectItem
                                            key={machine.id}
                                            value={machine.id}
                                        >
                                            <div className="flex items-center gap-2">
                                                <span className="font-medium">
                                                    {machine.code}
                                                </span>
                                                <span className="text-xs text-muted-foreground">
                                                    {machine.name}
                                                </span>
                                            </div>
                                        </SelectItem>
                                    ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Location */}
                    <div className="space-y-2">
                        <Label htmlFor="location">
                            {currentPreview?.kind === 'run'
                                ? 'Lokasi Output Cadangan'
                                : 'Lokasi Output'}
                        </Label>
                        {currentPreview?.kind === 'run' && (
                            <p className="text-xs text-muted-foreground">
                                Tetap diperlukan jika routing tidak lagi
                                tersedia saat disimpan dan sistem membuat satu
                                SPK. Untuk rangkaian, lokasi tiap tahap
                                mengikuti routing.
                            </p>
                        )}
                        <Select
                            value={selectedLocationId}
                            onValueChange={setSelectedLocationId}
                        >
                            <SelectTrigger id="location">
                                <SelectValue placeholder="Pilih lokasi..." />
                            </SelectTrigger>
                            <SelectContent>
                                {fgLocations.map((loc) => {
                                    const risky = isRiskyOutputLocation({
                                        ...loc,
                                        slug: loc.slug || '',
                                    });
                                    return (
                                        <SelectItem
                                            key={loc.id}
                                            value={loc.id}
                                            disabled={risky}
                                        >
                                            {loc.name}{' '}
                                            {risky ? '(Terlarang)' : ''}
                                        </SelectItem>
                                    );
                                })}
                                {fgLocations.length === 0 &&
                                    locations.map((loc) => {
                                        const risky = isRiskyOutputLocation({
                                            ...loc,
                                            slug: loc.slug || '',
                                        });
                                        return (
                                            <SelectItem
                                                key={loc.id}
                                                value={loc.id}
                                                disabled={risky}
                                            >
                                                {loc.name}{' '}
                                                {risky ? '(Terlarang)' : ''}
                                            </SelectItem>
                                        );
                                    })}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Priority */}
                    <div className="space-y-2">
                        <Label htmlFor="priority">Prioritas</Label>
                        <Select
                            value={priority}
                            onValueChange={(v) =>
                                setPriority(v as 'URGENT' | 'NORMAL' | 'LOW')
                            }
                        >
                            <SelectTrigger id="priority">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="URGENT">
                                    🔴 URGENT
                                </SelectItem>
                                <SelectItem value="NORMAL">
                                    🟡 NORMAL
                                </SelectItem>
                                <SelectItem value="LOW">🟢 LOW</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                            disabled={isSubmitting}
                        >
                            Batal
                        </Button>
                        <Button
                            type="submit"
                            disabled={
                                isSubmitting ||
                                !selectedLocationId ||
                                !currentPreview
                            }
                        >
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Membuat...
                                </>
                            ) : currentPreview?.kind === 'run' ? (
                                'Buat Rangkaian Produksi'
                            ) : (
                                'Buat SPK'
                            )}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
