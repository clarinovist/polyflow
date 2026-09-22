'use client';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils/utils';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import {
    stageLabelId,
    recommendedOutputHint,
    type ProductionStage,
} from '@/lib/locations/resolve-location';
import { parseLocalDate, formatLocalDate } from '@/lib/dates/parse-local-date';
import Link from 'next/link';

interface BomOption {
    id: string;
    name: string;
    isDefault: boolean;
    productVariantId: string;
    category: string;
    outputQuantity: number;
    productVariant: Record<string, unknown>;
}

interface MachineOption {
    id: string;
    name: string;
    type: string;
}

interface ProductOption {
    id: string;
    name: string;
}

interface StageProductSectionProps {
    children?: ReactNode;
    stage: ProductionStage;
    onStageChange: (stage: ProductionStage) => void;
    products: ProductOption[];
    selectedProductId: string;
    onProductChange: (id: string) => void;
    boms: BomOption[];
    selectedBomId: string;
    onBomChange: (id: string) => void;
    selectedBom: BomOption | undefined;
    machines: MachineOption[];
    selectedMachineId: string;
    onMachineChange: (id: string) => void;
    plannedStartDate: Date;
    onDateChange: (date: Date) => void;
    plannedEndDate?: Date;
    onEndDateChange?: (date: Date | undefined) => void;
}

