'use server';

import { withTenant } from "@/lib/core/tenant";
import { auth } from '@/auth';
import { prisma } from '@/lib/core/prisma';
import { Role, Prisma } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import * as bcrypt from 'bcryptjs';
import { safeAction, AuthorizationError, ConflictError, BusinessRuleError } from '@/lib/errors/errors';
import { logActivity } from '@/lib/tools/audit';
import { isTenantAdmin } from "@/lib/auth/roles";

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
    password: z.string().min(6, 'Password must be at least 6 characters').optional().or(z.literal('')),
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
            throw new AuthorizationError('Unauthorized: User account is inactive');
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
            OR: [
                { roles: { some: { role: "ADMIN" } } },
                { role: "ADMIN" },
            ],
        },
    });

    const targetIsAdmin = await prisma.user.findFirst({
        where: {
            id: userId,
            OR: [{ roles: { some: { role: "ADMIN" } } }, { role: "ADMIN" }],
        },
        select: { id: true, isActive: true },
    });

    if (!targetIsAdmin?.isActive) return;
    if (activeAdminCount <= 1) {
        throw new BusinessRuleError("Tidak dapat menghapus atau menonaktifkan admin aktif terakhir");
    }
}

export const getUsers = withTenant(
    async function getUsers() {
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
                },
                orderBy: { createdAt: 'desc' },
            });
            return users.map((u) => ({
                ...u,
                roles: u.roles.map((r) => r.role),
            }));
        });
    }
);

export const createUser = withTenant(
    async function createUser(data: CreateUserInput) {
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
                changes: { email: created.email, name: created.name, role: created.role },
            });

            revalidatePath('/dashboard/settings');
            return created.id;
        });
    }
);

export const setUserRoles = withTenant(
    async function setUserRoles(userId: string, newRoles: Role[]) {
        return safeAction(async () => {
            const session = await checkAdmin();
            const actorId = getActorId(session);

            const uniqueRoles = [...new Set(newRoles)];
            if (uniqueRoles.length === 0) {
                throw new BusinessRuleError("User harus memiliki minimal satu peran");
            }

            const targetUser = await prisma.user.findUnique({
                where: { id: userId },
                include: { roles: { select: { role: true } } },
            });
            if (!targetUser || targetUser.isSuperAdmin) {
                throw new BusinessRuleError("Tidak dapat mengubah peran Super Admin");
            }

            const previouslyHadAdmin =
                targetUser.role === "ADMIN" ||
                targetUser.roles.some((r) => r.role === "ADMIN");

            // Prevent removing ADMIN from self
            if (
                session.user?.id === userId &&
                previouslyHadAdmin &&
                !uniqueRoles.includes("ADMIN")
            ) {
                throw new BusinessRuleError("Tidak dapat menghapus peran admin dari akun sendiri");
            }

            if (previouslyHadAdmin && !uniqueRoles.includes("ADMIN")) {
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
                    })
                ),
                prisma.user.update({
                    where: { id: userId },
                    data: { role: primaryRole },
                }),
            ]);

            await logActivity({
                userId: actorId,
                action: "UPDATE_USER_ROLES",
                entityType: "User",
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

            revalidatePath("/dashboard/settings");
            return null;
        });
    }
);

export const updateUserRole = withTenant(
    async function updateUserRole(userId: string, newRole: Role) {
        return setUserRoles(userId, [newRole]);
    }
);

export const updateUser = withTenant(
    async function updateUser(data: UpdateUserInput) {
        return safeAction(async () => {
            const session = await checkAdmin();
            const actorId = getActorId(session);
            const validated = UpdateUserSchema.parse(data);

            const targetUser = await prisma.user.findUnique({
                where: { id: validated.id },
                include: { roles: { select: { role: true } } },
            });
            if (!targetUser || targetUser.isSuperAdmin) {
                throw new BusinessRuleError('Tidak dapat mengubah akun Super Admin');
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
                throw new BusinessRuleError('Tidak dapat menghapus peran admin dari akun sendiri');
            }

            if (previouslyHadAdmin && validated.role && validated.role !== 'ADMIN') {
                await assertNotLastActiveAdmin(validated.id);
            }

            const updateData: Prisma.UserUpdateInput = {};
            if (validated.name) updateData.name = validated.name;
            if (validated.email) {
                // Check if email taken by someone else
                const existing = await prisma.user.findFirst({
                    where: {
                        email: validated.email,
                        NOT: { id: validated.id }
                    }
                });
                if (existing) throw new ConflictError('Email already taken');
                updateData.email = validated.email;
            }
            if (validated.password) {
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

            revalidatePath('/dashboard/settings');
            return null;
        });
    }
);

export const deleteUser = withTenant(
    async function deleteUser(userId: string) {
        return safeAction(async () => {
            const session = await checkAdmin();
            const actorId = getActorId(session);

            // Prevent deactivating self
            if (session.user?.id === userId) {
                throw new BusinessRuleError('Cannot deactivate your own account');
            }

            const targetUser = await prisma.user.findUnique({ where: { id: userId } });
            if (!targetUser || targetUser.isSuperAdmin) {
                throw new BusinessRuleError('Cannot deactivate Super Admin accounts');
            }

            await assertNotLastActiveAdmin(userId);

            await prisma.user.update({
                where: { id: userId },
                data: { isActive: false },
            });

            await logActivity({
                userId: actorId,
                action: 'DEACTIVATE_USER',
                entityType: 'User',
                entityId: userId,
                details: `Deactivated user ${targetUser.email}`,
                changes: { before: { isActive: targetUser.isActive }, after: { isActive: false } },
            });

            revalidatePath('/dashboard/settings');
            return null;
        });
    }
);

export const reactivateUser = withTenant(
    async function reactivateUser(userId: string) {
        return safeAction(async () => {
            const session = await checkAdmin();
            const actorId = getActorId(session);

            const targetUser = await prisma.user.findUnique({ where: { id: userId } });
            if (!targetUser || targetUser.isSuperAdmin) {
                throw new BusinessRuleError('Cannot reactivate Super Admin accounts');
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
                changes: { before: { isActive: targetUser.isActive }, after: { isActive: true } },
            });

            revalidatePath('/dashboard/settings');
            return null;
        });
    }
);
