// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ScheduleDetailClient } from '../ScheduleDetailClient';

type Schedule = ComponentProps<typeof ScheduleDetailClient>['schedule'];
type Trip = Schedule['vehicles'][number];
type Stop = Trip['orders'][number];
type Item = NonNullable<Stop['salesOrder']>['items'][number];
type AddPayload = Parameters<typeof import('@/actions/sales/delivery-schedules').scheduleSOWithTrip>[1];
type AssignPayload = Parameters<typeof import('@/actions/sales/delivery-schedules').assignSalesOrderToTrip>[1];
type Result = { success: boolean; error?: string };
type GenerateResult = Result & { data?: { ok: string[]; failed: { stopId: string; error: string }[] } };

// Actual component, leaves, Radix, Link and timeline; only action/router/toast
// boundaries are mocked. Synthetic DTOs do not claim DB/permission verification.
const mocks = vi.hoisted(() => ({
    vehicles: vi.fn(), orders: vi.fn(), timeline: vi.fn(),
    add: vi.fn<(id: string, data: AddPayload) => Promise<Result>>(),
    assign: vi.fn<(id: string, data: AssignPayload) => Promise<Result>>(),
    status: vi.fn<(id: string, data: { status: string }) => Promise<Result>>(),
    tripStatus: vi.fn<(id: string, status: string) => Promise<Result>>(),
    removeTrip: vi.fn<(id: string) => Promise<Result>>(),
    removeStop: vi.fn<(id: string) => Promise<Result>>(),
    removeSchedule: vi.fn<(id: string) => Promise<Result>>(),
    generate: vi.fn<(id: string) => Promise<GenerateResult>>(),
    refresh: vi.fn(), push: vi.fn(),
    success: vi.fn(), error: vi.fn(), warning: vi.fn(),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh, push: mocks.push }) }));
vi.mock('@/actions/sales/delivery-schedules', () => ({
    updateDeliverySchedule: mocks.status, updateTripStatus: mocks.tripStatus,
    removeVehicleFromSchedule: mocks.removeTrip, assignSalesOrderToTrip: mocks.assign,
    generateDeliveryOrdersForTrip: mocks.generate, removeOrderFromSchedule: mocks.removeStop,
    listSchedulableSalesOrders: mocks.orders, deleteDeliverySchedule: mocks.removeSchedule,
    scheduleSOWithTrip: mocks.add,
}));
vi.mock('@/actions/sales/vehicles', () => ({ getVehicles: mocks.vehicles }));
vi.mock('@/actions/audit/entity-timeline', () => ({ getEntityStatusTimeline: mocks.timeline }));
vi.mock('sonner', () => ({ toast: { success: mocks.success, error: mocks.error, warning: mocks.warning } }));

