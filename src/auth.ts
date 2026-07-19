import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { authConfig } from './auth.config';
import { z } from 'zod';
import { prisma } from '@/lib/core/prisma';
import { extractSubdomain } from '@/lib/core/tenant';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { SESSION_POLICY } from '@/lib/auth/session-policy';

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
                    })
                    .safeParse(credentials);

                if (parsedCredentials.success) {
                    const { email, password, role, remember, subdomain: formSubdomain, impersonationBy, impersonationExpiresAt } = parsedCredentials.data;
                    const isImpersonation = !!impersonationBy;

                    // Resolve subdomain: prefer form field (from hidden input) > x-tenant-subdomain header > Host header
                    let subdomain = formSubdomain || request?.headers?.get('x-tenant-subdomain') || null;

                    if (!subdomain && request) {
                        const host = request.headers.get('host') || '';
                        subdomain = extractSubdomain(host);
                    }

                    let user;
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    let tenantDbRef: any = null;

                    if (subdomain) {
                        try {
                            const { getTenantDb, getMainPrisma, tenantContext } = await import('@/lib/core/prisma');
                            // CRITICAL: Use getMainPrisma() — the prisma proxy leaks tenant context
                            // from previous requests, routing this query to the wrong DB.
                            const mainPrisma = getMainPrisma();
                            const tenant = await mainPrisma.tenant.findUnique({
                                where: { subdomain }
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
                                const { tenantIdContext } = await import('@/lib/core/prisma');
                                user = await tenantContext.run(tenantDbRef, () =>
                                    tenantIdContext.run(tenant.id, () => getUser(email))
                                );
                            } else {
                                throw new Error('TenantNotFound');
                            }
                        } catch (error) {
                            // Preserve the suspended signal — don't collapse it
                            // into the generic TenantResolutionFailed.
                            if (error instanceof Error && error.message === 'TenantSuspended') {
                                throw error;
                            }
                            console.error('[NEXTAUTH] Tenant resolution error:', error);
                            throw new Error('TenantResolutionFailed');
                        }
                    } else {
                        // Fallback to default DB (e.g. localhost direct)
                        user = await getUser(email);
                    }

                    if (!user) {
                        throw new Error('UserNotFound');
                    }

                    if (user.isActive === false) {
                        throw new Error('UserInactive');
                    }

                    const passwordsMatch = isImpersonation || await bcrypt.compare(password, user.password);

                    if (passwordsMatch) {
                        // Load ALL assigned roles for this user
                        let userRoles: string[] = [];
                        try {
                            const roleDb = tenantDbRef || prisma;
                            const userRoleRecords = await roleDb.userRole.findMany({
                                where: { userId: user.id },
                                select: { role: true },
                            });
                            userRoles = userRoleRecords.map((r: { role: string }) => r.role);
                        } catch {
                            // Non-fatal: fall back to single primary role
                            userRoles = [user.role];
                        }

                        // Empty UserRole (edge case) → fallback primary
                        if (userRoles.length === 0) {
                            userRoles = [user.role];
                        }

                        const isAssignedAdmin = userRoles.includes("ADMIN") || user.role === "ADMIN";

                        // Validate: selected role must be in assigned roles (ADMIN bypass)
                        if (role && !userRoles.includes(role) && !isAssignedAdmin) {
                            throw new Error("RoleMismatch");
                        }
                        if (!role && !user.isSuperAdmin) {
                            throw new Error("RoleMismatch");
                        }

                        // Active role = selected workspace role at login (not always DB primary)
                        const activeRole = role || user.role;

                        // Aggregate allowedResources from ALL assigned roles (used by middleware path checks)
                        let allowedResources: string[] = [];
                        try {
                            const permDb = tenantDbRef || prisma;
                            const perms = await permDb.rolePermission.findMany({
                                where: { role: { in: userRoles as Role[] }, canAccess: true },
                                select: { resource: true },
                            });
                            allowedResources = Array.from(new Set(perms.map((p: { resource: string }) => p.resource)));
                        } catch {
                            // Non-fatal
                        }

                        return {
                            id: user.id,
                            name: user.name,
                            email: user.email,
                            role: activeRole as Role,     // ACTIVE role (login-selected)
                            roles: userRoles as Role[],   // ALL assigned roles
                            rememberMe: remember,
                            isSuperAdmin: user.isSuperAdmin,
                            allowedResources,
                            // Only set during impersonation — absence = normal login.
                            impersonatedBy: isImpersonation ? impersonationBy : undefined,
                            impersonationExpiresAt: isImpersonation ? impersonationExpiresAt : undefined,
                        };
                    }
                }

                return null;
            },
        }),
    ],
});
