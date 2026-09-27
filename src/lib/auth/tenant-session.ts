import type { Session } from 'next-auth';
import { CentralIdentityService } from '@/services/auth/central-identity-service';
import { AuthorizationError } from '@/lib/errors/errors';

export interface TenantRequestIdentity {
    tenantId: string;
    subdomain: string;
}

/**
 * Enforces that a browser session belongs to the tenant selected by the request
 * host. CENTRAL sessions additionally revalidate account/membership/local
 * revocation versions against their owning databases on every protected call.
 */
export async function assertTenantSession(
    session: Session,
    requestTenant: TenantRequestIdentity,
    centralIdentityService: CentralIdentityService | null,
    options: { requireLocalBinding?: boolean } = {},
): Promise<void> {
    if (!session.user?.id)
        throw new AuthorizationError('Sesi pengguna tidak valid.');

    const isCentral = !!session.user.globalAccountId;
    // Rollout compatibility: existing LOCAL JWTs predate tenant claims. The
    // feature flag can force them to sign in again after all entrypoints are
    // ready. CENTRAL sessions never receive this compatibility bypass.
    if (!isCentral && !options.requireLocalBinding && !session.user.tenantId)
        return;
    if (
        session.user.tenantId !== requestTenant.tenantId ||
        session.user.tenantSubdomain !== requestTenant.subdomain
    ) {
        throw new AuthorizationError(
            'Sesi tidak berlaku untuk perusahaan yang sedang dibuka.',
        );
    }

    if (!isCentral) return;
    const {
        globalAccountId,
        membershipId,
        tenantId,
        globalRevocationVersion,
        membershipVersion,
        localAuthVersion,
    } = session.user;
    if (
        !globalAccountId ||
        !membershipId ||
        !tenantId ||
        typeof globalRevocationVersion !== 'number' ||
        typeof membershipVersion !== 'number' ||
        typeof localAuthVersion !== 'number'
    ) {
        throw new AuthorizationError('Sesi akun pusat tidak lengkap.');
    }

    if (!centralIdentityService)
        throw new AuthorizationError('Validator akun pusat tidak tersedia.');

    await centralIdentityService.validateSessionBinding({
        globalAccountId,
        membershipId,
        tenantId,
        tenantUserId: session.user.id,
        globalRevocationVersion,
        membershipVersion,
        localAuthVersion,
    });
}
