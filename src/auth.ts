import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { authConfig } from './auth.config';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
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
            async authorize(credentials) {
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
                    const user = await getUser(email);

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

                        return {
                            id: user.id,
                            name: user.name,
                            email: user.email,
                            role: user.role,
                            rememberMe: remember,
                        };
                    }
                }

                return null;
            },
        }),
    ],
});
