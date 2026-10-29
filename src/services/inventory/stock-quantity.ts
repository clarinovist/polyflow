import { Prisma } from '@prisma/client';
import { ValidationError } from '@/lib/errors/errors';

export const STOCK_QUANTITY_SCALE = 4;

/**
 * Normalize a stock quantity to Prisma.Decimal(15,4) using ROUND_HALF_UP
 * so live Inventory.quantity decrements match PostgreSQL numeric(15,4) rounding
 * on StockMovement.quantity.
 */
export function toStockQuantity(value: Prisma.Decimal.Value): Prisma.Decimal {
    if (typeof value === 'number' && !Number.isFinite(value)) {
        throw new ValidationError(
            `Kuantitas stok harus berupa angka terbatas (diterima: ${String(value)}).`,
            { value: String(value) },
        );
    }

    let decimal: Prisma.Decimal;
    try {
        decimal =
            value instanceof Prisma.Decimal
                ? value
                : new Prisma.Decimal(value);
    } catch {
        throw new ValidationError(
            `Kuantitas stok tidak valid (diterima: ${String(value)}).`,
            { value: String(value) },
        );
    }

    if (!decimal.isFinite() || decimal.isNaN()) {
        throw new ValidationError(
            `Kuantitas stok harus berupa angka terbatas (diterima: ${String(value)}).`,
            { value: String(value) },
        );
    }

    if (decimal.lt(0)) {
        throw new ValidationError(
            `Kuantitas stok tidak boleh negatif (diterima: ${decimal.toString()}).`,
            { value: decimal.toString() },
        );
    }

    return decimal.toDecimalPlaces(
        STOCK_QUANTITY_SCALE,
        Prisma.Decimal.ROUND_HALF_UP,
    );
}
