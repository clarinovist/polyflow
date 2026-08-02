import { prisma } from '@/lib/core/prisma';
import { startOfMonth, endOfMonth } from 'date-fns';
import {
    type FieldSalesActorScope,
    scopedCustomerWhere,
    scopedSalesOrderWhere,
} from './field-scope';

// ── Types ───────────────────────────────────────────────────────

export type DormantCustomer = {
    customerId: string;
    customerName: string;
    lastOrderDate: Date | null;
    lastVisitDate: Date | null;
    isAlsoNotVisited: boolean;
    orderCount: number;
};

export type NewCustomer = {
    customerId: string;
    customerName: string;
    createdAt: Date;
};

export type LostCustomer = {
    customerId: string;
    customerName: string;
    lastOrderDate: Date | null;
    previousOrderCount: number;
};

export type CustomerActivitySummary = {
    dormantCount: number;
    newCount: number;
    lostCount: number;
    totalCustomersInScope: number;
};

export type CustomerActivityReportData = {
    startDate: Date;
    endDate: Date;
    dormantThresholdDays: number;
    summary: CustomerActivitySummary;
    dormantCustomers: DormantCustomer[];
    newCustomers: NewCustomer[];
    lostCustomers: LostCustomer[];
};

// ── Main ────────────────────────────────────────────────────────

