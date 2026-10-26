// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';

const mocks = vi.hoisted(() => ({
    logRunningOutput: vi.fn(),
    qcParameters: vi.fn(),
    toastError: vi.fn(),
}));
vi.mock('@/actions/production/production', () => ({
    logRunningOutput: (...args: unknown[]) => mocks.logRunningOutput(...args),
}));
vi.mock('@/actions/production/production-quality-standards', () => ({
    getQualityCheckParametersForVariant: (...args: unknown[]) => mocks.qcParameters(...args),
}));
vi.mock('@/components/ui/camera-capture', () => ({ CameraCapture: () => null }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: mocks.toastError } }));

import { KioskLogOutputDialog } from '../KioskLogOutputDialog';
import { logRunningOutputSchema } from '@/lib/schemas/production';

const now = Date.now();
const activeShift = { id: 'shift-1', shiftName: 'Shift 1', startTime: new Date(now - 3_600_000), endTime: new Date(now + 3_600_000), operatorId: 'op-1' };
const pastShift = { id: 'shift-0', shiftName: 'Shift Malam', startTime: new Date(now - 30_000_000), endTime: new Date(now - 20_000_000), operatorId: null };

type Props = ComponentProps<typeof KioskLogOutputDialog>;
const renderWizard = (overrides: Partial<Props> = {}) =>
    render(
        <KioskLogOutputDialog
            open
            onOpenChange={() => {}}
            executionId="exec-1"
            productVariantId="base"
            productName="Tali Rafia 1 kg"
            primaryUnit="KG"
            operatorId="op-1"
            orderHelpers={[{ id: 'op-1', name: 'Operator 1' }, { id: 'h-2', name: 'Helper 2' }]}
            shifts={[activeShift]}
            {...overrides}
        />,
    );

const qty = () => screen.getByLabelText(/Jumlah hasil bagus/i);
const nextButton = () => screen.getByRole('button', { name: /^Lanjut/ }) as HTMLButtonElement;
const next = () => fireEvent.click(nextButton());
const submitButton = () => screen.getByRole('button', { name: /^Kirim hasil/ }) as HTMLButtonElement;
const sent = () => mocks.logRunningOutput.mock.calls[0][0];

async function submitAndWait() {
    fireEvent.click(submitButton());
    await waitFor(() => expect(mocks.logRunningOutput).toHaveBeenCalledTimes(1));
}

const originalScrollIntoView = Element.prototype.scrollIntoView;
beforeAll(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    Element.prototype.scrollIntoView = vi.fn();
});
afterAll(() => {
    vi.unstubAllGlobals();
    Element.prototype.scrollIntoView = originalScrollIntoView;
});
afterEach(cleanup);
beforeEach(() => {
    vi.clearAllMocks();
    mocks.logRunningOutput.mockResolvedValue({ success: true, data: null });
    mocks.qcParameters.mockResolvedValue({ success: true, data: [] });
});

