import type { Unit } from '@prisma/client';
import { formatQuantity } from '@/lib/utils/production-units';
import { formatRupiah } from '@/lib/utils/utils';
import type { salesEntryMeta } from '@/lib/sales/unit-entry';

export function UnitEntryControl({ meta, quantity, price, index, onChange }: {
    meta: ReturnType<typeof salesEntryMeta>;
    quantity: number;
    price: number;
    index: number;
    onChange: (unit: Unit) => void;
}) {
    const primary = meta.displayUnit === meta.primaryUnit;
    const equivalentQty = primary ? quantity / meta.conversionFactor : quantity * meta.conversionFactor;
    const equivalentPrice = primary ? price * meta.conversionFactor : price / meta.conversionFactor;
    const other = primary ? meta.salesUnit : meta.primaryUnit;
    return (
        <div className="mt-2 space-y-2 rounded-md border bg-muted/30 p-2 text-xs">
            <label className="flex flex-wrap items-center gap-2 font-medium">
                Satuan jumlah & harga
                <select
                    aria-label={`Satuan item ${index + 1}`}
                    className="h-11 rounded-md border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    value={meta.displayUnit}
                    onChange={e => onChange(e.target.value as Unit)}
                >
                    <option value={meta.primaryUnit}>{meta.primaryUnit}</option>
                    {meta.hasAlternateUnit && <option value={meta.salesUnit}>{meta.salesUnit}</option>}
                </select>
            </label>
            <div aria-live="polite" className="space-y-1 break-words leading-relaxed text-muted-foreground">
                <div>{formatQuantity(quantity)} {meta.displayUnit} × {formatRupiah(price)}/{meta.displayUnit} = {formatRupiah(quantity * price)} (sebelum diskon/pajak)</div>
                {meta.hasAlternateUnit && <>
                    <div>Setara {formatQuantity(equivalentQty)} {other} × {formatRupiah(equivalentPrice)}/{other}</div>
                    <div>1 {meta.salesUnit} = {formatQuantity(meta.conversionFactor)} {meta.primaryUnit}. Ganti satuan tidak mengubah jumlah barang atau nilai.</div>
                </>}
            </div>
        </div>
    );
}
