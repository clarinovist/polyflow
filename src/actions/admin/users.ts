'use server';

import { withTenant } from '@/lib/core/tenant';
import { auth } from '@/auth';
import {
    prisma,
    getMainPrisma,
    getTenantDbFromContext,
    getTenantIdFromContext,
} from '@/lib/core/prisma';
import { Role, Prisma } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import * as bcrypt from 'bcryptjs';
import { invalidatePermissionsCache } from '@/lib/auth/permissions-cache';
import {
    safeAction,
    AuthorizationError,
    ConflictError,
    BusinessRuleError,
} from '@/lib/errors/errors';
import { logActivity } from '@/lib/tools/audit';
import { isTenantAdmin } from '@/lib/auth/roles';
import { unassignAllCustomersFromUser } from '@/services/sales/customer-assignment-service';
import { createTenantInvitationService } from '@/services/auth/tenant-invitation-service';
import { CentralIdentityService } from '@/services/auth/central-identity-service';
import { buildTenantOrigin } from '@/lib/auth/tenant-origin';
import { isCentralSsoConfigured } from '@/lib/auth/central-oidc-config';

// Schema for creating a user
const CreateUserSchema = z.object({
    name: z.string().min(2, 'Name must be at least 2 characters'),
    email: z.string().email('Invalid email address'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
    role: z.nativeEnum(Role),
});

export type CreateUserInput = z.infer<typeof CreateUserSchema>;

// Schema for updating a user
const UpdateUserSchema = z.object({
    id: z.string(),
    name: z.string().min(2, 'Name must be at least 2 characters').optional(),
    email: z.string().email('Invalid email address').optional(),
    password: z
        .string()
        .min(6, 'Password must be at least 6 characters')
        .optional()
        .or(z.literal('')),
    role: z.nativeEnum(Role).optional(),
});

export type UpdateUserInput = z.infer<typeof UpdateUserSchema>;

// Helper to check ADMIN permission
async function checkAdmin() {
    const session = await auth();
    if (!session?.user || !isTenantAdmin(session.user)) {
        throw new AuthorizationError('Unauthorized: Admin access required');
    }

    if (session.user.id) {
        const currentUser = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: { isActive: true },
        });
        if (!currentUser?.isActive) {
            throw new AuthorizationError(
                'Unauthorized: User account is inactive',
            );
        }
    }

    return session;
}

function getActorId(session: Awaited<ReturnType<typeof checkAdmin>>): string {
    const actorId = session.user?.id;
    if (!actorId) {
        throw new AuthorizationError('Unauthorized: Missing user id');
    }
    return actorId;
}

async function assertNotLastActiveAdmin(userId: string) {
    const activeAdminCount = await prisma.user.count({
        where: {
            isActive: true,
            isSuperAdmin: false,
            OR: [{ roles: { some: { role: 'ADMIN' } } }, { role: 'ADMIN' }],
        },
    });

    const targetIsAdmin = await prisma.user.findFirst({
        where: {
            id: userId,
            OR: [{ roles: { some: { role: 'ADMIN' } } }, { role: 'ADMIN' }],
        },
        select: { id: true, isActive: true },
    });

    if (!targetIsAdmin?.isActive) return;
    if (activeAdminCount <= 1) {
        throw new BusinessRuleError(
            'Tidak dapat menghapus atau menonaktifkan admin aktif terakhir',
        );
    }
}

export const getUsers = withTenant(async function getUsers() {
    return safeAction(async () => {
        await checkAdmin();
        const users = await prisma.user.findMany({
            where: { isSuperAdmin: false },
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                roles: { select: { role: true } },
                isActive: true,
                createdAt: true,
                authMode: true,
                centralAccountId: true,
            },
            orderBy: { createdAt: 'desc' },
        });
        const tenantId = getTenantIdFromContext();
        const centralIds = users
            .map((user) => user.centralAccountId)
            .filter((id): id is string => !!id);
        const memberships =
            tenantId && centralIds.length > 0
                ? await getMainPrisma().tenantMembership.findMany({
                      where: {
                          tenantId,
                          globalAccountId: { in: centralIds },
                      },
                      select: {
                          globalAccountId: true,
                          status: true,
                      },
                  })
                : [];
        const membershipStatus = new Map(
            memberships.map((membership) => [
                membership.globalAccountId,
                membership.status,
            ]),
        );
        return users.map((u) => ({
            ...u,
            roles: u.roles.map((r) => r.role),
            centralMembershipStatus: u.centralAccountId
                ? (membershipStatus.get(u.centralAccountId) ?? null)
                : null,
        }));
    });
});

