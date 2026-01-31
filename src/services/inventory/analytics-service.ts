import { prisma } from '@/lib/prisma';
import { MovementType, Prisma } from '@prisma/client';
import { subDays, format } from 'date-fns';

export async function getSuggestedPurchases() {
    const variants = await prisma.productVariant.findMany({
        where: { reorderPoint: { not: null } },
        include: {
            product: { select: { name: true, productType: true } },
            preferredSupplier: { select: { name: true } },
            inventories: { select: { quantity: true } }
        }
    });

    return variants.map(v => {
        const totalPhysical = v.inventories.reduce((sum, inv) => sum + inv.quantity.toNumber(), 0);
        return {
            ...v,
            totalStock: totalPhysical,
            shouldReorder: totalPhysical < (v.reorderPoint?.toNumber() || 0)
        };
    }).filter(v => v.shouldReorder);
}

export async function getInventoryValuation() {
    const stock = await prisma.inventory.findMany({
        where: { quantity: { gt: 0 } },
        include: {
            productVariant: {
                select: { name: true, skuCode: true, buyPrice: true }
            }
        }
    });

    let totalValuation = 0;
    const valuationDetails = [];

    for (const item of stock) {
        const quantity = item.quantity.toNumber();
        const unitCost = item.averageCost?.toNumber() || item.productVariant.buyPrice?.toNumber() || 0;
        const value = quantity * unitCost;

        totalValuation += value;

        valuationDetails.push({
            productVariantId: item.productVariantId,
            name: item.productVariant.name,
            sku: item.productVariant.skuCode,
            locationId: item.locationId,
            quantity,
            unitCost,
            totalValue: value
        });
    }

    return {
        totalValuation,
        details: valuationDetails
    };
}

export async function getInventoryAsOf(targetDate: Date, locationId?: string) {
    const result = await prisma.$queryRaw<Array<{ productVariantId: string, locationId: string, quantity: number }>>`
        SELECT
            "productVariantId",
            "locationId",
            SUM("quantity")::float as "quantity"
        FROM (
            SELECT "productVariantId", "fromLocationId" as "locationId", -1 * "quantity" as "quantity"
            FROM "StockMovement"
            WHERE "fromLocationId" IS NOT NULL AND "createdAt" <= ${targetDate}::timestamp

            UNION ALL

            SELECT "productVariantId", "toLocationId" as "locationId", "quantity"
            FROM "StockMovement"
            WHERE "toLocationId" IS NOT NULL AND "createdAt" <= ${targetDate}::timestamp
        ) as movements
        WHERE "locationId" IS NOT NULL
        ${locationId ? Prisma.sql`AND "locationId" = ${locationId}` : Prisma.empty}
        GROUP BY "productVariantId", "locationId"
    `;

    return result;
}