describe('KioskLogOutputDialog', () => {
    it('sends the output with affal, generic helpers and the active shift', async () => {
        renderWizard();
        fireEvent.change(qty(), { target: { value: '25' } });
        next();
        fireEvent.change(screen.getByLabelText(/^Prongkol/), { target: { value: '0,4' } });
        next();

        expect(screen.getByRole('heading', { name: 'Periksa lalu kirim' })).toBeTruthy();
        await submitAndWait();
        expect(sent()).toMatchObject({
            executionId: 'exec-1',
            quantityProduced: 25,
            scrapQuantity: 0.4,
            scrapProngkolQty: 0.4,
            scrapDaunQty: 0,
            operatorId: 'op-1',
            helperIds: ['h-2'],
            shiftId: 'shift-1',
            qcMeasurements: [],
            clientRequestId: expect.stringMatching(/^[0-9a-f-]{36}$/),
        });
        expect(sent().packagedOutput).toBeUndefined();
        expect(logRunningOutputSchema.safeParse(sent()).success).toBe(true);
    });

    it('locks Lanjut with its reason until there is an output or an affal-only choice', async () => {
        renderWizard();

        expect(nextButton().disabled).toBe(true);
        expect(screen.getByText('Isi hasil, atau pilih "Hasil 0, hanya affal".')).toBeTruthy();

        fireEvent.click(screen.getByRole('button', { name: 'Hasil 0, hanya affal' }));
        expect(screen.queryByRole('button', { name: 'Tidak ada affal' })).toBeNull();
        expect(nextButton().disabled).toBe(true);
        expect(screen.getByText('Hasil bagus 0, jadi affal wajib diisi.')).toBeTruthy();

        fireEvent.change(screen.getByLabelText(/^Daun/), { target: { value: '1' } });
        next();
        await submitAndWait();
        expect(sent()).toMatchObject({ quantityProduced: 0, scrapDaunQty: 1, scrapQuantity: 1 });
    });

    it('asks for the explicit no-affal choice after a good output', async () => {
        renderWizard();
        fireEvent.change(qty(), { target: { value: '25' } });
        next();

        expect(nextButton().disabled).toBe(true);
        fireEvent.click(screen.getByRole('button', { name: 'Tidak ada affal' }));

        expect(screen.getByRole('heading', { name: 'Periksa lalu kirim' })).toBeTruthy();
        await submitAndWait();
        expect(sent()).toMatchObject({ quantityProduced: 25, scrapQuantity: 0 });
    });

    it('converts an entry in the sales unit to the base unit', async () => {
        renderWizard({ salesUnit: 'BAL', conversionFactor: 25 });
        fireEvent.change(qty(), { target: { value: '2' } });
        next();
        fireEvent.click(screen.getByRole('button', { name: 'Tidak ada affal' }));
        await submitAndWait();

        expect(sent()).toMatchObject({
            quantityProduced: 50,
            enteredQuantity: 2,
            enteredUnit: 'BAL',
            baseQuantityProduced: 50,
            conversionFactorSnapshot: 25,
        });
    });

    it('sends an affal-only entry on a sales-unit SPK without zero unit fields the schema rejects', async () => {
        renderWizard({ salesUnit: 'BAL', conversionFactor: 25 });
        fireEvent.click(screen.getByRole('button', { name: 'Hasil 0, hanya affal' }));
        fireEvent.change(screen.getByLabelText(/^Prongkol/), { target: { value: '1' } });
        next();
        await submitAndWait();

        expect(sent()).toMatchObject({ quantityProduced: 0, scrapProngkolQty: 1 });
        expect(sent().enteredQuantity).toBeUndefined();
        expect(sent().enteredUnit).toBeUndefined();
        expect(sent().baseQuantityProduced).toBeUndefined();
        expect(sent().conversionFactorSnapshot).toBeUndefined();
        expect(logRunningOutputSchema.safeParse(sent()).success).toBe(true);
    });

    it('asks for every QC measurement and sends them', async () => {
        mocks.qcParameters.mockResolvedValue({
            success: true,
            data: [{ id: 'width', name: 'Lebar', unit: 'mm', targetValue: 2, minValue: 1.8, maxValue: 2.2 }],
        });
        renderWizard();
        await waitFor(() => expect(mocks.qcParameters).toHaveBeenCalled());
        fireEvent.change(qty(), { target: { value: '25' } });
        next();
        fireEvent.click(screen.getByRole('button', { name: 'Tidak ada affal' }));

        expect(nextButton().disabled).toBe(true);
        fireEvent.change(await screen.findByLabelText(/^Lebar/), { target: { value: '2,1' } });
        next();
        await submitAndWait();

        expect(sent().qcMeasurements).toEqual([{ parameterId: 'width', value: 2.1 }]);
    });

    it('blocks a material conversion whose BOM ratio is ambiguous', () => {
        renderWizard({ executionModeSnapshot: 'MATERIAL_CONVERSION', bomItems: [], bomOutputQuantity: 1 });
        fireEvent.change(qty(), { target: { value: '5' } });

        expect(nextButton().disabled).toBe(true);
        expect(screen.getAllByText(/BOM tidak valid/).length).toBeGreaterThan(0);
    });

    it('needs a shift picked with a button when no shift is active now', async () => {
        renderWizard({ shifts: [pastShift] });
        fireEvent.change(qty(), { target: { value: '25' } });
        next();
        fireEvent.click(screen.getByRole('button', { name: 'Tidak ada affal' }));

        expect(screen.queryByRole('combobox')).toBeNull();
        expect(submitButton().disabled).toBe(true);
        expect(screen.getAllByText(/Shift wajib/).length).toBeGreaterThan(0);

        fireEvent.click(screen.getByRole('button', { name: /Shift Malam/ }));
        await submitAndWait();
        expect(sent().shiftId).toBe('shift-0');
    });

    it('shows what was saved and starts a new entry on Catat lagi', async () => {
        renderWizard();
        fireEvent.change(qty(), { target: { value: '25' } });
        next();
        fireEvent.click(screen.getByRole('button', { name: 'Tidak ada affal' }));
        await submitAndWait();

        expect(await screen.findByRole('heading', { name: 'Hasil tersimpan' })).toBeTruthy();
        expect(screen.getAllByText('25 KG').length).toBeGreaterThan(0);
        fireEvent.click(screen.getByRole('button', { name: 'Catat lagi' }));

        expect((qty() as HTMLInputElement).value).toBe('');
    });
});