export const inviteUserToCentralLogin = withTenant(
    async function inviteUserToCentralLogin(userId: string) {
        return safeAction(async () => {
            if (!isCentralSsoConfigured()) {
                throw new BusinessRuleError(
                    'Login Google belum diaktifkan untuk deployment ini.',
                );
            }
            const session = await checkAdmin();
            const actorId = getActorId(session);
            const tenantId = getTenantIdFromContext();
            const tenantDb = getTenantDbFromContext();
            if (!tenantId || !tenantDb) {
                throw new BusinessRuleError('Konteks tenant tidak tersedia.');
            }

            const target = await tenantDb.user.findUnique({
                where: { id: userId },
                select: { id: true, email: true, role: true },
            });
            if (!target)
                throw new BusinessRuleError('Pengguna tidak ditemukan.');

            const service = createTenantInvitationService({
                mainDb: getMainPrisma(),
                loadTenantDb: async (requestedTenantId) => {
                    if (requestedTenantId !== tenantId) {
                        throw new AuthorizationError('Tenant tidak cocok.');
                    }
                    return tenantDb;
                },
            });
            // Delivery is deliberately separate: until the email transport is
            // configured, expose the raw token only to this authenticated admin
            // response and never persist/log it.
            const invitation = await service.createInvitation({
                tenantId,
                tenantUserId: target.id,
                role: target.role,
                recipientEmail: target.email,
                actor: { userId: actorId },
            });

            const tenant = await getMainPrisma().tenant.findUnique({
                where: { id: tenantId },
                select: { id: true, subdomain: true, status: true },
            });
            if (!tenant) throw new BusinessRuleError('Tenant tidak ditemukan.');
            // MAIN already contains the atomic security event. The tenant audit
            // is supplementary and must not hide the only copy of this raw URL
            // if its write fails after invitation creation.
            await logActivity({
                userId: actorId,
                action: 'CENTRAL_INVITATION_CREATED',
                entityType: 'User',
                entityId: target.id,
                details: 'Undangan login pusat dibuat.',
                changes: {
                    tenantId,
                    invitationId: invitation.invitationId,
                    expiresAt: invitation.expiresAt.toISOString(),
                },
            }).catch(() => undefined);
            return {
                invitationId: invitation.invitationId,
                // Keep the raw token in the URL fragment so it is not sent to
                // Caddy/application access logs or Referer headers.
                invitationUrl: `${buildTenantOrigin(tenant)}/login#invite=${encodeURIComponent(invitation.token)}`,
                expiresAt: invitation.expiresAt,
            };
        });
    },
);

export const revokeUserCentralMembership = withTenant(
    async function revokeUserCentralMembership(userId: string) {
        return safeAction(async () => {
            const session = await checkAdmin();
            const actorId = getActorId(session);
            const tenantId = getTenantIdFromContext();
            const tenantDb = getTenantDbFromContext();
            if (!tenantId || !tenantDb) {
                throw new BusinessRuleError('Konteks tenant tidak tersedia.');
            }
            const target = await tenantDb.user.findUnique({
                where: { id: userId },
                select: { id: true, centralAccountId: true },
            });
            if (!target?.centralAccountId) {
                throw new BusinessRuleError(
                    'Pengguna belum terhubung ke akun pusat.',
                );
            }
            const mainDb = getMainPrisma();
            const service = new CentralIdentityService({
                mainDb,
                loadTenantDb: async (requestedTenantId) => {
                    if (requestedTenantId !== tenantId)
                        throw new AuthorizationError('Tenant tidak cocok.');
                    return tenantDb;
                },
            });
            await service.revokeMembership({
                globalAccountId: target.centralAccountId,
                tenantId,
            });
            // Keep CENTRAL mode and its binding after revoke. Returning to LOCAL
            // would silently restore the legacy password as an authentication
            // fallback. A fresh admin invitation is required for future access.
            // MAIN revocation + security event are already committed atomically.
            // A supplementary tenant audit failure must not report revocation as
            // failed and tempt an unsafe retry.
            await logActivity({
                userId: actorId,
                action: 'CENTRAL_MEMBERSHIP_REVOKED',
                entityType: 'User',
                entityId: userId,
                details: 'Akses login pusat pengguna dicabut.',
            }).catch(() => undefined);
            invalidatePermissionsCache({ userId });
            revalidatePath('/dashboard/settings');
            return { success: true as const };
        });
    },
);

