import { prisma } from '@/lib/core/prisma';
import { Prisma, StockMovement, JournalStatus } from '@prisma/client';
import { createJournalEntry } from './journals-service';
import { updateStandardCost } from '@/actions/finance/cost-history';

type StockMovementWithProduct = Prisma.StockMovementGetPayload<{
    include: { productVariant: { include: { product: true } } }
}>;

export async function recordInventoryMovement(
    movement: StockMovement & { productVariant?: StockMovementWithProduct['productVariant'] },
    tx?: Prisma.TransactionClient
) {
    const db = tx || prisma;

    const productVariant = movement.productVariant ?? await db.productVariant.findUnique({
        where: { id: movement.productVariantId },
        include: { product: true }
    });

    if (!productVariant) return;

    // Check if this movement is related to a Maklon transaction
    let isMaklon = false;
    let goodsReceipt = null;

    if (movement.goodsReceiptId) {
        goodsReceipt = await db.goodsReceipt.findUnique({
            where: { id: movement.goodsReceiptId },
            include: { purchaseOrder: { include: { items: { where: { productVariantId: movement.productVariantId } } } } }
        });
        if (goodsReceipt?.isMaklon) isMaklon = true;
    } else if (movement.productionOrderId) {
        const po = await db.productionOrder.findUnique({ where: { id: movement.productionOrderId }, select: { isMaklon: true } });
        if (po?.isMaklon) isMaklon = true;
    } else if (movement.salesOrderId) {
        const so = await db.salesOrder.findUnique({ where: { id: movement.salesOrderId }, select: { orderType: true } });
        if (so?.orderType === 'MAKLON_JASA') isMaklon = true;
    }

    if (isMaklon) {
        // Off-balance sheet transaction: bypass financial valuation (WAC) and GL Generation
        return;
    }

    const date = movement.createdAt || new Date();
    // Priority: Standard Cost > Buy Price > Sell Price (Fallback)
    const currentCost = Number(productVariant.standardCost || productVariant.buyPrice || productVariant.price || 0);
    let cost = currentCost;

    // If this is a Goods Receipt, try to get the price from the Purchase Order and update Standard Cost
    if (movement.goodsReceiptId && goodsReceipt) {
        const poItem = goodsReceipt.purchaseOrder?.items[0];
        if (poItem) {
            const receiptPrice = Number(poItem.unitPrice);
            cost = receiptPrice;

            // AUTO-UPDATE Standard Cost (Weighted Average)
            // 1. Get current stock across all locations
            const inventorySum = await db.inventory.aggregate({
                where: { productVariantId: movement.productVariantId },
                _sum: { quantity: true }
            });
            const currentStock = inventorySum._sum.quantity ? inventorySum._sum.quantity.toNumber() : 0;
            const receiptQty = Number(movement.quantity);

            // 2. Calculate New Weighted Average
            // Formula: ((currentCost * currentStock) + (receiptPrice * receiptQty)) / (currentStock + receiptQty)
            if (currentStock + receiptQty > 0) {
                const newWeightedAvg = ((currentCost * currentStock) + (receiptPrice * receiptQty)) / (currentStock + receiptQty);

                // 3. Update Standard Cost & Log History
                await updateStandardCost(
                    movement.productVariantId,
                    newWeightedAvg,
                    'PURCHASE_GR',
                    movement.goodsReceiptId,
                    db as Prisma.TransactionClient // Use current transaction if available
                );
            }
        }
    }

    const totalAmount = Number(movement.quantity) * cost;

    if (totalAmount === 0) return;

    const productType = productVariant.product.productType;

    const getInventoryAccount = (pType: string) => {
        switch (pType) {
            case 'RAW_MATERIAL': return '11310';
            case 'FINISHED_GOOD': return '11330';
            case 'WIP': return '11320';
            case 'SCRAP': return '11350';
            case 'INTERMEDIATE': return '11320';
            case 'PACKAGING': return '11340';
            default: return '11300';
        }
    };

    const lines = [];

    if (movement.type === 'PURCHASE' || movement.goodsReceiptId) {
        const invAccount = productVariant.product.inventoryAccountId || getInventoryAccount(productType);
        lines.push(
            { accountId: (await getAccountId(invAccount, db)), debit: totalAmount, credit: 0, description: `GR: ${productVariant.name}` },
            { accountId: (await getAccountId('21110', db)), debit: 0, credit: totalAmount, description: `Trade Payable: ${productVariant.name}` }
        );
    }

    else if (movement.type === 'OUT' && movement.salesOrderId) {
        const invAccount = productVariant.product.inventoryAccountId || getInventoryAccount(productType);
        const cogsAccount = productVariant.product.cogsAccountId || '50000';
        lines.push(
            { accountId: (await getAccountId(cogsAccount, db)), debit: totalAmount, credit: 0, description: `COGS: ${productVariant.name}` },
            { accountId: (await getAccountId(invAccount, db)), debit: 0, credit: totalAmount, description: `Shipment: ${productVariant.name}` }
        );
    }

    else if (movement.type === 'OUT' && !movement.salesOrderId) {
        const creditAccount = productVariant.product.inventoryAccountId || getInventoryAccount(productType);
        const wipAccount = productVariant.product.wipAccountId || '11320';
        lines.push(
            { accountId: (await getAccountId(wipAccount, db)), debit: totalAmount, credit: 0, description: `Production Issue: ${productVariant.name}` },
            { accountId: (await getAccountId(creditAccount, db)), debit: 0, credit: totalAmount, description: `Material Consumed` }
        );
    }

    else if (movement.type === 'IN' && !movement.goodsReceiptId) {
        const debitAccount = productVariant.product.inventoryAccountId || getInventoryAccount(productType);
        const wipAccount = productVariant.product.wipAccountId || '11320';
        lines.push(
            { accountId: (await getAccountId(debitAccount, db)), debit: totalAmount, credit: 0, description: `Production Output: ${productVariant.name}` },
            { accountId: (await getAccountId(wipAccount, db)), debit: 0, credit: totalAmount, description: `WIP Relief` }
        );
    }

    else if (movement.type === 'ADJUSTMENT') {
        const invAccount = getInventoryAccount(productType);
        const absAmt = Math.abs(totalAmount);

        // If toLocationId is present, stock went IN (Gain). If it's null, stock went OUT (Loss).
        if (movement.toLocationId !== null) {
            lines.push(
                { accountId: (await getAccountId(invAccount, db)), debit: absAmt, credit: 0, description: `Stock Adj (In)` },
                { accountId: (await getAccountId('81100', db)), debit: 0, credit: absAmt, description: `Adj Gain` }
            );
        } else {
            lines.push(
                { accountId: (await getAccountId('91100', db)), debit: absAmt, credit: 0, description: `Adj Loss` },
                { accountId: (await getAccountId(invAccount, db)), debit: 0, credit: absAmt, description: `Stock Adj (Out)` }
            );
        }
    }

    if (lines.length > 0) {
        await createJournalEntry({
            entryDate: date,
            description: `Auto: ${movement.type} - ${productVariant.name}`,
            reference: movement.reference || movement.id,
            referenceType: movement.type === 'PURCHASE' ? 'GOODS_RECEIPT' : (movement.type === 'ADJUSTMENT' ? 'STOCK_ADJUSTMENT' : 'MANUAL_ENTRY'),
            referenceId: movement.id,
            isAutoGenerated: true,
            status: JournalStatus.POSTED,
            lines,
            createdById: movement.createdById ?? undefined
        }, tx);
    }
}

