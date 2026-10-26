import { prisma } from '@/lib/core/prisma';
import { Prisma, StockMovement, JournalStatus } from '@prisma/client';
import { createJournalEntry } from './journals-service';
import { updateStandardCostInternal } from '@/actions/finance/cost-history';
import { NotFoundError, BusinessRuleError } from '@/lib/errors/errors';
import { resolveAccountCode } from './account-mapping-policy';
import { allocateProductionWip } from './production-wip-provenance';

type StockMovementWithProduct = Prisma.StockMovementGetPayload<{
    include: { productVariant: { include: { product: true } } };
}>;

/**
 * Narrow persisted-Decimal conversion: real Prisma.Decimal values and plain
 * strings pass through without Number() interning. Numbers are accepted only
 * for non-persisted in-memory quantities; anything else fails closed because
 * its canonical string form is unknown.
 */
function toPersistedDecimal(
    value: Prisma.Decimal | string | number,
    field: string,
    details?: Record<string, unknown>,
): Prisma.Decimal {
    if (value instanceof Prisma.Decimal) return value;
    if (typeof value === 'string') {
        try {
            return new Prisma.Decimal(value);
        } catch {
            throw new BusinessRuleError(
                `Nilai ${field} tidak valid untuk valuasi penerimaan.`,
                details,
                'RECEIPT_VALUATION_INVALID_AMOUNT',
            );
        }
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
        return new Prisma.Decimal(value);
    }
    throw new BusinessRuleError(
        `Nilai ${field} tidak valid untuk valuasi penerimaan.`,
        details,
        'RECEIPT_VALUATION_INVALID_AMOUNT',
    );
}

function receiptCostFor(
    cost: Prisma.Decimal | string | number,
    movement: { id: string; goodsReceiptId: string | null },
): Prisma.Decimal {
    return toPersistedDecimal(cost, 'movement.cost', {
        movementId: movement.id,
        goodsReceiptId: movement.goodsReceiptId,
    });
}

/**
 * Check GL account balance won't go negative after posting.
 * For ASSET accounts: balance = debit - credit. A credit posting reduces balance.
 * For LIABILITY/EQUITY/REVENUE accounts: normal balance is credit — skip the guard.
 * Throws if posting would make an asset balance negative.
 */
async function validateGlBalance(
    db: Prisma.TransactionClient,
    accountId: string,
    creditAmount: number,
    productName: string,
) {
    if (creditAmount <= 0) return;

    const account = await db.account.findUnique({
        where: { id: accountId },
        select: { code: true, name: true, type: true },
    });

    if (!account) return;

    // Only validate for ASSET accounts (debit-normal).
    // LIABILITY, EQUITY, REVENUE have credit-normal balance — large credits are expected.
    if (account.type !== 'ASSET') return;

    const result = await db.journalLine.aggregate({
        where: {
            accountId,
            journalEntry: { status: 'POSTED' },
        },
        _sum: { debit: true, credit: true },
    });

    const totalDebit = Number(result._sum.debit || 0);
    const totalCredit = Number(result._sum.credit || 0);
    const currentBalance = totalDebit - totalCredit;

    if (currentBalance < creditAmount) {
        throw new BusinessRuleError(
            `Saldo akun GL akan minus!\n` +
                `Akun: ${account.code} - ${account.name}\n` +
                `Saldo saat ini: Rp ${currentBalance.toLocaleString('id-ID')}\n` +
                `Akan di-credit: Rp ${creditAmount.toLocaleString('id-ID')}\n` +
                `Produk: ${productName}\n` +
                `Tip: Pastikan stok sudah di-receipt/adjustment ke akun yang benar sebelum konsumsi.`,
        );
    }
}

