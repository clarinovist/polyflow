// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyOverviewData } from '@/components/production/overview/ProductionOverviewClient';

const action = vi.hoisted(() => vi.fn());
vi.mock('@/actions/dashboard/production-live-overview', () => ({
    getProductionLiveOverview: action,
}));
vi.mock('@/components/production/overview/ProductionOverviewClient', async (original) => ({
    ...(await original<object>()),
    ProductionOverviewClient: ({ initialData }: { initialData: { generatedAt: string } }) => (
        <div>Production client {initialData.generatedAt}</div>
    ),
}));

import ProductionDashboardPage from '../page';

describe('ProductionDashboardPage R4C', () => {
    beforeEach(() => vi.clearAllMocks());

    it.each([
        { success: false, error: 'unavailable' },
        { success: true, data: { ...emptyOverviewData(), state: 'HIDDEN', health: null } },
    ])('renders honest initial unavailable state for $success', async (result) => {
        action.mockResolvedValue(result);

        render(await ProductionDashboardPage());

        expect(screen.getByText('Dashboard Production tidak tersedia')).toBeTruthy();
        expect(
            screen.getByText(
                'Kondisi, perhatian, dan arah utama operasional produksi.',
            ),
        ).toBeTruthy();
        expect(
            screen.queryByText(
                'Health, attention, dan drivers operasional Production.',
            ),
        ).toBeNull();
        expect(screen.queryByText(/Production client/)).toBeNull();
        expect(screen.queryByText(/0 SPK/)).toBeNull();
    });

    it('passes through an available server snapshot without replacing generatedAt', async () => {
        const data = emptyOverviewData();
        data.generatedAt = '2026-10-09T08:00:00.000Z';
        action.mockResolvedValue({ success: true, data });

        render(await ProductionDashboardPage());

        expect(
            screen.getByText('Production client 2026-10-09T08:00:00.000Z'),
        ).toBeTruthy();
        expect(
            screen.getByText(
                'Kondisi, perhatian, dan arah utama operasional produksi.',
            ),
        ).toBeTruthy();
        expect(screen.queryByText('Dashboard Production tidak tersedia')).toBeNull();
    });
});
