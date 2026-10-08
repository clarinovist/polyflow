'use client';

import { useMemo, useState } from 'react';
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
import { Badge } from '@/components/ui/badge';
import { formatRupiah } from '@/lib/utils/utils';
import { toast } from 'sonner';
import { upsertSinglePriceAction } from '@/actions/sales/price-list';
import {
    ChevronDown,
    ChevronRight,
    Pencil,
    Plus,
    Save,
    X,
    Loader2,
} from 'lucide-react';
import {
    productTypeLabel,
    type CustomerOpt,
    type ProductPriceRowData,
} from './PriceListClient';

type Props = {
    row: ProductPriceRowData;
    customers: CustomerOpt[];
    canManage: boolean;
    defaultExpanded: boolean;
    onChanged: () => void;
};

function rangeLabel(row: ProductPriceRowData): string {
    if (row.customPriceCount === 0) return 'Pakai harga dasar';
    if (row.minPrice == null || row.maxPrice == null) return '-';
    if (row.minPrice === row.maxPrice) return formatRupiah(row.minPrice);
    return `${formatRupiah(row.minPrice)} – ${formatRupiah(row.maxPrice)}`;
}

function formatDeviation(pct: number | null): string {
    if (pct == null) return '';
    const sign = pct > 0 ? '+' : '';
    return `${sign}${pct.toFixed(1)}%`;
}

function deviationClass(pct: number | null): string {
    if (pct == null || pct === 0) return 'text-muted-foreground';
    return pct < 0 ? 'text-emerald-600' : 'text-amber-600';
}

