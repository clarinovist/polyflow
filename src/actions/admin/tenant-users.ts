"use server";

import { prisma, getTenantDb } from "@/lib/core/prisma";
import { auth } from "@/auth";
import { AuthorizationError, BusinessRuleError } from "@/lib/errors/errors";
import { Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import { logActivity } from "@/lib/tools/audit";

async function requireSuperAdmin() {
    const session = await auth();
    if (!session?.user || !session.user.isSuperAdmin) {
        throw new AuthorizationError("Super Admin access required.");
    }
    return session;
}

async function loadTenantDb(tenantId: string) {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant || !tenant.dbUrl) {
        throw new BusinessRuleError("Tenant not found.");
    }
    return { tenant, db: getTenantDb(tenant.dbUrl) };
}

export interface TenantUserRow {
    id: string;
    name: string | null;
    email: string;
    role: string;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export async function listTenantUsers(tenantId: string): Promise<TenantUserRow[]> {
    await requireSuperAdmin();
    const { db } = await loadTenantDb(tenantId);
    const users = await db.user.findMany({
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true, updatedAt: true },
    });
    return users;
}

/**
 * Suspend or reactivate an individual tenant user (Fitur G).
 * Suspended users (isActive=false) are blocked from logging in by
 * authorize() in auth.ts ('UserInactive' branch).
 */
export async function setTenantUserStatus(
    tenantId: string,
    userId: string,
    isActive: boolean
) {
    const session = await requireSuperAdmin();
    const { tenant, db } = await loadTenantDb(tenantId);

    const target = await db.user.findUnique({ where: { id: userId } });
    if (!target) throw new BusinessRuleError("User tidak ditemukan di DB tenant.");

    await db.user.update({
        where: { id: userId },
        data: { isActive },
    });

    await logActivity({
        userId: session.user.id!,
        action: isActive ? "TENANT_USER_REACTIVATED" : "TENANT_USER_SUSPENDED",
        entityType: "User",
        entityId: userId,
        details: `${isActive ? "Reactivated" : "Suspended"} tenant user ${target.email} on tenant "${tenant.name}".`,
        changes: { tenantId, userId, before: { isActive: target.isActive }, after: { isActive } },
    });

    return { success: true as const };
}

/**
 * Create a new user in a tenant's DB (Fitur A).
 * Email must not already exist in that tenant DB.
 */
export async function createTenantUser(
    tenantId: string,
    data: { name: string; email: string; password: string; role: Role }
) {
    const session = await requireSuperAdmin();
    const { tenant, db } = await loadTenantDb(tenantId);

    const existing = await db.user.findUnique({ where: { email: data.email } });
    if (existing) throw new BusinessRuleError("Email sudah digunakan di tenant ini.");

    if (data.password.length < 6) throw new BusinessRuleError("Password minimal 6 karakter.");

    const passwordHash = await bcrypt.hash(data.password, 10);

    const user = await db.user.create({
        data: {
            name: data.name,
            email: data.email,
            password: passwordHash,
            role: data.role,
            isActive: true,
        },
    });

    await db.userRole.create({
        data: { userId: user.id, role: data.role },
    }).catch(() => {/* UserRole may not exist on all schemas; non-fatal */});

    await logActivity({
        userId: session.user.id!,
        action: "TENANT_USER_CREATED",
        entityType: "User",
        entityId: user.id,
        details: `Created user ${user.email} (role: ${data.role}) on tenant "${tenant.name}".`,
        changes: { tenantId, name: data.name, email: data.email, role: data.role },
    });

    return { success: true as const, userId: user.id };
}

/**
 * Update user role in a tenant DB.
 */
export async function updateTenantUserRole(
    tenantId: string,
    userId: string,
    role: Role
) {
    const session = await requireSuperAdmin();
    const { tenant, db } = await loadTenantDb(tenantId);

    const target = await db.user.findUnique({ where: { id: userId } });
    if (!target) throw new BusinessRuleError("User tidak ditemukan.");

    await db.user.update({
        where: { id: userId },
        data: { role },
    });
    // Upsert UserRole entry so userRole.findMany picks up the new role.
    await db.userRole.upsert({
        where: { userId_role: { userId, role: target.role } },
        create: { userId, role },
        update: {},
    }).catch(() => {/* non-fatal if UserRole table differs */});

    await logActivity({
        userId: session.user.id!,
        action: "TENANT_USER_ROLE_CHANGED",
        entityType: "User",
        entityId: userId,
        details: `Changed role of ${target.email} from ${target.role} to ${role} on tenant "${tenant.name}".`,
        changes: { tenantId, userId, before: target.role, after: role },
    });

    return { success: true as const };
}

/**
 * Delete a user from a tenant DB. Permanent.
 */
export async function deleteTenantUser(tenantId: string, userId: string) {
    const session = await requireSuperAdmin();
    const { tenant, db } = await loadTenantDb(tenantId);

    const target = await db.user.findUnique({ where: { id: userId } });
    if (!target) throw new BusinessRuleError("User tidak ditemukan.");

    await db.user.delete({ where: { id: userId } });

    await logActivity({
        userId: session.user.id!,
        action: "TENANT_USER_DELETED",
        entityType: "User",
        entityId: userId,
        details: `Deleted user ${target.email} from tenant "${tenant.name}".`,
        changes: { tenantId, userId, email: target.email },
    });

    return { success: true as const };
}
