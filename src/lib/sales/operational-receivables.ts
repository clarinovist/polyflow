import type { Prisma } from '@prisma/client';

const HISTORICAL_AR_ORDER_PREFIXES = ['SO-OPEN-', 'OB-AR-'] as const;
const HISTORICAL_AR_NOTE_PREFIXES = [
    'Opening Balance Entry',
    'Sheet Penjualan Jun:',
] as const;

export type OperationalSalesReceivableOrderInput = {
    orderNumber?: string | null;
    notes?: string | null;
};

export function isOperationalSalesReceivableOrder(
    order: OperationalSalesReceivableOrderInput | null | undefined,
): boolean {
    if (!order) return false;

    const orderNumber = order.orderNumber ?? '';
    const notes = order.notes ?? '';

    return (
        !HISTORICAL_AR_ORDER_PREFIXES.some((prefix) =>
            orderNumber.startsWith(prefix),
        ) &&
        !HISTORICAL_AR_NOTE_PREFIXES.some((prefix) =>
            notes.startsWith(prefix),
        )
    );
}

export function buildOperationalSalesReceivableOrderWhere(): Prisma.SalesOrderWhereInput {
    return {
        customerId: { not: null },
        AND: [
            ...HISTORICAL_AR_ORDER_PREFIXES.map((prefix) => ({
                NOT: { orderNumber: { startsWith: prefix } },
            })),
            // SQL three-valued logic makes NOT (NULL LIKE 'prefix%') unknown,
            // which Prisma/PostgreSQL then filters out. Keep normal orders with
            // no notes while excluding only matching import markers.
            ...HISTORICAL_AR_NOTE_PREFIXES.map((prefix) => ({
                OR: [
                    { notes: null },
                    { NOT: { notes: { startsWith: prefix } } },
                ],
            })),
        ],
    };
}
