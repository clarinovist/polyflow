import type { UserAuthMode } from '@prisma/client';
import type { Session } from 'next-auth';
import { auth } from '@/auth';
import { getTenantDbFromContext } from '@/lib/core/prisma';
import { withTenantPage } from '@/lib/core/tenant';

export interface MobileAccountProfile {
    id: string;
    name: string | null;
    email: string;
    locale: string;
    avatarUrl: string | null;
    authMode: UserAuthMode;
}

type AuthenticatedAccess = {
    menuUser: Session['user'];
};

export type MobileAccountAccessResult =
    | { status: 'no-session' }
    | ({ status: 'desktop-only' } & AuthenticatedAccess)
    | ({ status: 'tenant-context' } & AuthenticatedAccess)
    | ({ status: 'user-not-found' } & AuthenticatedAccess)
    | ({ status: 'account-inactive' } & AuthenticatedAccess)
    | ({ status: 'allowed'; profile: MobileAccountProfile } &
          AuthenticatedAccess);

const resolveMobileAccountAccessInTenant = withTenantPage(
    async function resolveMobileAccountAccessInTenant(): Promise<MobileAccountAccessResult> {
        const session = await auth();
        if (!session?.user?.id) return { status: 'no-session' };

        const menuUser = session.user;
        const restrictedSession = session.user as Session['user'] & {
            impersonatedBy?: string;
        };
        if (restrictedSession.isSuperAdmin || restrictedSession.impersonatedBy) {
            return { status: 'desktop-only', menuUser };
        }

        const tenantDb = getTenantDbFromContext();
        if (!tenantDb) return { status: 'tenant-context', menuUser };

        const profile = await tenantDb.user.findUnique({
            where: { id: session.user.id },
            select: {
                id: true,
                name: true,
                email: true,
                locale: true,
                avatarUrl: true,
                authMode: true,
                isActive: true,
            },
        });
        if (!profile) return { status: 'user-not-found', menuUser };
        if (!profile.isActive) return { status: 'account-inactive', menuUser };

        return {
            status: 'allowed',
            menuUser,
            profile: {
                id: profile.id,
                name: profile.name,
                email: profile.email,
                locale: profile.locale,
                avatarUrl: profile.avatarUrl,
                authMode: profile.authMode,
            },
        };
    },
);

function isUnknownTenantError(error: unknown): error is Error {
    return (
        error instanceof Error &&
        error.message.startsWith('Tenant database not found for subdomain:')
    );
}

/** Resolve tenant self-service access without ever falling back to MAIN. */
export async function resolveMobileAccountAccess(): Promise<MobileAccountAccessResult> {
    try {
        return await resolveMobileAccountAccessInTenant();
    } catch (error) {
        if (!isUnknownTenantError(error)) throw error;

        const session = await auth();
        if (!session?.user?.id) return { status: 'no-session' };
        const menuUser = session.user;
        const restrictedSession = session.user as Session['user'] & {
            impersonatedBy?: string;
        };
        if (restrictedSession.isSuperAdmin || restrictedSession.impersonatedBy) {
            return { status: 'desktop-only', menuUser };
        }
        return { status: 'tenant-context', menuUser };
    }
}
