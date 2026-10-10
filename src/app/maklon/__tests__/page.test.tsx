// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ dashboard: vi.fn() }));

vi.mock('@/actions/maklon/maklon-dashboard', () => ({
    getMaklonDashboard: mocks.dashboard,
}));
vi.mock('@/lib/errors/errors', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/lib/errors/errors')>()),
}));

import MaklonDashboardPage from '../page';

const dashboard = {
    generatedAt: '2026-10-10T00:00:00.000Z',
    snapshotAt: '2026-10-10T00:00:00.000Z',
    workDate: '2026-10-10',
    health: {
        inProgress: { state: 'AVAILABLE', data: { count: 1 } },
        completedToday: { state: 'AVAILABLE', data: { count: 0 } },
        outputTodayByUnit: { state: 'AVAILABLE', data: { groups: [] } },
    },
    attention: {
        waitingMaterial: { state: 'AVAILABLE', data: { count: 0 } },
        pastPlannedEnd: { state: 'AVAILABLE', data: { count: 0 } },
    },
    drivers: { state: 'NOT_CONFIGURED', data: null },
    withheld: {
        materials: { state: 'NOT_CONFIGURED', data: null },
        financials: { state: 'NOT_CONFIGURED', data: null },
    },
    quickActionHrefs: ['/maklon/receipts'],
};

describe('MaklonDashboardPage', () => {
    beforeEach(() => vi.resetAllMocks());

    it('passes successful action data to the operational dashboard', async () => {
        mocks.dashboard.mockResolvedValue({ success: true, data: dashboard });

        render(await MaklonDashboardPage());

        expect(screen.getByText('SPK sedang berjalan')).toBeTruthy();
        expect(screen.getByText('1')).toBeTruthy();
        expect(
            screen.getByRole('link', { name: /Penerimaan bahan/i }),
        ).toBeTruthy();
    });

    it.each([
        ['returned failure', async () => ({ success: false, error: 'failed' })],
        ['thrown failure', async () => Promise.reject(new Error('failed'))],
    ])('renders explicit unavailable state for %s', async (_label, outcome) => {
        mocks.dashboard.mockImplementation(outcome);

        render(await MaklonDashboardPage());

        expect(
            screen.getByText('Dashboard Maklon tidak tersedia'),
        ).toBeTruthy();
        expect(
            screen.getByText(/Angka kosong tidak dianggap nol/),
        ).toBeTruthy();
        expect(screen.queryByText('Penerimaan bahan')).toBeNull();
    });

    it('rethrows Next redirect control flow instead of rendering a data outage', async () => {
        const redirectError = Object.assign(new Error('NEXT_REDIRECT'), {
            digest: 'NEXT_REDIRECT;replace;/login',
        });
        mocks.dashboard.mockRejectedValue(redirectError);

        await expect(MaklonDashboardPage()).rejects.toBe(redirectError);
    });
});
