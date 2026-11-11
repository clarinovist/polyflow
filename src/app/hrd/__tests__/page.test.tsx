import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    getBoard: vi.fn(),
    logError: vi.fn(),
}));

vi.mock('@/actions/hrd/dashboard-kpis', () => ({
    getHrdShiftBoard: mocks.getBoard,
}));
vi.mock('@/components/hrd/HrdShiftBoard', () => ({
    HrdShiftBoardComponent: () => null,
}));
vi.mock('@/lib/config/logger', () => ({
    logger: { error: mocks.logError },
}));

import HrdDashboardPage from '../page';

const board = { workDate: '2026-10-10' };

async function renderedData() {
    const element = await HrdDashboardPage();
    return (element.props as { data: unknown }).data;
}

describe('HrdDashboardPage', () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    it('passes the board data through on success without logging', async () => {
        mocks.getBoard.mockResolvedValue({ success: true, data: board });

        expect(await renderedData()).toBe(board);
        expect(mocks.logError).not.toHaveBeenCalled();
    });

    it('logs a thrown error and renders the honest error state (null data)', async () => {
        const failure = new Error('db down');
        mocks.getBoard.mockRejectedValue(failure);

        expect(await renderedData()).toBeNull();
        expect(mocks.logError).toHaveBeenCalledTimes(1);
        expect(mocks.logError.mock.calls[0][1]).toMatchObject({
            module: 'hrd-dashboard',
            error: failure,
        });
    });

    it('logs a failed action result instead of swallowing it', async () => {
        mocks.getBoard.mockResolvedValue({
            success: false,
            error: 'Unauthorized',
            code: 'AUTHORIZATION_ERROR',
        });

        expect(await renderedData()).toBeNull();
        expect(mocks.logError).toHaveBeenCalledTimes(1);
        expect(mocks.logError.mock.calls[0][1]).toMatchObject({
            module: 'hrd-dashboard',
            code: 'AUTHORIZATION_ERROR',
        });
    });
});
