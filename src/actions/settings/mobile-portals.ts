'use server';

import { withTenant } from '@/lib/core/tenant';
import { requireAuth } from '@/lib/tools/auth-checks';
import { safeAction, BusinessRuleError } from '@/lib/errors/errors';
import { getMyPermissions } from '@/actions/admin/permissions';
import { getActiveModuleKeys } from '@/lib/modules/tenant-entitlements';
import { getAvailableMobilePortals } from '@/lib/mobile/mobile-access-policy';

/** Discovery is not authorization: each portal/action still enforces its own guards. */
export const getMyMobilePortals = withTenant(async function getMyMobilePortals() {
    return safeAction(async () => {
        const session = await requireAuth();
        const [permissions, activeModules] = await Promise.all([getMyPermissions(), getActiveModuleKeys()]);
        if (!permissions.success) throw new BusinessRuleError('Pilihan portal belum dapat dimuat. Coba lagi.');
        return getAvailableMobilePortals(session.user, { permissions: permissions.data, activeModules });
    });
});
