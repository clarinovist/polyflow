// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getBoard, authMock } = vi.hoisted(() => ({
    getBoard: vi.fn(),
    authMock: vi.fn(),
}));
vi.mock('@/auth', () => ({ auth: authMock }));
vi.mock('@/actions/purchasing/purchasing-dashboard', () => ({
    getPurchasingShiftBoard: getBoard,
}));

import PurchasingHomePage from '../page';

describe('PurchasingHomePage', () => {
    beforeEach(() => {
        authMock.mockResolvedValue({ user: { role: 'PROCUREMENT' } });
    });

    it('passes an action failure through as unavailable instead of fabricated zeroes', async () => {
        getBoard.mockResolvedValueOnce({ success: false, error: 'Synthetic failure' });

        render(await PurchasingHomePage());

        expect(screen.getByText('Dashboard pembelian tidak tersedia')).toBeTruthy();
        expect(screen.queryByText('Rp 0')).toBeNull();
    });

    it('hides the create-PO link for a read-only factory manager', async () => {
        authMock.mockResolvedValue({ user: { role: 'FACTORY_MANAGER' } });
        getBoard.mockResolvedValueOnce({ success: true, data: null });

        render(await PurchasingHomePage());

        expect(screen.queryByRole('link', { name: 'Buat PO' })).toBeNull();
    });
});
