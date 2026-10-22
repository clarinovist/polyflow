'use client';

import { useId, useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { packagingUnitLabel } from '@/lib/production/packaging-material';

type Material = { productVariantId: string; name: string; unit: string };

export function PackagingMaterialPicker({ stock, value, label, onChange }: {
    stock: Material[];
    value: string;
    label: string;
    onChange: (material: Material) => void;
}) {
    const id = useId();
    const [open, setOpen] = useState(false);
    const materials = [...new Map(stock.map((item) => [item.productVariantId, item])).values()]
        .sort((a, b) => a.name.localeCompare(b.name, 'id') || a.productVariantId.localeCompare(b.productVariantId));
    const selected = materials.find((item) => item.productVariantId === value);
    return <div className="space-y-1">
        <label htmlFor={id} className="block text-sm">Kemasan</label>
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button id={id} aria-label={label} type="button" variant="outline" role="combobox"
                    aria-expanded={open} disabled={!materials.length}
                    className="h-auto min-h-11 w-full min-w-0 justify-between font-normal">
                    <span className="min-w-0 break-words whitespace-normal text-left">{selected?.name ?? 'Pilih kemasan'}</span>
                    <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-(--radix-popover-trigger-width) max-w-[calc(100vw-2rem)] p-0">
                <Command className="**:data-[slot=command-input-wrapper]:h-11">
                    <CommandInput aria-label={`Cari ${label.toLowerCase()}`} placeholder="Cari nama kemasan…" />
                    <CommandList className="max-h-60">
                        <CommandEmpty>Kemasan tidak ditemukan. Coba kata lain.</CommandEmpty>
                        <CommandGroup>
                            {materials.map((material) => <CommandItem key={material.productVariantId}
                                value={material.productVariantId} keywords={[material.name]}
                                className="min-h-11 items-start"
                                onSelect={() => { onChange(material); setOpen(false); }}>
                                <Check className={`mt-0.5 size-4 shrink-0 ${value === material.productVariantId ? 'opacity-100' : 'opacity-0'}`} />
                                <span className="min-w-0 flex-1 break-words">{material.name}</span>
                                <span className="shrink-0 text-xs text-muted-foreground">{packagingUnitLabel(material.unit)}</span>
                            </CommandItem>)}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    </div>;
}
