'use server';

import { auth } from '@/auth';
import { getTenantDbFromContext } from '@/lib/core/prisma';
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
    AuthorizationError,
} from '@/lib/errors/errors';
import { logActivity } from '@/lib/tools/audit';

async function requireTenantAccountContext() {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) {
        throw new AuthenticationError(
            'Anda harus login untuk melakukan aksi ini.',
        );
    }

    const tenantDb = getTenantDbFromContext();
    if (!tenantDb) {
        throw new AuthenticationError(
            'Konteks perusahaan tidak tersedia. Silakan login kembali.',
        );
    }

    const account = await tenantDb.user.findUnique({
        where: { id: userId },
        select: {
            id: true,
            email: true,
            password: true,
            authMode: true,
            centralAccountId: true,
            isActive: true,
        },
    });
    if (!account) throw new NotFoundError('User', userId);
    if (!account.isActive) {
        throw new AuthorizationError('Akun ini tidak aktif.');
    }

    return { userId, tenantDb, account };
}

function revalidateProfilePaths() {
    revalidatePath('/dashboard/settings');
    revalidatePath('/mobile/account');
}

const UpdateProfileSchema = z.object({
    name: z
        .string()
        .min(2, 'Nama minimal 2 karakter')
        .max(100, 'Nama terlalu panjang'),
    email: z.string().email('Alamat email tidak valid'),
    locale: z.enum(['id', 'en']).optional(),
});

export type UpdateProfileInput = z.infer<typeof UpdateProfileSchema>;

export const updateOwnProfile = withTenant(async function updateOwnProfile(
    input: UpdateProfileInput,
) {
    return safeAction(async () => {
        const { userId, tenantDb, account } =
            await requireTenantAccountContext();
        const data = UpdateProfileSchema.parse(input);

        const isCentral = account.authMode === 'CENTRAL';
        if (isCentral && data.email !== account.email) {
            throw new ValidationError(
                'Email akun pusat harus diubah melalui layanan login pusat.',
            );
        }

        if (!isCentral) {
            const existing = await tenantDb.user.findUnique({
                where: { email: data.email },
                select: { id: true },
            });
            if (existing && existing.id !== userId) {
                throw new ConflictError(
                    'Email sudah digunakan oleh pengguna lain.',
                );
            }
        }

        const updated = await tenantDb.user.update({
            where: { id: userId },
            data: {
                name: data.name,
                ...(!isCentral ? { email: data.email } : {}),
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

        revalidateProfilePaths();
        return updated;
    });
});

const ChangePasswordSchema = z
    .object({
        currentPassword: z.string().min(1, 'Password saat ini wajib diisi'),
        newPassword: z.string().min(6, 'Password baru minimal 6 karakter'),
    })
    .refine((value) => value.currentPassword !== value.newPassword, {
        message: 'Password baru harus berbeda dari password saat ini',
        path: ['newPassword'],
    });

export type ChangePasswordInput = z.infer<typeof ChangePasswordSchema>;

export const changeOwnPassword = withTenant(async function changeOwnPassword(
    input: ChangePasswordInput,
) {
    return safeAction(async () => {
        const { userId, tenantDb, account } =
            await requireTenantAccountContext();
        const data = ChangePasswordSchema.parse(input);

        if (account.authMode === 'CENTRAL') {
            throw new ValidationError(
                'Password akun pusat harus diubah melalui layanan login pusat.',
            );
        }

        const valid = await bcrypt.compare(
            data.currentPassword,
            account.password,
        );
        if (!valid) throw new ValidationError('Password saat ini salah.');

        const hashed = await bcrypt.hash(data.newPassword, 10);
        await tenantDb.user.update({
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

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const ALLOWED_AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export const updateOwnAvatar = withTenant(async function updateOwnAvatar(
    formData: FormData,
) {
    return safeAction(async () => {
        const { userId, tenantDb } = await requireTenantAccountContext();
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

        const { uploadToR2, getTenantPrefix } =
            await import('@/lib/storage/r2');
        const tenant = await getTenantPrefix();
        const ext =
            file.type === 'image/png'
                ? 'png'
                : file.type === 'image/webp'
                  ? 'webp'
                  : 'jpg';
        const key = `${tenant}/avatars/${userId}/${Date.now()}.${ext}`;
        const buffer = Buffer.from(await file.arrayBuffer());
        const url = await uploadToR2(key, buffer, file.type);

        const updated = await tenantDb.user.update({
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

        revalidateProfilePaths();
        return updated;
    });
});

export const removeOwnAvatar = withTenant(async function removeOwnAvatar() {
    return safeAction(async () => {
        const { userId, tenantDb } = await requireTenantAccountContext();
        const updated = await tenantDb.user.update({
            where: { id: userId },
            data: { avatarUrl: null },
            select: { id: true, avatarUrl: true },
        });
        revalidateProfilePaths();
        return updated;
    });
});

export const logoutAllDevices = withTenant(async function logoutAllDevices() {
    return safeAction(async () => {
        const { userId, tenantDb, account } =
            await requireTenantAccountContext();

        if (account.centralAccountId) {
            const { getMainPrisma } = await import('@/lib/core/prisma');
            await getMainPrisma().globalAccount.update({
                where: { id: account.centralAccountId },
                data: { revocationVersion: { increment: 1 } },
            });
        }
        const updated = await tenantDb.user.update({
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