export async function getStockHistory(productVariantId: string, startDate: Date, endDate: Date, locationId?: string) {
    const initialMovements = await prisma.stockMovement.findMany({
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

    let currentStock = initialMovements.reduce((sum, m) => {
        const qty = m.quantity.toNumber();
        let delta = 0;
        if (locationId) {
            if (m.toLocationId === locationId) delta += qty;
            if (m.fromLocationId === locationId) delta -= qty;
        } else {
            if (m.toLocationId && !m.fromLocationId) delta += qty;
            if (m.fromLocationId && !m.toLocationId) delta -= qty;
        }
        return sum + delta;
    }, 0);

    const movements = await prisma.stockMovement.findMany({
        where: {
            productVariantId,
            createdAt: {
                gte: startDate,
                lte: endDate
            },
            ...(locationId ? {
                OR: [
                    { fromLocationId: locationId },
                    { toLocationId: locationId }
                ]
            } : {})
        },
        orderBy: { createdAt: 'asc' }
    });

    const historyData = [];
    const curr = new Date(startDate);

    while (curr <= endDate) {
        const dayStart = new Date(curr);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(curr);
        dayEnd.setHours(23, 59, 59, 999);

        const dayMovements = movements.filter(m =>
            m.createdAt >= dayStart && m.createdAt <= dayEnd
        );

        dayMovements.forEach(m => {
            const qty = m.quantity.toNumber();
            if (locationId) {
                if (m.toLocationId === locationId) currentStock += qty;
                if (m.fromLocationId === locationId) currentStock -= qty;
            } else {
                if (m.toLocationId && !m.fromLocationId) currentStock += qty;
                if (m.fromLocationId && !m.toLocationId) currentStock -= qty;
            }
        });

        historyData.push({
            date: dayStart.toISOString().split('T')[0],
            stock: currentStock
        });

        curr.setDate(curr.getDate() + 1);
    }

    return historyData;
}

export async function getInventoryTurnover(periodDays = 30) {
    const startDate = subDays(new Date(), periodDays);
    const endDate = new Date();

    const outboundMovements = await prisma.stockMovement.findMany({
        where: {
            type: MovementType.OUT,
            createdAt: { gte: startDate, lte: endDate },
            cost: { not: null }
        },
        select: { quantity: true, cost: true }
    });

    const cogs = outboundMovements.reduce((sum, m) => {
        return sum + (m.quantity.toNumber() * (m.cost?.toNumber() || 0));
    }, 0);

    const currentValuation = await getInventoryValuation();
    const closingValue = currentValuation.totalValuation;

    const inboundMovements = await prisma.stockMovement.findMany({
        where: {
            type: MovementType.IN,
            createdAt: { gte: startDate, lte: endDate },
            cost: { not: null }
        },
        select: { quantity: true, cost: true }
    });
    const inValue = inboundMovements.reduce((sum, m) => sum + (m.quantity.toNumber() * (m.cost?.toNumber() || 0)), 0);
    const outValue = cogs;

    const openingValue = closingValue - inValue + outValue;
    const averageInventory = (openingValue + closingValue) / 2;

    const turnoverRatio = averageInventory > 0 ? cogs / averageInventory : 0;

    return {
        periodDays,
        cogs,
        averageInventory,
        turnoverRatio: Number(turnoverRatio.toFixed(2))
    };
}

export async function getDaysOfInventoryOnHand(periodDays = 30) {
    const turnoverStats = await getInventoryTurnover(periodDays);

    if (turnoverStats.cogs === 0) {
        return {
            ...turnoverStats,
            daysOnHand: turnoverStats.averageInventory > 0 ? 999 : 0
        };
    }

    const daysOnHand = (turnoverStats.averageInventory / turnoverStats.cogs) * periodDays;

    return {
        ...turnoverStats,
        daysOnHand: Number(daysOnHand.toFixed(1))
    };
}

export async function getStockMovementTrends(period: 'week' | 'month' | 'quarter' = 'month') {
    const days = period === 'week' ? 7 : period === 'month' ? 30 : 90;
    const startDate = subDays(new Date(), days);

    const movements = await prisma.stockMovement.findMany({
        where: {
            createdAt: { gte: startDate }
        },
        select: {
            type: true,
            quantity: true,
            createdAt: true
        },
        orderBy: { createdAt: 'asc' }
    });

    const grouped = movements.reduce((acc, m) => {
        const dateStr = format(m.createdAt, 'yyyy-MM-dd');
        if (!acc[dateStr]) {
            acc[dateStr] = { date: dateStr, in: 0, out: 0, transfer: 0, adjustment: 0 };
        }

        const qty = m.quantity.toNumber();
        if (m.type === MovementType.IN) acc[dateStr].in += qty;
        else if (m.type === MovementType.OUT) acc[dateStr].out += qty;
        else if (m.type === MovementType.TRANSFER) acc[dateStr].transfer += qty;
        else if (m.type === MovementType.ADJUSTMENT) acc[dateStr].adjustment += qty;

        return acc;
    }, {} as Record<string, { date: string; in: number; out: number; transfer: number; adjustment: number }>);

    const results = [];
    for (let i = 0; i <= days; i++) {
        const date = subDays(new Date(), days - i);
        const dateStr = format(date, 'yyyy-MM-dd');
        results.push(grouped[dateStr] || { date: dateStr, in: 0, out: 0, transfer: 0, adjustment: 0 });
    }

    return results;
}
