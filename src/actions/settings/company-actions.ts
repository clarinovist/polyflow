'use server';

import { auth } from '@/auth';
import { prisma } from '@/lib/core/prisma';
import { withTenant } from '@/lib/core/tenant';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
    safeAction,
    AuthorizationError,
    ValidationError,
} from '@/lib/errors/errors';
import { logActivity } from '@/lib/tools/audit';
import { isTenantAdmin } from '@/lib/auth/roles';
import { COMPANY_SETTING_KEYS, type CompanySettings } from '@/lib/config/company-settings';

async function requireAdminId(): Promise<string> {
    const session = await auth();
    if (!session?.user || !isTenantAdmin(session.user)) {
        throw new AuthorizationError('Hanya admin yang dapat mengubah pengaturan perusahaan.');
    }
    const id = session.user.id;
    if (!id) throw new AuthorizationError('Sesi tidak valid.');
    return id;
}

/**
 * Read company settings overrides stored in AppSetting (per tenant DB).
 * Returns a partial map keyed by the short name (e.g. "name", "address").
 */
export const getCompanySettings = withTenant(async function getCompanySettings() {
    return safeAction(async () => {
        // Read is admin-only to avoid leaking config to non-admins in the UI.
        await requireAdminId();
        const rows = await prisma.appSetting.findMany({
            where: { key: { in: Object.values(COMPANY_SETTING_KEYS) } },
            select: { key: true, value: true },
        });
        const byKey = new Map(rows.map((r) => [r.key, r.value]));
        const result: Partial<CompanySettings> = {};
        (Object.entries(COMPANY_SETTING_KEYS) as [keyof CompanySettings, string][]).forEach(
            ([field, key]) => {
                const val = byKey.get(key);
                if (val != null) result[field] = val;
            },
        );
        return result;
    });
});

const UpdateCompanySchema = z.object({
    name: z.string().max(200).optional(),
    address: z.string().max(500).optional(),
    phone: z.string().max(100).optional(),
    email: z.string().max(200).optional(),
    footerNote: z.string().max(500).optional(),
    signerName: z.string().max(200).optional(),
    logoUrl: z.string().max(500).optional(),
    bankAccountsNonPPN: z.string().max(10000).optional(),
    bankAccountsPPN: z.string().max(10000).optional(),
});

export type UpdateCompanyInput = z.infer<typeof UpdateCompanySchema>;

export const updateCompanySettings = withTenant(async function updateCompanySettings(input: UpdateCompanyInput) {
    return safeAction(async () => {
        const adminId = await requireAdminId();
        const data = UpdateCompanySchema.parse(input);

        const entries = Object.entries(data).filter(([, v]) => v !== undefined) as [
            keyof CompanySettings,
            string,
        ][];

        // Validate bank JSON if provided.
        for (const [field, value] of entries) {
            if (field === 'bankAccountsNonPPN' || field === 'bankAccountsPPN') {
                let parsed: unknown;
                try {
                    parsed = JSON.parse(value);
                } catch {
                    throw new ValidationError(`Format ${field} tidak valid. Harus JSON array [{holder,bank,account}].`);
                }
                if (!Array.isArray(parsed)) {
                    throw new ValidationError(`Format ${field} harus berupa array.`);
                }
            }
        }

        await prisma.$transaction(
            entries.map(([field, value]) => {
                const key = COMPANY_SETTING_KEYS[field];
                return prisma.appSetting.upsert({
                    where: { key },
                    create: { key, value, updatedBy: adminId },
                    update: { value, updatedBy: adminId },
                });
            }),
        );

        await logActivity({
            userId: adminId,
            action: 'COMPANY_SETTINGS_UPDATED',
            entityType: 'AppSetting',
            entityId: 'company',
            changes: data,
        });

        revalidatePath('/dashboard/settings');
        return { updated: entries.map(([f]) => f) };
    });
});

const MAX_LOGO_BYTES = 1 * 1024 * 1024; // 1MB
const ALLOWED_LOGO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export const uploadCompanyLogo = withTenant(async function uploadCompanyLogo(formData: FormData) {
    return safeAction(async () => {
        const adminId = await requireAdminId();
        const file = formData.get('logo');
        if (!(file instanceof File) || file.size === 0) {
            throw new ValidationError('File logo tidak ditemukan.');
        }
        if (!ALLOWED_LOGO_TYPES.includes(file.type)) {
            throw new ValidationError('Format logo harus JPG, PNG, atau WEBP.');
        }
        if (file.size > MAX_LOGO_BYTES) {
            throw new ValidationError('Ukuran logo maksimal 1MB.');
        }

        const { uploadToR2, getTenantPrefix } = await import('@/lib/storage/r2');
        const tenant = await getTenantPrefix();
        const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
        const key = `${tenant}/company/logo-${Date.now()}.${ext}`;
        const buffer = Buffer.from(await file.arrayBuffer());
        const url = await uploadToR2(key, buffer, file.type);

        const settingKey = COMPANY_SETTING_KEYS.logoUrl;
        await prisma.appSetting.upsert({
            where: { key: settingKey },
            create: { key: settingKey, value: url, updatedBy: adminId },
            update: { value: url, updatedBy: adminId },
        });

        await logActivity({
            userId: adminId,
            action: 'COMPANY_LOGO_UPDATED',
            entityType: 'AppSetting',
            entityId: 'company',
        });

        revalidatePath('/dashboard/settings');
        return { logoUrl: url };
    });
});
