import { redirect } from 'next/navigation';
import { withTenantPage } from '@/lib/core/tenant';
import type {
    MobileActionCapability,
    MobilePortalId,
} from '@/lib/mobile/mobile-portal-registry';
import { resolveMobilePortalAccess } from '@/lib/mobile/mobile-portal-access';
import type { MobilePortalDecision } from '@/lib/mobile/mobile-portal-decision';

/**
 * Page/layout resolver. App Router callers must use this tenant-scoped entry
 * point instead of calling the in-context action resolver directly.
 */
export const resolveMobilePortalPageAccess = withTenantPage(
    async function resolveMobilePortalPageAccess(
        portalId: MobilePortalId,
        capability?: MobileActionCapability,
    ): Promise<MobilePortalDecision> {
        return resolveMobilePortalAccess(portalId, capability);
    },
);

/** Final layout/page guard with a loop-safe selector landing. */
export async function requireMobilePortalPageAccess(portalId: MobilePortalId) {
    const decision = await resolveMobilePortalPageAccess(portalId);
    if (!decision.allowed) {
        if (decision.reason === 'NO_SESSION') redirect('/login');
        if (decision.reason === 'DESKTOP_ONLY') {
            redirect(
                '/device/desktop-required?from=' +
                    encodeURIComponent('/dashboard'),
            );
        }
        redirect('/mobile?reason=' + decision.reason.toLowerCase());
    }
    return {
        portal: decision.portal,
        capabilities: decision.capabilities,
    };
}