export async function getCustomerActivityReport(
    scope: FieldSalesActorScope,
    rawStartDate?: Date,
    rawEndDate?: Date,
    dormantThresholdDays: number = 60,
): Promise<CustomerActivityReportData> {
    const now = new Date();
    const startDate = rawStartDate ?? startOfMonth(now);
    const endDate = rawEndDate ?? endOfMonth(now);

    const periodLengthMs = endDate.getTime() - startDate.getTime();
    const previousStart = new Date(startDate.getTime() - periodLengthMs);
    const previousEnd = new Date(startDate.getTime() - 1);

    const customerScope = scopedCustomerWhere(scope);
    const soScope = scopedSalesOrderWhere(scope);

    // 1. Fetch all active customers in scope
    const customers = await prisma.customer.findMany({
        where: { ...customerScope, isActive: true },
        select: {
            id: true,
            name: true,
            createdAt: true,
        },
    });

    // 2. Fetch all non-CANCELLED SOs for current period + previous period
    const allRelevantOrders = await prisma.salesOrder.findMany({
        where: {
            ...soScope,
            status: { not: 'CANCELLED' },
            customerId: { not: null },
            OR: [
                {
                    orderDate: { gte: startDate, lte: endDate },
                },
                {
                    orderDate: { gte: previousStart, lte: previousEnd },
                },
            ],
        },
        select: {
            customerId: true,
            orderDate: true,
        },
    });

    // 3. Build per-customer aggregates
    type CustomerOrderInfo = {
        currentOrders: { orderDate: Date }[];
        previousOrders: { orderDate: Date }[];
        maxCurrentOrderDate: Date | null;
        maxPreviousOrderDate: Date | null;
    };

    const orderInfoByCustomer = new Map<string, CustomerOrderInfo>();

    for (const order of allRelevantOrders) {
        const cid = order.customerId;
        if (!cid) continue;

        let info = orderInfoByCustomer.get(cid);
        if (!info) {
            info = {
                currentOrders: [],
                previousOrders: [],
                maxCurrentOrderDate: null,
                maxPreviousOrderDate: null,
            };
            orderInfoByCustomer.set(cid, info);
        }

        const orderDate = order.orderDate ?? new Date();

        if (orderDate >= startDate && orderDate <= endDate) {
            info.currentOrders.push({ orderDate });
            if (
                !info.maxCurrentOrderDate ||
                orderDate > info.maxCurrentOrderDate
            ) {
                info.maxCurrentOrderDate = orderDate;
            }
        } else if (orderDate >= previousStart && orderDate <= previousEnd) {
            info.previousOrders.push({ orderDate });
            if (
                !info.maxPreviousOrderDate ||
                orderDate > info.maxPreviousOrderDate
            ) {
                info.maxPreviousOrderDate = orderDate;
            }
        }
    }

    // 3b. True last-order date per customer, ALL-TIME (not windowed to
    //     current/previous period) — dormant is defined relative to `now`,
    //     independent of the report's date range. A customer whose only
    //     order predates `previousStart` would otherwise be invisible to
    //     `allRelevantOrders` and get misclassified as "never ordered"
    //     (lastOrderDate: null) instead of showing their real last order.
    const lastOrderRows = await prisma.salesOrder.groupBy({
        by: ['customerId'],
        where: {
            ...soScope,
            status: { not: 'CANCELLED' },
            customerId: { not: null },
        },
        _max: { orderDate: true },
    });
    const trueLastOrderDateByCustomer = new Map<string, Date>();
    for (const row of lastOrderRows) {
        if (row.customerId && row._max.orderDate) {
            trueLastOrderDateByCustomer.set(row.customerId, row._max.orderDate);
        }
    }

    // 4. Fetch last visit date for customers with current orders (for dormant check)
    //    Only fetch for customers that are dormant candidates
    const dormantCandidateIds = customers
        .filter((c) => {
            const lastOrderDate = trueLastOrderDateByCustomer.get(c.id);
            if (!lastOrderDate) return true; // never ordered = dormant candidate
            const daysSince =
                (now.getTime() - lastOrderDate.getTime()) /
                (1000 * 60 * 60 * 24);
            return daysSince > dormantThresholdDays;
        })
        .map((c) => c.id);

    const visitMap = new Map<string, Date | null>();

    if (dormantCandidateIds.length > 0) {
        // Get max checkInTime per customerId from SalesVisit
        const visitRows = await prisma.salesVisit.findMany({
            where: {
                customerId: { in: dormantCandidateIds },
            },
            select: {
                customerId: true,
                checkInTime: true,
            },
            orderBy: { checkInTime: 'desc' },
        });

        // First occurrence per customer is the latest (due to orderBy desc)
        for (const v of visitRows) {
            if (!visitMap.has(v.customerId)) {
                visitMap.set(v.customerId, v.checkInTime);
            }
        }
    }

    // 5. Classify customers
    const dormantCustomers: DormantCustomer[] = [];
    const newCustomers: NewCustomer[] = [];
    const lostCustomers: LostCustomer[] = [];

    for (const customer of customers) {
        const info = orderInfoByCustomer.get(customer.id);
        const hasCurrentOrder = info && info.currentOrders.length > 0;
        const hasPreviousOrder = info && info.previousOrders.length > 0;

        // ── Dormant: no order within threshold days, based on the TRUE
        // last order date (all-time), not just current/previous period ──
        const trueLastOrderDate = trueLastOrderDateByCustomer.get(customer.id);
        let isDormant: boolean;
        if (!trueLastOrderDate) {
            // Never ordered at all → dormant
            isDormant = true;
        } else {
            const daysSince =
                (now.getTime() - trueLastOrderDate.getTime()) /
                (1000 * 60 * 60 * 24);
            isDormant = daysSince > dormantThresholdDays;
        }

        if (isDormant) {
            const lastVisitDate = visitMap.get(customer.id) ?? null;
            const lastOrderDate = trueLastOrderDate ?? null;

            let isAlsoNotVisited = true;
            if (lastVisitDate) {
                const daysSinceVisit =
                    (now.getTime() - lastVisitDate.getTime()) /
                    (1000 * 60 * 60 * 24);
                isAlsoNotVisited = daysSinceVisit > dormantThresholdDays;
            }

            dormantCustomers.push({
                customerId: customer.id,
                customerName: customer.name,
                lastOrderDate,
                lastVisitDate,
                isAlsoNotVisited,
                orderCount:
                    (info?.currentOrders.length ?? 0) +
                    (info?.previousOrders.length ?? 0),
            });
        }

        // ── New customer: createdAt in range ──
        if (customer.createdAt >= startDate && customer.createdAt <= endDate) {
            newCustomers.push({
                customerId: customer.id,
                customerName: customer.name,
                createdAt: customer.createdAt,
            });
        }

        // ── Lost customer: had orders in previous period, none in current ──
        if (hasPreviousOrder && !hasCurrentOrder) {
            lostCustomers.push({
                customerId: customer.id,
                customerName: customer.name,
                lastOrderDate: info?.maxPreviousOrderDate ?? null,
                previousOrderCount: info?.previousOrders.length ?? 0,
            });
        }
    }

    // Sort dormant by isAlsoNotVisited first (true = priority), then by lastOrderDate asc
    dormantCustomers.sort((a, b) => {
        if (a.isAlsoNotVisited !== b.isAlsoNotVisited) {
            return a.isAlsoNotVisited ? -1 : 1;
        }
        if (a.lastOrderDate && b.lastOrderDate) {
            return a.lastOrderDate.getTime() - b.lastOrderDate.getTime();
        }
        if (a.lastOrderDate) return 1;
        if (b.lastOrderDate) return -1;
        return 0;
    });

    // Sort lost by previousOrderCount desc
    lostCustomers.sort((a, b) => b.previousOrderCount - a.previousOrderCount);

    return {
        startDate,
        endDate,
        dormantThresholdDays,
        summary: {
            dormantCount: dormantCustomers.length,
            newCount: newCustomers.length,
            lostCount: lostCustomers.length,
            totalCustomersInScope: customers.length,
        },
        dormantCustomers,
        newCustomers,
        lostCustomers,
    };
}
