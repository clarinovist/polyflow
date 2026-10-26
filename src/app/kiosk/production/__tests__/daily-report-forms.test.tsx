// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import HdProductionForm from '../hd/HdProductionForm';
import PotongPlongProductionForm from '../potongplong/PotongPlongProductionForm';
import type { DailyReportFormProps } from '../daily-report-entry';

const mocks = vi.hoisted(() => ({
    shifts: vi.fn(), submit: vi.fn(), refresh: vi.fn(), success: vi.fn(), warning: vi.fn(), error: vi.fn(),
}));
vi.mock('@/actions/production/kiosk-daily-report', () => ({ submitKioskDailyReports: mocks.submit }));
vi.mock('@/actions/production/production-shifts', () => ({ getProductionShiftsByOrder: mocks.shifts }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock('sonner', () => ({ toast: { success: mocks.success, warning: mocks.warning, error: mocks.error } }));

const pointerKeys = ['hasPointerCapture', 'setPointerCapture', 'releasePointerCapture', 'scrollIntoView'] as const;
const descriptors = new Map(pointerKeys.map(key => [key, Object.getOwnPropertyDescriptor(Element.prototype, key)]));
beforeAll(() => {
    // Keep the real Radix controls; jsdom lacks the browser pointer/scroll APIs they use.
    for (const key of pointerKeys) Object.defineProperty(Element.prototype, key, {
        configurable: true, value: key === 'hasPointerCapture' ? () => false : () => undefined,
    });
});
afterAll(() => {
    for (const key of pointerKeys) {
        const descriptor = descriptors.get(key);
        if (descriptor) Object.defineProperty(Element.prototype, key, descriptor);
        else Reflect.deleteProperty(Element.prototype, key);
    }
});
beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    mocks.shifts.mockResolvedValue({ success: true, data: [{
        id: 'shift-1', shiftName: 'Pagi Uji', startTime: '2026-10-26T00:00:00Z', endTime: '2026-10-26T08:00:00Z',
    }] });
    mocks.submit.mockResolvedValue({ success: true, data: { status: 200, count: 1, results: [{ index: 0 }], errors: [] } });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const props: DailyReportFormProps = {
    operator: { id: 'operator-1', name: 'Operator Uji' },
    orders: [{ id: 'order-1', orderNumber: 'SPK-TEST', bom: { productVariant: {
        name: 'Produk Uji', primaryUnit: 'KG', salesUnit: 'BAL', conversionFactor: 10,
    } } }],
    machines: [{ id: 'machine-1', name: 'Mesin Uji' }],
    employees: [{ id: 'operator-1', name: 'Operator Uji' }, { id: 'helper-1', name: 'Helper Uji' }],
};
async function select(combobox: HTMLElement, name: RegExp) {
    fireEvent.keyDown(combobox, { key: 'ArrowDown' });
    fireEvent.click(await screen.findByRole('option', { name }));
}
async function fillEntry(index = 0, quantity = '2.5') {
    await select(screen.getAllByRole('combobox')[index * 2], /SPK-TEST/);
    await select(screen.getAllByRole('combobox')[index * 2 + 1], /Mesin Uji/);
    const shifts = await screen.findAllByRole('button', { name: /Pagi Uji/ });
    fireEvent.click(shifts[index]);
    fireEvent.change(screen.getAllByRole('spinbutton', { name: /Netto/ })[index], { target: { value: quantity } });
}
function submit() {
    fireEvent.click(screen.getByRole('button', { name: /(?:kirim|simpan).*laporan/i }));
}
function sent(call = 0): Array<Record<string, unknown>> {
    return JSON.parse(JSON.stringify(mocks.submit.mock.calls[call][0]));
}

for (const [variant, Component] of [['HD', HdProductionForm], ['Potong/Plong', PotongPlongProductionForm]] as const) {
    describe(`${variant} form characterization`, () => {
        it('sends the selected SPK, shift, machine, operator, helpers, units and variant fields then resets', async () => {
            render(<Component {...props} />);
            await fillEntry();
            fireEvent.click(screen.getByRole('checkbox', { name: 'Helper Uji' }));
            fireEvent.click(screen.getByRole('checkbox', { name: 'Helper Uji' }));
            fireEvent.click(screen.getByRole('checkbox', { name: 'Helper Uji' }));
            if (variant === 'HD') {
                fireEvent.change(screen.getByRole('spinbutton', { name: /Bruto/ }), { target: { value: '30' } });
                fireEvent.change(screen.getByRole('spinbutton', { name: /Bobin/ }), { target: { value: '5' } });
                fireEvent.change(screen.getByRole('textbox', { name: /Cek Gram/i }), { target: { value: '12g' } });
                fireEvent.change(screen.getByRole('spinbutton', { name: /Prongkol/ }), { target: { value: '1' } });
                fireEvent.change(screen.getByRole('spinbutton', { name: /Daun/ }), { target: { value: '0.5' } });
            } else {
                expect(screen.queryByRole('spinbutton', { name: /Bruto/ })).toBeNull();
                fireEvent.change(screen.getByRole('spinbutton', { name: /Potong/ }), { target: { value: '1.5' } });
            }
            fireEvent.change(screen.getByLabelText('Mulai Pukul'), { target: { value: '2026-10-26T08:00' } });
            fireEvent.change(screen.getByLabelText('Selesai Pukul'), { target: { value: '2026-10-26T09:00' } });
            submit();
            await waitFor(() => expect(mocks.submit).toHaveBeenCalledTimes(1));
            expect(screen.getByText('Operator PIN: Operator Uji')).toBeTruthy();
            expect(screen.queryByRole('combobox', { name: /Operator/ })).toBeNull();
            expect(screen.getByText(/Jika absensi belum lengkap/)).toBeTruthy();
            expect(sent()[0]).toMatchObject({
                productionOrderId: 'order-1', shiftId: 'shift-1', machineId: 'machine-1', operatorId: 'operator-1',
                helperIds: ['helper-1'], quantityProduced: 25, enteredQuantity: 2.5, enteredUnit: 'BAL',
                baseQuantityProduced: 25, conversionFactorSnapshot: 10,
                startTime: new Date('2026-10-26T08:00').toISOString(), endTime: new Date('2026-10-26T09:00').toISOString(),
                ...(variant === 'HD' ? { bruto: 30, bobin: 5, cekGram: '12g', scrapProngkolQty: 1, scrapDaunQty: 0.5, scrapQuantity: 0 } : { scrapQuantity: 1.5 }),
            });
            expect(sent()[0].clientRequestId).toMatch(/^[0-9a-f-]{36}$/);
            await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1));
            expect(mocks.success).toHaveBeenCalledTimes(1);
            expect((screen.getByRole('spinbutton', { name: /Netto/ }) as HTMLInputElement).value).toBe('0');
        });
        it('removes only 207 successes, marks the failed entry and retries the same request ID without reconverting its input', async () => {
            mocks.submit.mockResolvedValueOnce({ success: true, data: { status: 207,
                results: [{ index: 0 }], errors: [{ index: 1, error: 'Stok tidak cukup' }],
            } });
            render(<Component {...props} />);
            await fillEntry();
            fireEvent.click(screen.getByRole('button', { name: /Tambah Entri/i }));
            await fillEntry(1, '3');
            submit();
            expect((await screen.findByRole('alert')).textContent).toContain('Stok tidak cukup');
            expect(screen.getAllByRole('spinbutton', { name: /Netto/ })).toHaveLength(1);
            expect((screen.getByRole('spinbutton', { name: /Netto/ }) as HTMLInputElement).value).toBe('3');
            expect(sent()[0].clientRequestId).not.toBe(sent()[1].clientRequestId);
            submit();
            await waitFor(() => expect(mocks.submit).toHaveBeenCalledTimes(2));
            expect(sent(1)).toHaveLength(1);
            expect(sent(1)[0]).toEqual(sent()[1]);
            expect(mocks.warning).toHaveBeenCalledTimes(1);
            await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1));
        });
        it.each(['network', 'server'] as const)('keeps the entry and request ID after a %s failure', async (failure) => {
            if (failure === 'network') mocks.submit.mockRejectedValueOnce(new Error('Offline'));
            else mocks.submit.mockResolvedValueOnce({ success: false, error: 'Sesi PIN berakhir' });
            render(<Component {...props} />);
            await fillEntry();
            submit();
            await waitFor(() => expect(mocks.error).toHaveBeenCalledTimes(1));
            submit();
            await waitFor(() => expect(mocks.submit).toHaveBeenCalledTimes(2));
            expect(sent(1)).toEqual(sent());
        });
        it('keeps controls locked while submitting and creates a fresh ID only after success', async () => {
            let resolve!: (response: unknown) => void;
            mocks.submit.mockReturnValueOnce(new Promise(done => { resolve = done; }));
            const { container } = render(<Component {...props} />);
            await fillEntry();
            submit();
            await waitFor(() => expect(mocks.submit).toHaveBeenCalledTimes(1));
            expect(container.querySelector('fieldset')?.disabled).toBe(true);
            fireEvent.submit(container.querySelector('form')!);
            await act(async () => { await Promise.resolve(); });
            expect(mocks.submit).toHaveBeenCalledTimes(1);
            await act(async () => resolve({ success: true, data: { status: 200, count: 1, results: [{ index: 0 }], errors: [] } }));
            await fillEntry();
            submit();
            await waitFor(() => expect(mocks.submit).toHaveBeenCalledTimes(2));
            expect(sent(1)[0].clientRequestId).not.toBe(sent()[0].clientRequestId);
        });
        it('can remove an unsent entry without changing the surviving request identity', async () => {
            render(<Component {...props} />);
            await fillEntry();
            fireEvent.click(screen.getByRole('button', { name: /Tambah entri/i }));
            await fillEntry(1, '3');
            fireEvent.click(screen.getAllByRole('button', { name: 'Hapus' })[0]);
            expect(screen.getAllByRole('spinbutton', { name: /Netto/ })).toHaveLength(1);
            submit();
            await waitFor(() => expect(mocks.submit).toHaveBeenCalledTimes(1));
            expect(sent()[0].enteredQuantity).toBe(3);
        });
        it('shows shift loading then an empty state without inventing a shift', async () => {
            let resolve!: (response: unknown) => void;
            mocks.shifts.mockReturnValueOnce(new Promise(done => { resolve = done; }));
            render(<Component {...props} employees={[]} />);
            await select(screen.getAllByRole('combobox')[0], /SPK-TEST/);
            expect(screen.getByRole('status').textContent).toContain('Memuat shift');
            await act(async () => resolve({ success: true, data: [] }));
            expect(await screen.findByText('Belum ada shift di SPK ini')).toBeTruthy();
            expect(screen.getByText('Tidak ada helper lain.')).toBeTruthy();
            submit();
            expect(await screen.findByText('Shift wajib dipilih')).toBeTruthy();
            expect(mocks.submit).not.toHaveBeenCalled();
        });
        it('validates missing SPK/shift and negative output without sending anything', async () => {
            render(<Component {...props} />);
            submit();
            await screen.findByText(/Production Order ID is required|SPK wajib dipilih/);
            expect(mocks.submit).not.toHaveBeenCalled();
            await fillEntry(0, '-1');
            submit();
            await screen.findByText(/Quantity cannot be negative|Jumlah hasil tidak boleh negatif/);
            expect(mocks.submit).not.toHaveBeenCalled();
        });
        it('keeps affal-only sales-unit output at zero without positive-only unit audit fields', async () => {
            render(<Component {...props} />);
            await fillEntry(0, '0');
            fireEvent.change(screen.getByRole('spinbutton', { name: variant === 'HD' ? /Prongkol/ : /Potong/ }), { target: { value: '1' } });
            submit();
            await waitFor(() => expect(mocks.submit).toHaveBeenCalledTimes(1));
            expect(sent()[0].quantityProduced).toBe(0);
            expect(sent()[0]).not.toHaveProperty('enteredQuantity');
        });
    });
}
