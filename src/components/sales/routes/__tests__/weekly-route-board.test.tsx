// @vitest-environment jsdom
import { act, fireEvent, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WeeklyRouteBoard, type RouteWeekBoard } from '../WeeklyRouteBoard';
import { getRouteWeekBoard } from '@/actions/sales/route-plans';

vi.mock('@/actions/sales/route-plans', () => ({
    getRouteWeekBoard: vi.fn(), publishWeekRoutes: vi.fn(),
}));
vi.mock('../RouteCoverageBar', () => ({ RouteCoverageBar: () => null }));
vi.mock('../RouteDayDrawer', () => ({ RouteDayDrawer: () => null }));

const board: RouteWeekBoard = {
    days: [], overdue: [], conflicts: [], lastVisits: [],
    coverage: { activeCustomers: 0, scheduledThisWeek: 0 },
};
const props = { customers: [], initialWeekStart: '2026-10-26', initialBoard: board };
beforeEach(() => {
    vi.mocked(getRouteWeekBoard).mockReset();
    vi.mocked(getRouteWeekBoard).mockResolvedValue({ success: true, data: board });
});

describe('weekly board refresh identity', () => {
    it('refreshes for changed IDs or week, not new arrays with identical IDs', async () => {
        const view = render(<WeeklyRouteBoard {...props} team={[{ id: 'rep-a', name: 'A' }]} />);
        expect(getRouteWeekBoard).not.toHaveBeenCalled();
        await act(async () => {
            view.rerender(<WeeklyRouteBoard {...props} team={[{ id: 'rep-a', name: 'Renamed' }]} />);
        });
        expect(getRouteWeekBoard).not.toHaveBeenCalled();
        await act(async () => {
            view.rerender(<WeeklyRouteBoard {...props} team={[{ id: 'rep-b', name: 'B' }]} />);
        });
        expect(getRouteWeekBoard).toHaveBeenCalledExactlyOnceWith('2026-10-26', ['rep-b']);
        await act(async () => { fireEvent.click(view.container.querySelectorAll('button')[1]); });
        expect(getRouteWeekBoard).toHaveBeenLastCalledWith('2026-11-02', ['rep-b']);
        expect(getRouteWeekBoard).toHaveBeenCalledTimes(2);
        await act(async () => { view.rerender(<WeeklyRouteBoard {...props} team={[]} />); });
        expect(getRouteWeekBoard).toHaveBeenCalledTimes(2);
    });
});
