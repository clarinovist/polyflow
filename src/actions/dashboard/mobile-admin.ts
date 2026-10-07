'use server';

import { withTenant } from '@/lib/core/tenant';
import { AuthorizationError, safeAction } from '@/lib/errors/errors';
import { requireMobilePortalAccess } from '@/lib/mobile/mobile-portal-access';
import {
    MobileAdminService,
    type AdminMobileModuleKey,
} from '@/services/dashboard/mobile-admin-service';

async function getAdminMobileContext() {
    const access = await requireMobilePortalAccess('admin');
    const dataDependencies = access.dataDependencies;
    if (!dataDependencies) {
        throw new AuthorizationError('Konteks Admin Mobile tidak lengkap.');
    }
    return {
        activeModules: access.activeModules,
        permissions: access.permissions,
        availablePortals: access.availablePortals,
        dataDependencies,
    };
}

/** Read-only Admin Mobile aggregate. Every exported read repeats the server guard. */
export const getAdminMobileOverview = withTenant(
    async function getAdminMobileOverview() {
        return safeAction(async () =>
            MobileAdminService.getOverview(await getAdminMobileContext()),
        );
    },
);

export const getAdminMobileSection = withTenant(
    async function getAdminMobileSection(moduleKey: AdminMobileModuleKey) {
        return safeAction(async () =>
            MobileAdminService.getModuleSections(
                {
                    ...(await getAdminMobileContext()),
                    onlyModules: [moduleKey],
                },
            ),
        );
    },
);
