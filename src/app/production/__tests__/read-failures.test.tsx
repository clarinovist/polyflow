// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import MrpPage from '../mrp/page';
import RequestsPage from '../requests/page';
import RunsPage from '../runs/page';
import InventoryPage from '../inventory/page';
import ResourcesPage from '../resources/page';
import ShiftsPage from '../shifts/page';
import ProductionError from '../error';

const mocks = vi.hoisted(() => ({ inventory: vi.fn(), movements: vi.fn(), demand: vi.fn(), init: vi.fn(), runs: vi.fn(), employees: vi.fn(), shifts: vi.fn(), orders: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock('@/actions/inventory/inventory', () => ({ getInventoryList: mocks.inventory, getStockMovements: mocks.movements }));
vi.mock('@/actions/production/production-orders', () => ({ getProductionOrders: mocks.orders }));
vi.mock('@/actions/production/production', () => ({ getFgDemandBoard: mocks.demand, getInitData: mocks.init }));
vi.mock('@/actions/production/production-runs', () => ({ listProductionRuns: mocks.runs }));
vi.mock('@/actions/admin/employees', () => ({ getEmployees: mocks.employees }));
vi.mock('@/actions/admin/work-shifts', () => ({ getWorkShifts: mocks.shifts }));
vi.mock('@/components/production/ProductionRequestsClient', () => ({ ProductionRequestsClient: () => <div>Demand board</div> }));
vi.mock('@/components/production/runs/RunsListClient', () => ({ RunsListClient: () => <div>Daftar rangkaian</div> }));
vi.mock('@/components/production/AcknowledgeHandoverButton', () => ({ AcknowledgeHandoverButton: () => null }));
vi.mock('@/components/production/ShiftList', () => ({ ShiftList: () => <div>Daftar shift</div> }));
vi.mock('@/components/production/ShiftPageHeader', () => ({ ShiftPageHeader: () => null }));

beforeEach(() => {
    vi.resetAllMocks();
    for (const fn of [mocks.inventory, mocks.movements, mocks.runs, mocks.employees, mocks.shifts, mocks.demand]) fn.mockResolvedValue({ success: true, data: [] });
    mocks.init.mockResolvedValue({ success: true, data: { machines: [], locations: [] } });
    mocks.orders.mockResolvedValue([]);
});
afterEach(cleanup);

describe('production expected read failures', () => {
    it.each([
        ['MRP inventory', MrpPage, 'inventory'],
        ['demand', RequestsPage, 'demand'],
        ['demand options', RequestsPage, 'init'],
        ['runs', RunsPage, 'runs'],
        ['floor stock', InventoryPage, 'inventory'],
        ['handover', InventoryPage, 'movements'],
        ['team', ResourcesPage, 'employees'],
        ['shifts', ShiftsPage, 'shifts'],
    ] as const)('%s is unavailable, not empty/zero, and can retry', async (_name, Page, key) => {
        mocks[key].mockResolvedValue({ success: false, error: 'private infrastructure detail' });
        render(await Page());
        expect(screen.getByRole('alert')).toBeTruthy();
        expect(screen.queryByText('private infrastructure detail')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Coba lagi' }));
        expect(mocks.refresh).toHaveBeenCalledOnce();
        expect(screen.queryByText('Tidak Ada Kekurangan')).toBeNull();
        expect(screen.queryByText('Demand board')).toBeNull();
    });
    it.each([MrpPage, RequestsPage, RunsPage, InventoryPage, ResourcesPage, ShiftsPage])('keeps a successful empty response distinct from failure', async (Page) => {
        render(await Page());
        expect(screen.queryByRole('alert')).toBeNull();
    });
    it('handles thrown reads via the segment retry, without exposing internals', () => {
        const retry = vi.fn();
        render(<ProductionError error={new Error('secret connection')} retry={retry} />);
        expect(screen.queryByText('secret connection')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Coba lagi' }));
        expect(retry).toHaveBeenCalledOnce();
    });
});
