import type { NextAuthConfig } from 'next-auth';
import { SESSION_POLICY } from '@/lib/auth/session-policy';
import { getWorkspaceFromPath, canAccessWorkspace, getDefaultRedirectForUser } from '@/lib/auth/access-policy';
import { hasRole } from '@/lib/auth/roles';

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
        authorized({ auth, request: { nextUrl, headers } }) {
            try {
                const isLoggedIn = !!auth?.user;
                const pathname = nextUrl.pathname;
                const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'polyflow.uk';

                // NOTE: nextUrl.hostname returns "0.0.0.0" in Docker (internal bind address).
                // Use the Host header or x-forwarded-host for correct multi-tenant detection.
                let hostname = (headers.get('host') || '').split(':')[0];
                if (!hostname.endsWith(`.${rootDomain}`) && hostname !== rootDomain) {
                    // Fallback to x-forwarded-host (set by nginx proxy)
                    hostname = (headers.get('x-forwarded-host') || '').split(':')[0];
                }
                const isAdminSubdomain = hostname === `admin.${rootDomain}`;
                const isTenantSubdomain =
                    hostname !== rootDomain &&
                    hostname !== `www.${rootDomain}` &&
                    hostname !== `admin.${rootDomain}` &&
                    hostname.endsWith(`.${rootDomain}`);

                // Auth.js endpoints (csrf, callback, providers, session, etc.)
                // must always be reachable — they power the login form itself.
                // Blocking them (e.g. redirecting /api/auth/csrf to /login) makes
                // login impossible because the form can never fetch a CSRF token.
                if (pathname.startsWith('/api/auth')) return true;

                const isOnKiosk = pathname.startsWith('/kiosk');
                const isPublicPage = pathname === '/' || pathname === '/about' || pathname === '/features' || pathname === '/contact' || pathname === '/register';

                // Kiosk and Public pages are accessible without auth
                if (isOnKiosk || isPublicPage) return true;

                // === ADMIN SUBDOMAIN (admin.polyflow.uk) ===
                if (isAdminSubdomain) {
                    const isLoginPage = pathname === '/login';
                    // Short URL alias for the superadmin panel. proxy.ts rewrites this
                    // (internally, URL unchanged) to /admin/super-admin once this
                    // callback allows it through.
                    const isSuperAdminAlias = pathname === '/super-admin';

                    if (isLoginPage) {
                        // Already logged in as SuperAdmin → go to the panel
                        if (isLoggedIn) {
                            const user = auth.user as { isSuperAdmin?: boolean };
                            if (user.isSuperAdmin) {
                                return Response.redirect(new URL('/super-admin', nextUrl));
                            }
                        }
                        return true; // Show admin login page
                    }

                    // All other admin routes require SuperAdmin auth
                    if (!isLoggedIn) {
                        return Response.redirect(new URL('/login', nextUrl));
                    }

                    const user = auth.user as { isSuperAdmin?: boolean; impersonatedBy?: string };
                    // Allow impersonation sessions (tagged with impersonatedBy)
                    // to reach /admin/impersonate even though they're not
                    // superadmins — they're superadmin-acted-as-tenant-user.
                    const isImpersonating = !!user.impersonatedBy;
                    if (!user.isSuperAdmin && !isImpersonating) {
                        return Response.redirect(new URL('/login', nextUrl));
                    }

                    // admin.polyflow.uk only serves the superadmin panel
                    // (/super-admin alias + /admin/*), OR the impersonation
                    // view for sessions that are actively impersonating.
                    // Tenant/ERP routes like /dashboard, /warehouse,
                    // /production don't belong here — without this, navigating
                    // to an ERP path would render it against the main DB
                    // instead of the superadmin panel.
                    // /api/* is exempt — /api/admin/* endpoints (diagnostics,
                    // virtual-cs-metrics, etc.) are fetched by the admin UI and
                    // a redirect here would break System Health & other tools.
                    const isImpersonateView = pathname.startsWith('/admin/impersonate');
                    if (!isImpersonating && !isSuperAdminAlias && !pathname.startsWith('/admin') && !pathname.startsWith('/api/')) {
                        return Response.redirect(new URL('/super-admin', nextUrl));
                    }
                    // Impersonation sessions can ONLY access /admin/impersonate —
                    // everywhere else on admin.* they get bounced back there.
                    if (isImpersonating && !isImpersonateView) {
                        return Response.redirect(new URL('/admin/impersonate', nextUrl));
                    }

                    return true;
                }

                // === TENANT SUBDOMAIN (e.g. kiyowo.polyflow.uk) ===
                if (isTenantSubdomain) {
                    const workspace = getWorkspaceFromPath(pathname);

                    if (isLoggedIn) {
                        if (pathname === '/logout') return true;

                        const user = auth.user as { role?: string; roles?: string[]; isSuperAdmin?: boolean; allowedResources?: string[] };

                        // Mobile Sales Redirect logic
                        const userAgent = typeof headers.get === 'function' ? headers.get('user-agent') || '' : '';
                        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
                        const cookies = typeof headers.get === 'function' ? headers.get('cookie') || '' : '';
                        const hasMobileBypass = cookies.includes('bypass_mobile=true');

                        if (hasRole(user, 'SALES') && isMobile && !hasMobileBypass) {
                            // If they are not already on mobile sales pages, redirect them to /sales/mobile
                            if (!pathname.startsWith('/sales/mobile')) {
                                return Response.redirect(new URL('/sales/mobile', nextUrl));
                            }
                        }

                        if (workspace) {
                            if (!canAccessWorkspace(user, workspace, pathname)) {
                                const redirectUrl = getDefaultRedirectForUser(user);
                                return Response.redirect(new URL(redirectUrl, nextUrl));
                            }
                            return true;
                        }

                        // Tenant login page
                        const isLoginPage = pathname === '/login';
                        if (isLoginPage) {
                            return Response.redirect(new URL('/dashboard', nextUrl));
                        }

                        // Other tenant paths without workspace prefix — allow
                        return true;
                    }

                    // Unauthenticated tenant access
                    if (workspace) {
                        return false; // Redirect unauthenticated to login
                    }

                    const isLoginPage = pathname === '/login';
                    if (isLoginPage) {
                        return true;
                    }

                    // Other tenant paths without workspace prefix — allow
                    return true;
                }

                // === ROOT DOMAIN (polyflow.uk) ===
                // Landing page only — no login, no admin routes
                const isAdminRoute = pathname.startsWith('/admin');
                if (isAdminRoute) {
                    // Redirect admin routes to admin subdomain
                    return Response.redirect(new URL(`https://admin.${rootDomain}${pathname}`, nextUrl));
                }

                // Login on root domain → redirect to landing page
                // Users should log in at their tenant subdomain (e.g. kiyowo.polyflow.uk)
                if (pathname === '/login') {
                    if (isLoggedIn) {
                        const user = auth.user as { isSuperAdmin?: boolean };
                        if (user.isSuperAdmin) {
                            return Response.redirect(new URL(`https://admin.${rootDomain}/super-admin`, nextUrl));
                        }
                    }
                    return Response.redirect(new URL('/', nextUrl));
                }

                return true;
            } catch (error) {
                console.error('Authorization callback error:', error);
                return false;
            }
        },
        jwt({ token, user }) {
            if (user) {
                const u = user as {
                    id?: string;
                    role?: string;
                    roles?: string[];
                    rememberMe?: boolean;
                    isSuperAdmin?: boolean;
                    allowedResources?: string[];
                    tokenVersion?: number;
                    impersonatedBy?: string;
                    impersonationExpiresAt?: number;
                };
                token.role = u.role;
                token.roles = u.roles;
                token.id = u.id;
                token.rememberMe = u.rememberMe;
                token.isSuperAdmin = u.isSuperAdmin;
                token.allowedResources = u.allowedResources;
                token.tokenVersion = u.tokenVersion;
                token.lastActive = Math.floor(Date.now() / 1000);
                // Impersonation claims — only present on sessions started via
                // impersonateTenant(). Propagate to token so session()/authorized()
                // can read them.
                if (u.impersonatedBy) {
                    token.impersonatedBy = u.impersonatedBy;
                    token.impersonationExpiresAt = u.impersonationExpiresAt;
                }
            }

            const now = Math.floor(Date.now() / 1000);

            // Impersonation hard-expiry (30 min): kill session past expiry.
            // Checked on every JWT read.
            if (token.impersonationExpiresAt && now > (token.impersonationExpiresAt as number)) {
                return null;
            }

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
                (session.user as { roles?: unknown }).roles = token.roles;
                (session.user as { id?: unknown }).id = token.id;
                (session.user as { isSuperAdmin?: unknown }).isSuperAdmin = token.isSuperAdmin;
                (session.user as { allowedResources?: unknown }).allowedResources = token.allowedResources;
                (session.user as { tokenVersion?: unknown }).tokenVersion = token.tokenVersion;
                (session.user as { impersonatedBy?: unknown }).impersonatedBy = token.impersonatedBy;
                (session.user as { impersonationExpiresAt?: unknown }).impersonationExpiresAt = token.impersonationExpiresAt;
            }
            return session;
        },
    },
    providers: [], // Add providers with an empty array for now
    trustHost: true,
} satisfies NextAuthConfig;
