'use server';

import { auth } from '@/auth';
import { withTenant } from '@/lib/core/tenant';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
    safeAction,
    AuthorizationError,
    ValidationError,
} from '@/lib/errors/errors';
import { isTenantAdmin } from '@/lib/auth/roles';
import * as shellCloseSettingService from '@/services/settings/shell-close-setting-service';

async function requireAdminId(): Promise<string> {
    const session = await auth();
    if (!session?.user || !isTenantAdmin(session.user)) {
        throw new AuthorizationError(
            'Hanya admin yang dapat mengubah aturan penutupan sesi.',
        );
    }
    const id = session.user.id;
    if (!id) throw new AuthorizationError('Sesi tidak valid.');
    return id;
}

const saveSchema = z.object({ atLastOutput: z.boolean() }).strict();

export const getShellCloseSettings = withTenant(
    async function getShellCloseSettings() {
        return safeAction(async () => {
            await requireAdminId();
            const atLastOutput =
                await shellCloseSettingService.readShellCloseAtLastOutput();
            return { atLastOutput };
        });
    },
);

export const saveShellCloseSettings = withTenant(
    async function saveShellCloseSettings(input: { atLastOutput: boolean }) {
        return safeAction(async () => {
            const adminId = await requireAdminId();
            const parsed = saveSchema.safeParse(input);
            if (!parsed.success)
                throw new ValidationError('Pilihan aturan penutupan sesi tidak valid.');
            const atLastOutput =
                await shellCloseSettingService.saveShellCloseAtLastOutput(
                    parsed.data.atLastOutput,
                    adminId,
                );
            revalidatePath('/dashboard/settings');
            return { atLastOutput };
        });
    },
);
