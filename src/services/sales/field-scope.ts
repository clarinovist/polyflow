import { prisma } from '@/lib/core/prisma';
import { Prisma } from '@prisma/client';
import { hasAnyRole } from '@/lib/auth/roles';

export type FieldSalesActorScope = {
    actorUserId: string;
    isGlobalViewer: boolean;
};

/**
 * Determines whether the current actor can view all sales data (admin/sales_admin)
 * or only personal data (sales).
 */
export function getFieldSalesScope(session: {
    user: {
        id: string;
        role?: string | null;
        roles?: (string | null)[] | null;
    };
}): FieldSalesActorScope {
    // Normalize roles: filter null before passing to hasAnyRole (expects string[] not (string|null)[])
    const normalizedUser = {
        ...session.user,
        roles:
            session.user.roles?.filter((r): r is string => r != null) ?? null,
    };
    const isGlobalViewer = hasAnyRole(normalizedUser, ['ADMIN', 'SALES_ADMIN']);

    return {
        actorUserId: session.user.id,
        isGlobalViewer,
    };
}

/**
 * Customer scope: global viewers see all; sales see assigned + route today + created.
 */
export function scopedCustomerWhere(
    scope: FieldSalesActorScope,
): Prisma.CustomerWhereInput {
    if (scope.isGlobalViewer) return {};

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return {
        OR: [
            {
                salesAssignments: {
                    some: { userId: scope.actorUserId, unassignedAt: null },
                },
            },
            {
                routePlanItems: {
                    some: {
                        routePlan: {
                            userId: scope.actorUserId,
                            date: today,
                            status: { in: ['DRAFT', 'PUBLISHED'] },
                        },
                    },
                },
            },
            { salesOrders: { some: { createdById: scope.actorUserId } } },
            { salesVisits: { some: { userId: scope.actorUserId } } },
        ],
    };
}

/**
 * Route-plan-items scope: only the actor's routes.
 */
export function scopedRouteItemWhere(
    scope: FieldSalesActorScope,
): Prisma.SalesRoutePlanItemWhereInput {
    if (scope.isGlobalViewer) return {};

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return {
        routePlan: { userId: scope.actorUserId, date: today },
    };
}

/**
 * Sales order scope: global viewers see all; sales see assigned + created.
 */
export function scopedSalesOrderWhere(
    scope: FieldSalesActorScope,
): Prisma.SalesOrderWhereInput {
    if (scope.isGlobalViewer) return {};

    return {
        OR: [
            { createdById: scope.actorUserId },
            {
                customer: {
                    salesAssignments: {
                        some: { userId: scope.actorUserId, unassignedAt: null },
                    },
                },
            },
        ],
    };
}

/**
 * Invoice (receivable) scope: only invoices from scoped sales orders.
 */
export function scopedInvoiceWhere(
    scope: FieldSalesActorScope,
): Prisma.InvoiceWhereInput {
    if (scope.isGlobalViewer) {
        return {
            status: { in: ['UNPAID', 'PARTIAL', 'OVERDUE'] },
            salesOrder: { customerId: { not: null } },
        };
    }

    return {
        status: { in: ['UNPAID', 'PARTIAL', 'OVERDUE'] },
        salesOrder: {
            ...scopedSalesOrderWhere(scope),
            customerId: { not: null },
        },
    };
}

/**
 * Assert the actor can access a specific customer. Throws 404 if not.
 */
export async function assertCanAccessFieldCustomer(
    scope: FieldSalesActorScope,
    customerId: string,
): Promise<void> {
    if (scope.isGlobalViewer) return;

    const where = scopedCustomerWhere(scope);
    const count = await prisma.customer.count({
        where: { id: customerId, ...where },
    });

    if (count === 0) {
        const { NotFoundError } = await import('@/lib/errors/errors');
        throw new NotFoundError('Customer', customerId);
    }
}

/**
 * Assert the actor can access a specific order. Throws 404 if not.
 */
export async function assertCanAccessFieldOrder(
    scope: FieldSalesActorScope,
    orderId: string,
): Promise<void> {
    if (scope.isGlobalViewer) return;

    const where = scopedSalesOrderWhere(scope);
    const count = await prisma.salesOrder.count({
        where: { id: orderId, ...where },
    });

    if (count === 0) {
        const { NotFoundError } = await import('@/lib/errors/errors');
        throw new NotFoundError('Sales Order', orderId);
    }
}
