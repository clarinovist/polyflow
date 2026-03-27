'use server';

import { withTenant } from "@/lib/core/tenant";
import { auth } from '@/auth';
import { prisma } from '@/lib/core/prisma';
import { Role } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { logger } from '@/lib/config/logger';
import { safeAction, BusinessRuleError, AuthorizationError } from '@/lib/errors/errors';

export type ResourceKey = string;

async function checkAdmin() {
    const session = await auth();
    if (!session?.user || session.user.role !== 'ADMIN') {
        throw new AuthorizationError('Unauthorized: Admin access required');
    }
    return session;
}

export const getRolePermissions = withTenant(
async function getRolePermissions(targetRole: Role) {
    return safeAction(async () => {
        try {
            await checkAdmin();
            const permissions = await prisma.rolePermission.findMany({
                where: { role: targetRole },
            });
            return permissions;
        } catch (error) {
            if (error instanceof AuthorizationError) throw error;
            logger.error('Failed to fetch permissions', { error, targetRole, module: 'PermissionActions' });
            throw new BusinessRuleError('Failed to fetch permissions');
        }
    });
}
);

export const updatePermission = withTenant(
async function updatePermission(targetRole: Role, resource: string, canAccess: boolean) {
    return safeAction(async () => {
        try {
            await checkAdmin();

            await prisma.rolePermission.upsert({
                where: {
                    role_resource: {
                        role: targetRole,
                        resource: resource,
                    },
                },
                update: { canAccess },
                create: {
                    role: targetRole,
                    resource,
                    canAccess,
                },
            });

            revalidatePath('/dashboard/settings');
            revalidatePath('/dashboard');
            return null;
        } catch (error) {
            if (error instanceof AuthorizationError) throw error;
            logger.error('Failed to update permission', { error, targetRole, resource, module: 'PermissionActions' });
            throw new BusinessRuleError('Failed to update permission');
        }
    });
}
);

async function seedDefaultPermissionsInternal(targetRole: Role, defaultResources: string[]) {
    if (defaultResources.length === 0) return;

    const existingPermissions = await prisma.rolePermission.findMany({
        where: {
            role: targetRole,
            resource: {
                in: defaultResources,
            },
        },
        select: {
            resource: true,
        },
    });

    const existingResourcesSet = new Set(existingPermissions.map((p: { resource: string }) => p.resource));

    const missingResources = defaultResources.filter(r => !existingResourcesSet.has(r));

    if (missingResources.length > 0) {
        await prisma.rolePermission.createMany({
            data: missingResources.map(resource => ({
                role: targetRole,
                resource,
                canAccess: true,
            })),
            skipDuplicates: true,
        });
    }
}

export const seedDefaultPermissions = withTenant(
async function seedDefaultPermissions(targetRole: Role, defaultResources: string[]) {
    return safeAction(async () => {
        try {
            const session = await auth();
            if (session?.user?.role !== 'ADMIN') throw new AuthorizationError('Unauthorized');

            await seedDefaultPermissionsInternal(targetRole, defaultResources);
            return null;
        } catch (error) {
            if (error instanceof AuthorizationError) throw error;
            logger.error('Failed to seed permissions', { error, targetRole, module: 'PermissionActions' });
            throw new BusinessRuleError('Failed to seed');
        }
    });
}
);

const DEFAULT_PERMISSIONS: Record<Role, string[]> = {
    ADMIN: [],
    WAREHOUSE: [
        '/warehouse',
        '/kiosk',
    ],
    PRODUCTION: [
        '/dashboard',
        '/production/orders',
        '/production/analytics',
        '/dashboard/boms',
        '/dashboard/machines',
        '/dashboard/employees',
        '/dashboard/products',
        '/kiosk',
        '/warehouse',
        '/production',
        '/production/machines',
        '/production/dispatch',
        '/production/inventory',
        '/production/resources',
        '/production/history',
    ],
    PLANNING: [
        '/dashboard',
        '/production/orders',
        '/dashboard/boms',
        '/planning',
        '/warehouse/inventory',
        '/warehouse/analytics',
        '/warehouse/inventory/aging',
        '/dashboard/products',
        '/planning/purchase-orders',
        '/planning/mrp',
        '/planning/schedule',
        '/production',
    ],
    SALES: [
        '/dashboard',
        '/sales',
        '/sales/quotations',
        '/sales/invoices',
        '/sales/analytics',
        '/dashboard/products',
        '/sales/customers',
        '/warehouse/inventory',
    ],
    FINANCE: [
        '/dashboard',
        '/finance',
        '/finance/costing',
        '/finance/reports',
        '/finance/journals',
        '/finance/coa',
        '/finance/periods',
        '/finance/assets',
        '/finance/budget',
        '/sales/invoices',
        '/finance/invoices',
    ],
    PROCUREMENT: [
        '/dashboard',
        '/planning/purchase-orders',
        '/finance/invoices',
        '/planning/procurement-analytics',
        '/planning/suppliers',
        '/dashboard/products',
        '/warehouse/inventory',
    ],
};

export const getMyPermissions = withTenant(
async function getMyPermissions() {
    return safeAction(async () => {
        const session = await auth();
        if (!session?.user) return [];

        if (session.user.role === 'ADMIN') {
            return 'ALL';
        }

        const count = await prisma.rolePermission.count({
            where: { role: session.user.role }
        });

        if (count === 0) {
            const defaults = DEFAULT_PERMISSIONS[session.user.role];
            if (defaults && defaults.length > 0) {
                await seedDefaultPermissionsInternal(session.user.role, defaults);
            }
        }

        const permissions = await prisma.rolePermission.findMany({
            where: {
                role: session.user.role,
                canAccess: true
            },
            select: { resource: true }
        });

        return permissions.map((p: { resource: string }) => p.resource);
    });
}
);

export const canViewPrices = withTenant(
async function canViewPrices() {
    return safeAction(async () => {
        const session = await auth();
        if (!session?.user) return false;

        if (session.user.role === 'ADMIN') return true;

        const permission = await prisma.rolePermission.findUnique({
            where: {
                role_resource: {
                    role: session.user.role,
                    resource: 'feature:view-prices',
                },
            },
        });

        return !!permission?.canAccess;
    });
}
);