export function StageProductSection({
    children,
    stage,
    onStageChange,
    products,
    selectedProductId,
    onProductChange,
    boms,
    selectedBomId,
    onBomChange,
    selectedBom,
    machines,
    selectedMachineId,
    onMachineChange,
    plannedStartDate,
    onDateChange,
    plannedEndDate,
    onEndDateChange,
}: StageProductSectionProps) {
    return (
        <div className="space-y-6">
            {/* Stage selector */}
            <div className="space-y-3">
                <Label>Tahap produksi</Label>
                <div
                    className="grid grid-cols-2 gap-2 sm:grid-cols-4"
                    role="group"
                    aria-label="Stage produksi"
                >
                    {(
                        [
                            'mixing',
                            'extrusion',
                            'packing',
                            'rework',
                        ] as ProductionStage[]
                    ).map((s) => (
                        <Button
                            key={s}
                            type="button"
                            variant={stage === s ? 'default' : 'outline'}
                            className={cn(
                                'h-auto min-h-16 flex-col items-start gap-1 whitespace-normal rounded-lg px-3 py-3 text-left',
                                stage === s &&
                                    'border-emerald-600 bg-emerald-50 text-emerald-900 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-200',
                            )}
                            aria-label={s.charAt(0).toUpperCase() + s.slice(1)}
                            onClick={() => onStageChange(s)}
                            aria-pressed={stage === s}
                        >
                            <span className="font-semibold">
                                {s.charAt(0).toUpperCase() + s.slice(1)}
                            </span>
                            <span className="text-xs font-normal">
                                {
                                    {
                                        mixing: 'Campur bahan',
                                        extrusion: 'Bentuk produk',
                                        packing: 'Kemas hasil',
                                        rework: 'Olah ulang',
                                    }[s]
                                }
                            </span>
                        </Button>
                    ))}
                </div>
                <p className="text-xs text-muted-foreground">
                    Tahap:{' '}
                    <span className="font-medium text-foreground">
                        {stageLabelId(stage)}
                    </span>
                    {' · '}
                    Saran hasil: {recommendedOutputHint(stage)}
                </p>
            </div>

            {/* Product + BOM */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                    <Label htmlFor="spk-product">Produk</Label>
                    <Select
                        value={selectedProductId}
                        onValueChange={onProductChange}
                    >
                        <SelectTrigger
                            id="spk-product"
                            className="min-h-11 w-full"
                        >
                            <SelectValue placeholder="Pilih produk" />
                        </SelectTrigger>
                        <SelectContent>
                            {products.map((p) => (
                                <SelectItem key={p.id} value={p.id}>
                                    {p.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    {products.length === 0 &&
                        (stage === 'rework' ? (
                            // Rework needs a dedicated BOM category most tenants
                            // never create. Adjusting one order's materials is
                            // almost always what is actually wanted, and it
                            // leaves the recipe untouched.
                            <p className="text-xs text-muted-foreground">
                                Belum ada resep khusus Rework. Untuk memperbaiki
                                satu batch — misalnya menambah bahan ke adonan
                                yang sudah jadi — pakai stage aslinya lalu ubah
                                daftar bahan di SPK itu saja lewat{' '}
                                <span className="font-medium text-foreground">
                                    Keluarkan Bahan
                                </span>
                                . Resep tidak perlu diubah.{' '}
                                <Link
                                    href="/production/boms"
                                    className="text-primary underline"
                                >
                                    Buat resep Rework
                                </Link>{' '}
                                hanya jika perbaikannya berulang dengan
                                komposisi tetap.
                            </p>
                        ) : (
                            <p className="text-xs text-muted-foreground">
                                Tidak ada produk untuk stage ini.{' '}
                                <Link
                                    href="/production/boms"
                                    className="text-primary underline"
                                >
                                    Buat BOM dulu
                                </Link>
                            </p>
                        ))}
                </div>

                <div className="space-y-2">
                    <Label htmlFor="spk-bom">Resep (BOM)</Label>
                    <Select
                        value={selectedBomId}
                        onValueChange={onBomChange}
                        disabled={!selectedProductId}
                    >
                        <SelectTrigger id="spk-bom" className="min-h-11 w-full">
                            <SelectValue
                                placeholder={
                                    !selectedProductId
                                        ? 'Pilih produk dulu'
                                        : 'Pilih resep'
                                }
                            />
                        </SelectTrigger>
                        <SelectContent>
                            {boms.map((b) => (
                                <SelectItem key={b.id} value={b.id}>
                                    {b.name} {b.isDefault ? '(Default)' : ''}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    {selectedBom && (
                        <p className="text-xs text-muted-foreground">
                            Output: {selectedBom.outputQuantity}{' '}
                            {((
                                selectedBom.productVariant as Record<
                                    string,
                                    unknown
                                >
                            )?.primaryUnit as string) || ''}{' '}
                            / batch
                        </p>
                    )}
                </div>
            </div>

            {children}

            <h3 className="border-t pt-5 text-base font-semibold">
                Jadwal & mesin
            </h3>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="space-y-2">
                    <Label htmlFor="spk-machine">Mesin · opsional</Label>
                    <Select
                        value={selectedMachineId}
                        onValueChange={onMachineChange}
                    >
                        <SelectTrigger
                            id="spk-machine"
                            className="min-h-11 w-full"
                        >
                            <SelectValue placeholder="Tentukan kemudian" />
                        </SelectTrigger>
                        <SelectContent>
                            {machines.map((m) => (
                                <SelectItem key={m.id} value={m.id}>
                                    {m.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    {machines.length === 0 && (
                        <p className="text-[11px] text-muted-foreground">
                            Tidak ada mesin cocok; SPK tetap bisa tanpa mesin.
                        </p>
                    )}
                </div>

                <div className="space-y-2">
                    <Label htmlFor="spk-start">Tanggal mulai</Label>
                    <Input
                        id="spk-start"
                        className="min-h-11"
                        type="date"
                        value={formatLocalDate(plannedStartDate)}
                        onChange={(e) =>
                            onDateChange(parseLocalDate(e.target.value))
                        }
                    />
                </div>

                {onEndDateChange && (
                    <div className="space-y-2">
                        <Label htmlFor="spk-end">Selesai · opsional</Label>
                        <Input
                            id="spk-end"
                            className="min-h-11"
                            type="date"
                            value={
                                plannedEndDate
                                    ? formatLocalDate(plannedEndDate)
                                    : ''
                            }
                            onChange={(e) =>
                                onEndDateChange(
                                    e.target.value
                                        ? parseLocalDate(e.target.value)
                                        : undefined,
                                )
                            }
                        />
                    </div>
                )}
            </div>
        </div>
    );
}
