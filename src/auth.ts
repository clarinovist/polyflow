import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { authConfig } from './auth.config';
import { z } from 'zod';
import { prisma } from '@/lib/core/prisma';
import { extractSubdomain } from '@/lib/core/tenant';
import { Role, PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { normalizeUserRoles } from '@/lib/auth/roles';
import { SESSION_POLICY } from '@/lib/auth/session-policy';
import {
    getAuthErrorCauseMessage,
    getAuthErrorType,
    shouldSuppressExpectedAuthError,
} from '@/lib/auth/auth-log-filter';
import { checkMainLoginRateLimit } from '@/lib/auth/login-rate-limit';
import { verifyImpersonationSignature } from '@/lib/auth/impersonation-signature';
import {
    buildCentralOidcProvider,
    type CentralOidcProfile,
} from '@/lib/auth/central-oidc-config';
import { resolveCentralLoginUser } from '@/services/auth/central-login-service';
import { cookies, headers } from 'next/headers';
import {
    CENTRAL_INVITATION_COOKIE,
    centralInvitationCookieOptions,
} from '@/lib/auth/central-invitation-cookie';
import { createTenantInvitationService } from '@/services/auth/tenant-invitation-service';
import { CentralIdentityService } from '@/services/auth/central-identity-service';

function getRequestIp(request: Request | undefined): string {
    return (
        request?.headers?.get('x-forwarded-for')?.split(',')[0]?.trim() ||
        request?.headers?.get('x-real-ip') ||
        '127.0.0.1'
    );
}

const centralOidcProvider = buildCentralOidcProvider();

async function resolveCentralOidcUser(profile: CentralOidcProfile) {
    const requestHeaders = await headers();
    const subdomain =
        requestHeaders.get('x-tenant-subdomain') ||
        extractSubdomain(requestHeaders.get('host') || '');
    if (!subdomain || !profile.iss || !profile.sub || !profile.email) {
        throw new Error('CentralTenantContextMissing');
    }

    const { getMainPrisma, getTenantDb } = await import('@/lib/core/prisma');
    const mainDb = getMainPrisma();
    const cookieStore = await cookies();
    const invitationToken = cookieStore.get(CENTRAL_INVITATION_COOKIE)?.value;
    if (invitationToken) {
        const tenant = await mainDb.tenant.findUnique({
            where: { subdomain },
            select: { id: true, dbUrl: true },
        });
        if (!tenant?.dbUrl) throw new Error('CentralTenantContextMissing');
        const loadInvitationTenant = async (tenantId: string) => {
            if (tenantId !== tenant.id)
                throw new Error('CentralTenantContextMismatch');
            return getTenantDb(tenant.dbUrl);
        };
        const accepted = await createTenantInvitationService({
            mainDb,
            loadTenantDb: loadInvitationTenant,
        }).acceptInvitation({
            token: invitationToken,
            expectedTenantId: tenant.id,
            identity: {
                issuer: profile.iss,
                subject: profile.sub,
                email: profile.email,
                emailVerified: [true, 'true'].includes(
                    profile.email_verified ?? false,
                ),
            },
        });
        await new CentralIdentityService({
            mainDb,
            loadTenantDb: loadInvitationTenant,
        }).activateExistingUser({
            globalAccountId: accepted.globalAccountId,
            tenantId: accepted.tenantId,
            tenantUserId: accepted.tenantUserId,
        });
        cookieStore.set(CENTRAL_INVITATION_COOKIE, '', {
            ...centralInvitationCookieOptions(),
            maxAge: 0,
        });
    }

    return resolveCentralLoginUser(
        {
            tenantSubdomain: subdomain,
            identity: {
                issuer: profile.iss,
                subject: profile.sub,
                email: profile.email,
                emailVerified: [true, 'true'].includes(
                    profile.email_verified ?? false,
                ),
                name: profile.name,
                image: profile.picture,
            },
        },
        { mainDb, loadTenantDb: getTenantDb },
    );
}

async function getUser(email: string) {
    try {
        const user = await prisma.user.findUnique({ where: { email } });
        return user;
    } catch (error) {
        console.error('Failed to fetch user:', error);
        throw new Error('Failed to fetch user.');
    }
}

export const { auth, signIn, signOut, handlers } = NextAuth({
    ...authConfig,
    session: {
        strategy: 'jwt',
        maxAge: SESSION_POLICY.defaultMaxAgeSeconds,
    },
    logger: {
        error(error) {
            if (shouldSuppressExpectedAuthError(error)) {
                return;
            }

            const type = getAuthErrorType(error);
            console.error(`[auth][error] ${type}: ${error.message}`);

            const causeMessage = getAuthErrorCauseMessage(error);
            if (causeMessage) {
                console.error(`[auth][cause]: ${causeMessage}`);
                return;
            }

            if (error.stack) {
                console.error(error.stack.replace(/.*/, '').substring(1));
            }
        },
    },
    callbacks: {
        ...authConfig.callbacks,
        async signIn(params) {
            if (params.account?.provider !== 'central-oidc') return true;
            try {
                // Auth.js 5 beta passes this same user object from signIn to
                // handleLoginOrRegister and then into the JWT callback when no
                // adapter is configured. Keep a regression test around this
                // installed-version contract before upgrading Auth.js.
                Object.assign(
                    params.user,
                    await resolveCentralOidcUser(
                        params.profile as CentralOidcProfile,
                    ),
                );
                return true;
            } catch {
                // Never leak whether an account, tenant, or membership exists.
                return false;
            }
        },
    },
    providers: [
        ...(centralOidcProvider ? [centralOidcProvider] : []),
        Credentials({
            async authorize(credentials, request) {
                const parsedCredentials = z
                    .object({
                        email: z.string().email(),
                        password: z.string().min(6),
                        role: z.string().optional(),
                        remember: z.coerce.boolean().optional(),
                        subdomain: z.string().optional(),
                        // Internal-only: set when a superadmin impersonates a tenant
                        // user via impersonateTenant(). authorize() uses this to
                        // skip the password check and tag the session with the
                        // superadmin actor. Never exposed to the login form.
                        impersonationBy: z.string().optional(),
                        impersonationExpiresAt: z.number().optional(),
                        impersonationSignature: z.string().optional(),
                    })
                    .safeParse(credentials);

                if (parsedCredentials.success) {
                    const {
                        email,
                        password,
                        remember,
                        subdomain: formSubdomain,
                        impersonationBy,
                        impersonationExpiresAt,
                        impersonationSignature,
                    } = parsedCredentials.data;
                    const isImpersonation = !!impersonationBy;

                    // Resolve subdomain: prefer form field (from hidden input) > x-tenant-subdomain header > Host header
                    let subdomain =
                        formSubdomain ||
                        request?.headers?.get('x-tenant-subdomain') ||
                        null;

                    if (!subdomain && request) {
                        const host = request.headers.get('host') || '';
                        subdomain = extractSubdomain(host);
                    }

                    if (isImpersonation) {
                        const isValidImpersonation =
                            !!impersonationExpiresAt &&
                            verifyImpersonationSignature({
                                email,
                                subdomain: subdomain ?? '',
                                impersonationBy,
                                impersonationExpiresAt,
                                signature: impersonationSignature,
                            });

                        if (!isValidImpersonation) {
                            throw new Error('InvalidImpersonationSignature');
                        }
                    } else {
                        const rateLimitResult = checkMainLoginRateLimit({
                            ip: getRequestIp(request),
                            email,
                            subdomain: subdomain ?? 'main',
                        });
                        if (!rateLimitResult.success) {
                            throw new Error('LoginRateLimited');
                        }
                    }

                    let user;
                    let resolvedTenantId: string | undefined;
                    let tenantDbRef: PrismaClient | null = null;

                    if (subdomain) {
                        try {
                            const {
                                getTenantDb,
                                getMainPrisma,
                                tenantContext,
                            } = await import('@/lib/core/prisma');
                            // CRITICAL: Use getMainPrisma() — the prisma proxy leaks tenant context
                            // from previous requests, routing this query to the wrong DB.
                            const mainPrisma = getMainPrisma();
                            const tenant = await mainPrisma.tenant.findUnique({
                                where: { subdomain },
                            });

                            // Block login entirely for suspended tenants. Thrown
                            // as a distinct error so the login form can show a
                            // clear "tenant suspended" message. Must be checked
                            // BEFORE resolving the user so no session is issued.
                            if (tenant?.status === 'SUSPENDED') {
                                throw new Error('TenantSuspended');
                            }

                            if (tenant?.dbUrl) {
                                resolvedTenantId = tenant.id;
                                tenantDbRef = getTenantDb(tenant.dbUrl);
                                const { tenantIdContext } =
                                    await import('@/lib/core/prisma');
                                user = await tenantContext.run(
                                    tenantDbRef,
                                    () =>
                                        tenantIdContext.run(tenant.id, () =>
                                            getUser(email),
                                        ),
                                );
                            } else {
                                throw new Error('TenantNotFound');
                            }
                        } catch (error) {
                            // Preserve the suspended signal — don't collapse it
                            // into the generic TenantResolutionFailed.
                            if (
                                error instanceof Error &&
                                error.message === 'TenantSuspended'
                            ) {
                                throw error;
                            }
                            console.error(
                                '[NEXTAUTH] Tenant resolution error:',
                                error,
                            );
                            throw new Error('TenantResolutionFailed');
                        }
                    } else {
                        // Fallback to default DB (e.g. localhost direct)
                        user = await getUser(email);
                    }

                    if (!user) {
                        return null;
                    }

                    if (user.isActive === false) {
                        return null;
                    }

                    // Once a tenant-local actor is linked to a central identity,
                    // its old password must never remain a fallback credential.
                    // A signed superadmin impersonation remains a separate,
                    // explicitly verified support path.
                    if (!isImpersonation && user.authMode === 'CENTRAL') {
                        throw new Error('CentralLoginRequired');
                    }

                    const passwordsMatch =
                        isImpersonation ||
                        (await bcrypt.compare(password, user.password));

                    if (passwordsMatch) {
                        // Load ALL assigned roles for this user
                        let fetchedRoles: string[] = [];
                        try {
                            const roleDb = tenantDbRef || prisma;
                            const userRoleRecords =
                                await roleDb.userRole.findMany({
                                    where: { userId: user.id },
                                    select: { role: true },
                                });
                            fetchedRoles = userRoleRecords.map(
                                (r: { role: string }) => r.role,
                            );
                        } catch {
                            // Non-fatal: fall back to single primary role
                            fetchedRoles = [user.role];
                        }

                        // Normalize roles: primary role (user.role) is always included
                        const userRoles = normalizeUserRoles(
                            user.role,
                            fetchedRoles,
                        );

                        // Aggregate allowedResources from ALL assigned roles (used by middleware path checks)
                        let allowedResources: string[] = [];
                        try {
                            const permDb = tenantDbRef || prisma;
                            const perms = await permDb.rolePermission.findMany({
                                where: {
                                    role: { in: userRoles as Role[] },
                                    canAccess: true,
                                },
                                select: { resource: true },
                            });
                            allowedResources = Array.from(
                                new Set(
                                    perms.map(
                                        (p: { resource: string }) => p.resource,
                                    ),
                                ),
                            );
                        } catch {
                            // Non-fatal
                        }

                        return {
                            id: user.id,
                            name: user.name,
                            email: user.email,
                            image: user.avatarUrl || undefined,
                            role: user.role as Role, // Primary role from DB
                            roles: userRoles as Role[], // ALL assigned roles (normalized)
                            rememberMe: remember,
                            isSuperAdmin: user.isSuperAdmin,
                            allowedResources,
                            // Snapshot at login time; compared against the DB value in
                            // dashboard/layout.tsx to support "log out of all devices"
                            // (incrementing User.tokenVersion invalidates older JWTs).
                            // Deliberately NOT verified in the Edge middleware (auth.config.ts)
                            // to avoid a Prisma query on every request in that runtime.
                            tokenVersion: user.tokenVersion,
                            // Bind every tenant session to the server-resolved host.
                            // Never infer this later from a local user id because ids
                            // can legitimately overlap across tenant databases.
                            tenantId: resolvedTenantId,
                            tenantSubdomain:
                                resolvedTenantId && subdomain
                                    ? subdomain
                                    : undefined,
                            // Only set during impersonation — absence = normal login.
                            impersonatedBy: isImpersonation
                                ? impersonationBy
                                : undefined,
                            impersonationExpiresAt: isImpersonation
                                ? impersonationExpiresAt
                                : undefined,
                        };
                    }
                }

                return null;
            },
        }),
    ],
});
