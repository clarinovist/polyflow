import { prisma } from '@/lib/core/prisma';
import { Prisma, StockMovement, JournalStatus } from '@prisma/client';
import { createJournalEntry } from './journals-service';
import { updateStandardCost } from '@/actions/finance/cost-history';
import { NotFoundError, BusinessRuleError } from '@/lib/errors/errors';
import { resolveAccountCode } from './account-mapping-policy';

type StockMovementWithProduct = Prisma.StockMovementGetPayload<{
    include: { productVariant: { include: { product: true } } }
}>;

/**
 * Check GL account balance won't go negative after posting.
 * For ASSET accounts: balance = debit - credit. A credit posting reduces balance.
 * Throws if posting would make the balance negative.
 */
async function validateGlBalance(
    db: Prisma.TransactionClient,
    accountId: string,
    creditAmount: number,
    productName: string
) {
    if (creditAmount <= 0) return;

    const result = await db.journalLine.aggregate({
        where: {
            accountId,
            journalEntry: { status: 'POSTED' }
        },
        _sum: { debit: true, credit: true }
    });

    const totalDebit = Number(result._sum.debit || 0);
    const totalCredit = Number(result._sum.credit || 0);
    const currentBalance = totalDebit - totalCredit;

    if (currentBalance < creditAmount) {
        const account = await db.account.findUnique({ where: { id: accountId }, select: { code: true, name: true } });
        throw new BusinessRuleError(
            `Saldo akun GL akan minus!\n` +
            `Akun: ${account?.code} - ${account?.name}\n` +
            `Saldo saat ini: Rp ${currentBalance.toLocaleString('id-ID')}\n` +
            `Akan di-credit: Rp ${creditAmount.toLocaleString('id-ID')}\n` +
            `Produk: ${productName}\n` +
            `Tip: Pastikan stok sudah di-receipt/adjustment ke akun yang benar sebelum konsumsi.`
        );
    }
}

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
    // Priority: Persisted movement cost -> Standard Cost -> Buy Price -> Sell Price
    const currentCost = Number(movement.cost ?? productVariant.standardCost ?? productVariant.buyPrice ?? productVariant.price ?? 0);
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
            const currentStockAfterReceipt = inventorySum._sum.quantity ? inventorySum._sum.quantity.toNumber() : 0;
            const receiptQty = Number(movement.quantity);
            const currentStock = Math.max(0, currentStockAfterReceipt - receiptQty);

            // 2. Calculate New Weighted Average
            // Use the variant's EXISTING standardCost (before this update), NOT the receipt price.
            // Using receiptPrice here would make the formula collapse to: newAvg = receiptPrice (always).
            const previousStandardCost = Number(productVariant.standardCost ?? 0);
            if (currentStock + receiptQty > 0) {
                const newWeightedAvg = currentStock > 0 && previousStandardCost > 0
                    ? ((previousStandardCost * currentStock) + (receiptPrice * receiptQty)) / (currentStock + receiptQty)
                    : receiptPrice;

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

    const lines = [];

    if (movement.type === 'PURCHASE' || movement.goodsReceiptId) {
        const invAccount = productVariant.product.inventoryAccountId || resolveAccountCode(productType, 'inventory');
        lines.push(
            { accountId: (await getAccountId(invAccount, db)), debit: totalAmount, credit: 0, description: `GR: ${productVariant.name}` },
            { accountId: (await getAccountId(resolveAccountCode(productType, 'trade-payable'), db)), debit: 0, credit: totalAmount, description: `Trade Payable: ${productVariant.name}` }
        );
    }

    else if (movement.type === 'OUT' && movement.salesOrderId) {
        const invAccount = productVariant.product.inventoryAccountId || resolveAccountCode(productType, 'inventory');
        const cogsAccount = productVariant.product.cogsAccountId || resolveAccountCode(productType, 'cogs');
        lines.push(
            { accountId: (await getAccountId(cogsAccount, db)), debit: totalAmount, credit: 0, description: `COGS: ${productVariant.name}` },
            { accountId: (await getAccountId(invAccount, db)), debit: 0, credit: totalAmount, description: `Shipment: ${productVariant.name}` }
        );
    }

    else if (movement.type === 'OUT' && !movement.salesOrderId) {
        const creditAccount = productVariant.product.inventoryAccountId || resolveAccountCode(productType, 'inventory');
        const wipAccount = productVariant.product.wipAccountId || resolveAccountCode(productType, 'wip');
        lines.push(
            { accountId: (await getAccountId(wipAccount, db)), debit: totalAmount, credit: 0, description: `Production Issue: ${productVariant.name}` },
            { accountId: (await getAccountId(creditAccount, db)), debit: 0, credit: totalAmount, description: `Material Consumed` }
        );
    }

    else if (movement.type === 'IN' && !movement.goodsReceiptId) {
        const debitAccount = productVariant.product.inventoryAccountId || resolveAccountCode(productType, 'inventory');
        const wipAccount = productVariant.product.wipAccountId || resolveAccountCode(productType, 'wip');
        lines.push(
            { accountId: (await getAccountId(debitAccount, db)), debit: totalAmount, credit: 0, description: `Production Output: ${productVariant.name}` },
            { accountId: (await getAccountId(wipAccount, db)), debit: 0, credit: totalAmount, description: `WIP Relief` }
        );
    }

    else if (movement.type === 'ADJUSTMENT') {
        const invAccount = productVariant.product.inventoryAccountId || resolveAccountCode(productType, 'inventory');
        const absAmt = Math.abs(totalAmount);

        // If toLocationId is present, stock went IN (Gain). If it's null, stock went OUT (Loss).
        if (movement.toLocationId !== null) {
            lines.push(
                { accountId: (await getAccountId(invAccount, db)), debit: absAmt, credit: 0, description: `Stock Adj (In)` },
                { accountId: (await getAccountId(resolveAccountCode(productType, 'adjustment-gain'), db)), debit: 0, credit: absAmt, description: `Adj Gain` }
            );
        } else {
            lines.push(
                { accountId: (await getAccountId(resolveAccountCode(productType, 'adjustment-loss'), db)), debit: absAmt, credit: 0, description: `Adj Loss` },
                { accountId: (await getAccountId(invAccount, db)), debit: 0, credit: absAmt, description: `Stock Adj (Out)` }
            );
        }
    }

    if (lines.length > 0) {
        // Validate GL balance won't go negative for credit entries (OUT/ADJUSTMENT only).
        // SKIP for PURCHASE: credit goes to Trade Payables (liability) — credit increases
        // the balance, so this validation does not apply to liability/equity accounts.
        if (movement.type !== 'PURCHASE') {
            for (const line of lines) {
                if (line.credit > 0) {
                    await validateGlBalance(db, line.accountId, line.credit, productVariant.name);
                }
            }
        }

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

interface CacheEntry {
    id: string;
    timestamp: number;
}

const ACCOUNT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_SIZE = 200;
const accountCache = new Map<string, CacheEntry>();

async function getAccountId(code: string, db: Prisma.TransactionClient): Promise<string> {
    // If code is already a UUID (e.g. from Product account mappings), return it directly
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(code)) {
        return code;
    }

    const cached = accountCache.get(code);
    if (cached && Date.now() - cached.timestamp < ACCOUNT_CACHE_TTL_MS) {
        return cached.id;
    }

    const acc = await db.account.findUnique({ where: { code } });
    if (!acc) throw new NotFoundError('Account', code);

    // Evict oldest if at capacity
    if (accountCache.size >= MAX_CACHE_SIZE) {
        const oldestKey = accountCache.keys().next().value;
        if (oldestKey) accountCache.delete(oldestKey);
    }

    accountCache.set(code, { id: acc.id, timestamp: Date.now() });
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
    const overheadAccount = await getAccountId(resolveAccountCode(null, 'manufacturing-overhead'), db); // Manufacturing Overhead
    const payableAccount = await getAccountId(resolveAccountCode(null, 'accrued-liabilities'), db); // Accrued Liabilities (AP / Accruals)
    const rawMaterialExpense = await getAccountId(resolveAccountCode(null, 'cogs'), db); // COGS / RM Consumed
    const invAccount = await getAccountId(resolveAccountCode('RAW_MATERIAL', 'inventory'), db); // RM Inventory

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
        // Validate GL balance won't go negative for credit entries
        for (const line of lines) {
            if (line.credit > 0) {
                await validateGlBalance(db, line.accountId, line.credit, `Maklon WO#${order.orderNumber}`);
            }
        }

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
