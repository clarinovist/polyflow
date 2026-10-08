import { Prisma, PrismaClient, DeliveryStatus } from '@prisma/client';
import {
    DELIVERY_WORKFLOW_GROUPS,
    type DeliveryListQuery,
} from '@/lib/sales/delivery-list';

export const DELIVERY_LIST_SELECT = {
    id: true,
    orderNumber: true,
    deliveryDate: true,
    status: true,
    salesOrderId: true,
    carrier: true,
    salesOrder: {
        select: {
            orderNumber: true,
            customer: { select: { id: true, name: true } },
        },
    },
    sourceLocation: { select: { id: true, name: true } },
} satisfies Prisma.DeliveryOrderSelect;
export function buildDeliveryListWhere(
    query: DeliveryListQuery,
    options: { includeStatus?: boolean } = {},
): Prisma.DeliveryOrderWhereInput {
    const conditions: Prisma.DeliveryOrderWhereInput[] = [
        {
            OR: [
                { deliveryDate: { gte: query.startDate, lte: query.endDate } },
                {
                    status: {
                        in: [DeliveryStatus.PENDING, DeliveryStatus.LOADING],
                    },
                },
            ],
        },
    ];
    if (query.search)
        conditions.push({
            OR: [
                {
                    orderNumber: {
                        contains: query.search,
                        mode: 'insensitive',
                    },
                },
                {
                    salesOrder: {
                        is: {
                            OR: [
                                {
                                    orderNumber: {
                                        contains: query.search,
                                        mode: 'insensitive',
                                    },
                                },
                                {
                                    customer: {
                                        is: {
                                            name: {
                                                contains: query.search,
                                                mode: 'insensitive',
                                            },
                                        },
                                    },
                                },
                            ],
                        },
                    },
                },
            ],
        });
    if (query.customerId)
        conditions.push({
            salesOrder: { is: { customerId: query.customerId } },
        });
    if (query.sourceLocationId)
        conditions.push({ sourceLocationId: query.sourceLocationId });
    if (options.includeStatus !== false) {
        if (query.workflowGroup)
            conditions.push({
                status: {
                    in: [...DELIVERY_WORKFLOW_GROUPS[query.workflowGroup]],
                },
            });
        else if (query.status) conditions.push({ status: query.status });
    }
    return { AND: conditions };
}
function orderBy(query: DeliveryListQuery) {
    const stable = { id: query.direction } as const;
    if (query.sort === 'deliveryDate')
        return [{ deliveryDate: query.direction }, stable];
    if (query.sort === 'orderNumber')
        return [{ orderNumber: query.direction }, stable];
    return [
        { status: 'asc' as const },
        { deliveryDate: 'desc' as const },
        { id: 'asc' as const },
    ];
}
export async function queryDeliveryOrdersPage(
    db: Pick<PrismaClient, '$transaction'>,
    query: DeliveryListQuery,
    onQuery?: (
        name: 'total' | 'items' | 'counts' | 'customers' | 'locations',
    ) => void,
) {
    const where = buildDeliveryListWhere(query),
        countWhere = buildDeliveryListWhere(query, { includeStatus: false });
    const result = await db.$transaction(async (tx) => {
        onQuery?.('total');
        const total = await tx.deliveryOrder.count({ where });
        const page = Math.min(
            query.page,
            Math.max(Math.ceil(total / query.pageSize), 1),
        );
        const [items, statusGroups, customers, locations] = await Promise.all([
            Promise.resolve(onQuery?.('items')).then(() =>
                tx.deliveryOrder.findMany({
                    where,
                    orderBy: orderBy(query),
                    skip: (page - 1) * query.pageSize,
                    take: query.pageSize,
                    select: DELIVERY_LIST_SELECT,
                }),
            ),
            Promise.resolve(onQuery?.('counts')).then(() =>
                tx.deliveryOrder.groupBy({
                    by: ['status'],
                    where: countWhere,
                    _count: { _all: true },
                }),
            ),
            Promise.resolve(onQuery?.('customers')).then(() =>
                tx.customer.findMany({
                    where: {
                        salesOrders: {
                            some: { deliveryOrders: { some: countWhere } },
                        },
                    },
                    select: { id: true, name: true },
                    orderBy: { name: 'asc' },
                    take: 200,
                }),
            ),
            Promise.resolve(onQuery?.('locations')).then(() =>
                tx.location.findMany({
                    where: { deliveryOrders: { some: countWhere } },
                    select: { id: true, name: true },
                    orderBy: { name: 'asc' },
                    take: 200,
                }),
            ),
        ]);
        return { total, page, items, statusGroups, customers, locations };
    });
    const statusCounts = Object.fromEntries(
        Object.values(DeliveryStatus).map((status) => [status, 0]),
    ) as Record<DeliveryStatus, number>;
    for (const group of result.statusGroups)
        statusCounts[group.status] = group._count._all;
    return {
        items: result.items,
        meta: {
            page: result.page,
            pageSize: query.pageSize,
            total: result.total,
            totalPages: Math.ceil(result.total / query.pageSize),
            sort: query.sort,
            direction: query.direction,
        },
        statusCounts,
        filterOptions: {
            customers: result.customers,
            locations: result.locations,
        },
        scope: { includesOpenDraftsOutsidePeriod: true as const },
    };
}
