'use server';

import { auth } from '@/auth';
import { withTenant } from '@/lib/core/tenant';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { safeAction, AuthorizationError } from '@/lib/errors/errors';
import { isTenantAdmin } from '@/lib/auth/roles';
import * as kioskFeatureService from '@/services/settings/kiosk-feature-service';

async function requireAdminId(): Promise<string> {
    const session = await auth();
    if (!session?.user || !isTenantAdmin(session.user)) {
        throw new AuthorizationError(
            'Hanya admin yang dapat mengubah pengaturan kiosk.',
        );
    }
    const id = session.user.id;
    if (!id) throw new AuthorizationError('Sesi tidak valid.');
    return id;
}

const saveSchema = z.object({
    hasProsesKhusus: z.boolean(),
});

export const getKioskFeatureSettings = withTenant(
    async function getKioskFeatureSettings() {
        return safeAction(async () => {
            await requireAdminId();
            const hasProsesKhusus =
                await kioskFeatureService.readKioskFeatureSettings();
            return { hasProsesKhusus };
        });
    },
);

export const saveKioskFeatureSettings = withTenant(
    async function saveKioskFeatureSettings(input: {
        hasProsesKhusus: boolean;
    }) {
        return safeAction(async () => {
            const adminId = await requireAdminId();
            const parsed = saveSchema.parse(input);
            const hasProsesKhusus =
                await kioskFeatureService.saveKioskFeatureSettings(
                    parsed.hasProsesKhusus,
                    adminId,
                );
            revalidatePath('/kiosk');
            revalidatePath('/dashboard/settings');
            return { hasProsesKhusus };
        });
    },
);
