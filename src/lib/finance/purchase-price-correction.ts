import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { BusinessRuleError } from '@/lib/errors/errors';

const id = z.string().min(1, 'Identitas wajib diisi.').max(100, 'Identitas terlalu panjang.');
const price = z.string()
    .regex(/^(0|[1-9]\d{0,10})(\.\d{1,4})?$/, 'Harga harus berupa angka positif dengan maksimal 4 desimal.')
    .pipe(z.string().refine(value => new Prisma.Decimal(value).gt(0), 'Harga harus lebih dari nol.')
        .transform(value => new Prisma.Decimal(value).toFixed(4)));
export const purchasePricePreviewInput = z.object({
    invoiceId: id,
    purchaseOrderItemId: id,
    newUnitPrice: price,
});
export const purchasePriceCorrectionInput = purchasePricePreviewInput.extend({
    sourceFingerprint: z.string().regex(/^[a-f0-9]{64}$/, 'Pratinjau sumber tidak valid. Muat ulang.'),
    reason: z.string().trim().min(5, 'Alasan minimal 5 karakter.').max(1000, 'Alasan maksimal 1000 karakter.'),
    idempotencyKey: z.string().uuid('Kunci transaksi tidak valid.'),
    confirmed: z.literal(true, { error: 'Konfirmasi koreksi wajib diberikan.' }),
});

export function roundPurchaseMoney(value: Prisma.Decimal.Value) {
    return new Prisma.Decimal(value).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

type LocationInput = {
    locationId: string;
    receivedQuantity: Prisma.Decimal.Value;
    receiptDelta: Prisma.Decimal.Value;
    stockQuantity: Prisma.Decimal.Value;
    averageCost: Prisma.Decimal.Value | null;
};

/** Cumulative rounding allocates every receipt cent without reversing a location's sign. */
export function allocatePurchasePriceCorrection(input: LocationInput[]) {
    const rows = [...input].sort((a, b) => a.locationId.localeCompare(b.locationId));
    if (new Set(rows.map(row => row.locationId)).size !== rows.length) {
        throw new BusinessRuleError('Lokasi pratinjau berulang.', undefined, 'PURCHASE_PRICE_INVALID_SOURCE');
    }
    const receiptAmount = roundPurchaseMoney(rows.reduce(
        (sum, row) => sum.plus(row.receiptDelta), new Prisma.Decimal(0),
    ));
    if (receiptAmount.isZero()) {
        throw new BusinessRuleError('Tidak ada perubahan nilai penerimaan setelah pembulatan sen.', undefined, 'PURCHASE_PRICE_ZERO_DELTA');
    }
    let rawReceipt = new Prisma.Decimal(0);
    let allocatedReceipt = new Prisma.Decimal(0);
    let inventoryAmount = new Prisma.Decimal(0);
    const locations = rows.map((row) => {
        const q = new Prisma.Decimal(row.receivedQuantity);
        const stock = new Prisma.Decimal(row.stockQuantity);
        const avg = new Prisma.Decimal(row.averageCost ?? 0);
        const rawDelta = new Prisma.Decimal(row.receiptDelta);
        if ([q, stock, avg, rawDelta].some(value => !value.isFinite()) || q.lte(0) || stock.lt(0) || avg.lt(0)) {
            throw new BusinessRuleError('Jumlah atau biaya persediaan tidak valid.', undefined, 'PURCHASE_PRICE_INVALID_SOURCE');
        }
        if (stock.gt(0) && row.averageCost == null) {
            throw new BusinessRuleError('Biaya rata-rata stok belum tersedia. Rekonsiliasi persediaan terlebih dahulu.', undefined, 'PURCHASE_PRICE_INVALID_SOURCE');
        }
        rawReceipt = rawReceipt.plus(rawDelta);
        const r = roundPurchaseMoney(rawReceipt).minus(allocatedReceipt);
        allocatedReceipt = allocatedReceipt.plus(r);
        const h = Prisma.Decimal.min(stock, q);
        const inventory = roundPurchaseMoney(r.mul(h).div(q));
        const nextAvg = stock.gt(0) ? avg.mul(stock).plus(inventory).div(stock).toDecimalPlaces(4) : avg;
        if (nextAvg.lt(0) || nextAvg.gt('99999999999.9999')) {
            throw new BusinessRuleError('Koreksi menghasilkan biaya persediaan di luar batas. Rekonsiliasi terlebih dahulu.', undefined, 'PURCHASE_PRICE_INVALID_WAC');
        }
        inventoryAmount = inventoryAmount.plus(inventory);
        return {
            locationId: row.locationId,
            receivedQuantity: q.toFixed(4),
            stockQuantity: stock.toFixed(4),
            retainedQuantity: h.toFixed(4),
            receiptAmount: r.toFixed(2),
            inventoryAmount: inventory.toFixed(2),
            oldAverageCost: row.averageCost == null ? null : avg.toFixed(4),
            newAverageCost: row.averageCost == null ? null : nextAvg.toFixed(4),
        };
    });
    const varianceAmount = receiptAmount.minus(inventoryAmount);
    if ([receiptAmount, inventoryAmount, varianceAmount].some(value => value.abs().gt('9999999999999.99'))) {
        throw new BusinessRuleError('Nominal koreksi melampaui batas.', undefined, 'PURCHASE_PRICE_INVALID_AMOUNT');
    }
    return {
        receiptAmount: receiptAmount.toFixed(2),
        inventoryAmount: inventoryAmount.toFixed(2),
        varianceAmount: varianceAmount.toFixed(2),
        locations,
    };
}
