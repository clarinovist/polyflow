// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WarehouseShiftBoard } from '@/actions/dashboard/warehouse-dashboard';

const mocks = vi.hoisted(() => ({
    action: vi.fn(),
    board: vi.fn(({ data }: { data: WarehouseShiftBoard | null }) => (
        <div>{data ? `board:${data.generatedAt}` : 'board:unavailable'}</div>
    )),
}));

vi.mock('@/actions/dashboard/warehouse-dashboard', () => ({
    getWarehouseShiftBoard: mocks.action,
}));
vi.mock('@/components/warehouse/WarehouseShiftBoard', () => ({
    WarehouseShiftBoardComponent: mocks.board,
}));

import WarehousePage from '../page';

const board: WarehouseShiftBoard = {
    generatedAt: '2026-10-09T08:00:00.000Z',
    health: {
        operational: {
            status: 'AVAILABLE',
            data: {
                receivablePOs: 1,
                openLoadOrders: 2,
                materialQueue: 3,
            },
        },
        inventory: {
            status: 'AVAILABLE',
            data: { lowStock: 4, suggestedReorder: 5 },
        },
    },
    today: {
        status: 'AVAILABLE',
        data: {
            goodsReceipts: 6,
            deliveriesShipped: 7,
            materialIssues: 8,
        },
    },
    attention: {
        status: 'AVAILABLE',
        data: {
            loadingUnverified: { total: 0, returned: 0, items: [] },
            partialPOs: { total: 0, returned: 0, items: [] },
            waitingMaterial: { total: 0, returned: 0, items: [] },
        },
    },
    drivers: {
        status: 'AVAILABLE',
        data: { lowStock: [] },
    },
};

describe('WarehousePage', () => {
    beforeEach(() => vi.resetAllMocks());

    it('passes whole-action failure through as unavailable without synthesizing zeroes', async () => {
        mocks.action.mockResolvedValue({
            success: false,
            error: 'Synthetic failure',
        });

        render(await WarehousePage());

        expect(screen.getByText('board:unavailable')).toBeTruthy();
        expect(mocks.board.mock.calls[0]?.[0].data).toBeNull();
        expect(screen.queryByText(/board:0/)).toBeNull();
    });

    it('passes the successful server DTO through unchanged', async () => {
        mocks.action.mockResolvedValue({ success: true, data: board });

        render(await WarehousePage());

        expect(screen.getByText('board:2026-10-09T08:00:00.000Z')).toBeTruthy();
        expect(mocks.board.mock.calls[0]?.[0].data).toBe(board);
    });
});
