import type { NextAuthConfig } from 'next-auth';

export const authConfig = {
    pages: {
        signIn: '/login',
    },
    callbacks: {
        authorized({ auth, request: { nextUrl } }) {
            try {
                const isLoggedIn = !!auth?.user;
                const isOnDashboard = nextUrl.pathname.startsWith('/dashboard');
                const isOnKiosk = nextUrl.pathname.startsWith('/kiosk');
                const isOnWarehouse = nextUrl.pathname.startsWith('/warehouse');

                // Kiosk is public
                if (isOnKiosk) return true;

                if (isOnDashboard || isOnWarehouse) {
                    if (isLoggedIn) {
                        // Allow access to logout page to break redirect loops
                        if (nextUrl.pathname === '/logout') return true;

                        const userRole = (auth?.user as { role?: string })?.role;

                        // ADMIN can go anywhere
                        if (userRole === 'ADMIN') return true;

                        // Strict Workspace Isolation
                        if (userRole === 'WAREHOUSE') {
                            // Warehouse user trying to access Dashboard -> Redirect to Warehouse
                            if (isOnDashboard) {
                                return Response.redirect(new URL('/warehouse', nextUrl));
                            }
                        } else {
                            // Non-Warehouse/Non-Admin user (e.g. SALES, PPIC) trying to access Warehouse -> Redirect to Dashboard
                            if (isOnWarehouse) {
                                return Response.redirect(new URL('/dashboard', nextUrl));
                            }
                        }

                        return true;
                    }
                    return false; // Redirect unauthenticated users to login page
                } else if (isLoggedIn) {
                    // Default redirect for root "/"
                    if (nextUrl.pathname === '/') {
                        const userRole = (auth?.user as { role?: string })?.role;
                        const targetUrl = userRole === 'WAREHOUSE' ? '/warehouse' : '/dashboard';
                        return Response.redirect(new URL(targetUrl, nextUrl));
                    }
                }
                return true;
            } catch (error) {
                console.error('Authorization callback error:', error);
                return false; // Deny access on error during auth check
            }
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