export async function recordInventoryMovement(
    movement: StockMovement & {
        productVariant?: StockMovementWithProduct['productVariant'];
    },
    tx?: Prisma.TransactionClient,
    options?: { journalTotal?: number; productionOutput?: boolean },
): Promise<void> {
    if ((movement.goodsReceiptId || options?.productionOutput) && !tx) {
        return prisma.$transaction((innerTx) =>
            recordInventoryMovement(movement, innerTx, options),
        );
    }

    const db = tx || prisma;
    if (options?.productionOutput) {
        if (!movement.productionOrderId || movement.type !== 'IN' || movement.reversalOfId || movement.goodsReceiptId) {
            throw new BusinessRuleError('Identitas hasil produksi tidak valid.');
        }
        await db.$queryRaw`SELECT id FROM "ProductionOrder" WHERE id = ${movement.productionOrderId} FOR UPDATE`;
    }

    // Serialize receipt posting by its persisted movement. A plain find-first
    // idempotency check races when two workers replay the same movement before
    // either has created its journal.
    if (movement.goodsReceiptId || options?.productionOutput) {
        await db.$queryRaw`SELECT id FROM "StockMovement" WHERE id = ${movement.id} FOR UPDATE`;
    }
    if (options?.productionOutput) {
        const persisted = await db.stockMovement.findUnique({ where: { id: movement.id } });
        if (!persisted || persisted.productionOrderId !== movement.productionOrderId ||
            persisted.productVariantId !== movement.productVariantId || persisted.type !== 'IN' ||
            persisted.reversalOfId || persisted.goodsReceiptId || persisted.salesOrderId) {
            throw new BusinessRuleError('Transaksi hasil produksi tersimpan tidak sesuai sumber.');
        }
        movement = persisted;
    }

    // A movement is the accounting idempotency key. This guard must precede
    // product lookup, WAC/CostHistory changes, and journal amount fallback so a
    // replay cannot mutate valuation or regenerate a different rounded amount.
    const existingMovementJournal = await db.journalEntry.findFirst({
        where: {
            referenceType:
                movement.type === 'PURCHASE'
                    ? 'GOODS_RECEIPT'
                    : movement.type === 'ADJUSTMENT'
                      ? 'STOCK_ADJUSTMENT'
                      : 'MANUAL_ENTRY',
            referenceId: movement.id,
        },
        select: { id: true },
    });
    if (existingMovementJournal) return;

    // Internal consumption is posted atomically by its source service. Never
    // reconstruct a missing/removed journal as a production WIP issue.
    if (
        movement.type === 'OUT' &&
        !movement.salesOrderId &&
        !movement.productionOrderId
    ) {
        const usage = await db.internalUsage.findUnique({
            where: { movementId: movement.id },
            select: { id: true },
        });
        if (usage)
            throw new BusinessRuleError(
                'Jurnal pemakaian internal tidak tersedia. Minta Finance menelusuri bukti sumber; jangan posting ulang sebagai bahan produksi.',
            );
    }

    const productVariant =
        movement.productVariant ??
        (await db.productVariant.findUnique({
            where: { id: movement.productVariantId },
            include: { product: true },
        }));

    if (!productVariant) return;

    // Branded production uses SKU-level inventory valuation, not an unrelated
    // fallback price on the newly created brand's master record. Persist it so
    // returns/reversals use the original shipment cost.
    if (
        movement.type === 'OUT' &&
        movement.salesOrderId &&
        movement.cost == null
    ) {
        const branded = await db.productVariant.findUnique({
            where: { id: movement.productVariantId },
            select: {
                packagedOutputOption: { select: { id: true } },
                outputGroups: { take: 1, select: { id: true } },
            },
        });
        if (branded?.packagedOutputOption || branded?.outputGroups?.length) {
            const stock = movement.fromLocationId
                ? await db.inventory.findUnique({
                      where: {
                          locationId_productVariantId: {
                              locationId: movement.fromLocationId,
                              productVariantId: movement.productVariantId,
                          },
                      },
                      select: { averageCost: true },
                  })
                : null;
            if (stock?.averageCost == null)
                throw new BusinessRuleError(
                    'Biaya stok merek belum tersedia. Pengiriman dibatalkan.',
                );
            await db.stockMovement.update({
                where: { id: movement.id },
                data: { cost: stock.averageCost },
            });
            movement = { ...movement, cost: stock.averageCost };
        }
    }

    // Check if this movement is related to a Maklon transaction
    let isMaklon = false;
    let goodsReceipt = null;

    if (movement.goodsReceiptId) {
        goodsReceipt = await db.goodsReceipt.findUnique({
            where: { id: movement.goodsReceiptId },
            include: {
                purchaseOrder: {
                    include: {
                        items: true,
                    },
                },
                items: true,
            },
        });
        if (goodsReceipt?.isMaklon) isMaklon = true;
    } else if (movement.productionOrderId) {
        const po = await db.productionOrder.findUnique({
            where: { id: movement.productionOrderId },
            select: { isMaklon: true, actualPackagingEnabled: true, bom: { select: { productVariantId: true } } },
        });
        if (options?.productionOutput && (!po || po.actualPackagingEnabled ||
            po.bom.productVariantId !== movement.productVariantId)) {
            throw new BusinessRuleError('Sumber hasil utama produksi tidak sesuai WO.');
        }
        if (po?.isMaklon) isMaklon = true;
    } else if (movement.salesOrderId) {
        const so = await db.salesOrder.findUnique({
            where: { id: movement.salesOrderId },
            select: { orderType: true },
        });
        if (so?.orderType === 'MAKLON_JASA') isMaklon = true;
    }

    // Actual packaging carries verified ownership on each persisted movement.
    // An order-level maklon flag cannot suppress company-owned packaging costs.
    if (
        movement.companyOwned === false ||
        (isMaklon && movement.companyOwned !== true)
    ) {
        return;
    }

    const date = movement.createdAt || new Date();
    // Priority: Persisted movement cost -> Standard Cost -> Buy Price -> Sell Price
    const currentCost = Number(
        movement.cost ??
            productVariant.standardCost ??
            productVariant.buyPrice ??
            productVariant.price ??
            0,
    );
    let cost = currentCost;

    // If this is a Goods Receipt, use the persisted receipt movement cost as the
    // single source of truth. Never re-read current PO unitPrice: a later PO price
    // change must not revalue an already persisted GR. Movements may legitimately
    // share one SKU across several GR rows (partial receipts, repeated PO items),
    // and walk-in receipts carry no PO at all — so attribution here must not
    // demand one GR item per variant. Only a missing persisted cost, or a GR row
    // whose own PO lineage cannot be resolved, fails closed.
    if (movement.goodsReceiptId && goodsReceipt) {
        if (movement.cost == null) {
            throw new BusinessRuleError(
                'Biaya movement penerimaan tidak tersedia. Rekonsiliasi manual diperlukan.',
                {
                    movementId: movement.id,
                    goodsReceiptId: movement.goodsReceiptId,
                },
                'RECEIPT_COST_MISSING',
            );
        }

        const goodsReceiptItems = goodsReceipt.items ?? [];
        if (goodsReceipt.purchaseOrderId) {
            const unattributed = goodsReceiptItems.filter(
                (item) => !item.purchaseOrderItemId,
            );
            const unknownPoItem = goodsReceiptItems.filter(
                (item) =>
                    item.purchaseOrderItemId &&
                    !(goodsReceipt.purchaseOrder?.items ?? []).some(
                        (poItem) => poItem.id === item.purchaseOrderItemId,
                    ),
            );
            if (unattributed.length > 0 || unknownPoItem.length > 0) {
                throw new BusinessRuleError(
                    'Atribusi item PO penerimaan ambigu. Rekonsiliasi manual diperlukan.',
                    {
                        movementId: movement.id,
                        goodsReceiptId: movement.goodsReceiptId,
                        unattributed: unattributed.length,
                        unknownPoItem: unknownPoItem.length,
                    },
                    'RECEIPT_ATTRIBUTION_AMBIGUOUS',
                );
            }
        }

        const receiptCost = toPersistedDecimal(movement.cost, 'movement.cost', {
            movementId: movement.id,
            goodsReceiptId: movement.goodsReceiptId,
        });
        cost = receiptCost.toNumber();

        // AUTO-UPDATE Standard Cost (Weighted Average)
        // 1. Get current stock across all locations
        const inventorySum = await db.inventory.aggregate({
            where: { productVariantId: movement.productVariantId },
            _sum: { quantity: true },
        });
        // Stock arithmetic stays Decimal: inventory aggregate, receipt qty and
        // existing standard cost enter as persisted Decimals/strings, and only
        // the final legacy number-API argument converts.
        const currentStockAfterReceiptDec = inventorySum._sum.quantity
            ? toPersistedDecimal(
                  inventorySum._sum.quantity,
                  'inventory.quantity',
                  {
                      movementId: movement.id,
                      goodsReceiptId: movement.goodsReceiptId,
                  },
              )
            : new Prisma.Decimal(0);
        const receiptQtyDec = toPersistedDecimal(
            movement.quantity,
            'movement.quantity',
            {
                movementId: movement.id,
                goodsReceiptId: movement.goodsReceiptId,
            },
        );
        const currentStockDec = Prisma.Decimal.max(
            new Prisma.Decimal(0),
            currentStockAfterReceiptDec.minus(receiptQtyDec),
        );

        // 2. Calculate New Weighted Average
        // Use the variant's EXISTING standardCost (before this update), NOT the receipt price.
        // Using receiptPrice here would make the formula collapse to: newAvg = receiptPrice (always).
        const previousStandardCostDec =
            productVariant.standardCost == null
                ? new Prisma.Decimal(0)
                : toPersistedDecimal(
                      productVariant.standardCost,
                      'productVariant.standardCost',
                      {
                          movementId: movement.id,
                          goodsReceiptId: movement.goodsReceiptId,
                      },
                  );
        const totalQtyDec = currentStockDec.plus(receiptQtyDec);
        if (totalQtyDec.gt(0)) {
            const newWeightedAvg =
                currentStockDec.gt(0) && previousStandardCostDec.gt(0)
                    ? previousStandardCostDec
                          .mul(currentStockDec)
                          .plus(receiptCost.mul(receiptQtyDec))
                          .div(totalQtyDec)
                          .toDecimalPlaces(4)
                          .toNumber()
                    : receiptCost.toDecimalPlaces(4).toNumber();

            // 3. Update Standard Cost & Log History
            await updateStandardCostInternal(
                movement.productVariantId,
                newWeightedAvg,
                'PURCHASE_GR',
                movement.goodsReceiptId ?? undefined,
                db as Prisma.TransactionClient, // Use current transaction if available
            );
        }
    }

    const totalAmount =
        options?.journalTotal ??
        (options?.productionOutput && movement.cost != null
            ? new Prisma.Decimal(movement.quantity).mul(movement.cost).toDecimalPlaces(2).toNumber()
            : movement.goodsReceiptId && goodsReceipt && movement.cost != null
            ? toPersistedDecimal(movement.quantity, 'movement.quantity', {
                  movementId: movement.id,
                  goodsReceiptId: movement.goodsReceiptId,
              })
                  .mul(receiptCostFor(movement.cost, movement))
                  .toDecimalPlaces(2)
                  .toNumber()
            : Number(movement.quantity) * cost);

    if (totalAmount === 0) return;

    const productType = productVariant.product.productType;

    const lines = [];

    if (movement.type === 'PURCHASE' || movement.goodsReceiptId) {
        const invAccount =
            productVariant.product.inventoryAccountId ||
            (await resolveAccountCode(productType, 'inventory')).code;
        lines.push(
            {
                accountId: await getAccountId(invAccount, db),
                debit: totalAmount,
                credit: 0,
                description: `GR: ${productVariant.name}`,
            },
            {
                // GR/IR clearing — bukan AP langsung. Invoice yang membalik
                // accrual ini saat difakturkan (lihat handlePurchaseInvoiceCreated).
                accountId: await getAccountId(
                    (await resolveAccountCode(productType, 'gr-clearing')).code,
                    db,
                ),
                debit: 0,
                credit: totalAmount,
                description: `GR/IR: ${productVariant.name}`,
            },
        );
    } else if (movement.type === 'OUT' && movement.salesOrderId) {
        const invAccount =
            productVariant.product.inventoryAccountId ||
            (await resolveAccountCode(productType, 'inventory')).code;
        const cogsAccount =
            productVariant.product.cogsAccountId ||
            (await resolveAccountCode(productType, 'cogs')).code;
        lines.push(
            {
                accountId: await getAccountId(cogsAccount, db),
                debit: totalAmount,
                credit: 0,
                description: `COGS: ${productVariant.name}`,
            },
            {
                accountId: await getAccountId(invAccount, db),
                debit: 0,
                credit: totalAmount,
                description: `Shipment: ${productVariant.name}`,
            },
        );
    } else if (movement.type === 'OUT' && !movement.salesOrderId) {
        const creditAccount =
            productVariant.product.inventoryAccountId ||
            (await resolveAccountCode(productType, 'inventory')).code;
        // Company-supplied packaging on a toll order is a service cost, not
        // ownership of the customer's finished goods.
        const wipAccount =
            isMaklon && movement.companyOwned === true
                ? productVariant.product.cogsAccountId ||
                  (await resolveAccountCode(productType, 'cogs')).code
                : productVariant.product.wipAccountId ||
                  (await resolveAccountCode(productType, 'wip')).code;
        lines.push(
            {
                accountId: await getAccountId(wipAccount, db),
                debit: totalAmount,
                credit: 0,
                description: `Production Issue: ${productVariant.name}`,
            },
            {
                accountId: await getAccountId(creditAccount, db),
                debit: 0,
                credit: totalAmount,
                description: `Material Consumed`,
            },
        );
    } else if (movement.type === 'IN' && !movement.goodsReceiptId) {
        const debitAccount =
            productVariant.product.inventoryAccountId ||
            (await resolveAccountCode(productType, 'inventory')).code;
        if (options?.productionOutput && !isMaklon) {
            const amount = new Prisma.Decimal(totalAmount).toDecimalPlaces(2);
            const credits = await allocateProductionWip(db, movement, amount);
            lines.push({
                accountId: await getAccountId(debitAccount, db),
                debit: amount.toNumber(), credit: 0,
                description: `Production Output: ${productVariant.name}`,
            }, ...credits.map(line => ({
                accountId: line.accountId, debit: 0, credit: line.credit.toNumber(),
                description: 'WIP Relief: posted WO source',
            })));
        } else {
            const wipAccount = productVariant.product.wipAccountId ||
                (await resolveAccountCode(productType, 'wip')).code;
            lines.push(
                { accountId: await getAccountId(debitAccount, db), debit: totalAmount, credit: 0,
                    description: `Production Output: ${productVariant.name}` },
                { accountId: await getAccountId(wipAccount, db), debit: 0, credit: totalAmount,
                    description: 'WIP Relief' },
            );
        }
    } else if (movement.type === 'ADJUSTMENT') {
        const invAccount =
            productVariant.product.inventoryAccountId ||
            (await resolveAccountCode(productType, 'inventory')).code;
        const absAmt = Math.abs(totalAmount);

        // If toLocationId is present, stock went IN (Gain). If it's null, stock went OUT (Loss).
        if (movement.toLocationId !== null) {
            lines.push(
                {
                    accountId: await getAccountId(invAccount, db),
                    debit: absAmt,
                    credit: 0,
                    description: `Stock Adj (In)`,
                },
                {
                    accountId: await getAccountId(
                        (
                            await resolveAccountCode(
                                productType,
                                'adjustment-gain',
                            )
                        ).code,
                        db,
                    ),
                    debit: 0,
                    credit: absAmt,
                    description: `Adj Gain`,
                },
            );
        } else {
            lines.push(
                {
                    accountId: await getAccountId(
                        (
                            await resolveAccountCode(
                                productType,
                                'adjustment-loss',
                            )
                        ).code,
                        db,
                    ),
                    debit: absAmt,
                    credit: 0,
                    description: `Adj Loss`,
                },
                {
                    accountId: await getAccountId(invAccount, db),
                    debit: 0,
                    credit: absAmt,
                    description: `Stock Adj (Out)`,
                },
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
                    // Source-funded output may return WIP into inventory on the
                    // same account. Validate its net change, not a phantom outflow.
                    const credit = options?.productionOutput
                        ? Math.max(0, lines.filter(l => l.accountId === line.accountId)
                            .reduce((net, l) => net + l.credit - l.debit, 0))
                        : line.credit;
                    await validateGlBalance(
                        db,
                        line.accountId,
                        credit,
                        productVariant.name,
                    );
                }
            }
        }

        await createJournalEntry(
            {
                entryDate: date,
                description: `Auto: ${movement.type} - ${productVariant.name}`,
                reference: movement.reference || movement.id,
                referenceType:
                    movement.type === 'PURCHASE'
                        ? 'GOODS_RECEIPT'
                        : movement.type === 'ADJUSTMENT'
                          ? 'STOCK_ADJUSTMENT'
                          : 'MANUAL_ENTRY',
                referenceId: movement.id,
                isAutoGenerated: true,
                status: JournalStatus.POSTED,
                lines,
                createdById: movement.createdById ?? undefined,
            },
            tx,
        );
    }
}

