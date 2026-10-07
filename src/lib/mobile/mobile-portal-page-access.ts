import { redirect } from 'next/navigation';
import type { MobilePortalId } from '@/lib/mobile/mobile-portal-registry';
import { resolveMobilePortalAccess } from '@/lib/mobile/mobile-portal-access';

/** Final layout/page guard with a loop-safe selector landing. */
export async function requireMobilePortalPageAccess(portalId: MobilePortalId) {
    const decision = await resolveMobilePortalAccess(portalId);
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
