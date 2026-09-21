'use client';

import React, { useState, useMemo } from 'react';
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
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from '@/components/ui/command';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { Loader2, Factory, Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils/utils';
import { quickCreateProductionOrder } from '@/actions/production/production';
import { getCompatibleMachineTypes, MachineStageMap } from '@/lib/production/machine-compatibility';

type Bom = {
    id: string;
    name: string;
    category: string;
    productVariant: {
        id: string;
        name: string;
        product: {
            name: string;
        };
    };
};

type Machine = {
    id: string;
    name: string;
    code: string;
    type: string;
    status: string;
};

export function QuickProduceDialog({
    open,
    onOpenChange,
    boms,
    machines,
    machineStageMap,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    boms: Bom[];
    machines: Machine[];
    machineStageMap?: MachineStageMap | null;
}) {
    const router = useRouter();
    const [selectedBomId, setSelectedBomId] = useState('');
    const [quantity, setQuantity] = useState('');
    const [selectedMachineId, setSelectedMachineId] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [bomComboboxOpen, setBomComboboxOpen] = useState(false);

    // Find selected BOM
    const selectedBom = useMemo(
        () => boms.find((b) => b.id === selectedBomId),
        [boms, selectedBomId],
    );

    // Filter compatible machines based on BOM category
    const compatibleMachines = useMemo(() => {
        if (!selectedBom) return [];
        const allowedTypes = getCompatibleMachineTypes(
            selectedBom.category,
            machineStageMap,
        );
        return machines.filter((m) => allowedTypes.includes(m.type));
    }, [selectedBom, machines, machineStageMap]);

    // Reset machine when BOM changes
    const handleBomChange = (bomId: string) => {
        setSelectedBomId(bomId);
        setSelectedMachineId('');
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!selectedBomId || !quantity || !selectedMachineId) {
            toast.error('Lengkapi semua field');
            return;
        }

        const qty = parseFloat(quantity);
        if (isNaN(qty) || qty <= 0) {
            toast.error('Jumlah harus lebih dari 0');
            return;
        }

        setIsSubmitting(true);
        try {
            const result = await quickCreateProductionOrder({
                bomId: selectedBomId,
                plannedQuantity: qty,
                machineId: selectedMachineId,
            });

            if (result.success) {
                toast.success('SPK berhasil dibuat');
                onOpenChange(false);
                router.push(`/production/orders/${result.data.id}`);
                // Reset form
                setSelectedBomId('');
                setQuantity('');
                setSelectedMachineId('');
            } else {
                toast.error(result.error || 'Gagal membuat SPK');
            }
        } catch {
            toast.error('Gagal menyimpan. Silakan coba lagi.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Factory className="h-5 w-5" />
                        Buat SPK Cepat
                    </DialogTitle>
                    <DialogDescription>
                        Akan membuat 1 SPK untuk satu tahap dari BOM yang dipilih.
                        Ini bukan penambahan master produk.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Product / BOM selection — searchable combobox */}
                    <div className="space-y-2">
                        <Label htmlFor="bom">Produk</Label>
                        <Popover
                            open={bomComboboxOpen}
                            onOpenChange={setBomComboboxOpen}
                        >
                            <PopoverTrigger asChild>
                                <Button
                                    id="bom"
                                    variant="outline"
                                    role="combobox"
                                    aria-expanded={bomComboboxOpen}
                                    className="w-full justify-between font-normal"
                                >
                                    {selectedBom ? (
                                        <span className="flex flex-col items-start min-w-0">
                                            <span className="truncate font-medium">
                                                {selectedBom.productVariant.name}
                                            </span>
                                            <span className="text-xs text-muted-foreground">
                                                {selectedBom.category} • {selectedBom.name}
                                            </span>
                                        </span>
                                    ) : (
                                        <span className="text-muted-foreground">
                                            Pilih produk...
                                        </span>
                                    )}
                                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="p-0" align="start">
                                <Command
                                    filter={(value, search) => {
                                        const bom = boms.find(
                                            (b) => b.id === value,
                                        );
                                        if (!bom) return 0;
                                        const q = search.toLowerCase();
                                        return (
                                            bom.productVariant.name
                                                .toLowerCase()
                                                .includes(q) ||
                                            bom.name
                                                .toLowerCase()
                                                .includes(q) ||
                                            bom.category.toLowerCase().includes(q)
                                        )
                                            ? 1
                                            : 0;
                                    }}
                                >
                                    <CommandInput placeholder="Cari produk..." />
                                    <CommandList>
                                        <CommandEmpty>
                                            Tidak ada produk ditemukan.
                                        </CommandEmpty>
                                        <CommandGroup>
                                            {boms.map((bom) => (
                                                <CommandItem
                                                    key={bom.id}
                                                    value={bom.id}
                                                    onSelect={(currentValue) => {
                                                        handleBomChange(
                                                            currentValue ===
                                                                selectedBomId
                                                                ? ''
                                                                : currentValue,
                                                        );
                                                        setBomComboboxOpen(false);
                                                    }}
                                                    className="flex items-center gap-2"
                                                >
                                                    <Check
                                                        className={cn(
                                                            'h-4 w-4 shrink-0',
                                                            selectedBomId ===
                                                                bom.id
                                                                ? 'opacity-100'
                                                                : 'opacity-0',
                                                        )}
                                                    />
                                                    <div className="flex flex-col min-w-0 flex-1">
                                                        <span className="truncate font-medium">
                                                            {bom.productVariant.name}
                                                        </span>
                                                        <span className="text-xs text-muted-foreground">
                                                            {bom.category} • {bom.name}
                                                        </span>
                                                    </div>
                                                </CommandItem>
                                            ))}
                                        </CommandGroup>
                                    </CommandList>
                                </Command>
                            </PopoverContent>
                        </Popover>
                    </div>

                    {/* Quantity */}
                    <div className="space-y-2">
                        <Label htmlFor="quantity">Jumlah</Label>
                        <Input
                            id="quantity"
                            type="number"
                            placeholder="500"
                            value={quantity}
                            onChange={(e) => setQuantity(e.target.value)}
                            min="0"
                            step="any"
                        />
                    </div>

                    {/* Machine selection */}
                    <div className="space-y-2">
                        <Label htmlFor="machine">Mesin</Label>
                        <Select
                            value={selectedMachineId}
                            onValueChange={setSelectedMachineId}
                            disabled={!selectedBom}
                        >
                            <SelectTrigger id="machine">
                                <SelectValue
                                    placeholder={
                                        selectedBom
                                            ? compatibleMachines.length > 0
                                                ? 'Pilih mesin...'
                                                : 'Tidak ada mesin tersedia'
                                            : 'Pilih produk dulu'
                                    }
                                />
                            </SelectTrigger>
                            <SelectContent>
                                {compatibleMachines.map((machine) => (
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
                        {selectedBom && compatibleMachines.length === 0 && (
                            <p className="text-xs text-red-500">
                                Tidak ada mesin yang cocok untuk tahap{' '}
                                {selectedBom.category}.
                            </p>
                        )}
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
                                !selectedBomId ||
                                !quantity ||
                                !selectedMachineId
                            }
                        >
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Membuat...
                                </>
                            ) : (
                                'Buat SPK Cepat'
                            )}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
