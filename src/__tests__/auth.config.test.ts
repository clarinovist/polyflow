import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
vi.mock('@/lib/auth/session-policy', () => ({
    SESSION_POLICY: {
        idleTimeoutMs: 30 * 60 * 1000,
        idleTimeoutSeconds: 30 * 60,
        rememberMeMaxAgeSeconds: 30 * 24 * 60 * 60,
        defaultMaxAgeSeconds: 30 * 24 * 60 * 60,
        serverJwtIdleTimeoutSeconds: 2 * 60 * 60,
    },
}));

vi.mock('@/lib/auth/access-policy', () => ({
    getWorkspaceFromPath: vi.fn(),
    canAccessWorkspace: vi.fn(),
    getDefaultRedirectForUser: vi.fn(),
}));

describe('auth.config', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubEnv('NEXT_PUBLIC_ROOT_DOMAIN', 'polyflow.uk');
    });

    describe('redirect callback', () => {
        it('should return relative path when baseUrl contains 0.0.0.0', async () => {
            // Arrange
            const { authConfig } = await import('@/auth.config');
            const redirectCallback = authConfig.callbacks!.redirect!;

            // Act
            const result = await redirectCallback({
                url: 'http://0.0.0.0:3000/dashboard?tab=overview',
                baseUrl: 'http://0.0.0.0:3000',
            });

            // Assert
            expect(result).toBe('/dashboard?tab=overview');
        });

        it('should return relative path when baseUrl contains localhost:3000', async () => {
            // Arrange
            const { authConfig } = await import('@/auth.config');
            const redirectCallback = authConfig.callbacks!.redirect!;

            // Act
            const result = await redirectCallback({
                url: 'http://localhost:3000/admin/users',
                baseUrl: 'http://localhost:3000',
            });

            // Assert
            expect(result).toBe('/admin/users');
        });

        it('should return /login when URL parsing fails', async () => {
            // Arrange
            const { authConfig } = await import('@/auth.config');
            const redirectCallback = authConfig.callbacks!.redirect!;

            // Act
            const result = await redirectCallback({
                url: 'invalid-url',
                baseUrl: 'http://0.0.0.0:3000',
            });

            // Assert
            expect(result).toBe('/login');
        });

        it('should return original url when baseUrl is normal', async () => {
            // Arrange
            const { authConfig } = await import('@/auth.config');
            const redirectCallback = authConfig.callbacks!.redirect!;
            const url = 'https://kiyowo.polyflow.uk/dashboard';

            // Act
            const result = await redirectCallback({
                url,
                baseUrl: 'https://kiyowo.polyflow.uk',
            });

            // Assert
            expect(result).toBe(url);
        });
    });

    describe('jwt callback', () => {
        it('should set user properties on token when user exists', async () => {
            // Arrange
            const { authConfig } = await import('@/auth.config');
            const jwtCallback = authConfig.callbacks!.jwt!;
            const mockUser = {
                id: 'user-1',
                role: 'ADMIN',
                rememberMe: true,
                isSuperAdmin: false,
            };

            // Act
            const result = await jwtCallback({
                token: {},
                user: mockUser,
            } as any);

            // Assert
            expect(result).toMatchObject({
                role: 'ADMIN',
                id: 'user-1',
                rememberMe: true,
                isSuperAdmin: false,
            });
            expect(result!.lastActive).toBeDefined();
        });

        it('should return null when session is idle and not remember me', async () => {
            // Arrange
            const { authConfig } = await import('@/auth.config');
            const jwtCallback = authConfig.callbacks!.jwt!;
            const threeHoursAgo = Math.floor(Date.now() / 1000) - 3 * 60 * 60;

            // Act
            const result = await jwtCallback({
                token: {
                    rememberMe: false,
                    lastActive: threeHoursAgo,
                },
            } as any);

            // Assert
            expect(result).toBeNull();
        });

        it('should keep token when session is active', async () => {
            // Arrange
            const { authConfig } = await import('@/auth.config');
            const jwtCallback = authConfig.callbacks!.jwt!;
            const recentTime = Math.floor(Date.now() / 1000) - 60; // 1 minute ago

            // Act
            const result = await jwtCallback({
                token: {
                    rememberMe: false,
                    lastActive: recentTime,
                },
            } as any);

            // Assert
            expect(result).toBeDefined();
            expect(result!.lastActive).toBeGreaterThan(recentTime);
        });

        it('should keep token when remember me is true even if idle', async () => {
            // Arrange
            const { authConfig } = await import('@/auth.config');
            const jwtCallback = authConfig.callbacks!.jwt!;
            const threeHoursAgo = Math.floor(Date.now() / 1000) - 3 * 60 * 60;

            // Act
            const result = await jwtCallback({
                token: {
                    rememberMe: true,
                    lastActive: threeHoursAgo,
                },
            } as any);

            // Assert
            expect(result).toBeDefined();
        });
    });

    describe('session callback', () => {
        it('should set user properties from token', async () => {
            // Arrange
            const { authConfig } = await import('@/auth.config');
            const sessionCallback = authConfig.callbacks!.session!;
            const mockSession = {
                user: {},
                expires: '2024-12-31',
            };
            const mockToken = {
                role: 'ADMIN',
                id: 'user-1',
                isSuperAdmin: true,
            };

            // Act
            const result = await sessionCallback({
                session: mockSession,
                token: mockToken,
            } as any);

            // Assert
            expect((result.user as any).role).toBe('ADMIN');
            expect((result.user as any).id).toBe('user-1');
            expect((result.user as any).isSuperAdmin).toBe(true);
        });
    });

    describe('authorized callback', () => {
        it('should allow access to kiosk pages without auth', async () => {
            // Arrange
            const { authConfig } = await import('@/auth.config');
            const authorizedCallback = authConfig.callbacks!.authorized!;

            // Act
            const result = await authorizedCallback({
                auth: null,
                request: {
                    nextUrl: { pathname: '/kiosk/display' },
                    headers: new Map([['host', 'kiyowo.polyflow.uk']]),
                },
            } as any);

            // Assert
            expect(result).toBe(true);
        });

        it('should allow access to public pages without auth', async () => {
            // Arrange
            const { authConfig } = await import('@/auth.config');
            const authorizedCallback = authConfig.callbacks!.authorized!;

            // Act
            const result = await authorizedCallback({
                auth: null,
                request: {
                    nextUrl: { pathname: '/about' },
                    headers: new Map([['host', 'polyflow.uk']]),
                },
            } as any);

            // Assert
            expect(result).toBe(true);
        });

        it('should redirect to login when accessing tenant workspace without auth', async () => {
            // Arrange
            const { authConfig } = await import('@/auth.config');
            const { getWorkspaceFromPath } = await import('@/lib/auth/access-policy');
            const authorizedCallback = authConfig.callbacks!.authorized!;

            vi.mocked(getWorkspaceFromPath).mockReturnValue('warehouse');

            // Act
            const result = await authorizedCallback({
                auth: null,
                request: {
                    nextUrl: { pathname: '/warehouse/inventory' },
                    headers: new Map([['host', 'kiyowo.polyflow.uk']]),
                },
            } as any);

            // Assert
            expect(result).toBe(false);
        });

        it('should soft-land SALES user on mobile /dashboard to /field/sales', async () => {
            // Arrange
            const { authConfig } = await import('@/auth.config');
            const { getWorkspaceFromPath } = await import('@/lib/auth/access-policy');
            const authorizedCallback = authConfig.callbacks!.authorized!;

            vi.mocked(getWorkspaceFromPath).mockReturnValue('dashboard');
            
            const mockRedirect = vi.fn();
            const originalRedirect = Response.redirect;
            Response.redirect = mockRedirect;

            try {
                // Act
                await authorizedCallback({
                    auth: { user: { role: 'SALES' } },
                    request: {
                        nextUrl: new URL('https://kiyowo.polyflow.uk/dashboard'),
                        headers: new Map([
                            ['host', 'kiyowo.polyflow.uk'],
                            ['user-agent', 'Mozilla/5.0 (iPhone; CPU iPhone OS 13_2_3 like Mac OS X) AppleWebKit/605.1.15'],
                        ]),
                    },
                } as any);

                // Assert — /dashboard soft-lands to /field/sales for SALES
                expect(mockRedirect).toHaveBeenCalled();
                const redirectUrl = mockRedirect.mock.calls[0][0];
                expect(redirectUrl.pathname).toBe('/field/sales');
            } finally {
                Response.redirect = originalRedirect;
            }
        });

        it('should soft-land SALES user on mobile /dashboard even with bypass cookie', async () => {
            // Arrange
            const { authConfig } = await import('@/auth.config');
            const { getWorkspaceFromPath, canAccessWorkspace } = await import('@/lib/auth/access-policy');
            const authorizedCallback = authConfig.callbacks!.authorized!;

            vi.mocked(getWorkspaceFromPath).mockReturnValue('dashboard');
            vi.mocked(canAccessWorkspace).mockReturnValue(true);
            
            const mockRedirect = vi.fn();
            const originalRedirect = Response.redirect;
            Response.redirect = mockRedirect;

            try {
                // Act — SALES + bypass cookie on /dashboard → still soft-lands to /field/sales
                await authorizedCallback({
                    auth: { user: { role: 'SALES' } },
                    request: {
                        nextUrl: new URL('https://kiyowo.polyflow.uk/dashboard'),
                        headers: new Map([
                            ['host', 'kiyowo.polyflow.uk'],
                            ['user-agent', 'Mozilla/5.0 (iPhone; CPU iPhone OS 13_2_3 like Mac OS X) AppleWebKit/605.1.15'],
                            ['cookie', 'bypass_mobile=true'],
                        ]),
                    },
                } as any);

                // Assert — SALES bypass cookie doesn't help for /dashboard, soft-lands
                expect(mockRedirect).toHaveBeenCalled();
                const redirectUrl = mockRedirect.mock.calls[0][0];
                expect(redirectUrl.pathname).toBe('/field/sales');
            } finally {
                Response.redirect = originalRedirect;
            }
        });

        // === Mobile allowlist gate tests ===

        it('should redirect FINANCE on mobile to /device/desktop-required', async () => {
            const { authConfig } = await import('@/auth.config');
            const { getWorkspaceFromPath } = await import('@/lib/auth/access-policy');
            const authorizedCallback = authConfig.callbacks!.authorized!;

            vi.mocked(getWorkspaceFromPath).mockReturnValue('finance');

            const mockRedirect = vi.fn();
            const originalRedirect = Response.redirect;
            Response.redirect = mockRedirect;

            try {
                await authorizedCallback({
                    auth: { user: { role: 'FINANCE' } },
                    request: {
                        nextUrl: new URL('https://kiyowo.polyflow.uk/finance/journals'),
                        headers: new Map([
                            ['host', 'kiyowo.polyflow.uk'],
                            ['user-agent', 'Mozilla/5.0 (iPhone; CPU iPhone OS 13_2_3 like Mac OS X)'],
                        ]),
                    },
                } as any);

                expect(mockRedirect).toHaveBeenCalled();
                const redirectUrl = mockRedirect.mock.calls[0][0];
                expect(redirectUrl.pathname).toBe('/device/desktop-required');
            } finally {
                Response.redirect = originalRedirect;
            }
        });

        it('should allow ADMIN on mobile with bypass cookie to access /finance', async () => {
            const { authConfig } = await import('@/auth.config');
            const { getWorkspaceFromPath, canAccessWorkspace } = await import('@/lib/auth/access-policy');
            const authorizedCallback = authConfig.callbacks!.authorized!;

            vi.mocked(getWorkspaceFromPath).mockReturnValue('finance');
            vi.mocked(canAccessWorkspace).mockReturnValue(true);

            const mockRedirect = vi.fn();
            const originalRedirect = Response.redirect;
            Response.redirect = mockRedirect;

            try {
                const result = await authorizedCallback({
                    auth: { user: { role: 'ADMIN' } },
                    request: {
                        nextUrl: new URL('https://kiyowo.polyflow.uk/finance'),
                        headers: new Map([
                            ['host', 'kiyowo.polyflow.uk'],
                            ['user-agent', 'Mozilla/5.0 (iPhone; CPU iPhone OS 13_2_3 like Mac OS X)'],
                            ['cookie', 'bypass_mobile=true'],
                        ]),
                    },
                } as any);

                expect(mockRedirect).not.toHaveBeenCalled();
                expect(result).toBe(true);
            } finally {
                Response.redirect = originalRedirect;
            }
        });

        it('should allow mobile user on /kiosk (allowlisted)', async () => {
            const { authConfig } = await import('@/auth.config');
            const authorizedCallback = authConfig.callbacks!.authorized!;

            const mockRedirect = vi.fn();
            const originalRedirect = Response.redirect;
            Response.redirect = mockRedirect;

            try {
                const result = await authorizedCallback({
                    auth: { user: { role: 'PRODUCTION' } },
                    request: {
                        nextUrl: new URL('https://kiyowo.polyflow.uk/kiosk'),
                        headers: new Map([
                            ['host', 'kiyowo.polyflow.uk'],
                            ['user-agent', 'Mozilla/5.0 (Linux; Android 10)'],
                        ]),
                    },
                } as any);

                expect(mockRedirect).not.toHaveBeenCalled();
                expect(result).toBe(true);
            } finally {
                Response.redirect = originalRedirect;
            }
        });

        it('should allow mobile user on /my (allowlisted)', async () => {
            const { authConfig } = await import('@/auth.config');
            const authorizedCallback = authConfig.callbacks!.authorized!;

            const mockRedirect = vi.fn();
            const originalRedirect = Response.redirect;
            Response.redirect = mockRedirect;

            try {
                const result = await authorizedCallback({
                    auth: { user: { role: 'PRODUCTION' } },
                    request: {
                        nextUrl: new URL('https://kiyowo.polyflow.uk/my'),
                        headers: new Map([
                            ['host', 'kiyowo.polyflow.uk'],
                            ['user-agent', 'Mozilla/5.0 (iPhone; CPU iPhone OS 13_2_3 like Mac OS X)'],
                        ]),
                    },
                } as any);

                expect(mockRedirect).not.toHaveBeenCalled();
                expect(result).toBe(true);
            } finally {
                Response.redirect = originalRedirect;
            }
        });

        it('should soft-land SALES on /sales/orders to /field/sales', async () => {
            const { authConfig } = await import('@/auth.config');
            const authorizedCallback = authConfig.callbacks!.authorized!;

            const mockRedirect = vi.fn();
            const originalRedirect = Response.redirect;
            Response.redirect = mockRedirect;

            try {
                await authorizedCallback({
                    auth: { user: { role: 'SALES' } },
                    request: {
                        nextUrl: new URL('https://kiyowo.polyflow.uk/sales/orders'),
                        headers: new Map([
                            ['host', 'kiyowo.polyflow.uk'],
                            ['user-agent', 'Mozilla/5.0 (iPhone; CPU iPhone OS 13_2_3 like Mac OS X)'],
                        ]),
                    },
                } as any);

                expect(mockRedirect).toHaveBeenCalled();
                const redirectUrl = mockRedirect.mock.calls[0][0];
                expect(redirectUrl.pathname).toBe('/field/sales');
            } finally {
                Response.redirect = originalRedirect;
            }
        });

        it('should soft-land PRODUCTION on mobile /production/orders to /kiosk', async () => {
            const { authConfig } = await import('@/auth.config');
            const { getWorkspaceFromPath } = await import('@/lib/auth/access-policy');
            const authorizedCallback = authConfig.callbacks!.authorized!;

            vi.mocked(getWorkspaceFromPath).mockReturnValue('production');

            const mockRedirect = vi.fn();
            const originalRedirect = Response.redirect;
            Response.redirect = mockRedirect;

            try {
                await authorizedCallback({
                    auth: { user: { role: 'PRODUCTION' } },
                    request: {
                        nextUrl: new URL('https://kiyowo.polyflow.uk/production/orders'),
                        headers: new Map([
                            ['host', 'kiyowo.polyflow.uk'],
                            ['user-agent', 'Mozilla/5.0 (iPhone; CPU iPhone OS 13_2_3 like Mac OS X)'],
                        ]),
                    },
                } as any);

                expect(mockRedirect).toHaveBeenCalled();
                const redirectUrl = mockRedirect.mock.calls[0][0];
                expect(redirectUrl.pathname).toBe('/kiosk');
            } finally {
                Response.redirect = originalRedirect;
            }
        });

        it('should allow WAREHOUSE on mobile /warehouse/mobile (allowlisted)', async () => {
            const { authConfig } = await import('@/auth.config');
            const authorizedCallback = authConfig.callbacks!.authorized!;

            const mockRedirect = vi.fn();
            const originalRedirect = Response.redirect;
            Response.redirect = mockRedirect;

            try {
                const result = await authorizedCallback({
                    auth: { user: { role: 'WAREHOUSE' } },
                    request: {
                        nextUrl: new URL('https://kiyowo.polyflow.uk/warehouse/mobile'),
                        headers: new Map([
                            ['host', 'kiyowo.polyflow.uk'],
                            ['user-agent', 'Mozilla/5.0 (iPhone; CPU iPhone OS 13_2_3 like Mac OS X)'],
                        ]),
                    },
                } as any);

                expect(mockRedirect).not.toHaveBeenCalled();
                expect(result).toBe(true);
            } finally {
                Response.redirect = originalRedirect;
            }
        });

        it('should soft-land WAREHOUSE on mobile /warehouse to /warehouse/mobile', async () => {
            const { authConfig } = await import('@/auth.config');
            const { getWorkspaceFromPath } = await import('@/lib/auth/access-policy');
            const authorizedCallback = authConfig.callbacks!.authorized!;

            vi.mocked(getWorkspaceFromPath).mockReturnValue('warehouse');

            const mockRedirect = vi.fn();
            const originalRedirect = Response.redirect;
            Response.redirect = mockRedirect;

            try {
                await authorizedCallback({
                    auth: { user: { role: 'WAREHOUSE' } },
                    request: {
                        nextUrl: new URL('https://kiyowo.polyflow.uk/warehouse'),
                        headers: new Map([
                            ['host', 'kiyowo.polyflow.uk'],
                            ['user-agent', 'Mozilla/5.0 (iPhone; CPU iPhone OS 13_2_3 like Mac OS X)'],
                        ]),
                    },
                } as any);

                expect(mockRedirect).toHaveBeenCalled();
                const redirectUrl = mockRedirect.mock.calls[0][0];
                expect(redirectUrl.pathname).toBe('/warehouse/mobile');
            } finally {
                Response.redirect = originalRedirect;
            }
        });

        // === Admin subdomain mobile gate (no redirect loop) ===

        it('should redirect superadmin on mobile admin panel to desktop-required', async () => {
            const { authConfig } = await import('@/auth.config');
            const authorizedCallback = authConfig.callbacks!.authorized!;

            const mockRedirect = vi.fn();
            const originalRedirect = Response.redirect;
            Response.redirect = mockRedirect;

            try {
                await authorizedCallback({
                    auth: { user: { isSuperAdmin: true } },
                    request: {
                        nextUrl: new URL('https://admin.polyflow.uk/super-admin'),
                        headers: new Map([
                            ['host', 'admin.polyflow.uk'],
                            ['user-agent', 'Mozilla/5.0 (iPhone; CPU iPhone OS 13_2_3 like Mac OS X)'],
                        ]),
                    },
                } as any);

                expect(mockRedirect).toHaveBeenCalled();
                const redirectUrl = mockRedirect.mock.calls[0][0];
                expect(redirectUrl.pathname).toBe('/device/desktop-required');
            } finally {
                Response.redirect = originalRedirect;
            }
        });

        it('should allow desktop-required page on admin subdomain mobile (no loop)', async () => {
            const { authConfig } = await import('@/auth.config');
            const authorizedCallback = authConfig.callbacks!.authorized!;

            const mockRedirect = vi.fn();
            const originalRedirect = Response.redirect;
            Response.redirect = mockRedirect;

            try {
                const result = await authorizedCallback({
                    auth: { user: { isSuperAdmin: true } },
                    request: {
                        nextUrl: new URL('https://admin.polyflow.uk/device/desktop-required'),
                        headers: new Map([
                            ['host', 'admin.polyflow.uk'],
                            ['user-agent', 'Mozilla/5.0 (iPhone; CPU iPhone OS 13_2_3 like Mac OS X)'],
                        ]),
                    },
                } as any);

                expect(mockRedirect).not.toHaveBeenCalled();
                expect(result).toBe(true);
            } finally {
                Response.redirect = originalRedirect;
            }
        });
    });
});
