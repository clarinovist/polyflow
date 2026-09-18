// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AddOutputDialog } from '../AddOutputDialog';
import { addProductionOutput } from '@/actions/production/production';
import { toast } from 'sonner';

vi.mock('@/actions/production/production', () => ({ addProductionOutput: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

type Props = React.ComponentProps<typeof AddOutputDialog>;
const props = {
    order: {
        id: 'wo-date-test', machineId: 'machine-test',
        bom: { productVariant: { primaryUnit: 'KG', salesUnit: 'ZAK', conversionFactor: 25 } },
        shifts: [{ id: 'shift-test', shiftName: 'Malam', operatorId: 'operator-test',
            startTime: '2026-09-01T22:00:00+07:00', endTime: '2026-09-02T06:00:00+07:00',
            operator: { name: 'Operator Test' } }],
    },
    formData: {
        operators: [{ id: 'operator-test', name: 'Operator Test' }],
        helpers: [], workShifts: [], locations: [], machines: [], rawMaterials: [],
    },
} as unknown as Props;

function dateInput() {
    return screen.getByLabelText('Tanggal Produksi (WIB)') as HTMLInputElement;
}
function form() {
    return dateInput().closest('form')!;
}
function openDialog() {
    fireEvent.click(screen.getByRole('button', { name: /Hasil Produksi/i }));
}
function addGoodOutput() {
    fireEvent.change(screen.getByPlaceholderText(/Enter Item Size/), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
}
function addScrap() {
    fireEvent.change(screen.getAllByPlaceholderText('0.00')[0], { target: { value: '3' } });
}

describe('WO output production date', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-09-01T17:05:00Z'));
        vi.mocked(addProductionOutput).mockResolvedValue({ success: true, data: null });
    });
    afterEach(() => {
        cleanup();
        vi.useRealTimers();
    });

    it('defaults to today in WIB, with required/max and explanatory labels', () => {
        render(<AddOutputDialog {...props} />);
        openDialog();
        expect(dateInput().value).toBe('2026-09-02');
        expect(dateInput().required).toBe(true);
        expect(dateInput().max).toBe('2026-09-02');
        expect(screen.getByText(/stok dan jurnal dibukukan saat disimpan/)).toBeTruthy();
        expect(screen.getByText('Waktu Input (WIB)')).toBeTruthy();
    });

    it('submits the selected past date without changing UOM/affal and resets after success', async () => {
        render(<AddOutputDialog {...props} />);
        openDialog();
        fireEvent.change(dateInput(), { target: { value: '2026-08-20' } });
        addGoodOutput();
        addScrap();
        fireEvent.submit(form());
        await waitFor(() => expect(toast.success).toHaveBeenCalled());
        expect(addProductionOutput).toHaveBeenCalledWith(expect.objectContaining({
            productionOrderId: 'wo-date-test', productionDate: '2026-08-20',
            shiftId: 'shift-test', operatorId: 'operator-test',
            quantityProduced: 50, enteredQuantity: 2, enteredUnit: 'ZAK',
            conversionFactorSnapshot: 25, scrapProngkolQty: 3,
        }));
        openDialog();
        expect(dateInput().value).toBe('2026-09-02');
    });

    it('submits today explicitly even just after midnight with a previous-day shift', async () => {
        render(<AddOutputDialog {...props} />);
        openDialog();
        addScrap();
        fireEvent.submit(form());
        await waitFor(() => expect(addProductionOutput).toHaveBeenCalled());
        expect(addProductionOutput).toHaveBeenCalledWith(expect.objectContaining({
            productionDate: '2026-09-02', quantityProduced: 0,
            scrapProngkolQty: 3, enteredQuantity: undefined,
        }));
    });

    it.each(['', '2026-09-03'])(
        'rejects missing/future date %s before invoking the action', (value) => {
            render(<AddOutputDialog {...props} />);
            openDialog();
            addScrap();
            fireEvent.change(dateInput(), { target: { value } });
            fireEvent.submit(form());
            expect(addProductionOutput).not.toHaveBeenCalled();
            expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Tanggal produksi'));
        },
    );

    it('retains date after a server rejection and allows retry', async () => {
        vi.mocked(addProductionOutput).mockResolvedValueOnce({
            success: false, error: 'Stok tidak cukup', code: 'BUSINESS_RULE',
        });
        render(<AddOutputDialog {...props} />);
        openDialog();
        fireEvent.change(dateInput(), { target: { value: '2026-09-01' } });
        addScrap();
        fireEvent.submit(form());
        await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Stok tidak cukup'));
        expect(dateInput().value).toBe('2026-09-01');
        expect(dateInput().disabled).toBe(false);
        fireEvent.submit(form());
        await waitFor(() => expect(toast.success).toHaveBeenCalled());
        expect(addProductionOutput).toHaveBeenCalledTimes(2);
    });

    it('preserves date through the zero-scrap confirmation', async () => {
        render(<AddOutputDialog {...props} />);
        openDialog();
        fireEvent.change(dateInput(), { target: { value: '2026-09-01' } });
        addGoodOutput();
        fireEvent.submit(form());
        expect(addProductionOutput).not.toHaveBeenCalled();
        expect(screen.getByText('Scrap masih 0')).toBeTruthy();
        fireEvent.submit(form());
        await waitFor(() => expect(addProductionOutput).toHaveBeenCalledWith(expect.objectContaining({
            productionDate: '2026-09-01', scrapProngkolQty: 0, scrapDaunQty: 0,
        })));
    });

    it('refreshes the default when reopened on a new WIB day', () => {
        render(<AddOutputDialog {...props} />);
        openDialog();
        fireEvent.change(dateInput(), { target: { value: '2026-08-20' } });
        fireEvent.click(screen.getByRole('button', { name: 'Batal' }));
        vi.setSystemTime(new Date('2026-09-02T17:05:00Z'));
        openDialog();
        expect(dateInput().value).toBe('2026-09-03');
    });
});
