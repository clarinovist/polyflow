// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import AnalyticsPage from '../analytics/page';
import HistoryPage from '../history/page';
import MachinesPage from '../machines/page';
const mocks = vi.hoisted(() => ({ analytics: vi.fn(), history: vi.fn(), options: vi.fn(), machines: vi.fn(), employees: vi.fn(), shifts: vi.fn(), stages: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/actions/core/analytics', () => ({ getProductionAnalytics: mocks.analytics }));
vi.mock('@/actions/production/production-execution', () => ({ getProductionHistory: mocks.history, getProductionHistoryFilterOptions: mocks.options }));
vi.mock('@/actions/production/alert-threshold-settings', () => ({ getProductionAlertThresholdsForPage: async () => ({ success: false }) }));
vi.mock('@/actions/production/machines', () => ({ getMachines: mocks.machines }));
vi.mock('@/actions/production/production-orders', () => ({ getProductionOrders: async () => [] }));
vi.mock('@/actions/production/machine-stage-settings', () => ({ getMachineStageMap: mocks.stages }));
vi.mock('@/actions/admin/employees', () => ({ getEmployees: mocks.employees }));
vi.mock('@/actions/admin/work-shifts', () => ({ getWorkShifts: mocks.shifts }));
vi.mock('@/components/analytics/AnalyticsToolbar', () => ({ AnalyticsToolbar: () => null }));
vi.mock('@/components/analytics/ProductionRealizationChart', () => ({ ProductionRealizationChart: () => null }));
vi.mock('@/components/analytics/MachinePerformanceCard', () => ({ MachinePerformanceCard: () => null }));
vi.mock('@/components/analytics/ScrapAnalysisChart', () => ({ ScrapAnalysisChart: () => null }));
vi.mock('@/components/analytics/AffalByProcessCard', () => ({ AffalByProcessCard: () => null }));
vi.mock('@/components/analytics/OperatorProcessComparison', () => ({ OperatorProcessComparison: () => null }));
vi.mock('@/components/production/ProductionHistoryClient', () => ({ ProductionHistoryClient: () => null }));
vi.mock('@/components/production/ProductionHistoryFilters', () => ({ ProductionHistoryFilters: () => null }));
vi.mock('@/components/production/ShiftManagerDialog', () => ({ ShiftManagerDialog: () => null }));
vi.mock('@/components/production/ReassignMachineButton', () => ({ ReassignMachineButton: () => null }));
vi.mock('@/components/production/AssignJobButton', () => ({ AssignJobButton: () => null }));
vi.mock('@/components/production/MachineActions', () => ({ MachineActions: () => null }));
vi.mock('@/components/production/MachineOrderList', () => ({ MachineOrderList: () => null }));
beforeEach(() => {
    vi.resetAllMocks();
    for (const fn of [mocks.machines, mocks.employees, mocks.shifts]) fn.mockResolvedValue({ success: true, data: [] });
    mocks.stages.mockResolvedValue({ success: true, data: {} });
    mocks.history.mockResolvedValue({ success: true, data: { groups: [], summary: { totalGood: 0, totalScrap: 0, executionCount: 0, orderCount: 0, missingPhotoCount: 0, limit: 200, isTruncated: false } } });
    mocks.options.mockResolvedValue({ success: true, data: { machines: [], operators: [], products: [], shifts: [] } });
});
afterEach(cleanup);
describe('report and machine read reliability', () => {
    it('never displays zero analytics after a failed read', async () => {
        mocks.analytics.mockResolvedValue({ success: false });
        render(await AnalyticsPage({ searchParams: Promise.resolve({}) }));
        expect(screen.getByRole('alert')).toBeTruthy();
        expect(screen.queryByText('Rata-rata Yield')).toBeNull();
    });
    it.each(['history', 'options'] as const)('does not turn %s failures into an empty log', async (key) => {
        mocks[key].mockResolvedValue({ success: false });
        render(await HistoryPage({ searchParams: Promise.resolve({}) }));
        expect(screen.getByRole('alert')).toBeTruthy();
        expect(screen.queryByText('Hasil Bersih')).toBeNull();
    });
    it('renders successful empty history without an error', async () => {
        render(await HistoryPage({ searchParams: Promise.resolve({}) }));
        expect(screen.queryByRole('alert')).toBeNull();
        expect(screen.getByRole('heading', { name: 'Log Hasil' })).toBeTruthy();
    });
    it.each(['machines', 'employees', 'shifts', 'stages'] as const)('does not use unavailable %s as a valid empty/default assignment source', async (key) => {
        mocks[key].mockResolvedValue({ success: false });
        render(await MachinesPage()); expect(screen.getByRole('alert')).toBeTruthy();
    });
    it('renders an empty machine board only after successful reads', async () => {
        render(await MachinesPage()); expect(screen.queryByRole('alert')).toBeNull();
        expect(screen.getByRole('heading', { name: 'Status Mesin' })).toBeTruthy();
    });
});
