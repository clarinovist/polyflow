// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    action: vi.fn(),
    client: vi.fn(({ data }: { data: { generatedAt: string } }) => (
        <p>client:{data.generatedAt}</p>
    )),
}));

vi.mock('@/actions/dashboard/warehouse-mobile-dashboard', () => ({
    getWarehouseMobileDashboard: mocks.action,
}));
vi.mock('../WarehouseMobileHomeClient', () => ({
    WarehouseMobileHomeClient: mocks.client,
}));
vi.mock('@/components/mobile', () => ({
    MobileReadError: ({ title }: { title: string }) => (
        <p role="alert">{title}</p>
    ),
}));

import WarehouseMobilePage from '../page';

const data = {
    generatedAt: '2026-10-10T03:00:00.000Z',
    operational: { status: 'AVAILABLE', data: {} },
    today: { status: 'AVAILABLE', data: {} },
    loadingAttention: { status: 'AVAILABLE', data: {} },
    openOpname: { status: 'AVAILABLE', data: {} },
    links: {},
};

describe('WarehouseMobilePage', () => {
    beforeEach(() => vi.resetAllMocks());

    it('uses only the Warehouse mobile dashboard action and passes its DTO unchanged', async () => {
        mocks.action.mockResolvedValue({ success: true, data });

        render(await WarehouseMobilePage());

        expect(mocks.action).toHaveBeenCalledTimes(1);
        expect(mocks.client.mock.calls[0]?.[0].data).toBe(data);
        expect(screen.getByText(`client:${data.generatedAt}`)).toBeTruthy();
    });

    it('renders MobileReadError for whole-action failures', async () => {
        mocks.action.mockResolvedValue({
            success: false,
            error: 'synthetic failure',
        });

        render(await WarehouseMobilePage());

        expect(screen.getByRole('alert').textContent).toContain(
            'Ringkasan gudang belum tersedia',
        );
        expect(mocks.client).not.toHaveBeenCalled();
    });
});
