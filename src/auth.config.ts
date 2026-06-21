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

                const isOnKiosk = pathname.startsWith('/kiosk');
                const isPublicPage = pathname === '/' || pathname === '/about' || pathname === '/features' || pathname === '/contact' || pathname === '/register' || pathname === '/admin-login';

                // Kiosk and Public pages are accessible without auth
                if (isOnKiosk || isPublicPage) return true;

                const workspace = getWorkspaceFromPath(pathname);

                if (workspace) {
                    if (isLoggedIn) {
                        // Allow access to logout page to break redirect loops
                        if (pathname === '/logout') return true;

                        const user = auth.user as { role?: string; isSuperAdmin?: boolean };

                        // Check central access policy
                        if (!canAccessWorkspace(user, workspace)) {
                            const redirectUrl = getDefaultRedirectForUser(user);
                            return Response.redirect(new URL(redirectUrl, nextUrl));
                        }

                        return true;
                    }
                    return false; // Redirect unauthenticated users to login page
                } else if (isLoggedIn) {
                    const isLoginPage = pathname === '/login' || pathname === '/admin-login';

                    if (isLoginPage) {
                        // Check if this is a tenant subdomain login (e.g. kiyowo.polyflow.uk/login)
                        // Don't redirect — let the user see the tenant role selection page
                        // so they can switch workspaces or log in with different credentials
                        const hostname = nextUrl.hostname;
                        const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'polyflow.uk';
                        const isTenantLogin =
                            hostname !== rootDomain &&
                            hostname !== `www.${rootDomain}` &&
                            hostname.endsWith(`.${rootDomain}`);

                        if (isTenantLogin) {
                            return true; // Allow tenant login page for workspace switching
                        }

                        const user = auth.user as { role?: string; isSuperAdmin?: boolean };
                        const targetPath = getDefaultRedirectForUser(user);
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
