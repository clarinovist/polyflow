// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const { getBoard } = vi.hoisted(() => ({ getBoard: vi.fn() }));
vi.mock('@/actions/purchasing/purchasing-dashboard', () => ({
    getPurchasingShiftBoard: getBoard,
}));

import PurchasingHomePage from '../page';

describe('PurchasingHomePage', () => {
    it('passes an action failure through as unavailable instead of fabricated zeroes', async () => {
        getBoard.mockResolvedValueOnce({ success: false, error: 'Synthetic failure' });

        render(await PurchasingHomePage());

        expect(screen.getByText('Dashboard pembelian tidak tersedia')).toBeTruthy();
        expect(screen.queryByText('Rp 0')).toBeNull();
    });
});
