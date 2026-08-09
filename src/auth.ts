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

function getRequestIp(request: Request | undefined): string {
    return (
        request?.headers?.get('x-forwarded-for')?.split(',')[0]?.trim() ||
        request?.headers?.get('x-real-ip') ||
        '127.0.0.1'
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
    providers: [
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
