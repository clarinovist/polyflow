import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
    mockRedirect,
    mockGetActiveExecutions,
    mockHasWorkspaceEntitlement,
    mockBanner,
} = vi.hoisted(() => ({
    mockRedirect: vi.fn(),
    mockGetActiveExecutions: vi.fn(),
    mockHasWorkspaceEntitlement: vi.fn(),
    mockBanner: vi.fn(),
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
    ActiveExecutionBanner: (props: unknown) => {
        mockBanner(props);
        return null;
    },
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

import { renderToStaticMarkup } from 'react-dom/server';
import KioskLayout from '../layout';

describe('KioskLayout guard', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetActiveExecutions.mockResolvedValue({ success: true, data: [] });
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

    it('keeps the kiosk focus shell without supervisor bottom navigation', () => {
        const source = readFileSync(
            join(process.cwd(), 'src/app/kiosk/layout.tsx'),
            'utf8',
        );
        expect(source).toContain('KioskIdleShell');
        expect(source).not.toContain('MobilePortalBottomNav');
        expect(source).not.toContain('WarehouseBottomNav');
        expect(source).not.toContain('FieldBottomNav');
    });

    it('still enforces the production entitlement gate', async () => {
        mockHasWorkspaceEntitlement.mockReturnValue(false);

        await KioskLayout({ children: null });

        expect(mockHasWorkspaceEntitlement).toHaveBeenCalledWith('production');
        expect(mockRedirect).toHaveBeenCalledWith(
            '/error?error=ModuleNotEntitled',
        );
    });

    it('shows the running-SPK banner from the action result envelope', async () => {
        const publicFields = {
            id: 'exec-1',
            startTime: '2026-10-26T01:00:00.000Z',
            productionOrderId: 'order-1',
            productionOrder: {
                id: 'order-1',
                orderNumber: 'WO-001',
                bom: { productVariant: { name: 'Tali Rafia 1 kg' } },
            },
        };
        mockGetActiveExecutions.mockResolvedValue({
            success: true,
            data: [publicFields],
        });

        renderToStaticMarkup(await KioskLayout({ children: null }));

        expect(mockBanner).toHaveBeenCalledWith({ executions: [publicFields] });
    });

    it('passes only public fields to the banner, never employee or machine records', async () => {
        // The kiosk is public: anything given to a client component is in the page payload.
        mockGetActiveExecutions.mockResolvedValue({
            success: true,
            data: [
                {
                    id: 'exec-1',
                    startTime: '2026-10-26T01:00:00.000Z',
                    productionOrderId: 'order-1',
                    operatorId: 'emp-1',
                    operator: { id: 'emp-1', name: 'Synthetic', pinHash: 'hash', nik: '123', bankAccountNo: '999' },
                    machine: { id: 'm-1', name: 'Mesin 1' },
                    productionOrder: {
                        id: 'order-1',
                        orderNumber: 'WO-001',
                        status: 'IN_PROGRESS',
                        bom: { productVariant: { name: 'Tali Rafia 1 kg', price: 12000 } },
                    },
                },
            ],
        });

        renderToStaticMarkup(await KioskLayout({ children: null }));

        const sent = JSON.stringify(mockBanner.mock.calls[0][0]);
        expect(sent).not.toMatch(/pinHash|nik|bankAccountNo|operator|machine|price|status/);
        expect(sent).toContain('WO-001');
    });

    it('hides the banner when active executions cannot be read', async () => {
        mockGetActiveExecutions.mockResolvedValue({
            success: false,
            error: 'boom',
            code: 'INTERNAL',
        });

        renderToStaticMarkup(await KioskLayout({ children: null }));

        expect(mockBanner).not.toHaveBeenCalled();
    });
});
