'use server';

import { auth } from '@/auth';
import { withTenant } from '@/lib/core/tenant';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/core/prisma';
import {
    safeAction,
    AuthorizationError,
    ValidationError,
} from '@/lib/errors/errors';
import { isTenantAdmin } from '@/lib/auth/roles';
import {
    MAX_CONVERSION_ACCOUNTS,
    readConversionCostSetting,
    saveConversionCostSetting,
    type ConversionCostSetting,
} from '@/services/settings/conversion-cost-setting-service';

async function requireAdminId(): Promise<string> {
    const session = await auth();
    if (!session?.user || !isTenantAdmin(session.user)) {
        throw new AuthorizationError(
            'Hanya admin yang dapat mengubah sumber biaya konversi.',
        );
    }
    const id = session.user.id;
    if (!id) throw new AuthorizationError('Sesi tidak valid.');
    return id;
}

const saveSchema = z
    .object({
        enabled: z.boolean(),
        accountIds: z.array(z.string().min(1)).max(MAX_CONVERSION_ACCOUNTS),
    })
    .strict();

export const getConversionCostSettings = withTenant(
    async function getConversionCostSettings() {
        return safeAction(async () => {
            await requireAdminId();
            const setting = await readConversionCostSetting();
            // A saved account stays listed after deactivation so it can be removed.
            const accounts = await prisma.account.findMany({
                where: {
                    type: 'EXPENSE',
                    OR: [
                        { isActive: true },
                        { id: { in: setting.accountIds } },
                    ],
                },
                select: { id: true, code: true, name: true, isActive: true },
                orderBy: { code: 'asc' },
            });
            return { setting, accounts };
        });
    },
);

export const saveConversionCostSettings = withTenant(
    async function saveConversionCostSettings(input: ConversionCostSetting) {
        return safeAction(async () => {
            const adminId = await requireAdminId();
            const parsed = saveSchema.safeParse(input);
            if (!parsed.success)
                throw new ValidationError(
                    `Pilihan sumber biaya konversi tidak valid. Pilih paling banyak ${MAX_CONVERSION_ACCOUNTS} akun beban.`,
                );
            const accountIds = [...new Set(parsed.data.accountIds)];
            if (parsed.data.enabled && accountIds.length) {
                const found = await prisma.account.findMany({
                    where: { id: { in: accountIds }, type: 'EXPENSE' },
                    select: { id: true },
                });
                if (found.length !== accountIds.length)
                    throw new ValidationError(
                        'Hanya akun beban (EXPENSE) yang dapat dipakai sebagai sumber biaya konversi.',
                    );
            }
            const saved = await saveConversionCostSetting(
                { enabled: parsed.data.enabled, accountIds },
                adminId,
            );
            revalidatePath('/dashboard/settings');
            revalidatePath('/finance/reports/hpp');
            revalidatePath('/production/costing');
            return saved;
        });
    },
);
