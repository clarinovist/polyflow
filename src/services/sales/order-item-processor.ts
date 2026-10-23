import { prisma } from '@/lib/core/prisma';
import { unchangedSalesLine } from './order-edit-diff';
import { SalesOrderType, ProductType, Unit, Prisma, type SalesOrderItem } from '@prisma/client';
import { calculatePpn, type PpnMode } from '@/lib/utils/ppn';
import {
    BusinessRuleError,
    NotFoundError,
    ValidationError,
} from '@/lib/errors/errors';

type SalesLineInput = {
    id?: string;
    productVariantId: string;
    quantity: number;
    unitPrice: number;
    enteredQuantity?: number;
    enteredUnit?: Unit;
    conversionFactorSnapshot?: number;
    enteredUnitPrice?: number;
    discountPercent?: number;
    taxPercent?: number;
    dppOtherAmount?: number | null;
    ppnMode?: 'INCLUDE' | 'EXCLUDE';
    isFreeItem?: boolean;
};

type ProcessedItem = {
    productVariantId: string;
    quantity: number;
    unitPrice: number;
    isFreeItem: boolean;
    enteredQuantity: number | undefined;
    enteredUnit: Unit | undefined;
    conversionFactorSnapshot: number | undefined;
    enteredUnitPrice: number | undefined;
    discountPercent: number;
    taxPercent: number;
    taxAmount: number;
    subtotal: number;
    dppOtherAmount: number | null;
    ppnMode: PpnMode;
};

type OrderItemTotals = {
    totalAmount: number;
    totalDiscount: number;
    totalTax: number;
    items: ProcessedItem[];
};