export const createUser = withTenant(async function createUser(
    data: CreateUserInput,
) {
    return safeAction(async () => {
        const session = await checkAdmin();
        const actorId = getActorId(session);
        const validated = CreateUserSchema.parse(data);

        const existingUser = await prisma.user.findUnique({
            where: { email: validated.email },
        });

        if (existingUser) {
            throw new ConflictError('Email already registered');
        }

        const hashedPassword = await bcrypt.hash(validated.password, 10);

        const created = await prisma.$transaction(async (tx) => {
            const user = await tx.user.create({
                data: {
                    name: validated.name,
                    email: validated.email,
                    password: hashedPassword,
                    role: validated.role,
                },
            });
            await tx.userRole.create({
                data: { userId: user.id, role: validated.role },
            });
            return user;
        });

        await logActivity({
            userId: actorId,
            action: 'CREATE_USER',
            entityType: 'User',
            entityId: created.id,
            details: `Created user ${created.email}`,
            changes: {
                email: created.email,
                name: created.name,
                role: created.role,
            },
        });

        revalidatePath('/dashboard/settings');
        return created.id;
    });
});

export const setUserRoles = withTenant(async function setUserRoles(
    userId: string,
    newRoles: Role[],
) {
    return safeAction(async () => {
        const session = await checkAdmin();
        const actorId = getActorId(session);

        const uniqueRoles = [...new Set(newRoles)];
        if (uniqueRoles.length === 0) {
            throw new BusinessRuleError(
                'User harus memiliki minimal satu peran',
            );
        }

        const targetUser = await prisma.user.findUnique({
            where: { id: userId },
            include: { roles: { select: { role: true } } },
        });
        if (!targetUser || targetUser.isSuperAdmin) {
            throw new BusinessRuleError(
                'Tidak dapat mengubah peran Super Admin',
            );
        }

        const previouslyHadAdmin =
            targetUser.role === 'ADMIN' ||
            targetUser.roles.some((r) => r.role === 'ADMIN');

        // Prevent removing ADMIN from self
        if (
            session.user?.id === userId &&
            previouslyHadAdmin &&
            !uniqueRoles.includes('ADMIN')
        ) {
            throw new BusinessRuleError(
                'Tidak dapat menghapus peran admin dari akun sendiri',
            );
        }

        if (previouslyHadAdmin && !uniqueRoles.includes('ADMIN')) {
            await assertNotLastActiveAdmin(userId);
        }

        // Keep primary if still in list; else first role
        const primaryRole = uniqueRoles.includes(targetUser.role)
            ? targetUser.role
            : uniqueRoles[0];

        await prisma.$transaction([
            prisma.userRole.deleteMany({
                where: { userId, role: { notIn: uniqueRoles } },
            }),
            ...uniqueRoles.map((role) =>
                prisma.userRole.upsert({
                    where: { userId_role: { userId, role } },
                    update: {},
                    create: { userId, role },
                }),
            ),
            prisma.user.update({
                where: { id: userId },
                data: { role: primaryRole },
            }),
        ]);

        await logActivity({
            userId: actorId,
            action: 'UPDATE_USER_ROLES',
            entityType: 'User',
            entityId: userId,
            details: `Updated roles for ${targetUser.email}`,
            changes: {
                before: {
                    role: targetUser.role,
                    roles: targetUser.roles.map((r) => r.role),
                },
                after: { roles: uniqueRoles, primaryRole },
            },
        });

        // Roles drive permission lookups — drop the target user's cached
        // permission set so the change applies on their next navigation.
        invalidatePermissionsCache({ userId });

        revalidatePath('/dashboard/settings');
        return null;
    });
});
export const updateUser = withTenant(async function updateUser(
    data: UpdateUserInput,
) {
    return safeAction(async () => {
        const session = await checkAdmin();
        const actorId = getActorId(session);
        const validated = UpdateUserSchema.parse(data);

        const targetUser = await prisma.user.findUnique({
            where: { id: validated.id },
            include: { roles: { select: { role: true } } },
        });
        if (!targetUser || targetUser.isSuperAdmin) {
            throw new BusinessRuleError(
                'Tidak dapat mengubah akun Super Admin',
            );
        }

        const previouslyHadAdmin =
            targetUser.role === 'ADMIN' ||
            targetUser.roles.some((r) => r.role === 'ADMIN');

        if (
            session.user?.id === validated.id &&
            validated.role &&
            validated.role !== 'ADMIN' &&
            previouslyHadAdmin
        ) {
            throw new BusinessRuleError(
                'Tidak dapat menghapus peran admin dari akun sendiri',
            );
        }

        if (
            previouslyHadAdmin &&
            validated.role &&
            validated.role !== 'ADMIN'
        ) {
            await assertNotLastActiveAdmin(validated.id);
        }

        const updateData: Prisma.UserUpdateInput = {};
        if (validated.name) updateData.name = validated.name;
        if (
            validated.email &&
            targetUser.authMode === 'CENTRAL' &&
            validated.email !== targetUser.email
        ) {
            throw new BusinessRuleError(
                'Email akun pusat tidak dapat diubah dari tenant.',
            );
        }
        if (validated.email) {
            // Check if email taken by someone else
            const existing = await prisma.user.findFirst({
                where: {
                    email: validated.email,
                    NOT: { id: validated.id },
                },
            });
            if (existing) throw new ConflictError('Email already taken');
            updateData.email = validated.email;
        }
        if (validated.password) {
            if (targetUser.authMode === 'CENTRAL') {
                throw new BusinessRuleError(
                    'Password akun pusat tidak dapat direset dari tenant.',
                );
            }
            updateData.password = await bcrypt.hash(validated.password, 10);
        }
        if (validated.role) updateData.role = validated.role;

        const updated = await prisma.user.update({
            where: { id: validated.id },
            data: updateData,
        });

        await logActivity({
            userId: actorId,
            action: 'UPDATE_USER',
            entityType: 'User',
            entityId: updated.id,
            details: `Updated user ${updated.email}`,
            changes: {
                before: {
                    name: targetUser.name,
                    email: targetUser.email,
                    role: targetUser.role,
                },
                after: {
                    name: updated.name,
                    email: updated.email,
                    role: updated.role,
                    passwordChanged: !!validated.password,
                },
            },
        });

        // Primary role affects permission lookups — drop the user's cached set.
        invalidatePermissionsCache({ userId: validated.id });

        revalidatePath('/dashboard/settings');
        return null;
    });
});

