import { getUserRoles } from '@/lib/auth/roles';
import { getTenantDbFromContext } from '@/lib/core/prisma';
import { AuthorizationError } from '@/lib/errors/errors';
import { requireAuth } from '@/lib/tools/auth-checks';
import type { PrismaClient } from '@prisma/client';

export const OWNER_HPP_ALLOWLIST_ENV = 'OWNER_HPP_USER_IDS';

const DENIED_MESSAGE = 'Halaman ini tidak tersedia untuk akun Anda.';
const SAFE_USER_ID = /^[\w-]{1,100}$/;

export interface OwnerHppAccess {
    db: PrismaClient;
    userId: string;
}

/** Comma separated user ids; anything malformed is dropped (fail-closed). */
export function parseOwnerHppAllowlist(
    raw: string | undefined,
): ReadonlySet<string> {
    return new Set(
        (raw ?? '')
            .split(',')
            .map((entry) => entry.trim())
            .filter((entry) => SAFE_USER_ID.test(entry)),
    );
}

type SessionUser = {
    id?: string;
    isSuperAdmin?: boolean;
    impersonatedBy?: string;
    tokenVersion?: number;
};

/**
 * Owner-only gate for /owner. The edge (`auth.config.ts`) lets paths without a
 * workspace prefix through, so every page and server action must call this.
 *
 * Requires: a real (not super-admin, not impersonated) session, the user id on
 * the OWNER_HPP_USER_IDS allowlist, an active ADMIN account in this tenant, and
 * a token that has not been revoked ("log out of all devices").
 */
export async function requireOwnerHppAccess(): Promise<OwnerHppAccess> {
    const session = await requireAuth();
    const sessionUser = session.user as SessionUser;

    if (sessionUser.isSuperAdmin || sessionUser.impersonatedBy) {
        throw new AuthorizationError(DENIED_MESSAGE);
    }

    const userId = sessionUser.id;
    const allowlist = parseOwnerHppAllowlist(
        process.env[OWNER_HPP_ALLOWLIST_ENV],
    );
    if (!userId || !allowlist.has(userId)) {
        throw new AuthorizationError(DENIED_MESSAGE);
    }

    const db = getTenantDbFromContext();
    if (!db) throw new AuthorizationError(DENIED_MESSAGE);

    const account = await db.user.findUnique({
        where: { id: userId },
        select: {
            isActive: true,
            isSuperAdmin: true,
            role: true,
            roles: { select: { role: true } },
            tokenVersion: true,
        },
    });
    if (!account?.isActive || account.isSuperAdmin) {
        throw new AuthorizationError(DENIED_MESSAGE);
    }

    const roles = getUserRoles({
        role: account.role,
        roles: account.roles.map((entry) => entry.role),
    });
    if (!roles.includes('ADMIN')) {
        throw new AuthorizationError(DENIED_MESSAGE);
    }

    if (
        typeof sessionUser.tokenVersion === 'number' &&
        account.tokenVersion !== sessionUser.tokenVersion
    ) {
        throw new AuthorizationError(DENIED_MESSAGE);
    }

    return { db, userId };
}
