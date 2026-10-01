'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { requestAdditionalMaterial } from '@/actions/production/production';
import { Button } from '@/components/ui/button';
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from '@/components/ui/command';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';

export type KioskMaterialOption = {
    id: string;
    name: string;
    skuCode: string;
    primaryUnit: string;
    product: { productType: string };
};

interface AdditionalMaterialRequestDialogProps {
    productionOrderId: string;
    orderNumber: string;
    operatorId: string;
    materials: KioskMaterialOption[];
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    trigger?: React.ReactNode;
    onSuccess?: () => void;
}

export function AdditionalMaterialRequestDialog({
    productionOrderId,
    orderNumber,
    operatorId,
    materials,
    open: controlledOpen,
    onOpenChange,
    trigger,
    onSuccess,
}: AdditionalMaterialRequestDialogProps) {
    const [internalOpen, setInternalOpen] = useState(false);
    const [materialPickerOpen, setMaterialPickerOpen] = useState(false);
    const [productVariantId, setProductVariantId] = useState('');
    const [quantity, setQuantity] = useState('');
    const [reason, setReason] = useState('');
    const [loading, setLoading] = useState(false);
    const [requestId, setRequestId] = useState(() => crypto.randomUUID());

    const open = controlledOpen ?? internalOpen;
    const setOpen = (nextOpen: boolean) => {
        setInternalOpen(nextOpen);
        onOpenChange?.(nextOpen);
    };

    const selected = materials.find((item) => item.id === productVariantId);

    useEffect(() => {
        if (open) {
            setProductVariantId('');
            setQuantity('');
            setReason('');
            setRequestId(crypto.randomUUID());
        }
    }, [open]);

    const handleOpenChange = (nextOpen: boolean) => {
        setOpen(nextOpen);
    };

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        const numericQuantity = Number(quantity);
        if (!selected || !Number.isFinite(numericQuantity) || numericQuantity <= 0) {
            toast.error('Pilih bahan dan isi jumlah yang valid.');
            return;
        }
        if (reason.trim().length < 3) {
            toast.error('Isi alasan singkat agar gudang memahami kebutuhannya.');
            return;
        }

        setLoading(true);
        try {
            const result = await requestAdditionalMaterial({
                productionOrderId,
                productVariantId,
                quantity: numericQuantity,
                reason,
                operatorId,
                clientRequestId: requestId,
            });
            if (!result.success) {
                toast.error(result.error);
                return;
            }
            toast.success(
                result.data.idempotent
                    ? 'Permintaan ini sudah diterima sebelumnya.'
                    : 'Permintaan terkirim ke gudang. Stok belum dipotong sampai dikonfirmasi.',
            );
            setOpen(false);
            onSuccess?.();
        } catch {
            toast.error('Gagal mengirim permintaan. Silakan coba lagi.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Ajukan Bahan Tambahan</DialogTitle>
                    <DialogDescription>
                        SPK {orderNumber}. Permintaan dikirim ke gudang; stok dan
                        HPP baru berubah setelah gudang mengonfirmasi.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="additional-material-picker">Bahan</Label>
                        <Popover
                            open={materialPickerOpen}
                            onOpenChange={setMaterialPickerOpen}
                        >
                            <PopoverTrigger asChild>
                                <Button
                                    id="additional-material-picker"
                                    type="button"
                                    variant="outline"
                                    role="combobox"
                                    aria-expanded={materialPickerOpen}
                                    className="h-12 w-full justify-between text-left"
                                >
                                    <span className="truncate">
                                        {selected
                                            ? `${selected.name} (${selected.skuCode})`
                                            : 'Cari bahan...'}
                                    </span>
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                                <Command>
                                    <CommandInput placeholder="Cari nama atau SKU..." />
                                    <CommandList>
                                        <CommandEmpty>Bahan tidak ditemukan.</CommandEmpty>
                                        <CommandGroup>
                                            {materials.map((material) => (
                                                <CommandItem
                                                    key={material.id}
                                                    value={`${material.name} ${material.skuCode}`}
                                                    onSelect={() => {
                                                        setProductVariantId(material.id);
                                                        setMaterialPickerOpen(false);
                                                    }}
                                                >
                                                    <span className="min-w-0 flex-1 truncate">
                                                        {material.name}
                                                    </span>
                                                    <span className="ml-2 text-xs text-muted-foreground">
                                                        {material.skuCode}
                                                    </span>
                                                </CommandItem>
                                            ))}
                                        </CommandGroup>
                                    </CommandList>
                                </Command>
                            </PopoverContent>
                        </Popover>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="additional-material-quantity">
                            Jumlah {selected ? `(${selected.primaryUnit})` : ''}
                        </Label>
                        <Input
                            id="additional-material-quantity"
                            type="number"
                            inputMode="decimal"
                            min="0.0001"
                            step="0.0001"
                            className="h-12 text-lg font-bold"
                            value={quantity}
                            onChange={(event) => setQuantity(event.target.value)}
                            placeholder="0"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="additional-material-reason">Alasan</Label>
                        <Textarea
                            id="additional-material-reason"
                            value={reason}
                            onChange={(event) => setReason(event.target.value)}
                            maxLength={500}
                            rows={3}
                            placeholder="Contoh: campuran terlalu kering, perlu pelembab"
                        />
                    </div>

                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setOpen(false)}
                            disabled={loading}
                            className="h-12"
                        >
                            Batal
                        </Button>
                        <Button type="submit" disabled={loading} className="h-12">
                            {loading && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
                            Kirim ke Gudang
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
