import { prisma } from '@/lib/prisma';


export async function getStockLedger(
    productVariantId: string,
    startDate: Date,
    endDate: Date,
    locationId?: string
) {
    // 1. Get product info
    const productVariant = await prisma.productVariant.findUniqueOrThrow({
        where: { id: productVariantId },
        select: {
            id: true,
            name: true,
            skuCode: true,
            primaryUnit: true,
            product: {
                select: {
                    productType: true
                }
            }
        }
    });

    const productInfo = {
        id: productVariant.id,
        name: productVariant.name,
        skuCode: productVariant.skuCode,
        primaryUnit: productVariant.primaryUnit,
        type: productVariant.product.productType
    };

    // 2. Compute opening stock (all movements before startDate)
    const priorMovements = await prisma.stockMovement.findMany({
        where: {
            productVariantId,
            createdAt: { lt: startDate },
            ...(locationId ? {
                OR: [
                    { fromLocationId: locationId },
                    { toLocationId: locationId }
                ]
            } : {})
        }
    });

    let openingStock = 0;
    priorMovements.forEach(m => {
        const qty = m.quantity.toNumber();
        if (locationId) {
            // Per location balance
            if (m.toLocationId === locationId) openingStock += qty;
            if (m.fromLocationId === locationId) openingStock -= qty;
        } else {
            // Global balance (only external movements matter for total)
            if (m.toLocationId && !m.fromLocationId) openingStock += qty;    // IN
            if (m.fromLocationId && !m.toLocationId) openingStock -= qty;    // OUT
            // TRANSFER: internal transfer doesn't change global total
        }
    });

    // 3. Get movements in range with relations
    const movements = await prisma.stockMovement.findMany({
        where: {
            productVariantId,
            createdAt: { gte: startDate, lte: endDate },
            ...(locationId ? {
                OR: [
                    { fromLocationId: locationId },
                    { toLocationId: locationId }
                ]
            } : {})
        },
        include: {
            fromLocation: { select: { id: true, name: true } },
            toLocation: { select: { id: true, name: true } },
            createdBy: { select: { name: true } },
            batch: { select: { batchNumber: true } }
        },
        orderBy: { createdAt: 'asc' }
    });

    // 4. Build ledger entries with running balance
    let runningBalance = openingStock;
    let totalIn = 0;
    let totalOut = 0;

    const entries = movements.map(m => {
        const qty = m.quantity.toNumber();
        let qtyIn = 0;
        let qtyOut = 0;

        if (locationId) {
            // Per location logic
            if (m.toLocationId === locationId) qtyIn = qty;
            if (m.fromLocationId === locationId) qtyOut = qty;
        } else {
            // Global logic
            if (m.toLocationId && !m.fromLocationId) qtyIn = qty;
            if (m.fromLocationId && !m.toLocationId) qtyOut = qty;
        }

        runningBalance += qtyIn - qtyOut;
        totalIn += qtyIn;
        totalOut += qtyOut;

        return {
            id: m.id,
            date: m.createdAt,
            type: m.type,
            qtyIn,
            qtyOut,
            balance: runningBalance,
            fromLocation: m.fromLocation?.name || null,
            toLocation: m.toLocation?.name || null,
            reference: m.reference,
            batch: m.batch?.batchNumber || null,
            createdBy: m.createdBy?.name || null
        };
    });

    return {
        product: productInfo,
        entries,
        summary: {
            openingStock,
            totalIn,
            totalOut,
            closingStock: runningBalance
        }
    };
}
