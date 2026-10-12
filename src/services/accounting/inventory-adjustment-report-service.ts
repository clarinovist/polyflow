import { prisma } from '@/lib/core/prisma';
import { toBusinessDateString, wibRangeBounds } from '@/lib/utils/timezone';
import type { Prisma } from '@prisma/client';

const ADJUSTMENT_ACCOUNT_CODES = new Set([
    '7-103',
    '81100',
    '8-203',
    '91100',
]);

export type InventoryAdjustmentDirection = 'GAIN' | 'LOSS';

export interface InventoryAdjustmentReportEvent {
    journalId: string;
    journalNumber: string;
    movementId: string;
    direction: InventoryAdjustmentDirection;
    effectiveDate: string;
    recordedAt: string;
    productVariantId: string;
    productName: string;
    variantName: string;
    unit: string;
    locationName: string;
    quantity: number;
    amount: number;
    unitCost: number | null;
    costBasis: 'SNAPSHOT' | 'INFERRED';
    sourceType: 'STOCK_OPNAME' | 'STOCK_ADJUSTMENT';
    sourceId: string | null;
    sourceLabel: string;
    reason: string;
    actorName: string | null;
    systemQuantity: number | null;
    countedQuantity: number | null;
}

export interface InventoryAdjustmentReportDetails {
    accountId: string;
    accountCode: string;
    accountName: string;
    direction: InventoryAdjustmentDirection;
    eventCount: number;
    totalAmount: number;
    events: InventoryAdjustmentReportEvent[];
}

function emptyResult(
    accountId: string,
    direction: InventoryAdjustmentDirection,
): InventoryAdjustmentReportDetails {
    return {
        accountId,
        accountCode: '',
        accountName: '',
        direction,
        eventCount: 0,
        totalAmount: 0,
        events: [],
    };
}

export async function getInventoryAdjustmentReportDetails(
    accountId: string,
    startDate: Date,
    endDate: Date,
    tx?: Prisma.TransactionClient,
): Promise<InventoryAdjustmentReportDetails> {
    const db = tx ?? prisma;
    const account = await db.account.findUnique({
        where: { id: accountId },
        select: {
            id: true,
            code: true,
            name: true,
            type: true,
        },
    });

    const direction: InventoryAdjustmentDirection =
        account?.type === 'EXPENSE' ? 'LOSS' : 'GAIN';

    if (!account || !ADJUSTMENT_ACCOUNT_CODES.has(account.code)) {
        return emptyResult(accountId, direction);
    }

    const entryDate = wibRangeBounds(startDate, endDate);
    const journals = await db.journalEntry.findMany({
        where: {
            status: 'POSTED',
            referenceType: 'STOCK_ADJUSTMENT',
            referenceId: { not: null },
            entryDate,
            lines: { some: { accountId } },
        },
        orderBy: [{ entryDate: 'desc' }, { createdAt: 'desc' }],
        select: {
            id: true,
            entryNumber: true,
            entryDate: true,
            createdAt: true,
            reference: true,
            referenceId: true,
            createdBy: { select: { name: true } },
            lines: {
                where: { accountId },
                select: { debit: true, credit: true },
            },
        },
    });

    const movementIds = journals.flatMap((journal) =>
        journal.referenceId ? [journal.referenceId] : [],
    );
    const movements = await db.stockMovement.findMany({
        where: { id: { in: movementIds } },
        select: {
            id: true,
            quantity: true,
            cost: true,
            reference: true,
            createdAt: true,
            productVariantId: true,
            fromLocation: { select: { name: true } },
            toLocation: { select: { name: true } },
            createdBy: { select: { name: true } },
            productVariant: {
                select: {
                    name: true,
                    primaryUnit: true,
                    product: { select: { name: true } },
                },
            },
        },
    });
    const movementById = new Map(
        movements.map((movement) => [movement.id, movement] as const),
    );

    const opnameNumbers = [
        ...new Set(
            movements.flatMap((movement) =>
                movement.reference?.startsWith('OPN-')
                    ? [movement.reference]
                    : [],
            ),
        ),
    ];
    const opnames =
        opnameNumbers.length === 0
            ? []
            : await db.stockOpname.findMany({
                  where: { opnameNumber: { in: opnameNumbers } },
                  select: {
                      id: true,
                      opnameNumber: true,
                      items: {
                          select: {
                              productVariantId: true,
                              systemQuantity: true,
                              countedQuantity: true,
                          },
                      },
                  },
              });
    const opnameByNumber = new Map(
        opnames.flatMap((opname) =>
            opname.opnameNumber ? [[opname.opnameNumber, opname] as const] : [],
        ),
    );

    const events = journals.flatMap<InventoryAdjustmentReportEvent>(
        (journal) => {
            const movement = journal.referenceId
                ? movementById.get(journal.referenceId)
                : null;
            const line = journal.lines[0];
            if (!movement || !line) return [];

            const amount = Math.abs(
                direction === 'GAIN'
                    ? Number(line.credit) - Number(line.debit)
                    : Number(line.debit) - Number(line.credit),
            );
            const quantity = Number(movement.quantity);
            const opname = movement.reference
                ? opnameByNumber.get(movement.reference)
                : null;
            const opnameItem = opname?.items.find(
                (item) =>
                    item.productVariantId === movement.productVariantId,
            );

            return [
                {
                    journalId: journal.id,
                    journalNumber: journal.entryNumber,
                    movementId: movement.id,
                    direction,
                    effectiveDate: toBusinessDateString(journal.entryDate),
                    recordedAt: journal.createdAt.toISOString(),
                    productVariantId: movement.productVariantId,
                    productName: movement.productVariant.product.name,
                    variantName: movement.productVariant.name,
                    unit: movement.productVariant.primaryUnit,
                    locationName:
                        movement.toLocation?.name ??
                        movement.fromLocation?.name ??
                        '-',
                    quantity,
                    amount,
                    unitCost:
                        movement.cost == null
                            ? quantity > 0
                                ? amount / quantity
                                : null
                            : Number(movement.cost),
                    costBasis: movement.cost == null ? 'INFERRED' : 'SNAPSHOT',
                    sourceType: opname ? 'STOCK_OPNAME' : 'STOCK_ADJUSTMENT',
                    sourceId: opname?.id ?? null,
                    sourceLabel:
                        opname?.opnameNumber ??
                        movement.reference ??
                        'Penyesuaian stok',
                    reason:
                        movement.reference ??
                        journal.reference ??
                        'Penyesuaian stok',
                    actorName:
                        movement.createdBy?.name ??
                        journal.createdBy?.name ??
                        null,
                    systemQuantity:
                        opnameItem == null
                            ? null
                            : Number(opnameItem.systemQuantity),
                    countedQuantity:
                        opnameItem?.countedQuantity == null
                            ? null
                            : Number(opnameItem.countedQuantity),
                },
            ];
        },
    );

    return {
        accountId: account.id,
        accountCode: account.code,
        accountName: account.name,
        direction,
        eventCount: events.length,
        totalAmount: events.reduce((sum, event) => sum + event.amount, 0),
        events,
    };
}
