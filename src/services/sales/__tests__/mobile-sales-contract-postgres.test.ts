import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { verifyReturnTestDatabase } from '@/services/finance/__tests__/return-credit-postgres-fixture';
import {
    fieldSalesReceivableWhere,
    routeStorageDateForBusinessDate,
} from '../mobile-field-sales-service';
import { createMarketingTaskCandidateWheres } from '../mobile-marketing-service';

const { database } = (() => ({
    database: {
        client: null as import('@prisma/client').PrismaClient | null,
    },
}))();

if (process.env.RETURN_CREDIT_TEST_DATABASE_URL) {
    const { returnTestClient } = await import(
        '@/services/finance/__tests__/return-credit-postgres-fixture'
    );
    database.client = returnTestClient(
        process.env.RETURN_CREDIT_TEST_DATABASE_URL,
    );
}
const db = database.client;
const date = new Date('2026-10-11T00:00:00.000Z');

function order(index: number) {
    return `marketing-high-${String(index).padStart(2, '0')}`;
}

describe.skipIf(!db)('mobile sales contracts on disposable PostgreSQL', () => {
    beforeEach(async () => {
        await verifyReturnTestDatabase(db!);
        await db!.$executeRawUnsafe(
            'TRUNCATE "Invoice", "SalesRoutePlanItem", "SalesRoutePlan", "CustomerSalesAssignment", "SalesVisit", "SalesOrder", "Customer", "User" CASCADE',
        );
        await db!.user.createMany({
            data: [
                {
                    id: 'field-owner',
                    email: 'field-owner@example.invalid',
                    password: 'fixture-not-an-account',
                    role: 'SALES',
                },
                {
                    id: 'field-other',
                    email: 'field-other@example.invalid',
                    password: 'fixture-not-an-account',
                    role: 'SALES',
                },
                {
                    id: 'marketing-sales',
                    email: 'marketing-sales@example.invalid',
                    password: 'fixture-not-an-account',
                    role: 'SALES',
                },
            ],
        });
        await db!.customer.createMany({
            data: [
                { id: 'owned-customer', name: 'Owned customer' },
                { id: 'other-customer', name: 'Other customer' },
                { id: 'marketing-customer', name: 'Marketing customer' },
            ],
        });
        await db!.customerSalesAssignment.create({
            data: {
                id: 'owned-assignment',
                customerId: 'owned-customer',
                userId: 'field-owner',
                assignedById: 'field-owner',
            },
        });
    });

    afterAll(async () => {
        await db?.$disconnect();
    });

    it('resolves a DATE route by the exact UTC date-only storage key', async () => {
        await db!.salesRoutePlan.create({
            data: {
                id: 'route-contract',
                date,
                userId: 'field-owner',
                createdBy: 'field-owner',
            },
        });
        const route = await db!.salesRoutePlan.findUnique({
            where: {
                date_userId: {
                    date: routeStorageDateForBusinessDate('2026-10-11'),
                    userId: 'field-owner',
                },
            },
        });
        expect(route?.id).toBe('route-contract');
        expect(route?.date.toISOString()).toBe('2026-10-11T00:00:00.000Z');
    });

    it('applies owned operational positive AR relation before deterministic top-N', async () => {
        await db!.salesOrder.createMany({
            data: [
                {
                    id: 'owned-created',
                    orderNumber: 'SO-OWNED-CREATED',
                    customerId: 'other-customer',
                    createdById: 'field-owner',
                },
                {
                    id: 'owned-assigned',
                    orderNumber: 'SO-OWNED-ASSIGNED',
                    customerId: 'owned-customer',
                    createdById: 'field-other',
                },
                {
                    id: 'historical',
                    orderNumber: 'SO-OPEN-HISTORICAL',
                    customerId: 'owned-customer',
                },
                {
                    id: 'null-customer',
                    orderNumber: 'SO-NULL-CUSTOMER',
                    createdById: 'field-owner',
                },
                {
                    id: 'other-rep',
                    orderNumber: 'SO-OTHER-REP',
                    customerId: 'other-customer',
                    createdById: 'field-other',
                },
                {
                    id: 'zero-order',
                    orderNumber: 'SO-ZERO',
                    customerId: 'owned-customer',
                },
            ],
        });
        await db!.invoice.createMany({
            data: [
                {
                    id: 'ar-owned-1',
                    invoiceNumber: 'INV-OWNED-1',
                    salesOrderId: 'owned-created',
                    totalAmount: 500,
                    dueDate: date,
                },
                {
                    id: 'ar-owned-2',
                    invoiceNumber: 'INV-OWNED-2',
                    salesOrderId: 'owned-assigned',
                    totalAmount: 400,
                    dueDate: date,
                },
                {
                    id: 'ar-historical',
                    invoiceNumber: 'INV-HISTORICAL',
                    salesOrderId: 'historical',
                    totalAmount: 900,
                    dueDate: date,
                },
                {
                    id: 'ar-null-customer',
                    invoiceNumber: 'INV-NULL-CUSTOMER',
                    salesOrderId: 'null-customer',
                    totalAmount: 800,
                    dueDate: date,
                },
                {
                    id: 'ar-other-rep',
                    invoiceNumber: 'INV-OTHER-REP',
                    salesOrderId: 'other-rep',
                    totalAmount: 700,
                    dueDate: date,
                },
                {
                    id: 'ar-zero',
                    invoiceNumber: 'INV-ZERO',
                    salesOrderId: 'zero-order',
                    totalAmount: 0,
                    dueDate: date,
                },
            ],
        });
        const where = fieldSalesReceivableWhere({
            actorUserId: 'field-owner',
            isGlobalViewer: false,
        });
        const [count, rows] = await Promise.all([
            db!.invoice.count({ where }),
            db!.invoice.findMany({
                where,
                orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
                take: 1,
                select: { id: true },
            }),
        ]);
        expect(count).toBe(2);
        expect(rows.map((row) => row.id)).toEqual(['ar-owned-1']);
    });

    it('keeps urgent marketing candidate ahead of more than ten commercial candidates', async () => {
        await db!.salesOrder.createMany({
            data: [
                ...Array.from({ length: 11 }, (_, index) => ({
                    id: order(index + 1),
                    orderNumber: `Q-HIGH-${index + 1}`,
                    customerId: 'marketing-customer',
                    salesRepId: 'marketing-sales',
                    status: 'QUOTATION' as const,
                    commercialReviewStatus: 'PENDING' as const,
                    nextFollowUpDate: new Date(
                        `2026-09-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
                    ),
                })),
                {
                    id: 'marketing-urgent',
                    orderNumber: 'Q-URGENT',
                    customerId: 'marketing-customer',
                    salesRepId: 'marketing-sales',
                    status: 'QUOTATION' as const,
                    commercialReviewStatus: 'NOT_REQUIRED' as const,
                    nextFollowUpDate: new Date('2026-10-01T00:00:00.000Z'),
                },
            ],
        });
        const wheres = createMarketingTaskCandidateWheres({
            teamIds: ['marketing-sales'],
            now: new Date('2026-10-07T03:00:00.000Z'),
            startOfDay: new Date('2026-10-06T17:00:00.000Z'),
            endOfDay: new Date('2026-10-07T16:59:59.999Z'),
        });
        const [
            validityCount,
            validity,
            followUpCount,
            followUps,
            commercialCount,
            commercial,
        ] = await Promise.all([
            db!.salesOrder.count({ where: wheres.urgentValidityWhere }),
            db!.salesOrder.findMany({
                where: wheres.urgentValidityWhere,
                orderBy: [{ validUntil: 'asc' }, { id: 'asc' }],
                take: 10,
                select: { id: true },
            }),
            db!.salesOrder.count({ where: wheres.urgentFollowUpWhere }),
            db!.salesOrder.findMany({
                where: wheres.urgentFollowUpWhere,
                orderBy: [{ nextFollowUpDate: 'asc' }, { id: 'asc' }],
                take: 10,
                select: { id: true },
            }),
            db!.salesOrder.count({
                where: wheres.commercialPipelineWhere,
            }),
            db!.salesOrder.findMany({
                where: wheres.commercialFollowUpWhere,
                orderBy: [{ nextFollowUpDate: 'asc' }, { id: 'asc' }],
                take: 10,
                select: { id: true },
            }),
        ]);
        const winners = [
            ...validity.map((row) => ({ ...row, rank: 0 })),
            ...followUps.map((row) => ({ ...row, rank: 0 })),
            ...commercial.map((row) => ({ ...row, rank: 1 })),
        ]
            .sort((a, b) => a.rank - b.rank || a.id.localeCompare(b.id))
            .slice(0, 10);
        expect(validityCount + followUpCount + commercialCount).toBe(12);
        expect(winners).toHaveLength(10);
        expect(winners[0].id).toBe('marketing-urgent');
    });
});