const DAY = '2026-09-15';
const vehicle = {
    id: 'fixture-vehicle', plateNumber: 'SYNTHETIC-01', name: 'Synthetic truck',
    capacityKg: 100, driverName: 'Synthetic driver', status: 'ACTIVE',
};
function item(id: string, unit: string, quantity: number, deliveredQty: number): Item {
    return {
        id, quantity, deliveredQty, enteredQuantity: null, enteredUnit: null,
        productVariant: { id: `variant-${id}`, name: `Synthetic ${id}`, skuCode: id, primaryUnit: unit },
    };
}
const order = {
    id: 'fixture-so', orderNumber: 'SO-SYNTHETIC-01',
    customer: { id: 'fixture-customer', name: 'Synthetic customer' },
    remainingQty: 110, alreadyPlanned: true,
    items: [item('kg', 'KG', 125.7, 20), item('lower-kg', 'kg', 10, 8), item('over', 'KG', 3, 5), item('bag', 'ZAK', 700, 2)],
};
const nonKgOrder = {
    ...order, id: 'fixture-so-nonkg', orderNumber: 'SO-SYNTHETIC-02', alreadyPlanned: false,
    items: [item('roll', 'ROLL', 80, 10)],
};
function stop(overrides: Partial<Stop> = {}): Stop {
    return {
        id: 'fixture-stop', status: 'PLANNED', activityType: 'DELIVERY', activityLabel: null,
        activityCustomer: null, plannedWeightKg: 108, sequence: 0, notes: null,
        deliveryOrder: null, salesOrder: order, ...overrides,
    };
}
function trip(overrides: Partial<Trip> = {}): Trip {
    return {
        id: 'fixture-trip', vehicleId: vehicle.id, transportMode: 'INTERNAL_FLEET',
        departureDate: `${DAY}T08:00:00.000Z`, routeName: 'Synthetic route', runNumber: 'A',
        status: 'PLANNED', notes: null, externalProvider: null, externalPlate: null,
        externalDriver: null, cancelReason: null, vehicle, orders: [stop()], ...overrides,
    };
}
function schedule(overrides: Partial<Schedule> = {}): Schedule {
    return {
        id: 'fixture-schedule', scheduleNumber: 'SCH-SYNTHETIC',
        weekStart: '2026-09-14T00:00:00.000Z', weekEnd: '2026-09-20T00:00:00.000Z',
        status: 'DRAFT', notes: null, createdBy: { name: 'Synthetic planner' },
        vehicles: [trip()], ...overrides,
    };
}
function delivery(): NonNullable<Stop['deliveryOrder']> {
    return { id: 'fixture-do', orderNumber: 'DO-SYNTHETIC', totalCharge: 100, status: 'DRAFT', salesOrder: order };
}
const originalScrollIntoView = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollIntoView');
beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
    mocks.vehicles.mockResolvedValue({ success: true, data: [vehicle] });
    mocks.orders.mockResolvedValue({ success: true, data: [order, nonKgOrder] });
    mocks.timeline.mockResolvedValue({ success: true, data: [] });
    for (const action of [mocks.add, mocks.assign, mocks.status, mocks.tripStatus, mocks.removeTrip, mocks.removeStop, mocks.removeSchedule]) {
        action.mockResolvedValue({ success: true });
    }
    mocks.generate.mockResolvedValue({ success: true, data: { ok: ['fixture-do'], failed: [] } });
});
afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    if (originalScrollIntoView) Object.defineProperty(Element.prototype, 'scrollIntoView', originalScrollIntoView);
    else Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
});
async function mount(value = schedule()) {
    const view = render(<ScheduleDetailClient schedule={value} />);
    await screen.findByText('Belum ada perubahan status tercatat.');
    expect(mocks.vehicles).toHaveBeenCalledWith({ status: 'ACTIVE' });
    expect(mocks.orders).toHaveBeenCalledWith({ scheduleId: value.id });
    expect(mocks.timeline).toHaveBeenCalledWith('DeliverySchedule', value.id);
    return view;
}
async function choose(trigger: HTMLElement, name: RegExp) {
    fireEvent.click(trigger);
    fireEvent.click(await screen.findByRole('option', { name }));
}
function dateInput(): HTMLInputElement {
    const input = document.querySelector<HTMLInputElement>('input[type="date"]');
    if (!input) throw new Error('Date input missing');
    return input;
}
async function openAdd(orderNumber = order.orderNumber, date = DAY) {
    fireEvent.click(screen.getByRole('button', { name: 'Tambah SO' }));
    await choose(screen.getAllByRole('combobox')[0], new RegExp(orderNumber));
    fireEvent.change(dateInput(), { target: { value: date } });
    await choose(screen.getAllByRole('combobox')[1], /SYNTHETIC-01/);
}
function submit() { fireEvent.click(screen.getByRole('button', { name: 'Tambah ke Rencana' })); }
function stopRow() { return within(screen.getByRole('table')).getAllByRole('row')[1]; }
function tripCard() {
    const card = screen.getByText('Synthetic route', { exact: false }).closest('.border.rounded-lg');
    if (!(card instanceof HTMLElement)) throw new Error('Trip card missing');
    return within(card);
}
function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((done) => { resolve = done; });
    return { promise, resolve };
}

