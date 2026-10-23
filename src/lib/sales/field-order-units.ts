import type { Unit } from '@prisma/client';
import { salesEntryMeta } from './unit-entry';

export type FieldProductUnits = {
    primaryUnit: Unit;
    salesUnit: Unit | null;
    conversionFactor: number;
};
export type FieldUnitEntry = {
    id?: string;
    productVariantId: string;
    quantity: number;
    unitPrice: number;
    enteredUnit?: Unit;
    enteredQuantity?: number;
    enteredUnitPrice?: number;
    conversionFactorSnapshot?: number;
    originalBaseQuantity?: number;
    originalBaseUnitPrice?: number;
};

/** The product picker prices and stocks are in primary units, not sales units. */
export function serializeFieldUnits(product: {
    primaryUnit: Unit;
    salesUnit: Unit | null;
    conversionFactor: unknown;
}): FieldProductUnits {
    return {
        primaryUnit: product.primaryUnit,
        salesUnit: product.salesUnit,
        conversionFactor: Number(product.conversionFactor),
    };
}

export function fieldEntryMeta(product: FieldProductUnits, entry: FieldUnitEntry, original?: FieldUnitEntry) {
    if (!product.primaryUnit) throw new Error('Satuan produk belum tersedia. Muat ulang halaman.');
    const meta = salesEntryMeta(product, entry, original);
    if (![meta.primaryUnit, meta.salesUnit].includes(meta.displayUnit)) {
        throw new Error('Satuan produk berubah. Muat ulang sebelum menyimpan.');
    }
    return meta;
}

/** No loss of historical rounding on a no-op save; the server verifies identity. */
export function unchangedFieldEntry(entry: FieldUnitEntry, original?: FieldUnitEntry) {
    return original && entry.id === original.id && entry.productVariantId === original.productVariantId &&
        Number(entry.quantity) === Number(original.quantity) && Number(entry.unitPrice) === Number(original.unitPrice) &&
        entry.enteredUnit === original.enteredUnit;
}

export function fieldEntryPayload(entry: FieldUnitEntry, product: FieldProductUnits, original?: FieldUnitEntry) {
    if (unchangedFieldEntry(entry, original) && original?.originalBaseQuantity != null && original.originalBaseUnitPrice != null) {
        return {
            quantity: original.originalBaseQuantity,
            unitPrice: original.originalBaseUnitPrice,
            enteredQuantity: original.enteredQuantity,
            enteredUnit: original.enteredQuantity == null ? undefined : original.enteredUnit,
            enteredUnitPrice: original.enteredUnitPrice,
            conversionFactorSnapshot: original.conversionFactorSnapshot,
        };
    }
    const meta = fieldEntryMeta(product, entry, original);
    const factor = meta.displayUnit === meta.primaryUnit ? 1 : meta.conversionFactor;
    if (!Number.isFinite(factor) || factor <= 0) throw new Error('Faktor satuan produk tidak valid.');
    const enteredQuantity = Number(entry.quantity);
    const enteredUnitPrice = Number(entry.unitPrice);
    const quantity = Number((enteredQuantity * factor).toPrecision(15));
    const unitPrice = Number((enteredUnitPrice / factor).toPrecision(15));
    if (enteredQuantity <= 0 || enteredUnitPrice < 0) throw new Error('Jumlah harus positif dan harga tidak boleh negatif.');
    if (Number(quantity.toFixed(4)) <= 0 || Number(enteredQuantity.toFixed(4)) <= 0) {
        throw new Error('Jumlah terlalu kecil: satuan input dan satuan dasar minimal 0,0001 agar tidak tersimpan sebagai nol.');
    }
    for (const [value, scale] of [[quantity, 4], [unitPrice, 2], [enteredQuantity, 4], [enteredUnitPrice, 2]] as const) {
        if (!Number.isFinite(value) || Math.abs(value - Number(value.toFixed(scale))) > 1e-9) {
            throw new Error('Konversi tidak dapat disimpan tepat. Gunakan satuan dasar atau sesuaikan jumlah/harga (jumlah maks. 4 desimal, harga maks. 2 desimal).');
        }
    }
    return { quantity, unitPrice, enteredQuantity, enteredUnit: meta.displayUnit as Unit, enteredUnitPrice, conversionFactorSnapshot: factor };
}
