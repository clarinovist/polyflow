// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import HdKioskPage from '../hd/page';
import PotongPlongKioskPage from '../potongplong/page';

const mocks = vi.hoisted(() => ({ session: vi.fn(), enabled: vi.fn(), orders: vi.fn(), machines: vi.fn(), employees: vi.fn(), form: vi.fn() }));
vi.mock('@/lib/auth/kiosk-operator-session', () => ({ getKioskOperatorSession: mocks.session }));
vi.mock('@/lib/core/tenant', () => ({ withTenantPage: (fn: unknown) => fn }));
vi.mock('@/services/settings/kiosk-feature-service', () => ({ readKioskFeatureSettings: mocks.enabled }));
vi.mock('@/actions/production/production-orders', () => ({ getProductionOrders: mocks.orders }));
vi.mock('@/actions/production/machines', () => ({ getMachines: mocks.machines }));
vi.mock('@/actions/admin/employees', () => ({ getEmployees: mocks.employees }));
vi.mock('../hd/HdProductionForm', () => ({ default: (props: unknown) => { mocks.form(props); return null; } }));
vi.mock('../potongplong/PotongPlongProductionForm', () => ({ default: (props: unknown) => { mocks.form(props); return null; } }));
vi.mock('next/navigation', () => ({ redirect: () => { throw new Error('redirect'); } }));

beforeEach(() => {
    vi.clearAllMocks();
    mocks.enabled.mockResolvedValue(true);
    mocks.session.mockResolvedValue({ employeeId: 'operator-1', name: 'Operator Uji', code: 'OP-TEST', tenantId: 'tenant-test' });
    const order = { id: 'order-1', orderNumber: 'SPK-TEST', notes: 'private-order-note', bom: { productVariant: {
        name: 'Produk Uji', primaryUnit: 'KG', salesUnit: 'BAL', conversionFactor: 10, costPrice: 123, sellingPrice: 456,
    } } };
    mocks.orders.mockResolvedValue([{ ...order, status: 'RELEASED' }, { ...order, id: 'closed', status: 'COMPLETED' }]);
    mocks.machines.mockResolvedValue({ success: true, data: [{ id: 'machine-1', name: 'Mesin Uji', costPerHour: 123 }] });
    mocks.employees.mockResolvedValue({ success: true, data: [
        { id: 'operator-1', name: 'Operator Uji', status: 'ACTIVE', pinHash: 'fake-secret', salary: 123, nik: 'fake-id', bankAccount: 'fake-account' },
        { id: 'inactive', name: 'Inactive Uji', status: 'INACTIVE' },
    ] });
});
afterEach(cleanup);

for (const [variant, Page] of [['HD', HdKioskPage], ['Potong/Plong', PotongPlongKioskPage]] as const) {
    describe(`${variant} public page DTO`, () => {
        it('passes only display identifiers/names/unit metadata to the client', async () => {
            render(await Page());
            expect(mocks.form.mock.calls[0][0]).toEqual({
                operator: { id: 'operator-1', name: 'Operator Uji' },
                orders: [{ id: 'order-1', orderNumber: 'SPK-TEST', bom: { productVariant: {
                    name: 'Produk Uji', primaryUnit: 'KG', salesUnit: 'BAL', conversionFactor: 10,
                } } }],
                machines: [{ id: 'machine-1', name: 'Mesin Uji' }], employees: [{ id: 'operator-1', name: 'Operator Uji' }],
            });
            const back = screen.getByRole('link', { name: /Kembali ke hub/ });
            expect(back.getAttribute('href')).toBe('/kiosk');
            expect(back.className).toContain('min-h-12');
        });
        it('requires a PIN session before reading any form data', async () => {
            mocks.session.mockResolvedValue(null);
            await expect(Page()).rejects.toThrow('redirect');
            expect(mocks.orders).not.toHaveBeenCalled();
            expect(mocks.employees).not.toHaveBeenCalled();
        });
        it('keeps the feature gate before data reads', async () => {
            mocks.enabled.mockResolvedValue(false);
            await expect(Page()).rejects.toThrow('redirect');
            expect(mocks.orders).not.toHaveBeenCalled();
        });
        it('keeps empty fallback lists when the existing read actions fail', async () => {
            mocks.machines.mockResolvedValue({ success: false });
            mocks.employees.mockResolvedValue({ success: false });
            render(await Page());
            expect(mocks.form.mock.calls[0][0]).toMatchObject({ machines: [], employees: [] });
        });
    });
}
