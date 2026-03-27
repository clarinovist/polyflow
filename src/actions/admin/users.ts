'use server';

import { withTenant } from "@/lib/core/tenant";
import { auth } from '@/auth';
import { prisma } from '@/lib/core/prisma';
import { Role, Prisma } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import * as bcrypt from 'bcryptjs';
import { safeAction, AuthorizationError, ConflictError, BusinessRuleError } from '@/lib/errors/errors';

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
    if (!session?.user || session.user.role !== 'ADMIN') {
        throw new AuthorizationError('Unauthorized: Admin access required');
    }
    return session;
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
                    createdAt: true,
                },
                orderBy: { createdAt: 'desc' },
            });
            return users;
        });
    }
);

export const createUser = withTenant(
    async function createUser(data: CreateUserInput) {
        return safeAction(async () => {
            await checkAdmin();
            const validated = CreateUserSchema.parse(data);

            const existingUser = await prisma.user.findUnique({
                where: { email: validated.email },
            });

            if (existingUser) {
                throw new ConflictError('Email already registered');
            }

            const hashedPassword = await bcrypt.hash(validated.password, 10);

            await prisma.user.create({
                data: {
                    name: validated.name,
                    email: validated.email,
                    password: hashedPassword,
                    role: validated.role,
                },
            });

            revalidatePath('/dashboard/settings');
            return null;
        });
    }
);

export const updateUserRole = withTenant(
    async function updateUserRole(userId: string, newRole: Role) {
        return safeAction(async () => {
            await checkAdmin();

            const targetUser = await prisma.user.findUnique({ where: { id: userId } });
            if (!targetUser || targetUser.isSuperAdmin) {
                throw new BusinessRuleError('Cannot modify Super Admin role');
            }

            await prisma.user.update({
                where: { id: userId },
                data: { role: newRole },
            });

            revalidatePath('/dashboard/settings');
            return null;
        });
    }
);

export const updateUser = withTenant(
    async function updateUser(data: UpdateUserInput) {
        return safeAction(async () => {
            await checkAdmin();
            const validated = UpdateUserSchema.parse(data);

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

            const targetUser = await prisma.user.findUnique({ where: { id: validated.id } });
            if (!targetUser || targetUser.isSuperAdmin) {
                throw new BusinessRuleError('Cannot modify Super Admin accounts');
            }

            await prisma.user.update({
                where: { id: validated.id },
                data: updateData,
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

            // Prevent deleting self
            if (session.user?.id === userId) {
                throw new BusinessRuleError('Cannot delete your own account');
            }

            const targetUser = await prisma.user.findUnique({ where: { id: userId } });
            if (!targetUser || targetUser.isSuperAdmin) {
                throw new BusinessRuleError('Cannot delete Super Admin accounts');
            }

            await prisma.user.delete({
                where: { id: userId },
            });

            revalidatePath('/dashboard/settings');
            return null;
        });
    }
);
