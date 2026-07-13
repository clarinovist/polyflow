'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { duplicateBom } from '@/actions/production/boms';
import { getProductVariants } from '@/actions/production/boms';
import { toast } from 'sonner';
import { Loader2, Copy, Info } from 'lucide-react';

interface DuplicateBomDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    sourceBom: {
        id: string;
        name: string;
        productVariantId: string;
        productVariantName: string;
        outputQuantity: number;
        itemCount?: number;
        category: string;
    };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ProductVariant = any;

export function DuplicateBomDialog({
    open,
    onOpenChange,
    sourceBom,
}: DuplicateBomDialogProps) {
    const router = useRouter();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [variants, setVariants] = useState<ProductVariant[]>([]);
    const [loadingVariants, setLoadingVariants] = useState(false);

    // Form state
    const [targetVariantId, setTargetVariantId] = useState('');
    const [name, setName] = useState(`Salinan - ${sourceBom.name}`);
    const [outputQuantity, setOutputQuantity] = useState(
        sourceBom.outputQuantity.toString()
    );
    const [quantityScale, setQuantityScale] = useState('1');
    const [isDefault, setIsDefault] = useState(true);

    // Reset form when dialog opens with new source
    useEffect(() => {
        if (open) {
            setTargetVariantId('');
            setName(`Salinan - ${sourceBom.name}`);
            setOutputQuantity(sourceBom.outputQuantity.toString());
            setQuantityScale('1');
            setIsDefault(true);
        }
    }, [open, sourceBom]);

    // Fetch product variants when dialog opens
    useEffect(() => {
        if (open && variants.length === 0) {
            setLoadingVariants(true);
            getProductVariants()
                .then((result) => {
                    if (result.success && result.data) {
                        setVariants(result.data);
                    }
                })
                .finally(() => setLoadingVariants(false));
        }
    }, [open, variants.length]);

    const scale = parseFloat(quantityScale);
    const isValidScale = Number.isFinite(scale) && scale > 0;
    const previewScale = isValidScale && scale !== 1 ? ` × ${scale}` : '';

    async function handleSubmit() {
        if (!targetVariantId) {
            toast.error('Pilih variant output terlebih dahulu.');
            return;
        }

        if (!isValidScale) {
            toast.error('Faktor skala harus lebih dari 0.');
            return;
        }

        setIsSubmitting(true);
        try {
            const result = await duplicateBom({
                sourceBomId: sourceBom.id,
                productVariantId: targetVariantId,
                name,
                outputQuantity: outputQuantity ? parseFloat(outputQuantity) : undefined,
                quantityScale: scale,
                isDefault,
            });

            if (result.success) {
                toast.success('Formula berhasil diduplikasi!', {
                    description: `${name} — ${sourceBom.itemCount} bahan${previewScale}`,
                });
                onOpenChange(false);
                router.refresh();
            } else {
                toast.error('Gagal menduplikasi formula', {
                    description: result.error,
                });
            }
        } catch {
            toast.error('Gagal memproses. Silakan coba lagi.');
        } finally {
            setIsSubmitting(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Copy className="h-5 w-5 text-blue-600" />
                        Duplikat Formula
                    </DialogTitle>
                    <DialogDescription>
                        Salin resep dari <strong>{sourceBom.name}</strong> ke variant baru.
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-2">
                    {/* Source info (read-only) */}
                    <div className="rounded-md bg-muted p-3 text-sm">
                        <div className="font-medium text-muted-foreground text-xs uppercase tracking-wider mb-1">
                            Sumber
                        </div>
                        <div>{sourceBom.name}</div>
                        <div className="text-muted-foreground text-xs mt-1">
                            {sourceBom.itemCount} bahan · {sourceBom.category} · Output {sourceBom.outputQuantity}
                        </div>
                    </div>

                    {/* Target variant */}
                    <div className="space-y-2">
                        <Label htmlFor="target-variant">Variant Target *</Label>
                        <Select
                            value={targetVariantId}
                            onValueChange={setTargetVariantId}
                            disabled={loadingVariants}
                        >
                            <SelectTrigger id="target-variant">
                                <SelectValue
                                    placeholder={
                                        loadingVariants
                                            ? 'Memuat variant...'
                                            : 'Pilih variant output...'
                                    }
                                />
                            </SelectTrigger>
                            <SelectContent>
                                {variants.map((variant: ProductVariant) => (
                                    <SelectItem key={variant.id} value={variant.id}>
                                        <span className="font-mono text-xs text-muted-foreground mr-2">
                                            {variant.skuCode}
                                        </span>
                                        {variant.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Name */}
                    <div className="space-y-2">
                        <Label htmlFor="bom-name">Nama Resep *</Label>
                        <Input
                            id="bom-name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Nama resep baru"
                        />
                    </div>

                    {/* Output quantity + Scale side by side */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="output-qty">Output Quantity</Label>
                            <Input
                                id="output-qty"
                                type="number"
                                value={outputQuantity}
                                onChange={(e) => setOutputQuantity(e.target.value)}
                                min="0.0001"
                                step="0.01"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="scale">Faktor Skala Qty</Label>
                            <Input
                                id="scale"
                                type="number"
                                value={quantityScale}
                                onChange={(e) => setQuantityScale(e.target.value)}
                                min="0.0001"
                                step="0.01"
                            />
                        </div>
                    </div>

                    {/* Scale hint */}
                    <div className="flex items-start gap-2 text-xs text-muted-foreground bg-blue-50 dark:bg-blue-950/20 rounded-md p-2">
                        <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 text-blue-600" />
                        <span>
                            Untuk spek beda berat: scale 0,9 = 90% qty bahan. Scrap % tidak diubah.
                        </span>
                    </div>

                    {/* isDefault */}
                    <div className="flex items-center gap-2">
                        <Checkbox
                            id="is-default"
                            checked={isDefault}
                            onCheckedChange={(checked) => setIsDefault(checked === true)}
                        />
                        <Label htmlFor="is-default" className="text-sm font-normal cursor-pointer">
                            Jadikan default
                        </Label>
                    </div>

                    {/* Preview */}
                    <div className="rounded-md border border-dashed p-3 text-sm">
                        <span className="font-medium">Preview:</span>{' '}
                        {sourceBom.itemCount} bahan{previewScale ? ` (scale ${scale})` : ' (sama dengan sumber)'}
                        {isDefault ? ' · Default: Ya' : ''}
                    </div>
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
                        onClick={handleSubmit}
                        disabled={isSubmitting || !targetVariantId || !isValidScale}
                        className="bg-blue-600 hover:bg-blue-700"
                    >
                        {isSubmitting ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Menduplikasi...
                            </>
                        ) : (
                            <>
                                <Copy className="mr-2 h-4 w-4" />
                                Duplikat Formula
                            </>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
