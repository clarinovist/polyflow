import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { authConfig } from './auth.config';
import { z } from 'zod';
import { prisma } from '@/lib/core/prisma';
import { extractSubdomain } from '@/lib/core/tenant';
import * as bcrypt from 'bcryptjs';

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
        maxAge: 30 * 24 * 60 * 60, // 30 days
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
                    })
                    .safeParse(credentials);

                if (parsedCredentials.success) {
                    const { email, password, role, remember } = parsedCredentials.data;

                    // Extract Subdomain from headers in NextAuth 5
                    let subdomain = request?.headers?.get('x-tenant-subdomain');

                    if (!subdomain && request) {
                        const host = request.headers.get('host') || '';
                        subdomain = extractSubdomain(host);
                    }

                    let user;

                    if (subdomain) {
                        try {
                            const { getTenantDb, tenantContext } = await import('@/lib/core/prisma');
                            const tenant = await prisma.tenant.findUnique({
                                where: { subdomain }
                            });

                            if (tenant?.dbUrl) {
                                const tenantDb = getTenantDb(tenant.dbUrl);
                                user = await tenantContext.run(tenantDb, () => getUser(email));
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

                        return {
                            id: user.id,
                            name: user.name,
                            email: user.email,
                            role: user.role,
                            rememberMe: remember,
                            isSuperAdmin: user.isSuperAdmin,
                        };
                    }
                }

                return null;
            },
        }),
    ],
});
