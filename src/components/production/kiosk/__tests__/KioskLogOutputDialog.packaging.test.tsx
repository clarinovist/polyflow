// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import type { KioskPackagingContext } from '@/lib/production/kiosk-packaging';

const mocks = vi.hoisted(() => ({ logRunningOutput: vi.fn(), toastError: vi.fn() }));
vi.mock('@/actions/production/production', () => ({
    logRunningOutput: (...args: unknown[]) => mocks.logRunningOutput(...args),
}));
vi.mock('@/actions/production/production-quality-standards', () => ({
    getQualityCheckParametersForVariant: async () => ({ success: true, data: [] }),
}));
vi.mock('@/components/ui/camera-capture', () => ({ CameraCapture: () => null }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: mocks.toastError } }));

import { KioskLogOutputDialog } from '../KioskLogOutputDialog';

const context: KioskPackagingContext = {
    enabled: true,
    baseVariantId: 'base',
    fixedBrandId: null,
    brands: [{ id: 'base', name: 'Tali Rafia 1 kg', labelVariantId: null, labelName: null }],
    plannedPackagingIds: [],
    stock: [{ id: 's1', productVariantId: 'film', name: 'Plastik', unit: 'KG', locationId: 'pack', locationName: 'Gudang Kemasan', ownerCustomerId: null, ownerName: null, quantity: 38 }],
    usage: [{ productVariantId: 'film', name: 'Plastik', unit: 'KG', quantity: 2.4, lastSourceLocationId: 'pack' }],
    producedBaseQty: 80,
};

const now = Date.now();
const activeShift = { id: 'shift-1', shiftName: 'Shift 1', startTime: new Date(now - 3_600_000), endTime: new Date(now + 3_600_000), operatorId: 'op-1' };

function renderWizard(actualPackagingEnabled = true) {
    return render(
        <KioskLogOutputDialog
            open
            onOpenChange={() => {}}
            executionId="exec-1"
            productVariantId="base"
            productName="Tali Rafia 1 kg"
            primaryUnit="KG"
            operatorId="op-1"
            shifts={[activeShift]}
            actualPackagingEnabled={actualPackagingEnabled}
            packaging={{ context, isLoading: false, error: '', onRetry: () => {} }}
        />,
    );
}

const next = () => fireEvent.click(screen.getByRole('button', { name: /^Lanjut/ }));

function ToggleHarness() {
    const [open, setOpen] = useState(true);
    return (
        <>
            <button type="button" onClick={() => setOpen(true)}>buka</button>
            <KioskLogOutputDialog
                open={open}
                onOpenChange={setOpen}
                executionId="exec-1"
                productVariantId="base"
                productName="Tali Rafia 1 kg"
                primaryUnit="KG"
                operatorId="op-1"
                shifts={[activeShift]}
                actualPackagingEnabled
                packaging={{ context, isLoading: false, error: '', onRetry: () => {} }}
            />
        </>
    );
}

/** Fills Hasil 25 KG and Plastik 0.8 KG, then submits. */
async function submitPackagedEntry() {
    fireEvent.change(screen.getByLabelText(/Jumlah Hasil Bagus/), { target: { value: '25' } });
    next();
    fireEvent.change(screen.getByLabelText('Jumlah Plastik'), { target: { value: '0.8' } });
    next();
    next();
    fireEvent.click(screen.getByRole('button', { name: /Ya, Tidak Ada Scrap/ }));
    next();
    fireEvent.click(screen.getByRole('button', { name: /Kirim Hasil/ }));
}
const sentRequestIds = () =>
    mocks.logRunningOutput.mock.calls.map((call) => (call[0] as { packagedOutput: { clientRequestId: string } }).packagedOutput.clientRequestId);

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
    mocks.logRunningOutput.mockReset();
    mocks.logRunningOutput.mockResolvedValue({ success: true, data: null });
    mocks.toastError.mockReset();
});

