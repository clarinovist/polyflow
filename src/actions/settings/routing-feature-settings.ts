'use server';

import { auth } from '@/auth';
import { withTenant } from '@/lib/core/tenant';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { safeAction, AuthorizationError } from '@/lib/errors/errors';
import { isTenantAdmin } from '@/lib/auth/roles';
import * as routingFeatureService from '@/services/settings/routing-feature-service';

async function requireAdminId(): Promise<string> {
    const session = await auth();
    if (!session?.user || !isTenantAdmin(session.user)) {
        throw new AuthorizationError(
            'Hanya admin yang dapat mengubah pengaturan routing.',
        );
    }
    const id = session.user.id;
    if (!id) throw new AuthorizationError('Sesi tidak valid.');
    return id;
}

const saveSchema = z.object({
    enabled: z.boolean(),
});

export const getRoutingFeatureSettings = withTenant(
    async function getRoutingFeatureSettings() {
        return safeAction(async () => {
            await requireAdminId();
            return routingFeatureService.readRoutingFeatureSettings();
        });
    },
);

export const saveRoutingFeatureSettings = withTenant(
    async function saveRoutingFeatureSettings(input: { enabled: boolean }) {
        return safeAction(async () => {
            const adminId = await requireAdminId();
            const parsed = saveSchema.parse(input);
            const tenantEnabled =
                await routingFeatureService.saveRoutingFeatureSettings(
                    parsed.enabled,
                    adminId,
                );
            revalidatePath('/production/routings');
            revalidatePath('/production/runs');
            revalidatePath('/dashboard/settings');
            return { tenantEnabled };
        });
    },
);
