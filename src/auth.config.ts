import type { NextAuthConfig } from 'next-auth';

export const authConfig = {
    pages: {
        signIn: '/login',
    },
    callbacks: {
        authorized({ auth, request: { nextUrl } }) {
            const isLoggedIn = !!auth?.user;
            const isOnDashboard = nextUrl.pathname.startsWith('/dashboard');
            if (isOnDashboard) {
                if (isLoggedIn) return true;
                return false; // Redirect unauthenticated users to login page
            } else if (isLoggedIn) {
                return Response.redirect(new URL('/dashboard', nextUrl));
            }
            return true;
        },
        jwt({ token, user }) {
            if (user) {
                token.role = (user as { role?: string }).role;
                token.id = user.id;
            }
            return token;
        },
        session({ session, token }) {
            if (session.user) {
                (session.user as { role?: unknown }).role = token.role;
                (session.user as { id?: unknown }).id = token.id;
            }
            return session;
        },
    },
    providers: [], // Add providers with an empty array for now
    trustHost: true,
} satisfies NextAuthConfig;
