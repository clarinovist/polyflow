import type { NextAuthConfig } from 'next-auth';

export const authConfig = {
    pages: {
        signIn: '/login',
    },
    session: {
        strategy: 'jwt',
        maxAge: 30 * 24 * 60 * 60, // 30 days
    },
    callbacks: {
        authorized({ auth, request: { nextUrl } }) {
            try {
                const isLoggedIn = !!auth?.user;

                // Strip locale from pathname to normalize checks
                // Matches /id, /en, /id/..., /en/...
                const pathWithoutLocale = nextUrl.pathname.replace(/^\/(?:id|en)(?:\/|$)/, '/');
                // Ensure it starts with / if it became empty string (unlikely with replace logic but safe to be sure)
                const normalizedPath = pathWithoutLocale === '' ? '/' : pathWithoutLocale;

                const isOnDashboard = normalizedPath.startsWith('/dashboard');
                const isOnKiosk = normalizedPath.startsWith('/kiosk');
                const isOnWarehouse = normalizedPath.startsWith('/warehouse');
                const isOnProduction = normalizedPath.startsWith('/production');

                // Kiosk is public
                if (isOnKiosk) return true;

                if (isOnDashboard || isOnWarehouse || isOnProduction) {
                    if (isLoggedIn) {
                        // Allow access to logout page to break redirect loops
                        if (nextUrl.pathname === '/logout') return true;

                        const userRole = (auth?.user as { role?: string })?.role;

                        // ADMIN can go anywhere
                        if (userRole === 'ADMIN') return true;

                        // Strict Workspace Isolation
                        if (userRole === 'WAREHOUSE') {
                            // Warehouse user trying to access Dashboard or Production -> Redirect to Warehouse
                            if (isOnDashboard || isOnProduction) {
                                const locale = nextUrl.pathname.split('/')[1];
                                const prefix = ['id', 'en'].includes(locale) ? `/${locale}` : '';
                                return Response.redirect(new URL(`${prefix}/warehouse`, nextUrl));
                            }
                        } else if (userRole === 'PRODUCTION') {
                            // Production user trying to access Warehouse -> Redirect to Production
                            if (isOnWarehouse) {
                                const locale = nextUrl.pathname.split('/')[1];
                                const prefix = ['id', 'en'].includes(locale) ? `/${locale}` : '';
                                return Response.redirect(new URL(`${prefix}/production`, nextUrl));
                            }
                        } else if (userRole === 'FINANCE' || userRole === 'SALES' || userRole === 'PPIC') {
                            // These roles stay in /dashboard, but should be blocked from /warehouse and /production
                            if (isOnWarehouse || isOnProduction) {
                                const locale = nextUrl.pathname.split('/')[1];
                                const prefix = ['id', 'en'].includes(locale) ? `/${locale}` : '';
                                return Response.redirect(new URL(`${prefix}/dashboard`, nextUrl));
                            }
                        }

                        return true;
                    }
                    return false; // Redirect unauthenticated users to login page
                } else if (isLoggedIn) {
                    const isLoginPage = normalizedPath === '/login';
                    const isRootPage = normalizedPath === '/';

                    if (isLoginPage || isRootPage) {
                        const userRole = (auth?.user as { role?: string })?.role;
                        let targetPath = '/dashboard';
                        if (userRole === 'WAREHOUSE') targetPath = '/warehouse';
                        if (userRole === 'PRODUCTION') targetPath = '/production';
                        if (userRole === 'FINANCE') targetPath = '/dashboard';

                        // Construct locale-aware URL
                        const locale = nextUrl.pathname.split('/')[1];
                        const hasLocale = ['id', 'en'].includes(locale);
                        const targetUrlPath = hasLocale ? `/${locale}${targetPath}` : targetPath;

                        return Response.redirect(new URL(targetUrlPath, nextUrl));
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
