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

// Function to seed default permissions if they don't exist
// Useful for ensuring a role starts with some access
export async function seedDefaultPermissions(targetRole: Role, defaultResources: string[]) {
    try {
        // We only check auth if called from client, but this might be called internally too.
        // For safety, let's assume this is an admin action if called from UI.
        const session = await auth();
        if (session?.user?.role !== 'ADMIN') return { success: false, error: 'Unauthorized' };

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
        '/dashboard',
        '/dashboard/inventory',
        '/dashboard/inventory/transfer',
        '/dashboard/inventory/adjustment',
        '/dashboard/inventory/opname',
        '/dashboard/inventory/history',
        '/dashboard/products',
    ],
    PRODUCTION: [
        '/dashboard',
        '/dashboard/production/orders',
        '/dashboard/production/boms',
        '/dashboard/production/resources/machines',
        '/dashboard/production/resources/employees',
        '/dashboard/products',
    ],
    PPIC: [
        '/dashboard',
        '/dashboard/production/orders',
        '/dashboard/production/boms',
        '/dashboard/inventory',
        '/dashboard/products',
    ],
    SALES: [
        '/dashboard',
        '/dashboard/products',
        '/dashboard/inventory',
    ]
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
            await seedDefaultPermissions(session.user.role, defaults);
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
