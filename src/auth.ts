import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { authConfig } from './auth.config';
import { z } from 'zod';
import { prisma } from '@/lib/core/prisma';
import { extractSubdomain } from '@/lib/core/tenant';
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
                    })
                    .safeParse(credentials);

                if (parsedCredentials.success) {
                    const { email, password, role, remember, subdomain: formSubdomain } = parsedCredentials.data;

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
                            const { getTenantDb, tenantContext } = await import('@/lib/core/prisma');
                            const tenant = await prisma.tenant.findUnique({
                                where: { subdomain }
                            });

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

                    const passwordsMatch = await bcrypt.compare(password, user.password);

                    if (passwordsMatch) {
                        // Check if role matches if provided
                        // ADMIN can bypass this and access all workspaces
                        if (role && user.role !== role && user.role !== 'ADMIN') {
                            throw new Error('RoleMismatch');
                        }
                        // Strictly enforce that if role isn't provided, we only allow access to root if they are SuperAdmin
                        // For tenant logins, the role is always provided by the form.
                        if (!role && !user.isSuperAdmin) {
                            throw new Error('RoleMismatch');
                        }

                        // Load role permissions for this user
                        let allowedResources: string[] = [];
                        try {
                            const permDb = tenantDbRef || prisma;
                            const perms = await permDb.rolePermission.findMany({
                                where: { role: user.role, canAccess: true },
                                select: { resource: true },
                            });
                            allowedResources = perms.map((p: { resource: string }) => p.resource);
                        } catch {
                            // Non-fatal: user just won't have DB-based permissions
                        }

                        return {
                            id: user.id,
                            name: user.name,
                            email: user.email,
                            role: user.role,
                            rememberMe: remember,
                            isSuperAdmin: user.isSuperAdmin,
                            allowedResources,
                        };
                    }
                }

                return null;
            },
        }),
    ],
});