async function getAccountId(
    code: string,
    db: Prisma.TransactionClient,
): Promise<string> {
    // If code is already a UUID (e.g. from Product account mappings), return it directly
    if (
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            code,
        )
    ) {
        return code;
    }

    // A code is not globally unique across tenant databases. Resolve on the
    // caller's transaction instead of reusing a process-global code -> UUID.
    const acc = await db.account.findUnique({ where: { code } });
    if (!acc) throw new NotFoundError('Account', code);
    return acc.id;
}

export async function recordMaklonCosts(
    productionOrderId: string,
    tx: Prisma.TransactionClient,
) {
    const db = tx || prisma;
    const order = await db.productionOrder.findUnique({
        where: { id: productionOrderId },
        include: { maklonCostItems: true },
    });

    if (
        !order ||
        !order.isMaklon ||
        !order.maklonCostItems ||
        order.maklonCostItems.length === 0
    )
        return;

    // Accounts
    const overheadAccount = await getAccountId(
        (await resolveAccountCode(null, 'manufacturing-overhead')).code,
        db,
    ); // Manufacturing Overhead
    const payableAccount = await getAccountId(
        (await resolveAccountCode(null, 'accrued-liabilities')).code,
        db,
    ); // Accrued Liabilities (AP / Accruals)
    const rawMaterialExpense = await getAccountId(
        (await resolveAccountCode(null, 'cogs')).code,
        db,
    ); // COGS / RM Consumed
    const invAccount = await getAccountId(
        (await resolveAccountCode('RAW_MATERIAL', 'inventory')).code,
        db,
    ); // RM Inventory

    const lines = [];
    for (const item of order.maklonCostItems) {
        const amount = Number(item.amount);
        if (amount <= 0) continue;

        // Group into logical Dr/Cr mappings
        if (item.costType === 'ADDITIVE' || item.costType === 'COLORANT') {
            lines.push(
                {
                    accountId: rawMaterialExpense,
                    debit: amount,
                    credit: 0,
                    description: `Maklon Mat Used: ${item.description || item.costType}`,
                },
                {
                    accountId: invAccount,
                    debit: 0,
                    credit: amount,
                    description: `Inventory Consumption (Maklon)`,
                },
            );
        } else {
            // LABOR, MACHINE, ELECTRICITY, OVERHEAD, OTHER
            lines.push(
                {
                    accountId: overheadAccount,
                    debit: amount,
                    credit: 0,
                    description: `Maklon Overhead: ${item.description || item.costType}`,
                },
                {
                    accountId: payableAccount,
                    debit: 0,
                    credit: amount,
                    description: `Accrued Expense (Maklon)`,
                },
            );
        }
    }

    if (lines.length > 0) {
        // Validate GL balance won't go negative for credit entries
        for (const line of lines) {
            if (line.credit > 0) {
                await validateGlBalance(
                    db,
                    line.accountId,
                    line.credit,
                    `Maklon WO#${order.orderNumber}`,
                );
            }
        }

        await createJournalEntry(
            {
                entryDate: order.actualEndDate || new Date(),
                description: `Maklon Costs for WO#${order.orderNumber}`,
                reference: order.orderNumber,
                referenceType: 'MANUAL_ENTRY',
                referenceId: order.id,
                isAutoGenerated: true,
                status: JournalStatus.POSTED,
                lines,
                createdById: order.createdById ?? undefined,
            },
            db as Prisma.TransactionClient,
        );
    }
}
