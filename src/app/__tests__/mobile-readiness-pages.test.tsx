// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import ProductionHome from '../production/mobile/page';
import ProductionInsights from '../production/mobile/insights/page';
import FinanceHome from '../finance/mobile/page';
import FinanceInsights from '../finance/mobile/insights/page';
import FinanceTasks from '../finance/mobile/tasks/page';
import HrdHome from '../hrd/mobile/page';
import HrdInsights from '../hrd/mobile/insights/page';
import HrdTasks from '../hrd/mobile/tasks/page';
import PurchasingHome from '../purchasing/mobile/page';
import PurchasingInsights from '../purchasing/mobile/insights/page';
import PurchasingTasks from '../purchasing/mobile/tasks/page';
import StockPage from '../field/sales/stock/page';
import OrdersPage from '../field/sales/orders/page';
import ReceivablesPage from '../field/sales/receivables/page';
import SelectorPage from '../mobile/page';
import { HrdAttendanceClient } from '../hrd/mobile/attendance/attendance-client';
const m = vi.hoisted(() => ({ production: vi.fn(), finance: vi.fn(), hrd: vi.fn(), purchasing: vi.fn(), products: vi.fn(), locations: vi.fn(), orders: vi.fn(), receivables: vi.fn(), portals: vi.fn(), refresh: vi.fn(), push: vi.fn(), redirect: vi.fn(), auth: vi.fn() }));
vi.mock('@/actions/production/mobile-supervisor', () => ({ getProductionSupervisorOverview: m.production }));
vi.mock('@/actions/production/alert-threshold-settings', () => ({ getProductionAlertThresholdsForPage: async () => ({ success: false }) }));
vi.mock('@/actions/finance/mobile-dashboard', () => ({ getFinanceMobileOverview: m.finance }));
vi.mock('@/actions/hrd/mobile-dashboard', () => ({ getHrdMobileOverview: m.hrd }));
vi.mock('@/actions/purchasing/mobile-dashboard', () => ({ getPurchasingMobileOverview: m.purchasing }));
vi.mock('@/actions/inventory/inventory', () => ({ getProductVariants: m.products, getLocations: m.locations }));
vi.mock('@/actions/sales/field-actions', () => ({ getMyFieldSalesOrders: m.orders, getMyFieldReceivables: m.receivables }));
vi.mock('@/actions/settings/mobile-portals', () => ({ getMyMobilePortals: m.portals }));
vi.mock('@/auth', () => ({ auth: m.auth }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: m.refresh, push: m.push }), redirect: m.redirect }));
vi.mock('@/components/layout/mobile-account-menu', () => ({ MobileAccountMenu: () => null }));
vi.mock('@/components/ui/barcode-scanner', () => ({ BarcodeScanner: () => null }));
vi.mock('../field/sales/orders/OrderListClient', () => ({ OrderListClient: () => <p>Orders</p> }));
vi.mock('../field/sales/receivables/ReceivablesListClient', () => ({ ReceivablesListClient: () => <p>Receivables</p> }));
afterEach(cleanup);
beforeEach(() => {
    vi.resetAllMocks();
    for (const fn of [m.production, m.finance, m.hrd, m.purchasing, m.products, m.locations, m.orders, m.receivables, m.portals]) fn.mockResolvedValue({ success: false });
    m.auth.mockResolvedValue({ user: { id: 'synthetic', role: 'FINANCE' } });
});
describe('mobile read states', () => {
    it.each([ProductionHome, ProductionInsights, FinanceHome, FinanceInsights, FinanceTasks, HrdHome, HrdInsights, HrdTasks, PurchasingHome, PurchasingInsights, PurchasingTasks, StockPage, OrdersPage, ReceivablesPage, SelectorPage])('%s shows unavailable and retry, not a zero dashboard', async (Page) => {
        render(await Page()); expect(screen.getByRole('alert')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Coba lagi' })); expect(m.refresh).toHaveBeenCalled();
    });
    it('renders useful invoice facts without a desktop dead-end link', async () => {
        m.finance.mockResolvedValue({ success: true, data: { recentInvoices: [{ id: 'inv', type: 'AP', invoiceNumber: 'SYNTHETIC', customerName: 'Example', dueDate: '2026-09-01T00:00:00Z', amount: 600, status: 'PARTIAL' }] } });
        render(await FinanceTasks()); expect(screen.getByText('Sisa tagihan')).toBeTruthy();
        expect(screen.getByText(/Pembayaran dan jurnal tetap/)).toBeTruthy(); expect(screen.queryAllByRole('link')).toHaveLength(0);
    });
    it('shows leaves inline and the full pending count', async () => {
        m.hrd.mockResolvedValue({ success: true, data: { highlights: { pendingLeaveCount: 35 }, pendingLeaves: [{ id: 'leave', employeeName: 'Example', leaveType: 'ANNUAL', startDate: '2026-09-01', endDate: '2026-09-02' }] } });
        render(await HrdTasks()); expect(screen.getByText(/35 pengajuan/)).toBeTruthy(); expect(screen.queryAllByRole('link')).toHaveLength(0);
    });
    it('renders PO status and unknown total without desktop link', async () => {
        m.purchasing.mockResolvedValue({ success: true, data: { recentOrders: [{ id: 'po', poNumber: 'SYNTHETIC PO', supplierName: 'Example', status: 'DRAFT', totalAmount: null }] } });
        render(await PurchasingTasks()); expect(screen.getByText('Total: Belum tersedia')).toBeTruthy(); expect(screen.queryAllByRole('link')).toHaveLength(0);
    });
    it('excludes customer-owned and hidden-location quantities from physical stock', async () => {
        m.products.mockResolvedValue({ success: true, data: [{ id: 'p', name: 'Variant', skuCode: 'SYNTH', primaryUnit: 'KG', product: { name: 'Product', productType: 'FINISHED_GOOD' }, inventories: [{ locationId: 'own', quantity: 5 }, { locationId: 'customer', quantity: 90 }, { locationId: 'hidden', quantity: 40 }] }] });
        m.locations.mockResolvedValue({ success: true, data: [{ id: 'own', name: 'Company', locationType: 'OWNED', locationPurpose: 'FINISHED_GOOD' }, { id: 'customer', name: 'Customer inventory', locationType: 'CUSTOMER_OWNED', locationPurpose: 'FINISHED_GOOD' }] });
        const element = await StockPage();
        expect(element.props.products[0].inventories).toEqual([{ locationId: 'own', quantity: 5 }]);
        render(element); expect(screen.queryByText('Unknown')).toBeNull(); expect(screen.getByText('Total Stok Fisik')).toBeTruthy();
    });
    it('keeps no-portals on a terminal page instead of a redirect loop', async () => {
        m.portals.mockResolvedValue({ success: true, data: [] }); render(await SelectorPage());
        expect(screen.getByRole('status').textContent).toContain('Belum ada portal mobile'); expect(m.redirect).not.toHaveBeenCalled();
    });
    it('distinguishes absent and not-recorded and submits NO_RECORD as derived filter', () => {
        render(<HrdAttendanceClient initialFilters={{}} initialData={{ generatedAt: '', date: '2026-09-23', totalEmployees: 3, presentCount: 1, absentCount: 0, onLeaveCount: 0, noRecordCount: 2, shifts: [], records: [] }} />);
        expect(screen.getByText('Belum tercatat')).toBeTruthy();
        fireEvent.change(screen.getByLabelText('Status absensi'), { target: { value: 'NO_RECORD' } });
        fireEvent.click(screen.getByRole('button', { name: 'Terapkan' })); expect(m.push).toHaveBeenCalledWith('/hrd/mobile/attendance?date=2026-09-23&status=NO_RECORD');
    });
});