describe('KioskLogOutputDialog with actual packaging', () => {
    it('records the counted packaging with the output in one submission', async () => {
        renderWizard();
        fireEvent.change(screen.getByLabelText(/Jumlah Hasil Bagus/), { target: { value: '25' } });
        next();

        fireEvent.change(screen.getByLabelText('Jumlah Plastik'), { target: { value: '0.8' } });
        next();
        next();
        fireEvent.click(screen.getByRole('button', { name: /Ya, Tidak Ada Scrap/ }));
        next();
        expect(screen.getByText('Plastik')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: /Kirim Hasil/ }));

        await waitFor(() => expect(mocks.logRunningOutput).toHaveBeenCalledTimes(1));
        const payload = mocks.logRunningOutput.mock.calls[0][0];
        expect(payload).toMatchObject({
            executionId: 'exec-1',
            quantityProduced: 25,
            shiftId: 'shift-1',
            packagedOutput: {
                clientRequestId: expect.stringMatching(/^[0-9a-f-]{36}$/),
                groups: [{
                    productVariantId: 'base',
                    quantity: 25,
                    packaging: [{ productVariantId: 'film', sourceLocationId: 'pack', unit: 'KG', quantity: 0.8 }],
                }],
            },
        });
    });

    it('stops at the Kemasan step until every count is filled', () => {
        renderWizard();
        fireEvent.change(screen.getByLabelText(/Jumlah Hasil Bagus/), { target: { value: '25' } });
        next();
        next();

        expect(mocks.toastError).toHaveBeenCalledWith('Isi jumlah Plastik yang terpakai.');
        expect(screen.getByLabelText('Jumlah Plastik')).toBeTruthy();
    });

    it('keeps the original steps and payload for SPKs without actual packaging', async () => {
        renderWizard(false);
        fireEvent.change(screen.getByLabelText(/Jumlah Hasil Bagus/), { target: { value: '25' } });
        next();

        expect(screen.queryByLabelText('Jumlah Plastik')).toBeNull();
        expect(screen.getByLabelText(/Scrap Prongkol/)).toBeTruthy();
    });

    it('reuses the request id after a failed submit, even across close and reopen', async () => {
        mocks.logRunningOutput.mockResolvedValueOnce({ success: false, error: 'Koneksi terputus', code: 'INTERNAL' });
        render(<ToggleHarness />);
        await submitPackagedEntry();
        await waitFor(() => expect(mocks.logRunningOutput).toHaveBeenCalledTimes(1));

        fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
        await waitFor(() => expect(screen.queryByLabelText(/Jumlah Hasil Bagus/)).toBeNull());
        fireEvent.click(screen.getByRole('button', { name: 'buka' }));
        await submitPackagedEntry();

        await waitFor(() => expect(mocks.logRunningOutput).toHaveBeenCalledTimes(2));
        const [first, second] = sentRequestIds();
        expect(second).toBe(first);
    });

    it('starts a new request id after a confirmed save', async () => {
        render(<ToggleHarness />);
        await submitPackagedEntry();
        await waitFor(() => expect(mocks.logRunningOutput).toHaveBeenCalledTimes(1));

        fireEvent.click(await screen.findByRole('button', { name: /Catat Lagi/ }));
        await submitPackagedEntry();

        await waitFor(() => expect(mocks.logRunningOutput).toHaveBeenCalledTimes(2));
        const [first, second] = sentRequestIds();
        expect(second).not.toBe(first);
    });

    it('drops a request id the server already used, so the next batch can be sent', async () => {
        mocks.logRunningOutput.mockResolvedValueOnce({ success: false, error: 'Permintaan sudah dipakai', code: 'PACKAGED_REQUEST_REUSED' });
        render(<ToggleHarness />);
        await submitPackagedEntry();
        await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith(expect.stringMatching(/sudah tersimpan/)));

        fireEvent.click(screen.getByRole('button', { name: /Kirim Hasil/ }));
        await waitFor(() => expect(mocks.logRunningOutput).toHaveBeenCalledTimes(2));
        const [first, second] = sentRequestIds();
        expect(second).not.toBe(first);
    });

    it('never creates a request id for SPKs without actual packaging', async () => {
        const randomUUID = vi.spyOn(crypto, 'randomUUID');
        renderWizard(false);
        fireEvent.change(screen.getByLabelText(/Jumlah Hasil Bagus/), { target: { value: '25' } });
        next();
        next();
        fireEvent.click(screen.getByRole('button', { name: /Ya, Tidak Ada Scrap/ }));
        next();
        fireEvent.click(screen.getByRole('button', { name: /Kirim Hasil/ }));

        await waitFor(() => expect(mocks.logRunningOutput).toHaveBeenCalledTimes(1));
        expect(mocks.logRunningOutput.mock.calls[0][0].packagedOutput).toBeUndefined();
        expect(randomUUID).not.toHaveBeenCalled();
        randomUUID.mockRestore();
    });
});
