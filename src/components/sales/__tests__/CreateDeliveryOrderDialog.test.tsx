// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateDeliveryOrderDialog } from '../CreateDeliveryOrderDialog';

const mocks = vi.hoisted(() => ({
    orders: vi.fn(), detail: vi.fn(), locations: vi.fn(), vehicles: vi.fn(),
    tariff: vi.fn(), routes: vi.fn(), create: vi.fn(), refresh: vi.fn(), error: vi.fn(),
}));
vi.mock('@/actions/sales/sales', () => ({ getSalesOrders: mocks.orders, getSalesOrderById: mocks.detail }));
vi.mock('@/actions/inventory/inventory', () => ({ getLocations: mocks.locations }));
vi.mock('@/actions/inventory/deliveries', () => ({ createManualDeliveryOrder: mocks.create }));
vi.mock('@/actions/sales/vehicles', () => ({ getVehicles: mocks.vehicles }));
vi.mock('@/actions/sales/vehicle-tariffs', () => ({ getActiveTariff: mocks.tariff, listVehicleRouteOptions: mocks.routes }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh, push: vi.fn() }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: mocks.error } }));
// Keep selection deterministic in jsdom; the dialog and business handlers are real.
vi.mock('@/components/ui/select', () => ({
    Select: ({ children, value, onValueChange, disabled }: { children: ReactNode; value: string; onValueChange: (value: string) => void; disabled?: boolean }) => (
        <select value={value} onChange={(event) => onValueChange(event.target.value)} disabled={disabled}>
            <option value="">Pilih</option>{children}
        </select>
    ),
    SelectTrigger: () => null,
    SelectValue: () => null,
    SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
    SelectItem: ({ children, value }: { children: ReactNode; value: string }) => <option value={value}>{children}</option>,
}));

function line(overrides = {}) {
    return {
        id: 'item', quantity: '150', deliveredQty: '0', enteredQuantity: null, enteredUnit: null,
        productVariant: { name: 'Varian', primaryUnit: 'KG', salesUnit: 'BAL', conversionFactor: '5', product: { name: 'Barang Uji', productType: 'FINISHED_GOOD' } },
        ...overrides,
    };
}
function order(items = [line()]) {
    return { id: 'so', orderNumber: 'SO-TEST', customer: { name: 'Pelanggan Uji' }, items };
}
const success = (data: unknown) => ({ success: true, data });
beforeEach(() => {
    vi.resetAllMocks();
    mocks.orders.mockResolvedValue(success([order(), { ...order(), id: 'other', orderNumber: 'SO-OTHER' }]));
    mocks.detail.mockResolvedValue(success(order()));
    mocks.locations.mockResolvedValue(success([{ id: 'warehouse', name: 'Gudang Uji' }]));
    mocks.vehicles.mockResolvedValue(success([{ id: 'vehicle', name: 'Truk Uji', plateNumber: 'TEST', ownershipType: 'OWNED' }]));
    mocks.routes.mockResolvedValue(success([]));
    mocks.tariff.mockResolvedValue(success({ rateType: 'PER_KG', costRate: 2, chargeRate: 3 }));
    mocks.create.mockResolvedValue(success({ id: 'do' }));
});
afterEach(cleanup);

async function open() {
    render(<CreateDeliveryOrderDialog />);
    fireEvent.click(screen.getByRole('button', { name: 'Buat Surat Jalan Manual' }));
    await screen.findByRole('option', { name: 'SO-TEST — Pelanggan Uji' });
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'so' } });
    await screen.findByText('Item dalam SO');
}
function weightInput() {
    return screen.getByLabelText<HTMLInputElement>('Estimasi Berat (Kg)');
}
async function chooseFreight() {
    fireEvent.change(screen.getAllByRole('combobox')[1], { target: { value: 'warehouse' } });
    fireEvent.change(screen.getAllByRole('combobox')[2], { target: { value: 'vehicle' } });
    await screen.findByText('Tarif: Per Kg');
}
function submit() {
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Buat Surat Jalan' }));
}

