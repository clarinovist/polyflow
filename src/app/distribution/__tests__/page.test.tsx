// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    dashboard: vi.fn(),
    rethrow: vi.fn(),
}));

vi.mock('@/actions/distribution/dashboard', () => ({
    getDistributionDashboard: mocks.dashboard,
}));
vi.mock('next/navigation', () => ({
    unstable_rethrow: mocks.rethrow,
}));

import DistributionDashboardPage from '../page';

const dashboard = {
    generatedAt: '2026-10-10T00:00:00.000Z',
    snapshotAt: '2026-10-10T00:00:00.000Z',
    businessDate: '2026-10-10',
    health: {
        salesOrders: {
            state: 'AVAILABLE',
            data: { active: 1, readyToShip: 0 },
            href: '/sales/orders',
        },
        purchaseOrders: { state: 'HIDDEN', data: null, href: null },
        inventory: { state: 'HIDDEN', data: null, href: null },
        accountsReceivable: { state: 'HIDDEN', data: null, href: null },
        accountsPayable: { state: 'HIDDEN', data: null, href: null },
    },
    attention: {
        readyWithoutDo: { state: 'HIDDEN', data: null, href: null },
    },
    drivers: { state: 'NOT_CONFIGURED', data: null },
    withheld: {
        operations: { state: 'NOT_CONFIGURED', data: null },
        financials: { state: 'NOT_CONFIGURED', data: null },
    },
    quickActionHrefs: ['/sales/orders'],
};

describe('DistributionDashboardPage', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        mocks.rethrow.mockImplementation((error: unknown) => {
            const value = error as { message?: string; digest?: string };
            if (
                value?.message === 'NEXT_REDIRECT' ||
                value?.message === 'NEXT_NOT_FOUND' ||
                value?.digest?.startsWith('NEXT_REDIRECT')
            ) {
                throw error;
            }
        });
    });

    it('passes successful action data to the reduced whole-tenant dashboard', async () => {
        mocks.dashboard.mockResolvedValue({ success: true, data: dashboard });

        render(await DistributionDashboardPage());

        expect(
            screen.getByText('Kondisi seluruh operasi distribusi tenant'),
        ).toBeTruthy();
        expect(screen.getByText('Pesanan aktif')).toBeTruthy();
        expect(screen.getByText('1')).toBeTruthy();
        expect(
            screen.getByRole('navigation', {
                name: 'Aksi cepat Distribution',
            }),
        ).toBeTruthy();
    });

    it.each([
        ['returned failure', async () => ({ success: false, error: 'failed' })],
        ['thrown failure', async () => Promise.reject(new Error('failed'))],
    ])('renders explicit unavailable state for %s', async (_label, outcome) => {
        mocks.dashboard.mockImplementation(outcome);

        render(await DistributionDashboardPage());

        expect(
            screen.getByText('Dashboard Distribution tidak tersedia'),
        ).toBeTruthy();
        expect(screen.queryByText('0')).toBeNull();
    });

    it.each([
        Object.assign(new Error('NEXT_REDIRECT'), {
            digest: 'NEXT_REDIRECT;replace;/login',
        }),
        new Error('NEXT_NOT_FOUND'),
    ])('rethrows Next control flow instead of rendering an outage', async (error) => {
        mocks.dashboard.mockRejectedValue(error);

        await expect(DistributionDashboardPage()).rejects.toBe(error);
        expect(mocks.rethrow).toHaveBeenCalledWith(error);
    });
});
