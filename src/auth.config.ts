import type { NextAuthConfig } from 'next-auth';
import { SESSION_POLICY } from '@/lib/auth/session-policy';
import { getWorkspaceFromPath, canAccessWorkspace, getDefaultRedirectForUser } from '@/lib/auth/access-policy';

export const authConfig = {
    pages: {
        signIn: '/login',
    },
    session: {
        strategy: 'jwt',
        // maxAge is controlled by the NextAuth instance in auth.ts now (30 days for remember me)
    },
    cookies: {
        sessionToken: {
            name: process.env.NODE_ENV === 'production'
                ? `__Secure-authjs.session-token`
                : `authjs.session-token`,
            options: {
                httpOnly: true,
                sameSite: 'lax',
                path: '/',
                secure: process.env.NODE_ENV === 'production',
            },
        },
    },
    callbacks: {
        // Fix: redirect to relative path when NEXTAUTH_URL is not set (multi-tenant)
        async redirect({ url, baseUrl }) {
            // When baseUrl is the Docker fallback (NEXTAUTH_URL not set),
            // use relative path so user stays on the same tenant domain
            if (baseUrl.includes('0.0.0.0') || baseUrl.includes('localhost:3000')) {
                try {
                    const urlObj = new URL(url);
                    // Return only pathname + search, keeping tenant domain intact
                    return urlObj.pathname + (urlObj.search || '');
                } catch {
                    return '/login';
                }
            }
            return url;
        },
        authorized({ auth, request: { nextUrl } }) {
            try {
                const isLoggedIn = !!auth?.user;
                const pathname = nextUrl.pathname;
                const hostname = nextUrl.hostname;
                const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'polyflow.uk';

                // Detect which domain context we're on
                const isAdminSubdomain = hostname === `admin.${rootDomain}`;
                const isTenantSubdomain =
                    hostname !== rootDomain &&
                    hostname !== `www.${rootDomain}` &&
                    hostname !== `admin.${rootDomain}` &&
                    hostname.endsWith(`.${rootDomain}`);

                const isOnKiosk = pathname.startsWith('/kiosk');
                const isPublicPage = pathname === '/' || pathname === '/about' || pathname === '/features' || pathname === '/contact' || pathname === '/register';

                // Kiosk and Public pages are accessible without auth
                if (isOnKiosk || isPublicPage) return true;

                // === ADMIN SUBDOMAIN (admin.polyflow.uk) ===
                if (isAdminSubdomain) {
                    const isLoginPage = pathname === '/login';

                    if (isLoginPage) {
                        // Already logged in as SuperAdmin → go to dashboard
                        if (isLoggedIn) {
                            const user = auth.user as { isSuperAdmin?: boolean };
                            if (user.isSuperAdmin) {
                                return Response.redirect(new URL('/admin/super-admin', nextUrl));
                            }
                        }
                        return true; // Show admin login page
                    }

                    // All other admin routes require SuperAdmin auth
                    if (!isLoggedIn) {
                        return Response.redirect(new URL('/login', nextUrl));
                    }

                    const user = auth.user as { isSuperAdmin?: boolean };
                    if (!user.isSuperAdmin) {
                        return Response.redirect(new URL('/login', nextUrl));
                    }

                    return true;
                }

                // === TENANT SUBDOMAIN (e.g. kiyowo.polyflow.uk) ===
                if (isTenantSubdomain) {
                    const workspace = getWorkspaceFromPath(pathname);

                    if (workspace) {
                        if (isLoggedIn) {
                            if (pathname === '/logout') return true;

                            const user = auth.user as { role?: string; isSuperAdmin?: boolean };
                            if (!canAccessWorkspace(user, workspace)) {
                                const redirectUrl = getDefaultRedirectForUser(user);
                                return Response.redirect(new URL(redirectUrl, nextUrl));
                            }
                            return true;
                        }
                        return false; // Redirect unauthenticated to login
                    }

                    // Tenant login page
                    const isLoginPage = pathname === '/login';
                    if (isLoginPage) {
                        return true; // Always show tenant login (allows workspace switching)
                    }

                    // Other tenant paths without workspace prefix — allow
                    return true;
                }

                // === ROOT DOMAIN (polyflow.uk) ===
                // Pure workspace discovery — no admin routes here
                const isAdminRoute = pathname.startsWith('/admin');
                if (isAdminRoute) {
                    // Redirect admin routes to admin subdomain
                    return Response.redirect(new URL(`https://admin.${rootDomain}${pathname}`, nextUrl));
                }

                // Login on root domain → show workspace discovery
                if (pathname === '/login') {
                    if (isLoggedIn) {
                        // Logged-in user on root login → send to admin subdomain if SuperAdmin
                        const user = auth.user as { isSuperAdmin?: boolean };
                        if (user.isSuperAdmin) {
                            return Response.redirect(new URL(`https://admin.${rootDomain}/admin/super-admin`, nextUrl));
                        }
                    }
                    return true; // Show workspace discovery
                }

                return true;
            } catch (error) {
                console.error('Authorization callback error:', error);
                return false;
            }
        },
        jwt({ token, user }) {
            if (user) {
                const u = user as { id?: string; role?: string; rememberMe?: boolean; isSuperAdmin?: boolean };
                token.role = u.role;
                token.id = u.id;
                token.rememberMe = u.rememberMe;
                token.isSuperAdmin = u.isSuperAdmin;
                token.lastActive = Math.floor(Date.now() / 1000);
            }

            const now = Math.floor(Date.now() / 1000);

            // Check for idle timeout if not "Remember Me"
            if (!token.rememberMe) {
                if (token.lastActive && (now - (token.lastActive as number) > SESSION_POLICY.serverJwtIdleTimeoutSeconds)) {
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
                (session.user as { isSuperAdmin?: unknown }).isSuperAdmin = token.isSuperAdmin;
            }
            return session;
        },
    },
    providers: [], // Add providers with an empty array for now
    trustHost: true,
} satisfies NextAuthConfig;