describe('delivery order units and freight weight', () => {
    it('converts legacy base quantities instead of attaching the sales unit to an unchanged number', async () => {
        await open();
        expect(screen.getByText('30 BAL (150 KG)')).toBeTruthy();
        expect(weightInput().value).toBe('150');
    });

    it('keeps snapshot display and uses base KG, not BAL counts or the changed master factor, for freight', async () => {
        const item = line({ quantity: '750', enteredQuantity: '150', enteredUnit: 'BAL', conversionFactorSnapshot: '5' });
        item.productVariant.conversionFactor = '10';
        mocks.detail.mockResolvedValue(success(order([item, { ...item, id: 'second' }])));
        await open();
        expect(screen.getAllByText(/150 BAL \(750 KG\)/)).toHaveLength(2);
        expect(weightInput().value).toBe('1500');
        await chooseFreight();
        submit();
        await waitFor(() => expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
            estimatedWeightKg: 1500, totalCost: 3000, totalCharge: 4500,
        })));
    });

    it('estimates only residual physical items, not delivered goods or services', async () => {
        const service = line({ id: 'service', quantity: '500' });
        service.productVariant.product.productType = 'SERVICE';
        mocks.detail.mockResolvedValue(success(order([line({ deliveredQty: '100' }), service])));
        await open();
        expect(weightInput().value).toBe('50');
        expect(screen.getByText('50 kg')).toBeTruthy();
    });

    it('clears the previous estimate for mixed unknown units and requires manual KG for per-KG freight', async () => {
        await open();
        const countItem = line({ id: 'count', quantity: '20' });
        countItem.productVariant.primaryUnit = 'PCS';
        countItem.productVariant.salesUnit = 'PCS';
        mocks.detail.mockResolvedValue(success(order([line(), countItem])));
        fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'other' } });
        await waitFor(() => expect(weightInput().value).toBe(''));
        expect(screen.getByText('Isi berat manual')).toBeTruthy();
        await chooseFreight();
        submit();
        expect(mocks.create).not.toHaveBeenCalled();
        expect(mocks.error).toHaveBeenCalledWith('Isi estimasi berat yang valid untuk tarif per kg');
        fireEvent.change(weightInput(), { target: { value: '42.5' } });
        expect(screen.getByText('42,5 kg')).toBeTruthy();
        submit();
        await waitFor(() => expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
            estimatedWeightKg: 42.5, totalCost: 85, totalCharge: 127.5,
        })));
    });

    it('ignores a late SO response and blocks submission while the current detail loads', async () => {
        await open();
        let resolveOld!: (value: ReturnType<typeof success>) => void;
        mocks.detail.mockReturnValueOnce(new Promise((resolve) => { resolveOld = resolve; }));
        fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'other' } });
        expect(weightInput().value).toBe('');
        expect(within(screen.getByRole('dialog')).getByRole<HTMLButtonElement>('button', { name: 'Buat Surat Jalan' }).disabled).toBe(true);
        mocks.detail.mockResolvedValueOnce(success(order([line({ quantity: '40' })])));
        fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'so' } });
        await waitFor(() => expect(weightInput().value).toBe('40'));
        await act(async () => resolveOld(success(order([line({ quantity: '999' })]))));
        expect(weightInput().value).toBe('40');
        expect(screen.getByText('40 kg')).toBeTruthy();
    });

    it('does not restore stale weight after closing and reopening the dialog', async () => {
        await open();
        let resolveOld!: (value: ReturnType<typeof success>) => void;
        mocks.detail.mockReturnValueOnce(new Promise((resolve) => { resolveOld = resolve; }));
        fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'other' } });
        fireEvent.click(screen.getByRole('button', { name: 'Batal' }));
        await act(async () => resolveOld(success(order([line({ quantity: '999' })]))));
        fireEvent.click(screen.getByRole('button', { name: 'Buat Surat Jalan Manual' }));
        expect(weightInput().value).toBe('');
        expect(screen.queryByText('Item dalam SO')).toBeNull();
    });

    it('clears weight if the new SO cannot be loaded', async () => {
        await open();
        mocks.detail.mockResolvedValueOnce({ success: false, error: 'Tidak tersedia' });
        fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'other' } });
        await waitFor(() => expect(screen.queryByText('Memuat detail SO...')).toBeNull());
        expect(weightInput().value).toBe('');
        expect(screen.queryByText('Item dalam SO')).toBeNull();
    });

    it('leaves flat-rate charges unchanged when weight is unknown', async () => {
        const item = line();
        item.productVariant.primaryUnit = 'PCS';
        item.productVariant.salesUnit = 'PCS';
        mocks.detail.mockResolvedValue(success(order([item])));
        mocks.tariff.mockResolvedValue(success({ rateType: 'FLAT', costRate: 20, chargeRate: 30 }));
        await open();
        fireEvent.change(screen.getAllByRole('combobox')[1], { target: { value: 'warehouse' } });
        fireEvent.change(screen.getAllByRole('combobox')[2], { target: { value: 'vehicle' } });
        await screen.findByText('Tarif: Flat Rate');
        submit();
        await waitFor(() => expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
            estimatedWeightKg: undefined, totalCost: 20, totalCharge: 30,
        })));
    });
});
