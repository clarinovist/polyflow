import { prisma } from '@/lib/prisma';
import { Prisma, StockMovement, JournalStatus } from '@prisma/client';
import { createJournalEntry } from './journals-service';
import { updateStandardCost } from '@/actions/cost-history';

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

    const date = movement.createdAt || new Date();
    // Priority: Standard Cost > Buy Price > Sell Price (Fallback)
    const currentCost = Number(productVariant.standardCost || productVariant.buyPrice || productVariant.price || 0);
    let cost = currentCost;

    // If this is a Goods Receipt, try to get the price from the Purchase Order and update Standard Cost
    if (movement.goodsReceiptId) {
        const gr = await db.goodsReceipt.findUnique({
            where: { id: movement.goodsReceiptId },
            include: { purchaseOrder: { include: { items: { where: { productVariantId: movement.productVariantId } } } } }
        });
        const poItem = gr?.purchaseOrder?.items[0];
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
        // Check if a Purchase Invoice (BILL) already journaled this purchase directly
        // If BILL came first (no GR at that time), it debited inventory directly.
        // In that case, skip the GR accrual journal to avoid double-counting.
        let billAlreadyExists = false;
        if (movement.goodsReceiptId) {
            const gr = await db.goodsReceipt.findUnique({
                where: { id: movement.goodsReceiptId },
                select: { purchaseOrderId: true }
            });
            if (gr?.purchaseOrderId) {
                const existingBill = await db.purchaseInvoice.findFirst({
                    where: { purchaseOrderId: gr.purchaseOrderId }
                });
                if (existingBill) {
                    // Check if the BILL's journal debited inventory directly (no GR at the time)
                    const billJournal = await db.journalEntry.findFirst({
                        where: { referenceId: existingBill.id, status: 'POSTED' },
                        include: { lines: true }
                    });
                    const acc11310 = await db.account.findUnique({ where: { code: '11310' } });
                    if (billJournal && acc11310) {
                        const directDebit = billJournal.lines.some(
                            l => l.accountId === acc11310.id && Number(l.debit) > 0
                        );
                        if (directDebit) billAlreadyExists = true;
                    }
                }
            }
        }

        if (!billAlreadyExists) {
            const invAccount = productVariant.product.inventoryAccountId || getInventoryAccount(productType);
            lines.push(
                { accountId: (await getAccountId(invAccount)), debit: totalAmount, credit: 0, description: `GR: ${productVariant.name}` },
                { accountId: (await getAccountId('21120')), debit: 0, credit: totalAmount, description: `Accrued Payable: ${productVariant.name}` }
            );
        }
        // If billAlreadyExists, skip journal — inventory was already recognized when BILL was created
    }

    else if (movement.type === 'OUT' && movement.salesOrderId) {
        const invAccount = productVariant.product.inventoryAccountId || getInventoryAccount(productType);
        const cogsAccount = productVariant.product.cogsAccountId || '50000';
        lines.push(
            { accountId: (await getAccountId(cogsAccount)), debit: totalAmount, credit: 0, description: `COGS: ${productVariant.name}` },
            { accountId: (await getAccountId(invAccount)), debit: 0, credit: totalAmount, description: `Shipment: ${productVariant.name}` }
        );
    }

    else if (movement.type === 'OUT' && !movement.salesOrderId) {
        const creditAccount = productVariant.product.inventoryAccountId || getInventoryAccount(productType);
        const wipAccount = productVariant.product.wipAccountId || '11320';
        lines.push(
            { accountId: (await getAccountId(wipAccount)), debit: totalAmount, credit: 0, description: `Production Issue: ${productVariant.name}` },
            { accountId: (await getAccountId(creditAccount)), debit: 0, credit: totalAmount, description: `Material Consumed` }
        );
    }

    else if (movement.type === 'IN' && !movement.goodsReceiptId) {
        const debitAccount = productVariant.product.inventoryAccountId || getInventoryAccount(productType);
        const wipAccount = productVariant.product.wipAccountId || '11320';
        lines.push(
            { accountId: (await getAccountId(debitAccount)), debit: totalAmount, credit: 0, description: `Production Output: ${productVariant.name}` },
            { accountId: (await getAccountId(wipAccount)), debit: 0, credit: totalAmount, description: `WIP Relief` }
        );
    }

    else if (movement.type === 'ADJUSTMENT') {
        const invAccount = getInventoryAccount(productType);
        const absAmt = Math.abs(totalAmount);

        if (Number(movement.quantity) > 0) {
            lines.push(
                { accountId: (await getAccountId(invAccount)), debit: absAmt, credit: 0, description: `Stock Adj (In)` },
                { accountId: (await getAccountId('81100')), debit: 0, credit: absAmt, description: `Adj Gain` }
            );
        } else {
            lines.push(
                { accountId: (await getAccountId('91100')), debit: absAmt, credit: 0, description: `Adj Loss` },
                { accountId: (await getAccountId(invAccount)), debit: 0, credit: absAmt, description: `Stock Adj (Out)` }
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

async function getAccountId(code: string): Promise<string> {
    if (accountCache.has(code)) return accountCache.get(code)!;

    const acc = await prisma.account.findUnique({ where: { code } });
    if (!acc) throw new Error(`GL Account code ${code} not found during auto-journal.`);

    accountCache.set(code, acc.id);
    return acc.id;
}