describe('ScheduleDetailClient characterization', () => {
    it('auto-selects the single matching trip and submits KG-only positive residual rounded weight with real IDs/date', async () => {
        await mount();
        await openAdd();
        expect((screen.getByRole('radio', { name: /Gabung ke Trip #1/ }) as HTMLInputElement).checked).toBe(true);
        expect((screen.getByRole('spinbutton') as HTMLInputElement).value).toBe('108');
        expect(screen.getByText(/Item non-KG tidak dihitung otomatis/).textContent).toContain('ZAK');
        expect(screen.getByText('Detail Barang & Sisa Qty di SO:')).toBeTruthy();
        expect(dateInput().min).toBe('2026-09-14');
        expect(dateInput().max).toBe('2026-09-20');
        submit();
        await waitFor(() => expect(mocks.add).toHaveBeenCalledWith('fixture-schedule', {
            salesOrderId: order.id, vehicleId: vehicle.id, departureDate: new Date(DAY),
            plannedWeightKg: 108, existingTripId: 'fixture-trip',
        }));
        await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
        expect(mocks.success).toHaveBeenCalledWith('SO berhasil ditambahkan.');
        expect(screen.queryByRole('spinbutton')).toBeNull();
    });

    it('allows an explicit new trip and manual weight, disables pending submission, then resets the form', async () => {
        const pending = deferred<Result>();
        mocks.add.mockReturnValueOnce(pending.promise);
        await mount();
        await openAdd();
        fireEvent.click(screen.getByRole('radio', { name: /Buat trip baru/ }));
        fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '55.5' } });
        submit();
        await waitFor(() => expect(mocks.add).toHaveBeenCalledOnce());
        expect(mocks.add.mock.calls[0][1]).toEqual({
            salesOrderId: order.id, vehicleId: vehicle.id, departureDate: new Date(DAY),
            plannedWeightKg: 55.5, existingTripId: undefined,
        });
        expect((screen.getByRole('button', { name: 'Tambah ke Rencana' }) as HTMLButtonElement).disabled).toBe(true);
        expect(mocks.refresh).not.toHaveBeenCalled();
        await act(async () => pending.resolve({ success: true }));
        fireEvent.click(screen.getByRole('button', { name: 'Tambah SO' }));
        expect(dateInput().value).toBe('');
        expect((screen.getByRole('spinbutton') as HTMLInputElement).value).toBe('');
        expect((screen.getByRole('button', { name: 'Tambah ke Rencana' }) as HTMLButtonElement).disabled).toBe(true);
    });

    it('excludes non-KG residuals and creates a new trip automatically when the day has no match', async () => {
        await mount();
        await openAdd(nonKgOrder.orderNumber, '2026-09-16');
        expect(screen.queryByRole('radio')).toBeNull();
        expect(screen.getByText(/Belum ada trip untuk armada/)).toBeTruthy();
        expect((screen.getByRole('spinbutton') as HTMLInputElement).value).toBe('');
        submit();
        await waitFor(() => expect(mocks.add).toHaveBeenCalledOnce());
        expect(mocks.add.mock.calls[0][1]).toEqual({
            salesOrderId: nonKgOrder.id, vehicleId: vehicle.id,
            departureDate: new Date('2026-09-16'), plannedWeightKg: undefined, existingTripId: undefined,
        });
    });

    it('does not auto-select multiple eligible trips and excludes cancelled trips from matching', async () => {
        await mount(schedule({ vehicles: [trip(), trip({ id: 'fixture-second', status: 'CONFIRMED', orders: [] }), trip({ id: 'fixture-cancelled', status: 'CANCELLED', orders: [] })] }));
        await openAdd();
        expect(screen.getAllByRole('radio')).toHaveLength(3);
        expect(screen.getAllByRole('radio').every((radio) => !(radio as HTMLInputElement).checked)).toBe(true);
        fireEvent.click(screen.getByRole('radio', { name: /Gabung ke Trip #2/ }));
        submit();
        await waitFor(() => expect(mocks.add).toHaveBeenCalledOnce());
        expect(mocks.add.mock.calls[0][1].existingTripId).toBe('fixture-second');
    });

    it('preserves add errors, selection on failure, cancellation, and no refresh for rejected actions', async () => {
        mocks.add.mockResolvedValueOnce({ success: false, error: 'Synthetic add rejected' }).mockRejectedValueOnce(new Error('Synthetic failure'));
        await mount();
        await openAdd();
        submit();
        await waitFor(() => expect(mocks.error).toHaveBeenCalledWith('Synthetic add rejected'));
        expect((screen.getByRole('spinbutton') as HTMLInputElement).value).toBe('108');
        submit();
        await waitFor(() => expect(mocks.error).toHaveBeenCalledWith('Gagal menambah SO.'));
        expect(mocks.refresh).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'Batal' }));
        expect(screen.queryByRole('spinbutton')).toBeNull();
    });

    it('assigns a falsy-trip-ID stop using SO identity and preserves the missing-SO guard', async () => {
        // Real schedule IDs always attach tripId to every stop. An explicit
        // empty-ID synthetic DTO exercises the existing otherwise dormant UI;
        // this is not evidence that persisted stops can be unassigned.
        const view = await mount(schedule({ vehicles: [trip({ id: '', vehicle: { ...vehicle, plateNumber: 'SYNTHETIC-SOURCE' }, orders: [stop()] }), trip({ id: 'fixture-target', orders: [] })] }));
        await choose(within(stopRow()).getByRole('combobox'), /SYNTHETIC-01/);
        await waitFor(() => expect(mocks.assign).toHaveBeenCalledWith('fixture-target', { salesOrderId: order.id, plannedWeightKg: 108 }));
        await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
        view.rerender(<ScheduleDetailClient schedule={schedule({ vehicles: [trip({ id: '', vehicle: { ...vehicle, plateNumber: 'SYNTHETIC-SOURCE' }, orders: [stop({ salesOrder: null })] }), trip({ id: 'fixture-target', orders: [] })] })} />);
        await choose(within(stopRow()).getByRole('combobox'), /SYNTHETIC-01/);
        await waitFor(() => expect(mocks.error).toHaveBeenCalledWith('Stop tidak punya SO.'));
        expect(mocks.assign).toHaveBeenCalledOnce();
    });

    it('removes stops/trips by their IDs only after confirmation and preserves refresh semantics', async () => {
        await mount();
        vi.mocked(window.confirm).mockReturnValueOnce(false);
        fireEvent.click(within(stopRow()).getByRole('button'));
        expect(mocks.removeStop).not.toHaveBeenCalled();
        fireEvent.click(within(stopRow()).getByRole('button'));
        await waitFor(() => expect(mocks.removeStop).toHaveBeenCalledWith('fixture-stop'));
        await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1));
        fireEvent.click(tripCard().getByRole('button', { name: '' }));
        await waitFor(() => expect(mocks.removeTrip).toHaveBeenCalledWith('fixture-trip'));
        expect(window.confirm).toHaveBeenLastCalledWith('Yakin hapus trip "SYNTHETIC-01"? Stop akan dikembalikan ke "Belum diatur".');
        await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(2));
    });

    it('distinguishes generated DO partial success, action error and thrown failure without false refreshes', async () => {
        mocks.generate.mockResolvedValueOnce({ success: true, data: { ok: ['fixture-do'], failed: [{ stopId: 'fixture-other', error: 'Synthetic rejected' }] } })
            .mockResolvedValueOnce({ success: false, error: 'Synthetic generation rejected' })
            .mockRejectedValueOnce(new Error('Synthetic failure'));
        await mount();
        const generate = () => fireEvent.click(screen.getByRole('button', { name: 'Buat Semua SJ (1)' }));
        generate();
        await waitFor(() => expect(mocks.warning).toHaveBeenCalledWith('1 SJ dibuat, 1 gagal.'));
        expect(mocks.generate).toHaveBeenLastCalledWith('fixture-trip');
        expect(mocks.refresh).toHaveBeenCalledOnce();
        generate();
        await waitFor(() => expect(mocks.error).toHaveBeenCalledWith('Synthetic generation rejected'));
        generate();
        await waitFor(() => expect(mocks.error).toHaveBeenCalledWith('Gagal generate SJ.'));
        expect(mocks.refresh).toHaveBeenCalledOnce();
        expect((screen.getByRole('button', { name: 'Buat Semua SJ (1)' }) as HTMLButtonElement).disabled).toBe(false);
    });

    it('keeps trip lifecycle gates, capacity overflow, successful generation and delivery links', async () => {
        const view = await mount();
        expect(screen.getByText('108%')).toBeTruthy();
        expect(document.querySelector('.bg-red-500')?.getAttribute('style')).toBe('width: 100%;');
        fireEvent.click(screen.getByRole('button', { name: 'Konfirmasi' }));
        await waitFor(() => expect(mocks.tripStatus).toHaveBeenCalledWith('fixture-trip', 'CONFIRMED'));
        fireEvent.click(screen.getByRole('button', { name: 'Buat Semua SJ (1)' }));
        await waitFor(() => expect(mocks.success).toHaveBeenCalledWith('1 Surat Jalan berhasil dibuat.'));
        view.rerender(<ScheduleDetailClient schedule={schedule({ vehicles: [trip({ status: 'CONFIRMED' })] })} />);
        expect(screen.queryByRole('button', { name: 'Berangkat' })).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Batal' }));
        await waitFor(() => expect(mocks.tripStatus).toHaveBeenCalledWith('fixture-trip', 'PLANNED'));
        view.rerender(<ScheduleDetailClient schedule={schedule({ vehicles: [trip({ status: 'CONFIRMED', orders: [stop({ deliveryOrder: delivery() })] })] })} />);
        expect(screen.getByRole('link', { name: 'DO-SYNTHETIC' }).getAttribute('href')).toBe('/sales/deliveries');
        expect(screen.queryByRole('button', { name: /Buat Semua SJ/ })).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Berangkat' }));
        await waitFor(() => expect(mocks.tripStatus).toHaveBeenCalledWith('fixture-trip', 'DEPARTED'));
        view.rerender(<ScheduleDetailClient schedule={schedule({ vehicles: [trip({ status: 'DEPARTED' })] })} />);
        fireEvent.click(screen.getByRole('button', { name: 'Selesai' }));
        await waitFor(() => expect(mocks.tripStatus).toHaveBeenCalledWith('fixture-trip', 'COMPLETED'));
    });

    it('preserves draft/active/closed visibility and delete gating by linked DO rather than schedule status', async () => {
        const view = await mount();
        expect(screen.getByRole('button', { name: 'Aktifkan' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Tambah SO' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Hapus Jadwal' })).toBeTruthy();
        view.rerender(<ScheduleDetailClient schedule={schedule({ status: 'ACTIVE' })} />);
        expect(screen.queryByRole('button', { name: 'Aktifkan' })).toBeNull();
        expect(screen.getByRole('button', { name: 'Tutup Minggu' })).toBeTruthy();
        expect(tripCard().queryByRole('button', { name: '' })).toBeNull();
        view.rerender(<ScheduleDetailClient schedule={schedule({ status: 'CLOSED' })} />);
        expect(screen.getByRole('button', { name: 'Buka Kembali' })).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'Tambah SO' })).toBeNull();
        expect(within(stopRow()).queryByRole('button')).toBeNull();
        expect(screen.getByRole('button', { name: 'Hapus Jadwal' })).toBeTruthy();
        // Existing trip actions are NOT gated by isEditable; preserve, don't fix.
        expect(screen.getByRole('button', { name: 'Konfirmasi' })).toBeTruthy();
        view.rerender(<ScheduleDetailClient schedule={schedule({ status: 'CLOSED', vehicles: [trip({ orders: [stop({ deliveryOrder: delivery() })] })] })} />);
        expect(screen.queryByRole('button', { name: 'Hapus Jadwal' })).toBeNull();
    });

    it('sends schedule transitions, holds pending gates and refreshes only a successful status update', async () => {
        const pending = deferred<Result>();
        mocks.status.mockReturnValueOnce(pending.promise).mockResolvedValueOnce({ success: true });
        const view = await mount();
        fireEvent.click(screen.getByRole('button', { name: 'Aktifkan' }));
        expect(mocks.status).toHaveBeenCalledWith('fixture-schedule', { status: 'ACTIVE' });
        expect((screen.getByRole('button', { name: 'Hapus Jadwal' }) as HTMLButtonElement).disabled).toBe(true);
        await act(async () => pending.resolve({ success: false, error: 'Synthetic status rejected' }));
        expect(mocks.error).toHaveBeenCalledWith('Synthetic status rejected');
        expect(mocks.refresh).not.toHaveBeenCalled();
        view.rerender(<ScheduleDetailClient schedule={schedule({ status: 'ACTIVE' })} />);
        fireEvent.click(screen.getByRole('button', { name: 'Tutup Minggu' }));
        await waitFor(() => expect(mocks.status).toHaveBeenCalledWith('fixture-schedule', { status: 'CLOSED' }));
        await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
        expect(mocks.success).toHaveBeenCalledWith('Status diubah ke "Selesai".');
    });

    it('keeps empty summaries/back link and confirms deletion before navigation, with errors staying on page', async () => {
        mocks.removeSchedule.mockResolvedValueOnce({ success: false, error: 'Synthetic delete rejected' }).mockResolvedValueOnce({ success: true });
        await mount(schedule({ vehicles: [] }));
        expect(screen.getByText(/Belum ada SO yang dijadwalkan/)).toBeTruthy();
        expect(screen.getByText(/Belum ada trip. Buat trip/)).toBeTruthy();
        expect(screen.getByRole('link', { name: 'Kembali' }).getAttribute('href')).toBe('/sales/delivery-schedules');
        expect(screen.getByText('0 kg')).toBeTruthy();
        vi.mocked(window.confirm).mockReturnValueOnce(false);
        fireEvent.click(screen.getByRole('button', { name: 'Hapus Jadwal' }));
        expect(mocks.removeSchedule).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'Hapus Jadwal' }));
        await waitFor(() => expect(mocks.error).toHaveBeenCalledWith('Synthetic delete rejected'));
        expect(mocks.push).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'Hapus Jadwal' }));
        await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/sales/delivery-schedules'));
        expect(mocks.removeSchedule).toHaveBeenLastCalledWith('fixture-schedule');
        expect(mocks.refresh).not.toHaveBeenCalled();
    });
});