export const deleteUser = withTenant(async function deleteUser(userId: string) {
    return safeAction(async () => {
        const session = await checkAdmin();
        const actorId = getActorId(session);

        // Prevent deactivating self
        if (session.user?.id === userId) {
            throw new BusinessRuleError('Cannot deactivate your own account');
        }

        const targetUser = await prisma.user.findUnique({
            where: { id: userId },
        });
        if (!targetUser || targetUser.isSuperAdmin) {
            throw new BusinessRuleError(
                'Cannot deactivate Super Admin accounts',
            );
        }

        await assertNotLastActiveAdmin(userId);

        await prisma.$transaction(async (tx) => {
            await tx.user.update({
                where: { id: userId },
                data: { isActive: false },
            });

            await unassignAllCustomersFromUser(userId, actorId, tx);

            await logActivity({
                userId: actorId,
                action: 'DEACTIVATE_USER',
                entityType: 'User',
                entityId: userId,
                details: `Deactivated user ${targetUser.email}`,
                changes: {
                    before: { isActive: targetUser.isActive },
                    after: { isActive: false },
                },
                tx,
            });
        });

        // Deactivated user must not keep serving cached permissions.
        invalidatePermissionsCache({ userId });

        revalidatePath('/dashboard/settings');
        return null;
    });
});

export const reactivateUser = withTenant(async function reactivateUser(
    userId: string,
) {
    return safeAction(async () => {
        const session = await checkAdmin();
        const actorId = getActorId(session);

        const targetUser = await prisma.user.findUnique({
            where: { id: userId },
        });
        if (!targetUser || targetUser.isSuperAdmin) {
            throw new BusinessRuleError(
                'Cannot reactivate Super Admin accounts',
            );
        }

        await prisma.user.update({
            where: { id: userId },
            data: { isActive: true },
        });

        await logActivity({
            userId: actorId,
            action: 'REACTIVATE_USER',
            entityType: 'User',
            entityId: userId,
            details: `Reactivated user ${targetUser.email}`,
            changes: {
                before: { isActive: targetUser.isActive },
                after: { isActive: true },
            },
        });

        // Reactivation changes access — drop the user's cached set.
        invalidatePermissionsCache({ userId });

        revalidatePath('/dashboard/settings');
        return null;
    });
});
