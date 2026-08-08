'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { formatRupiah } from '@/lib/utils/utils';
import { toast } from 'sonner';
import {
    previewBulkAdjustPricesAction,
    applyBulkAdjustPricesAction,
} from '@/actions/sales/price-list';
import { Loader2 } from 'lucide-react';
import type { ProductType } from '@prisma/client';
import {
    PRODUCT_TYPE_OPTIONS,
    productLabel,
    type CustomerOpt,
    type ProductOpt,
} from './PriceListClient';

type PreviewRow = {
    id: string;
    oldPrice: number;
    newPrice: number;
    customerName: string;
    productName: string;
    skuCode: string;
};

type AdjustMode = 'PERCENT' | 'AMOUNT';
type FilterOption = { value: string; label: string };

const MODE_OPTIONS: FilterOption[] = [
    { value: 'PERCENT', label: 'Persen (%)' },
    { value: 'AMOUNT', label: 'Nominal (Rp)' },
];

function FilterSelect({
    label,
    value,
    onChange,
    options,
}: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    options: FilterOption[];
}) {
    return (
        <div className="space-y-2">
            <label className="text-xs font-medium">{label}</label>
            <Select
                value={value || '__all'}
                onValueChange={(v) => onChange(v === '__all' ? '' : v)}
            >
                <SelectTrigger>
                    <SelectValue placeholder="Semua" />
                </SelectTrigger>
                <SelectContent>
                    {options.map((o) => (
                        <SelectItem
                            key={o.value || '__all'}
                            value={o.value || '__all'}
                        >
                            {o.label}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    );
}

function PreviewTable({ rows }: { rows: PreviewRow[] }) {
    return (
        <div className="max-h-60 overflow-y-auto rounded border bg-background">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Customer</TableHead>
                        <TableHead>Produk</TableHead>
                        <TableHead className="text-right">Lama</TableHead>
                        <TableHead className="text-right">Baru</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {rows.slice(0, 100).map((r) => (
                        <TableRow key={r.id}>
                            <TableCell className="text-xs max-w-[140px] truncate">
                                {r.customerName}
                            </TableCell>
                            <TableCell className="text-xs max-w-[160px] truncate">
                                {r.skuCode} - {r.productName}
                            </TableCell>
                            <TableCell className="text-right text-xs">
                                {formatRupiah(r.oldPrice)}
                            </TableCell>
                            <TableCell className="text-right text-xs font-semibold">
                                {formatRupiah(r.newPrice)}
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
            {rows.length > 100 && (
                <p className="p-2 text-xs text-muted-foreground text-center">
                    ... dan {rows.length - 100} baris lagi
                </p>
            )}
        </div>
    );
}

type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    customers: CustomerOpt[];
    products: ProductOpt[];
    onApplied: () => void;
};

export function BulkAdjustDialog({
    open,
    onOpenChange,
    customers,
    products,
    onApplied,
}: Props) {
    const [bulkMode, setBulkMode] = useState<AdjustMode>('PERCENT');
    const [bulkValue, setBulkValue] = useState<string>('');
    const [bulkFilterCustomer, setBulkFilterCustomer] = useState<string>('');
    const [bulkFilterProduct, setBulkFilterProduct] = useState<string>('');
    const [bulkFilterCategory, setBulkFilterCategory] = useState<string>('');
    const [previewRows, setPreviewRows] = useState<PreviewRow[] | null>(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [applyLoading, setApplyLoading] = useState(false);
    const [showConfirmApply, setShowConfirmApply] = useState(false);

    function resetPreviewState() {
        setPreviewRows(null);
        setShowConfirmApply(false);
    }

    function buildFilter() {
        return {
            customerId: bulkFilterCustomer || undefined,
            productVariantId: bulkFilterProduct || undefined,
            category: (bulkFilterCategory || undefined) as
                | ProductType
                | undefined,
        };
    }

    async function handlePreview() {
        const valueNum = Number(bulkValue);
        if (!Number.isFinite(valueNum)) {
            toast.error('Nilai penyesuaian tidak valid');
            return;
        }
        if (valueNum === 0) {
            toast.info('Nilai 0% / 0 nominal tidak mengubah apa pun');
            setPreviewRows([]);
            return;
        }
        if (!bulkFilterCustomer && !bulkFilterProduct && !bulkFilterCategory) {
            toast.error(
                'Filter wajib diisi (customer / produk / kategori) untuk mencegah update massal tanpa sengaja',
            );
            return;
        }
        setPreviewLoading(true);
        try {
            const result = await previewBulkAdjustPricesAction({
                filter: buildFilter(),
                mode: bulkMode,
                value: valueNum,
            });
            if (result.success && result.data) {
                const data = result.data as {
                    preview: PreviewRow[];
                    affectedCount: number;
                    totalFiltered: number;
                };
                setPreviewRows(data.preview);
                if (data.preview.length === 0) {
                    toast.info(
                        `Tidak ada baris berubah (filter cocok ${data.totalFiltered} baris, 0% change).`,
                    );
                }
            } else {
                const msg = !result.success
                    ? (result as { error?: string }).error
                    : 'Gagal preview';
                toast.error(msg || 'Gagal preview');
                setPreviewRows(null);
            }
        } finally {
            setPreviewLoading(false);
        }
    }

    async function handleApply() {
        const valueNum = Number(bulkValue);
        if (!Number.isFinite(valueNum)) {
            toast.error('Nilai tidak valid');
            return;
        }
        setApplyLoading(true);
        try {
            const result = await applyBulkAdjustPricesAction({
                filter: buildFilter(),
                mode: bulkMode,
                value: valueNum,
            });
            if (result.success) {
                const data = result.data as { updatedCount: number };
                toast.success(
                    `${data.updatedCount} harga berhasil disesuaikan`,
                );
                onOpenChange(false);
                resetPreviewState();
                onApplied();
            } else {
                toast.error(
                    (result as { error?: string }).error ||
                        'Gagal menerapkan penyesuaian',
                );
            }
        } finally {
            setApplyLoading(false);
        }
    }

    const customerOptions: FilterOption[] = [
        { value: '', label: 'Semua customer' },
        ...customers.map((c) => ({ value: c.id, label: c.name })),
    ];
    const productOptions: FilterOption[] = [
        { value: '', label: 'Semua produk' },
        ...products.map((p) => ({ value: p.id, label: productLabel(p) })),
    ];
    const hasPreview = previewRows !== null && previewRows.length > 0;
    const needsConfirm = hasPreview && !showConfirmApply;

    return (
        <Dialog
            open={open}
            onOpenChange={(nextOpen) => {
                onOpenChange(nextOpen);
                if (!nextOpen) resetPreviewState();
            }}
        >
            <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Sesuaikan Harga Massal</DialogTitle>
                    <DialogDescription>
                        Operasi massal tanpa undo. Wajib preview dulu —
                        tampilkan daftar perubahan sebelum tombol Terapkan
                        aktif. Hanya harga Aktif dengan customer Aktif yang
                        ikut; inactive tidak ke-adjust.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                    <div className="grid gap-3 md:grid-cols-3">
                        <FilterSelect
                            label="Filter Customer"
                            value={bulkFilterCustomer}
                            onChange={setBulkFilterCustomer}
                            options={customerOptions}
                        />
                        <FilterSelect
                            label="Filter Produk"
                            value={bulkFilterProduct}
                            onChange={setBulkFilterProduct}
                            options={productOptions}
                        />
                        <FilterSelect
                            label="Filter Kategori"
                            value={bulkFilterCategory}
                            onChange={setBulkFilterCategory}
                            options={PRODUCT_TYPE_OPTIONS}
                        />
                    </div>
                    <div className="grid gap-3 md:grid-cols-3">
                        <FilterSelect
                            label="Mode"
                            value={bulkMode}
                            onChange={(v) => setBulkMode(v as AdjustMode)}
                            options={MODE_OPTIONS}
                        />
                        <div className="space-y-2 md:col-span-2">
                            <label className="text-xs font-medium">
                                Nilai{' '}
                                {bulkMode === 'PERCENT'
                                    ? '(mis. 10 = +10%, -5 = -5%)'
                                    : '(mis. 5000 = +Rp 5.000)'}
                            </label>
                            <Input
                                type="number"
                                placeholder={
                                    bulkMode === 'PERCENT' ? '10' : '5000'
                                }
                                value={bulkValue}
                                onChange={(e) => setBulkValue(e.target.value)}
                            />
                        </div>
                    </div>
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={handlePreview}
                        disabled={previewLoading || !bulkValue.trim()}
                    >
                        {previewLoading ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-1" />
                        ) : null}
                        Tampilkan Preview (dry-run)
                    </Button>
                    {previewRows !== null && (
                        <div className="space-y-2 rounded border p-3 bg-muted/30">
                            <p className="text-sm font-medium">
                                Preview: {previewRows.length} baris akan berubah
                            </p>
                            {previewRows.length === 0 ? (
                                <p className="text-xs text-muted-foreground">
                                    Tidak ada perubahan (filter cocok atau 0%).
                                </p>
                            ) : (
                                <PreviewTable rows={previewRows} />
                            )}
                        </div>
                    )}
                    {needsConfirm && (
                        <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                            <p className="font-medium">
                                Perlu konfirmasi: operasi tanpa undo.
                            </p>
                            <p className="text-xs mt-1">
                                Klik &quot;Konfirmasi & Terapkan&quot; untuk
                                melanjutkan — {previewRows?.length} baris akan
                                ditulis.
                            </p>
                        </div>
                    )}
                </div>
                <DialogFooter>
                    <Button
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                    >
                        Batal
                    </Button>
                    {needsConfirm ? (
                        <Button
                            variant="destructive"
                            onClick={() => setShowConfirmApply(true)}
                        >
                            Konfirmasi & Terapkan
                        </Button>
                    ) : null}
                    {showConfirmApply ? (
                        <Button
                            variant="destructive"
                            onClick={handleApply}
                            disabled={applyLoading}
                        >
                            {applyLoading ? (
                                <Loader2 className="h-4 w-4 animate-spin mr-1" />
                            ) : null}
                            Ya, Terapkan {previewRows?.length ?? 0} Perubahan
                        </Button>
                    ) : null}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
