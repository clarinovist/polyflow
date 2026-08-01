import { prisma } from '@/lib/core/prisma';
import { logActivity } from '@/lib/tools/audit';

type AssignCustomerInput = {
    customerId: string;
    userId: string;
    isPrimary?: boolean;
    assignedById: string;
    notes?: string;
};

type UnassignCustomerInput = {
    customerId: string;
    userId: string;
};

/**
 * Assigns a customer to a sales rep. Creates a new assignment record.
 * If isPrimary, closes any existing primary assignment for that customer first.
 */
export async function assignCustomerToSales(input: AssignCustomerInput) {
    const { customerId, userId, isPrimary = true, assignedById, notes } = input;

    return prisma.$transaction(async (tx) => {
        // Close existing active primary assignment for this customer
        if (isPrimary) {
            const existingPrimary = await tx.customerSalesAssignment.findFirst({
                where: {
                    customerId,
                    isPrimary: true,
                    unassignedAt: null,
                },
            });

            if (existingPrimary) {
                await tx.customerSalesAssignment.update({
                    where: { id: existingPrimary.id },
                    data: { unassignedAt: new Date() },
                });

                await logActivity({
                    userId: assignedById,
                    action: 'CUSTOMER_REASSIGNED',
                    entityType: 'Customer',
                    entityId: customerId,
                    details: `Customer unassigned dari ${existingPrimary.userId} oleh ${assignedById}`,
                });
            }
        }

        // Check for duplicate active assignment
        const existingAssignment = await tx.customerSalesAssignment.findFirst({
            where: {
                customerId,
                userId,
                unassignedAt: null,
            },
        });

        if (existingAssignment) {
            return existingAssignment; // already assigned
        }

        const assignment = await tx.customerSalesAssignment.create({
            data: {
                customerId,
                userId,
                isPrimary,
                assignedById,
                notes,
            },
        });

        await logActivity({
            userId: assignedById,
            action: 'CUSTOMER_ASSIGNED',
            entityType: 'Customer',
            entityId: customerId,
            details: `Customer di-assign ke ${userId} (primary: ${isPrimary})`,
        });

        return assignment;
    });
}

/**
 * Unassigns a customer from a sales rep.
 */
export async function unassignCustomerFromSales(input: UnassignCustomerInput) {
    const { customerId, userId } = input;

    return prisma.$transaction(async (tx) => {
        const assignment = await tx.customerSalesAssignment.findFirst({
            where: {
                customerId,
                userId,
                unassignedAt: null,
            },
        });

        if (!assignment) return null;

        const updated = await tx.customerSalesAssignment.update({
            where: { id: assignment.id },
            data: { unassignedAt: new Date() },
        });

        await logActivity({
            userId: 'system',
            action: 'CUSTOMER_UNASSIGNED',
            entityType: 'Customer',
            entityId: customerId,
            details: `Customer unassigned dari ${userId}`,
        });

        return updated;
    });
}

/**
 * Auto-assigns a prospect customer to the sales rep who created it.
 */
export async function autoAssignProspectToSales(
    customerId: string,
    salesUserId: string,
) {
    return assignCustomerToSales({
        customerId,
        userId: salesUserId,
        isPrimary: true,
        assignedById: salesUserId,
        notes: 'Auto-assignment dari first visit prospect',
    });
}

/**
 * Gets all active assignments for a customer.
 */
export async function getCustomerAssignments(customerId: string) {
    return prisma.customerSalesAssignment.findMany({
        where: {
            customerId,
            unassignedAt: null,
        },
        include: {
            user: { select: { id: true, name: true } },
            assignedBy: { select: { id: true, name: true } },
        },
        orderBy: { assignedAt: 'desc' },
    });
}

/**
 * Bulk unassigns all active customers from a user (e.g. on deactivation).
 * Single logActivity call instead of per-customer.
 */
export async function unassignAllCustomersFromUser(
    userId: string,
    unassignedById: string,
) {
    const now = new Date();
    const result = await prisma.customerSalesAssignment.updateMany({
        where: {
            userId,
            unassignedAt: null,
        },
        data: {
            unassignedAt: now,
        },
    });

    if (result.count > 0) {
        await logActivity({
            userId: unassignedById,
            action: 'CUSTOMER_UNASSIGNED',
            entityType: 'Customer',
            entityId: userId,
            details: `${result.count} customer(s) unassigned dari ${userId} (bulk: user dinonaktifkan)`,
        });
    }

    return result.count;
}

/**
 * Gets all customers assigned to a sales rep.
 */
export async function getAssignedCustomers(userId: string) {
    return prisma.customerSalesAssignment.findMany({
        where: {
            userId,
            unassignedAt: null,
        },
        include: {
            customer: true,
        },
        orderBy: { assignedAt: 'desc' },
    });
}