const accountCache = new Map<string, string>();

async function getAccountId(code: string, db: Prisma.TransactionClient): Promise<string> {
    // If code is already a UUID (e.g. from Product account mappings), return it directly
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(code)) {
        return code;
    }

    if (accountCache.has(code)) return accountCache.get(code)!;

    const acc = await db.account.findUnique({ where: { code } });
    if (!acc) throw new Error(`GL Account code ${code} not found during auto-journal.`);

    accountCache.set(code, acc.id);
    return acc.id;
}

export async function recordMaklonCosts(productionOrderId: string, tx: Prisma.TransactionClient) {
    const db = tx || prisma;
    const order = await db.productionOrder.findUnique({
        where: { id: productionOrderId },
        include: { maklonCostItems: true }
    });

    if (!order || !order.isMaklon || !order.maklonCostItems || order.maklonCostItems.length === 0) return;

    // Accounts
    const overheadAccount = await getAccountId('51100', db); // Manufacturing Overhead
    const payableAccount = await getAccountId('21200', db); // Accrued Liabilities (AP / Accruals)
    const rawMaterialExpense = await getAccountId('50000', db); // COGS / RM Consumed
    const invAccount = await getAccountId('11310', db); // RM Inventory

    const lines = [];
    for (const item of order.maklonCostItems) {
        const amount = Number(item.amount);
        if (amount <= 0) continue;

        // Group into logical Dr/Cr mappings
        if (item.costType === 'ADDITIVE' || item.costType === 'COLORANT') {
            lines.push(
                { accountId: rawMaterialExpense, debit: amount, credit: 0, description: `Maklon Mat Used: ${item.description || item.costType}` },
                { accountId: invAccount, debit: 0, credit: amount, description: `Inventory Consumption (Maklon)` }
            );
        } else {
            // LABOR, MACHINE, ELECTRICITY, OVERHEAD, OTHER
            lines.push(
                { accountId: overheadAccount, debit: amount, credit: 0, description: `Maklon Overhead: ${item.description || item.costType}` },
                { accountId: payableAccount, debit: 0, credit: amount, description: `Accrued Expense (Maklon)` }
            );
        }
    }

    if (lines.length > 0) {
        await createJournalEntry({
            entryDate: order.actualEndDate || new Date(),
            description: `Maklon Costs for WO#${order.orderNumber}`,
            reference: order.orderNumber,
            referenceType: 'MANUAL_ENTRY',
            referenceId: order.id,
            isAutoGenerated: true,
            status: JournalStatus.POSTED,
            lines,
            createdById: order.createdById ?? undefined
        }, db as Prisma.TransactionClient);
    }
}
