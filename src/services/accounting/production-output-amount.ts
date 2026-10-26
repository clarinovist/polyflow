import { Prisma, type StockMovement } from '@prisma/client';
import { BusinessRuleError } from '@/lib/errors/errors';

/** Validate representation precision, never increase the WO funding allowance. */
export function assertProductionOutputAmount(movement: StockMovement, value: number) {
    const amount = new Prisma.Decimal(value);
    const quantity = new Prisma.Decimal(movement.quantity);
    const cost = movement.cost;
    if (!amount.isFinite() || amount.lt(0) || amount.decimalPlaces() > 2 ||
        !quantity.isFinite() || !quantity.gt(0) || !cost?.isFinite() || cost.lt(0)) {
        throw new BusinessRuleError('Sumber nilai hasil produksi tidak valid. Hasil belum disimpan.');
    }
    // Rounding a unit price to 4dp loses at most 0.00005 per unit; rounding
    // the original total to cents loses at most 0.005. This is NOT a WIP tolerance:
    // allocateProductionWip still requires every cent of amount to be funded.
    const precisionBound = quantity.mul('0.00005').plus('0.005');
    if (amount.minus(quantity.mul(cost)).abs().gt(precisionBound)) {
        throw new BusinessRuleError('Sumber nilai hasil produksi tidak sesuai biaya satuan tersimpan. Hasil belum disimpan.');
    }
}
