import type { NextAuthConfig } from 'next-auth';

export const authConfig = {
    pages: {
        signIn: '/login',
    },
    session: {
        strategy: 'jwt',
        maxAge: 24 * 60 * 60, // 24 hours
    },
    cookies: {
        sessionToken: {
            name: `__Secure-authjs.session-token`,
            options: {
                httpOnly: true,
                sameSite: 'lax',
                path: '/',
                secure: true,
            },
        },
    },
    callbacks: {
        authorized({ auth, request: { nextUrl } }) {
            try {
                const isLoggedIn = !!auth?.user;
                const pathname = nextUrl.pathname;

                const isOnDashboard = pathname.startsWith('/dashboard');
                const isOnKiosk = pathname.startsWith('/kiosk');
                const isOnWarehouse = pathname.startsWith('/warehouse');
                const isOnProduction = pathname.startsWith('/production');
                const isOnFinance = pathname.startsWith('/finance');
                const isOnSales = pathname.startsWith('/sales');
                const isOnPlanning = pathname.startsWith('/planning');

                // Kiosk is public
                if (isOnKiosk) return true;

                if (isOnDashboard || isOnWarehouse || isOnProduction || isOnFinance || isOnSales || isOnPlanning) {
                    if (isLoggedIn) {
                        // Allow access to logout page to break redirect loops
                        if (pathname === '/logout') return true;

                        const userRole = (auth?.user as { role?: string })?.role;

                        // ADMIN can go anywhere
                        if (userRole === 'ADMIN') return true;

                        // Strict Workspace Isolation
                        if (userRole === 'WAREHOUSE') {
                            // Warehouse user trying to access other workspaces -> Redirect to Warehouse
                            if (!isOnWarehouse) {
                                return Response.redirect(new URL('/warehouse', nextUrl));
                            }
                        } else if (userRole === 'PRODUCTION') {
                            // Production user trying to access other workspaces -> Redirect to Production
                            if (!isOnProduction) {
                                return Response.redirect(new URL('/production', nextUrl));
                            }
                        } else if (['FINANCE', 'SALES', 'PLANNING'].includes(userRole || '')) {
                            // These roles should stay in their respective areas or dashboard
                            // For now, allow dashboard + sales/finance/planning
                            if (isOnWarehouse || isOnProduction) {
                                return Response.redirect(new URL('/dashboard', nextUrl));
                            }
                        }

                        return true;
                    }
                    return false; // Redirect unauthenticated users to login page
                } else if (isLoggedIn) {
                    const isLoginPage = pathname === '/login';
                    const isRootPage = pathname === '/';

                    if (isLoginPage || isRootPage) {
                        const userRole = (auth?.user as { role?: string })?.role;
                        let targetPath = '/dashboard';
                        if (userRole === 'WAREHOUSE') targetPath = '/warehouse';
                        if (userRole === 'PRODUCTION') targetPath = '/production';

                        return Response.redirect(new URL(targetPath, nextUrl));
                    }
                }
                return true;
            } catch (error) {
                console.error('Authorization callback error:', error);
                return false;
            }
        },
        jwt({ token, user }) {
            if (user) {
                const u = user as { id?: string; role?: string; rememberMe?: boolean };
                token.role = u.role;
                token.id = u.id;
                token.rememberMe = u.rememberMe;
                token.lastActive = Math.floor(Date.now() / 1000);
            }

            const now = Math.floor(Date.now() / 1000);
            const TWO_HOURS = 2 * 60 * 60;

            // Check for idle timeout if not "Remember Me"
            if (!token.rememberMe) {
                if (token.lastActive && (now - (token.lastActive as number) > TWO_HOURS)) {
                    // This will effectively sign out the user on the next server-side check
                    return null;
                }
            }

            token.lastActive = now; // Update activity timestamp
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
