// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import ProductionHome from '../production/mobile/page';
import ProductionInsights from '../production/mobile/insights/page';
import ProductionTasks from '../production/mobile/tasks/page';
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
import SalesHome from '../field/sales/page';
import OrdersPage from '../field/sales/orders/page';
import ReceivablesPage from '../field/sales/receivables/page';
import SelectorPage from '../mobile/page';
import { HrdAttendanceClient } from '../hrd/mobile/attendance/attendance-client';
import WarehouseHome from '../warehouse/mobile/page';
const m = vi.hoisted(() => ({ production: vi.fn(), spkList: vi.fn(), exec: vi.fn(), finance: vi.fn(), hrd: vi.fn(), purchasing: vi.fn(), pipeline: vi.fn(), customers: vi.fn(), compliance: vi.fn(), followUps: vi.fn(), routePlan: vi.fn(), products: vi.fn(), locations: vi.fn(), orders: vi.fn(), receivables: vi.fn(), portals: vi.fn(), deliveries: vi.fn(), opname: vi.fn(), warehouseKpis: vi.fn(), receivablePos: vi.fn(), refresh: vi.fn(), push: vi.fn(), redirect: vi.fn(), auth: vi.fn() }));
vi.mock('@/actions/production/mobile-supervisor', () => ({ getProductionSupervisorOverview: m.production, getMobileSupervisorSpkList: m.spkList, getFactoryManagerExecutiveOverview: m.exec }));
vi.mock('@/actions/production/alert-threshold-settings', () => ({ getProductionAlertThresholdsForPage: async () => ({ success: false }) }));
vi.mock('@/actions/finance/mobile-dashboard', () => ({ getFinanceMobileOverview: m.finance }));
vi.mock('@/actions/hrd/mobile-dashboard', () => ({ getHrdMobileOverview: m.hrd }));
vi.mock('@/actions/purchasing/mobile-dashboard', () => ({ getPurchasingMobileOverview: m.purchasing }));
vi.mock('@/actions/inventory/inventory', () => ({ getProductVariants: m.products, getLocations: m.locations }));
vi.mock('@/actions/inventory/deliveries', () => ({ getOpenDeliveryOrders: m.deliveries }));
vi.mock('@/actions/inventory/opname', () => ({ getOpnameSessions: m.opname }));
vi.mock('@/actions/dashboard/warehouse-kpi', () => ({ getWarehouseTodayKPIs: m.warehouseKpis }));
vi.mock('@/services/purchasing/purchase-service', () => ({ PurchaseService: { listReceivablePurchaseOrders: m.receivablePos } }));
vi.mock('@/lib/core/tenant', () => ({
    withTenantPage: (fn: unknown) => fn,
    withTenant: (fn: unknown) => fn,
}));
vi.mock('@/actions/sales/field-actions', () => ({
    getMyFieldPipelineStats: m.pipeline,
    getMyFieldReceivables: m.receivables,
    getMyFieldCustomers: m.customers,
    getMyFieldComplianceStats: m.compliance,
    getMyFollowUpsToday: m.followUps,
    getMyFieldSalesOrders: m.orders,
}));
vi.mock('@/actions/sales/route-plans', () => ({ getTodayRoutePlan: m.routePlan }));
vi.mock('@/actions/settings/mobile-portals', () => ({ getMyMobilePortals: m.portals }));
vi.mock('@/auth', () => ({ auth: m.auth }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: m.refresh, push: m.push }), redirect: m.redirect }));
vi.mock('@/components/layout/mobile-account-menu-server', () => ({ MobileAccountMenuServer: () => null }));
vi.mock('@/components/ui/barcode-scanner', () => ({ BarcodeScanner: () => null }));
vi.mock('@/components/sales/mobile/VisitSyncBanner', () => ({ VisitSyncBanner: () => null }));
vi.mock('@/components/field/RouteTodaySection', () => ({ RouteTodaySection: () => null }));
vi.mock('@/components/field/PipelineSummaryCard', () => ({ PipelineSummaryCard: () => null }));
vi.mock('@/components/field/FollowUpTodaySection', () => ({ FollowUpTodaySection: () => null }));
vi.mock('../field/sales/orders/OrderListClient', () => ({ OrderListClient: () => <p>Orders</p> }));
vi.mock('../field/sales/receivables/ReceivablesListClient', () => ({ ReceivablesListClient: () => <p>Receivables</p> }));
afterEach(cleanup);
beforeEach(() => {
    vi.resetAllMocks();
    for (const fn of [m.production, m.exec, m.finance, m.hrd, m.purchasing, m.pipeline, m.customers, m.compliance, m.followUps, m.routePlan, m.products, m.locations, m.orders, m.receivables, m.portals, m.deliveries, m.opname]) fn.mockResolvedValue({ success: false });
    m.warehouseKpis.mockResolvedValue({ shippedToday: 0, receivedToday: 0 });
    m.receivablePos.mockResolvedValue([]);
    m.auth.mockResolvedValue({ user: { id: 'synthetic', role: 'FINANCE' } });
});
describe('mobile read states', () => {
    it.each([ProductionHome, ProductionInsights, FinanceHome, FinanceInsights, FinanceTasks, HrdHome, HrdInsights, HrdTasks, PurchasingHome, PurchasingInsights, PurchasingTasks, StockPage, OrdersPage, ReceivablesPage, SelectorPage])('%s shows unavailable and retry, not a zero dashboard', async (Page) => {
        render(await Page()); expect(screen.getByRole('alert')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Coba lagi' })); expect(m.refresh).toHaveBeenCalled();
    });
    it('does not render a summed mixed-unit production target', async () => {
        m.auth.mockResolvedValue({
            user: { id: 'production', role: 'PRODUCTION' },
        });
        m.production.mockResolvedValue({
            success: true,
            data: {
                generatedAt: '2026-10-09T00:00:00.000Z',
                highlights: {
                    activeOrdersCount: 2,
                    outputToday: 12,
                    targetToday: null,
                    targetUnitMode: 'MIXED',
                    targetUnit: null,
                    downtimeMinutesToday: 0,
                    scrapToday: 0,
                    qcPendingCount: 0,
                },
                recentOrders: [],
                downtimeAlerts: [],
            },
        });

        render(await ProductionHome());

        expect(screen.getByText('Belum dikonfigurasi')).toBeTruthy();
        expect(screen.queryByText(/campuran/i)).toBeNull();
    });

    it('explains that mixed-unit target efficiency is not configured', async () => {
        m.production.mockResolvedValue({
            success: true,
            data: {
                generatedAt: '2026-10-09T00:00:00.000Z',
                highlights: {
                    activeOrdersCount: 2,
                    outputToday: 12,
                    targetToday: null,
                    targetUnitMode: 'MIXED',
                    targetUnit: null,
                    downtimeMinutesToday: 0,
                    scrapToday: 0,
                    qcPendingCount: 0,
                },
                recentOrders: [],
                downtimeAlerts: [],
            },
        });

        render(await ProductionInsights());

        expect(screen.getByText('Belum dikonfigurasi')).toBeTruthy();
        expect(
            screen.getByText(/target lintas satuan belum dikonfigurasi/i),
        ).toBeTruthy();
        expect(screen.queryByText(/150.*campuran/i)).toBeNull();
    });

    it('keeps a failed Sales home read distinct from an empty dashboard', async () => {
        render(await SalesHome());
        expect(screen.getByRole('alert').textContent).toContain(
            'Ringkasan sales lapangan belum tersedia',
        );
        expect(screen.queryByText(/Selamat/)).toBeNull();
    });

    it('keeps a failed warehouse read distinct from an empty dashboard', async () => {
        render(await WarehouseHome());
        expect(screen.getByRole('alert').textContent).toContain(
            'Ringkasan gudang belum tersedia',
        );
        expect(screen.queryByText('Gudang Mobile')).toBeNull();
    });

    it('hides quick SPK from Factory Manager even with a secondary production role', async () => {
        m.auth.mockResolvedValue({
            user: {
                id: 'manager',
                role: 'FACTORY_MANAGER',
                roles: ['FACTORY_MANAGER', 'PRODUCTION'],
            },
        });
        m.spkList.mockResolvedValue({
            success: true,
            data: { items: [], total: 0 },
        });
        render(
            await ProductionTasks({
                searchParams: Promise.resolve({}),
            }),
        );
        expect(screen.queryByText('Buat SPK')).toBeNull();
    });

    it('renders useful invoice facts without a desktop dead-end link', async () => {
        m.finance.mockResolvedValue({
            success: true,
            data: {
                generatedAt: '2026-10-07T00:00:00.000Z',
                query: { type: 'AP', due: 'OVERDUE', bucket: 'ALL', page: 1 },
                counts: { total: 1, returned: 1, ar: 0, ap: 1, hasNext: false, pageSizePerType: 10 },
                invoices: [{ id: 'inv', type: 'AP', invoiceNumber: 'SYNTHETIC', partnerName: 'Example', invoiceDate: '2026-08-01T00:00:00Z', dueDate: '2026-09-01T00:00:00Z', remainingAmount: 600, status: 'PARTIAL', bucket: '1_30' }],
            },
        });
        render(await FinanceTasks());
        expect(screen.getByText('Sisa tagihan')).toBeTruthy();
        expect(screen.getByText(/Pembayaran, posting jurnal/)).toBeTruthy();
        expect(screen.getByRole('link', { name: /SYNTHETIC/ }).getAttribute('href')).toBe('/finance/mobile/invoices/ap/inv');
    });
    it('shows leaves inline and the full pending count', async () => {
        m.hrd.mockResolvedValue({ success: true, data: { highlights: { pendingLeaveCount: 35 }, pendingLeaves: [{ id: 'leave', employeeName: 'Example', leaveType: 'ANNUAL', startDate: '2026-09-01', endDate: '2026-09-02' }] } });
        render(await HrdTasks()); expect(screen.getByText(/35 pengajuan/)).toBeTruthy(); expect(screen.queryAllByRole('link')).toHaveLength(0);
    });
    it('renders an exception queue with mobile-safe detail links and no mutation control', async () => {
        m.purchasing.mockResolvedValue({
            success: true,
            data: {
                generatedAt: '2026-10-07T00:00:00.000Z',
                filter: 'DRAFT_PO',
                queue: {
                    total: 1,
                    returned: 1,
                    items: [{
                        id: 'po',
                        kind: 'DRAFT_PO',
                        title: 'SYNTHETIC PO',
                        subtitle: 'Example',
                        status: 'DRAFT',
                        priority: 'NORMAL',
                        href: '/purchasing/mobile/orders/po',
                        sortAt: '2026-10-07T00:00:00.000Z',
                    }],
                },
            },
        });
        render(await PurchasingTasks({
            searchParams: Promise.resolve({ filter: 'DRAFT_PO' }),
        }));
        expect(screen.getByText(/Menampilkan 1 dari 1 exception/)).toBeTruthy();
        expect(screen.getByRole('link', { name: /SYNTHETIC PO/ }).getAttribute('href')).toBe('/purchasing/mobile/orders/po');
        expect(screen.queryByRole('button', { name: /approve|setuju|ubah/i })).toBeNull();
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

    it('shows a direct-route denial without auto-redirecting the only remaining portal', async () => {
        m.portals.mockResolvedValue({
            success: true,
            data: [{
                id: 'finance', title: 'Finance Mobile', description: 'Ringkasan',
                path: '/finance/mobile', icon: 'Wallet', status: 'ACTIVE',
            }],
        });
        render(await SelectorPage({
            searchParams: Promise.resolve({ reason: 'resource' }),
        }));
        expect(screen.getByRole('alert').textContent).toContain('dicabut');
        expect(m.redirect).not.toHaveBeenCalled();
    });
    it('distinguishes absent and not-recorded and submits NO_RECORD as derived filter', () => {
        render(<HrdAttendanceClient initialFilters={{}} initialData={{ generatedAt: '', date: '2026-09-23', totalEmployees: 3, presentCount: 1, absentCount: 0, onLeaveCount: 0, noRecordCount: 2, shifts: [], records: [] }} />);
        expect(screen.getByText('Belum tercatat')).toBeTruthy();
        fireEvent.change(screen.getByLabelText('Status absensi'), { target: { value: 'NO_RECORD' } });
        fireEvent.click(screen.getByRole('button', { name: 'Terapkan' })); expect(m.push).toHaveBeenCalledWith('/hrd/mobile/attendance?date=2026-09-23&status=NO_RECORD');
    });
});
