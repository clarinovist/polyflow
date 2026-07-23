'use server';

import { auth } from '@/auth';
import { prisma } from '@/lib/core/prisma';
import { withTenant } from '@/lib/core/tenant';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import * as bcrypt from 'bcryptjs';
import {
    safeAction,
    AuthenticationError,
    NotFoundError,
    ConflictError,
    ValidationError,
} from '@/lib/errors/errors';
import { logActivity } from '@/lib/tools/audit';

async function requireUserId(): Promise<string> {
    const session = await auth();
    const id = session?.user?.id;
    if (!id) {
        throw new AuthenticationError('Anda harus login untuk melakukan aksi ini.');
    }
    return id;
}

// ─── 1a + 4b: Update own profile (name, email, locale) ──────────────

const UpdateProfileSchema = z.object({
    name: z.string().min(2, 'Nama minimal 2 karakter').max(100, 'Nama terlalu panjang'),
    email: z.string().email('Alamat email tidak valid'),
    locale: z.enum(['id', 'en']).optional(),
});

export type UpdateProfileInput = z.infer<typeof UpdateProfileSchema>;

export const updateOwnProfile = withTenant(async function updateOwnProfile(input: UpdateProfileInput) {
    return safeAction(async () => {
        const userId = await requireUserId();
        const data = UpdateProfileSchema.parse(input);

        // Email must be unique across the tenant (except for the user themselves).
        const existing = await prisma.user.findUnique({
            where: { email: data.email },
            select: { id: true },
        });
        if (existing && existing.id !== userId) {
            throw new ConflictError('Email sudah digunakan oleh pengguna lain.');
        }

        const updated = await prisma.user.update({
            where: { id: userId },
            data: {
                name: data.name,
                email: data.email,
                ...(data.locale ? { locale: data.locale } : {}),
            },
            select: { id: true, name: true, email: true, locale: true },
        });

        await logActivity({
            userId,
            action: 'PROFILE_UPDATED',
            entityType: 'User',
            entityId: userId,
        });

        revalidatePath('/dashboard/settings');
        return updated;
    });
});

// ─── 4a: Change own password ─────────────────────────────────────────

const ChangePasswordSchema = z
    .object({
        currentPassword: z.string().min(1, 'Password saat ini wajib diisi'),
        newPassword: z.string().min(6, 'Password baru minimal 6 karakter'),
    })
    .refine((v) => v.currentPassword !== v.newPassword, {
        message: 'Password baru harus berbeda dari password saat ini',
        path: ['newPassword'],
    });

export type ChangePasswordInput = z.infer<typeof ChangePasswordSchema>;

export const changeOwnPassword = withTenant(async function changeOwnPassword(input: ChangePasswordInput) {
    return safeAction(async () => {
        const userId = await requireUserId();
        const data = ChangePasswordSchema.parse(input);

        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, password: true },
        });
        if (!user) {
            throw new NotFoundError('User', userId);
        }

        const valid = await bcrypt.compare(data.currentPassword, user.password);
        if (!valid) {
            throw new ValidationError('Password saat ini salah.');
        }

        const hashed = await bcrypt.hash(data.newPassword, 10);
        await prisma.user.update({
            where: { id: userId },
            data: { password: hashed },
        });

        await logActivity({
            userId,
            action: 'PASSWORD_CHANGED',
            entityType: 'User',
            entityId: userId,
        });

        return { success: true };
    });
});

// ─── 4c: Update own avatar ───────────────────────────────────────────

const MAX_AVATAR_BYTES = 2 * 1024 * 1024; // 2MB
const ALLOWED_AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export const updateOwnAvatar = withTenant(async function updateOwnAvatar(formData: FormData) {
    return safeAction(async () => {
        const userId = await requireUserId();
        const file = formData.get('avatar');

        if (!(file instanceof File) || file.size === 0) {
            throw new ValidationError('File avatar tidak ditemukan.');
        }
        if (!ALLOWED_AVATAR_TYPES.includes(file.type)) {
            throw new ValidationError('Format harus JPG, PNG, atau WEBP.');
        }
        if (file.size > MAX_AVATAR_BYTES) {
            throw new ValidationError('Ukuran avatar maksimal 2MB.');
        }

        const { uploadToR2, getTenantPrefix } = await import('@/lib/storage/r2');
        const tenant = await getTenantPrefix();
        const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
        const key = `${tenant}/avatars/${userId}/${Date.now()}.${ext}`;
        const buffer = Buffer.from(await file.arrayBuffer());
        const url = await uploadToR2(key, buffer, file.type);

        const updated = await prisma.user.update({
            where: { id: userId },
            data: { avatarUrl: url },
            select: { id: true, avatarUrl: true },
        });

        await logActivity({
            userId,
            action: 'AVATAR_UPDATED',
            entityType: 'User',
            entityId: userId,
        });

        revalidatePath('/dashboard/settings');
        return updated;
    });
});

export const removeOwnAvatar = withTenant(async function removeOwnAvatar() {
    return safeAction(async () => {
        const userId = await requireUserId();
        const updated = await prisma.user.update({
            where: { id: userId },
            data: { avatarUrl: null },
            select: { id: true, avatarUrl: true },
        });
        revalidatePath('/dashboard/settings');
        return updated;
    });
});

// ─── 4f: Log out of all devices (token invalidation) ─────────────────

export const logoutAllDevices = withTenant(async function logoutAllDevices() {
    return safeAction(async () => {
        const userId = await requireUserId();
        const updated = await prisma.user.update({
            where: { id: userId },
            data: { tokenVersion: { increment: 1 } },
            select: { tokenVersion: true },
        });

        await logActivity({
            userId,
            action: 'LOGOUT_ALL_DEVICES',
            entityType: 'User',
            entityId: userId,
        });

        return { tokenVersion: updated.tokenVersion };
    });
});
