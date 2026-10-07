'use server';

import { withTenant } from '@/lib/core/tenant';
import { getTenantDbFromContext } from '@/lib/core/prisma';
import { requireAuth } from '@/lib/tools/auth-checks';
import { safeAction, BusinessRuleError } from '@/lib/errors/errors';
import {
    getMyExplicitFeaturePermissions,
    getMyPermissions,
} from '@/actions/admin/permissions';
import { getActiveModuleKeys } from '@/lib/modules/tenant-entitlements';
import { MOBILE_PORTAL_REGISTRY } from '@/lib/mobile/mobile-portal-registry';
import { getAvailableMobilePortals } from '@/lib/mobile/mobile-portal-decision';
import { readMobilePortalRollouts } from '@/services/settings/mobile-portal-rollout-service';

/** Discovery is not authorization: each portal/action still enforces its own guards. */
export const getMyMobilePortals = withTenant(
    async function getMyMobilePortals() {
        return safeAction(async () => {
            const session = await requireAuth();
            const tenantDb = getTenantDbFromContext();
            if (!tenantDb) {
                throw new BusinessRuleError(
                    'Konteks tenant portal mobile tidak tersedia.',
                );
            }
            const rolloutKeys = MOBILE_PORTAL_REGISTRY.flatMap((portal) =>
                portal.rolloutKey ? [portal.rolloutKey] : [],
            );
            const [permissions, featurePermissions, activeModules, rollout] =
                await Promise.all([
                    getMyPermissions(),
                    getMyExplicitFeaturePermissions(),
                    getActiveModuleKeys(),
                    readMobilePortalRollouts(rolloutKeys, tenantDb.appSetting),
                ]);
            if (!permissions.success) {
                throw new BusinessRuleError(
                    'Pilihan portal belum dapat dimuat. Coba lagi.',
                );
            }
            return getAvailableMobilePortals({
                user: {
                    ...session.user,
                    isSuperAdmin:
                        !!session.user.isSuperAdmin ||
                        !!(session.user as { impersonatedBy?: string })
                            .impersonatedBy,
                },
                permissions: permissions.data,
                featurePermissions: featurePermissions.success
                    ? featurePermissions.data
                    : [],
                activeModules,
                rollout,
            });
        });
    },
);