function decimalToNumber(value: unknown, fallback = 1) {
    if (typeof value === 'number')
        return Number.isFinite(value) ? value : fallback;
    if (typeof value === 'string') {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : fallback;
    }
    if (typeof value === 'object' && value !== null && 'toNumber' in value) {
        const parsed = (value as { toNumber: () => number }).toNumber();
        return Number.isFinite(parsed) ? parsed : fallback;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function assertNearlyEqual(
    clientValue: number | undefined,
    serverValue: number,
    label: string,
) {
    if (clientValue === undefined) return;
    if (!Number.isFinite(Number(clientValue)) || !Number.isFinite(serverValue) || Math.abs(Number(clientValue) - serverValue) > 0.0001) {
        throw new ValidationError(
            `${label} mismatch. Client sent ${clientValue}, server calculated ${serverValue}.`,
        );
    }
}

function resolveSalesEnteredUnitFactor(
    item: SalesLineInput,
    variant: {
        primaryUnit: Unit;
        salesUnit: Unit | null;
        conversionFactor: unknown;
    },
    historical?: SalesOrderItem,
) {
    const payloadCount = [
        item.enteredQuantity !== undefined,
        item.enteredUnit !== undefined,
        item.enteredUnitPrice !== undefined,
        item.conversionFactorSnapshot !== undefined,
    ].filter(Boolean).length;

    if (payloadCount > 0 && payloadCount < 4) {
        throw new ValidationError(
            'Incomplete sales conversion payload. Send enteredQuantity, enteredUnit, enteredUnitPrice, and conversionFactorSnapshot together.',
        );
    }

    if (payloadCount === 0) return null;

    const enteredUnit = item.enteredUnit as Unit;
    if (enteredUnit === variant.primaryUnit) return 1;

    if ((variant.salesUnit && enteredUnit === variant.salesUnit) || historical?.enteredUnit === enteredUnit) {
        // Snapshot authority comes only from the persisted item of this SO.
        const savedFactor = historical?.enteredUnit === enteredUnit
            ? Number(historical.conversionFactorSnapshot) : NaN;
        const factor = Number.isFinite(savedFactor) && savedFactor > 0
            ? savedFactor : decimalToNumber(variant.conversionFactor, NaN);
        if (!Number.isFinite(factor) || factor <= 0) {
            throw new ValidationError(
                `Invalid conversion factor for sales unit ${enteredUnit}`,
            );
        }
        return factor;
    }

    throw new ValidationError(
        `Unit ${enteredUnit} is not valid for this product variant`,
    );
}

function normalizeSalesLineItem(
    item: SalesLineInput,
    variant: {
        primaryUnit: Unit;
        salesUnit: Unit | null;
        conversionFactor: unknown;
    },
    historical?: SalesOrderItem,
) {
    for (const value of [item.quantity, item.unitPrice, item.enteredQuantity, item.enteredUnitPrice, item.conversionFactorSnapshot]) {
        if (value !== undefined && !Number.isFinite(Number(value))) throw new ValidationError('Jumlah, harga, dan faktor satuan harus berupa angka valid.');
    }
    if (item.quantity <= 0 || item.unitPrice < 0 || (item.enteredQuantity !== undefined && item.enteredQuantity <= 0) || (item.enteredUnitPrice !== undefined && item.enteredUnitPrice < 0)) throw new ValidationError('Jumlah harus positif dan harga tidak boleh negatif.');
    for (const value of [item.quantity, item.enteredQuantity]) {
        if (value !== undefined && new Prisma.Decimal(value).toDecimalPlaces(4).lte(0)) {
            throw new ValidationError('Jumlah terlalu kecil: satuan input dan satuan dasar minimal 0,0001 agar tidak tersimpan sebagai nol.');
        }
    }
    for (const [value, scale] of [[item.quantity, 4], [item.unitPrice, 2], [item.enteredQuantity, 4], [item.enteredUnitPrice, 2]] as const) {
        if (value !== undefined && Math.abs(value - Number(new Prisma.Decimal(value).toFixed(scale))) > 1e-9) {
            throw new ValidationError('Konversi tidak dapat disimpan tepat: jumlah maksimal 4 desimal dan harga maksimal 2 desimal, baik pada satuan input maupun satuan dasar. Gunakan satuan lain atau sesuaikan jumlah/harga.');
        }
    }
    const factor = resolveSalesEnteredUnitFactor(item, variant, historical);

    if (factor === null) {
        return {
            productVariantId: item.productVariantId,
            quantity: Number(item.quantity),
            unitPrice: Number(item.unitPrice),
            isFreeItem: Boolean(item.isFreeItem),
            enteredQuantity: undefined,
            enteredUnit: undefined,
            conversionFactorSnapshot: undefined,
            enteredUnitPrice: undefined,
            discountPercent: item.discountPercent || 0,
            taxPercent: item.taxPercent || 0,
            dppOtherAmount: item.dppOtherAmount || null,
            ppnMode: (item.ppnMode || 'EXCLUDE') as PpnMode,
        };
    }

    const enteredQuantity = Number(item.enteredQuantity);
    const enteredUnitPrice = Number(item.enteredUnitPrice);
    const baseQuantity = enteredQuantity * factor;
    const baseUnitPrice =
        factor > 0 ? enteredUnitPrice / factor : enteredUnitPrice;

    if (new Prisma.Decimal(baseQuantity).toDecimalPlaces(4).lte(0)) {
        throw new ValidationError('Jumlah dasar terlalu kecil untuk disimpan.');
    }
    if (Math.abs(baseQuantity - Number(new Prisma.Decimal(baseQuantity).toFixed(4))) > 1e-7 || Math.abs(baseUnitPrice - Number(new Prisma.Decimal(baseUnitPrice).toFixed(2))) > 1e-7) {
        throw new ValidationError('Konversi tidak dapat disimpan tepat: jumlah dasar maksimal 4 desimal dan harga dasar maksimal 2 desimal. Sesuaikan jumlah/harga sebelum menyimpan.');
    }
    assertNearlyEqual(item.quantity, baseQuantity, 'Sales quantity conversion');
    assertNearlyEqual(
        item.unitPrice,
        baseUnitPrice,
        'Sales unit price conversion',
    );
    assertNearlyEqual(
        item.conversionFactorSnapshot,
        factor,
        'Sales conversion factor',
    );

    return {
        productVariantId: item.productVariantId,
        quantity: baseQuantity,
        unitPrice: baseUnitPrice,
        isFreeItem: Boolean(item.isFreeItem),
        enteredQuantity,
        enteredUnit: item.enteredUnit,
        conversionFactorSnapshot: factor,
        enteredUnitPrice,
        discountPercent: item.discountPercent || 0,
        taxPercent: item.taxPercent || 0,
        dppOtherAmount: item.dppOtherAmount || null,
        ppnMode: (item.ppnMode || 'EXCLUDE') as PpnMode,
    };
}

/**
 * Processes order line items: validates, normalizes, and computes totals.
 * Shared by createOrder and updateOrder.
 */
export async function processOrderItems(
    items: SalesLineInput[],
    orderType: SalesOrderType,
    existingItems: SalesOrderItem[] = [],
): Promise<OrderItemTotals> {
    let totalAmount = 0;
    let totalDiscount = 0;
    let totalTax = 0;

    const processedItems = await Promise.all(
        items.map(async (item) => {
            const variant = await prisma.productVariant.findUnique({
                where: { id: item.productVariantId },
                include: { product: true },
            });

            if (!variant)
                throw new NotFoundError(
                    'Product Variant',
                    item.productVariantId,
                );

            const isService =
                variant.product.productType === ProductType.SERVICE;
            if (isService && orderType !== SalesOrderType.MAKLON_JASA) {
                throw new BusinessRuleError(
                    `Service item '${variant.name}' is only allowed for Maklon Jasa orders`,
                    { productVariantId: item.productVariantId, orderType },
                );
            }
            if (!isService && orderType === SalesOrderType.MAKLON_JASA) {
                throw new BusinessRuleError(
                    `Physical item '${variant.name}' is not allowed for Maklon Jasa orders. Use a Service item instead.`,
                    { productVariantId: item.productVariantId, orderType },
                );
            }

            const historical = item.id ? existingItems.find(old => old.id === item.id && old.productVariantId === item.productVariantId) : undefined;
            // Trusted byte-equivalent historical intent is not a new conversion.
            // Older rows may have rounded base prices; do not reject or rewrite them.
            const preserve = historical && unchangedSalesLine(historical, item) && historical.subtotal != null;
            const normalized = preserve ? {
                productVariantId: historical.productVariantId,
                quantity: Number(historical.quantity), unitPrice: Number(historical.unitPrice),
                isFreeItem: Boolean(historical.isFreeItem),
                enteredQuantity: historical.enteredQuantity == null ? undefined : Number(historical.enteredQuantity),
                enteredUnit: historical.enteredUnit ?? undefined,
                enteredUnitPrice: historical.enteredUnitPrice == null ? undefined : Number(historical.enteredUnitPrice),
                conversionFactorSnapshot: historical.conversionFactorSnapshot == null ? undefined : Number(historical.conversionFactorSnapshot),
                discountPercent: Number(historical.discountPercent ?? 0), taxPercent: Number(historical.taxPercent ?? 0),
                dppOtherAmount: historical.dppOtherAmount == null ? null : Number(historical.dppOtherAmount),
                ppnMode: historical.ppnMode ?? 'EXCLUDE',
            } : normalizeSalesLineItem(item, variant, historical);
            const rawSubtotal = normalized.quantity * normalized.unitPrice;
            const discountAmount =
                rawSubtotal * (normalized.discountPercent / 100);
            const subtotalAfterDiscount = rawSubtotal - discountAmount;
            const ppnMode = normalized.ppnMode;
            const calculated = calculatePpn(subtotalAfterDiscount, normalized.taxPercent, ppnMode);
            const ppnResult = preserve
                ? { total: Number(historical.subtotal), taxAmount: Number(historical.taxAmount ?? 0) }
                : calculated;

            totalDiscount += discountAmount;
            totalTax += ppnResult.taxAmount;
            totalAmount += ppnResult.total;

            return {
                ...normalized,
                taxAmount: ppnResult.taxAmount,
                subtotal: ppnResult.total,
            };
        }),
    );

    return {
        totalAmount,
        totalDiscount,
        totalTax,
        items: processedItems,
    };
}
