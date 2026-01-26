'use server';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { Role } from '@prisma/client';
import { revalidatePath } from 'next/cache';

// Using href as the unique resource identifier
// These must match sidebar-nav.tsx
export type ResourceKey = string;

// Helper to check ADMIN permission
async function checkAdmin() {
    const session = await auth();
    if (!session?.user || session.user.role !== 'ADMIN') {
        throw new Error('Unauthorized: Admin access required');
    }
    return session;
}

export async function getRolePermissions(targetRole: Role) {
    try {
        await checkAdmin();
        const permissions = await prisma.rolePermission.findMany({
            where: { role: targetRole },
        });
        return { success: true, data: permissions };
    } catch (error) {
        console.error('Failed to fetch permissions:', error);
        return { success: false, error: 'Failed to fetch permissions' };
    }
}

export async function updatePermission(targetRole: Role, resource: string, canAccess: boolean) {
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
        revalidatePath('/dashboard'); // May affect sidebar visibility
        return { success: true };
    } catch (error) {
        console.error('Failed to update permission:', error);
        return { success: false, error: 'Failed to update permission' };
    }
}

// Helper to seed without admin check (internal use only)
async function seedDefaultPermissionsInternal(targetRole: Role, defaultResources: string[]) {
    for (const resource of defaultResources) {
        const exists = await prisma.rolePermission.findUnique({
            where: {
                role_resource: {
                    role: targetRole,
                    resource: resource,
                },
            },
        });

        if (!exists) {
            await prisma.rolePermission.create({
                data: {
                    role: targetRole,
                    resource,
                    canAccess: true, // Default to accessible if we are seeding
                },
            });
        }
    }
}

// Public action to seed default permissions (only for ADMIN)
export async function seedDefaultPermissions(targetRole: Role, defaultResources: string[]) {
    try {
        const session = await auth();
        if (session?.user?.role !== 'ADMIN') return { success: false, error: 'Unauthorized' };

        await seedDefaultPermissionsInternal(targetRole, defaultResources);
        return { success: true };
    } catch (error) {
        console.error('Failed to seed permissions:', error);
        return { success: false, error: 'Failed to seed' };
    }
}

// Default permissions to seed if none exist
const DEFAULT_PERMISSIONS: Record<Role, string[]> = {
    ADMIN: [], // Admin has * everything * by checkAdmin logic, but we can seed if we want explicit.
    WAREHOUSE: [
        '/warehouse',
        '/kiosk', // Optional: if they need to check kiosk
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
    PPIC: [
        '/dashboard',
        '/production/orders',
        '/dashboard/boms',
        '/planning', // Was /dashboard/ppic
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
        '/warehouse/inventory', // View only usually
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
        '/warehouse/inventory', // Need to see stock levels to buy
    ],
};

// Client-side helper (but executed on server for initial load) to get user's own permissions
export async function getMyPermissions() {
    const session = await auth();
    if (!session?.user) return [];

    // Admins have access to everything by default
    if (session.user.role === 'ADMIN') {
        return 'ALL';
    }

    // Check if user has ANY permissions
    const count = await prisma.rolePermission.count({
        where: { role: session.user.role }
    });

    // If no permissions exist for this role at all, SEED them to avoid "Empty Sidebar" shock
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
}

// Check if current user can view prices
export async function canViewPrices() {
    const session = await auth();
    if (!session?.user) return false;

    if (session.user.role === 'ADMIN') return true;

    // Check for specific feature permission
    const permission = await prisma.rolePermission.findUnique({
        where: {
            role_resource: {
                role: session.user.role,
                resource: 'feature:view-prices',
            },
        },
    });

    return !!permission?.canAccess;
}