export function ProductPriceRow({
    row,
    customers,
    canManage,
    defaultExpanded,
    onChanged,
}: Props) {
    const [expanded, setExpanded] = useState(defaultExpanded);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editingPrice, setEditingPrice] = useState('');
    const [saving, setSaving] = useState(false);
    const [addingCustomerId, setAddingCustomerId] = useState('');
    const [addingPrice, setAddingPrice] = useState('');

    const pricedCustomerIds = useMemo(
        () => new Set(row.prices.map((p) => p.customerId)),
        [row.prices],
    );
    const addableCustomers = useMemo(
        () => customers.filter((c) => !pricedCustomerIds.has(c.id)),
        [customers, pricedCustomerIds],
    );

    async function handleSaveEdit(customerId: string) {
        const parsed = Number(editingPrice);
        if (!Number.isFinite(parsed) || parsed < 0) {
            toast.error('Harga tidak valid');
            return;
        }
        setSaving(true);
        try {
            const result = await upsertSinglePriceAction({
                customerId,
                productVariantId: row.variantId,
                price: parsed,
            });
            if (result.success) {
                toast.success('Harga diperbarui');
                setEditingId(null);
                setEditingPrice('');
                onChanged();
            } else {
                toast.error(result.error || 'Gagal menyimpan');
            }
        } finally {
            setSaving(false);
        }
    }

    async function handleAddCustomerPrice() {
        if (!addingCustomerId) {
            toast.error('Pilih customer dulu');
            return;
        }
        const parsed = Number(addingPrice);
        if (!Number.isFinite(parsed) || parsed < 0) {
            toast.error('Harga tidak valid');
            return;
        }
        setSaving(true);
        try {
            const result = await upsertSinglePriceAction({
                customerId: addingCustomerId,
                productVariantId: row.variantId,
                price: parsed,
            });
            if (result.success) {
                toast.success('Harga customer ditambahkan');
                setAddingCustomerId('');
                setAddingPrice('');
                onChanged();
            } else {
                toast.error(result.error || 'Gagal menambah harga');
            }
        } finally {
            setSaving(false);
        }
    }

    return (
        <>
            <TableRow className="text-foreground hover:bg-muted/40">
                <TableCell>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-11 w-11"
                        aria-expanded={expanded}
                        aria-label={`${expanded ? 'Tutup' : 'Buka'} rincian harga ${row.skuCode}`}
                        onClick={() => setExpanded((value) => !value)}
                    >
                        {expanded ? (
                            <ChevronDown
                                aria-hidden="true"
                                className="h-4 w-4 text-muted-foreground"
                            />
                        ) : (
                            <ChevronRight
                                aria-hidden="true"
                                className="h-4 w-4 text-muted-foreground"
                            />
                        )}
                    </Button>
                </TableCell>
                <TableCell className="font-mono text-xs">
                    {row.skuCode}
                </TableCell>
                <TableCell className="max-w-[220px] truncate">
                    {row.productName === row.variantName
                        ? row.variantName
                        : `${row.productName} - ${row.variantName}`}
                </TableCell>
                <TableCell>
                    <Badge variant="outline" className="text-[10px]">
                        {productTypeLabel(row.productType)}
                    </Badge>
                </TableCell>
                <TableCell className="text-right">
                    {row.basePrice != null ? formatRupiah(row.basePrice) : '-'}
                </TableCell>
                <TableCell>
                    {row.customPriceCount > 0
                        ? `${row.customPriceCount} customer`
                        : 'Belum ada'}
                </TableCell>
                <TableCell className="text-xs">{rangeLabel(row)}</TableCell>
            </TableRow>

            {expanded && (
                <TableRow>
                    <TableCell colSpan={7} className="bg-muted/20 p-0">
                        <div
                            className="p-3 space-y-3"
                            onClick={(e) => e.stopPropagation()}
                        >
                            {row.prices.length === 0 ? (
                                <p className="text-xs text-muted-foreground">
                                    Belum ada harga khusus untuk SKU ini.
                                </p>
                            ) : (
                                <div className="overflow-x-auto rounded border bg-background text-foreground">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Customer</TableHead>
                                                <TableHead className="text-right">
                                                    Harga
                                                </TableHead>
                                                <TableHead className="text-right">
                                                    vs Dasar
                                                </TableHead>
                                                <TableHead>Status</TableHead>
                                                {canManage && (
                                                    <TableHead className="text-right">
                                                        Aksi
                                                    </TableHead>
                                                )}
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {row.prices.map((price) => (
                                                <TableRow key={price.id}>
                                                    <TableCell className="max-w-[200px] truncate">
                                                        {price.customerName}
                                                        {price.customerCode ? (
                                                            <span className="text-xs text-muted-foreground">
                                                                {' '}
                                                                (
                                                                {
                                                                    price.customerCode
                                                                }
                                                                )
                                                            </span>
                                                        ) : null}
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        {editingId ===
                                                        price.id ? (
                                                            <Input
                                                                type="number"
                                                                min={0}
                                                                aria-label={`Harga untuk ${price.customerName}`}
                                                                className="ml-auto h-11 w-28 text-right sm:h-8"
                                                                value={
                                                                    editingPrice
                                                                }
                                                                onChange={(e) =>
                                                                    setEditingPrice(
                                                                        e.target
                                                                            .value,
                                                                    )
                                                                }
                                                                autoFocus
                                                            />
                                                        ) : (
                                                            <span className="font-semibold">
                                                                {formatRupiah(
                                                                    price.unitPrice,
                                                                )}
                                                            </span>
                                                        )}
                                                    </TableCell>
                                                    <TableCell
                                                        className={`text-right text-xs ${deviationClass(price.deviationPercent)}`}
                                                    >
                                                        {formatDeviation(
                                                            price.deviationPercent,
                                                        )}
                                                    </TableCell>
                                                    <TableCell>
                                                        <Badge
                                                            variant={
                                                                price.isActive
                                                                    ? 'default'
                                                                    : 'secondary'
                                                            }
                                                            className="text-[10px]"
                                                        >
                                                            {price.isActive
                                                                ? 'Aktif'
                                                                : 'Nonaktif'}
                                                        </Badge>
                                                    </TableCell>
                                                    {canManage && (
                                                        <TableCell className="text-right">
                                                            {editingId ===
                                                            price.id ? (
                                                                <div className="flex justify-end gap-1">
                                                                    <Button
                                                                        size="sm"
                                                                        variant="default"
                                                                        className="h-11 min-w-11 sm:h-8"
                                                                        aria-label={`Simpan harga ${price.customerName}`}
                                                                        disabled={
                                                                            saving
                                                                        }
                                                                        onClick={() =>
                                                                            handleSaveEdit(
                                                                                price.customerId,
                                                                            )
                                                                        }
                                                                    >
                                                                        {saving ? (
                                                                            <Loader2 className="h-3 w-3 motion-safe:animate-spin" />
                                                                        ) : (
                                                                            <Save className="h-3 w-3" />
                                                                        )}
                                                                    </Button>
                                                                    <Button
                                                                        size="sm"
                                                                        variant="ghost"
                                                                        className="h-11 min-w-11 sm:h-8"
                                                                        aria-label={`Batal edit harga ${price.customerName}`}
                                                                        onClick={() => {
                                                                            setEditingId(
                                                                                null,
                                                                            );
                                                                            setEditingPrice(
                                                                                '',
                                                                            );
                                                                        }}
                                                                    >
                                                                        <X className="h-3 w-3" />
                                                                    </Button>
                                                                </div>
                                                            ) : (
                                                                <Button
                                                                    size="sm"
                                                                    variant="outline"
                                                                    className="h-11 sm:h-8"
                                                                    onClick={() => {
                                                                        setEditingId(
                                                                            price.id,
                                                                        );
                                                                        setEditingPrice(
                                                                            String(
                                                                                price.unitPrice,
                                                                            ),
                                                                        );
                                                                    }}
                                                                >
                                                                    <Pencil className="h-3 w-3 mr-1" />
                                                                    Edit
                                                                </Button>
                                                            )}
                                                        </TableCell>
                                                    )}
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            )}

                            {canManage && addableCustomers.length > 0 && (
                                <div className="flex flex-wrap items-end gap-2 rounded border border-dashed p-2">
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-medium text-muted-foreground">
                                            Tambah harga customer
                                        </label>
                                        <Select
                                            value={addingCustomerId}
                                            onValueChange={setAddingCustomerId}
                                        >
                                            <SelectTrigger
                                                aria-label={`Customer untuk ${row.skuCode}`}
                                                className="h-11 w-56 sm:h-8"
                                            >
                                                <SelectValue placeholder="Pilih customer" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {addableCustomers.map((c) => (
                                                    <SelectItem
                                                        key={c.id}
                                                        value={c.id}
                                                    >
                                                        {c.name}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <Input
                                        type="number"
                                        min={0}
                                        aria-label={`Harga baru untuk ${row.skuCode}`}
                                        className="h-11 w-32 sm:h-8"
                                        placeholder="Harga"
                                        value={addingPrice}
                                        onChange={(e) =>
                                            setAddingPrice(e.target.value)
                                        }
                                    />
                                    <Button
                                        size="sm"
                                        className="h-11 sm:h-8"
                                        disabled={saving}
                                        onClick={handleAddCustomerPrice}
                                    >
                                        {saving ? (
                                            <Loader2 className="h-3 w-3 motion-safe:animate-spin mr-1" />
                                        ) : (
                                            <Plus className="h-3 w-3 mr-1" />
                                        )}
                                        Simpan
                                    </Button>
                                </div>
                            )}
                        </div>
                    </TableCell>
                </TableRow>
            )}
        </>
    );
}
