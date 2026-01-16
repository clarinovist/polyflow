'use server';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { Role, Prisma } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import * as bcrypt from 'bcryptjs';

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
        throw new Error('Unauthorized: Admin access required');
    }
    return session;
}

export async function getUsers() {
    try {
        await checkAdmin();
        const users = await prisma.user.findMany({
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
        });
        return { success: true, data: users };
    } catch (error) {
        console.error('Failed to fetch users:', error);
        return { success: false, error: 'Failed to fetch users' };
    }
}

export async function createUser(data: CreateUserInput) {
    try {
        await checkAdmin();
        const validated = CreateUserSchema.parse(data);

        const existingUser = await prisma.user.findUnique({
            where: { email: validated.email },
        });

        if (existingUser) {
            return { success: false, error: 'Email already registered' };
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
        return { success: true };
    } catch (error) {
        console.error('Failed to create user:', error);
        if (error instanceof z.ZodError) {
            // Return the first error message
            return { success: false, error: error.issues?.[0]?.message || 'Validation error' };
        }
        return { success: false, error: (error as Error).message };
    }
}

export async function updateUserRole(userId: string, newRole: Role) {
    try {
        await checkAdmin();

        await prisma.user.update({
            where: { id: userId },
            data: { role: newRole },
        });

        revalidatePath('/dashboard/settings');
        return { success: true };
    } catch (error) {
        console.error('Failed to update user role:', error);
        return { success: false, error: 'Failed to update role' };
    }
}

export async function updateUser(data: UpdateUserInput) {
    try {
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
            if (existing) return { success: false, error: 'Email already taken' };
            updateData.email = validated.email;
        }
        if (validated.password) {
            updateData.password = await bcrypt.hash(validated.password, 10);
        }
        if (validated.role) updateData.role = validated.role;

        await prisma.user.update({
            where: { id: validated.id },
            data: updateData,
        });

        revalidatePath('/dashboard/settings');
        return { success: true };
    } catch (error) {
        console.error('Failed to update user:', error);
        if (error instanceof z.ZodError) {
            return { success: false, error: error.issues?.[0]?.message || 'Validation error' };
        }
        return { success: false, error: (error as Error).message };
    }
}

export async function deleteUser(userId: string) {
    try {
        const session = await checkAdmin();

        // Prevent deleting self
        if (session.user?.id === userId) {
            return { success: false, error: 'Cannot delete your own account' };
        }

        await prisma.user.delete({
            where: { id: userId },
        });

        revalidatePath('/dashboard/settings');
        return { success: true };
    } catch (error) {
        console.error('Failed to delete user:', error);
        return { success: false, error: 'Failed to delete user' };
    }
}
