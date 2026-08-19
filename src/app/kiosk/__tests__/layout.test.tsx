import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockRedirect, mockGetActiveExecutions, mockHasWorkspaceEntitlement } =
    vi.hoisted(() => ({
        mockRedirect: vi.fn(),
        mockGetActiveExecutions: vi.fn(),
        mockHasWorkspaceEntitlement: vi.fn(),
    }));

vi.mock('next/navigation', () => ({
    redirect: (...args: unknown[]) => mockRedirect(...args),
}));

vi.mock('@/actions/production/production', () => ({
    getActiveExecutions: (...args: unknown[]) =>
        mockGetActiveExecutions(...args),
}));

vi.mock('@/lib/auth/access-policy', () => ({
    hasWorkspaceEntitlement: (...args: unknown[]) =>
        mockHasWorkspaceEntitlement(...args),
}));

// Presentational children are irrelevant to the guard being tested.
vi.mock('@/components/production/kiosk/ActiveExecutionBanner', () => ({
    ActiveExecutionBanner: () => null,
}));
vi.mock('@/components/auth/polyflow-logo', () => ({ default: () => null }));
vi.mock('@/components/layout/admin-back-button', () => ({
    AdminBackButton: () => null,
}));
vi.mock('../ClockDisplay', () => ({ ClockDisplay: () => null }));
vi.mock('../KioskFullscreenToggle', () => ({
    KioskFullscreenToggle: () => null,
}));
vi.mock('../KioskIdleShell', () => ({
    KioskIdleShell: ({ children }: { children: unknown }) => children,
}));

import KioskLayout from '../layout';

describe('KioskLayout guard', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetActiveExecutions.mockResolvedValue([]);
        mockHasWorkspaceEntitlement.mockReturnValue(true);
    });

    it('renders without a NextAuth session — production operators only have code + PIN', async () => {
        await KioskLayout({ children: null });

        expect(mockRedirect).not.toHaveBeenCalled();
    });

    it('never calls redirect("/login")', async () => {
        await KioskLayout({ children: null });

        expect(mockRedirect).not.toHaveBeenCalledWith('/login');
    });

    it('still enforces the production entitlement gate', async () => {
        mockHasWorkspaceEntitlement.mockReturnValue(false);

        await KioskLayout({ children: null });

        expect(mockHasWorkspaceEntitlement).toHaveBeenCalledWith('production');
        expect(mockRedirect).toHaveBeenCalledWith(
            '/error?error=ModuleNotEntitled',
        );
    });
});
