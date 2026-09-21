// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateSpkFromDemandDialog } from '../CreateSpkFromDemandDialog';
import { QuickProduceDialog } from '../QuickProduceDialog';

const mocks = vi.hoisted(() => ({ create: vi.fn(), preview: vi.fn(), quick: vi.fn(), push: vi.fn(), success: vi.fn(), error: vi.fn(), close: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('sonner', () => ({ toast: { success: mocks.success, error: mocks.error } }));
vi.mock('@/actions/production/production-demand', () => ({ createSpkFromDemand: mocks.create, previewSpkFromDemand: mocks.preview }));
vi.mock('@/actions/production/production', () => ({ quickCreateProductionOrder: mocks.quick }));
vi.mock('@/components/ui/select', () => ({
    Select: ({ children, onValueChange, disabled }: { children: React.ReactNode; onValueChange: (value: string) => void; disabled?: boolean }) => <fieldset disabled={disabled}><SelectContext.Provider value={onValueChange}>{children}</SelectContext.Provider></fieldset>,
    SelectTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    SelectValue: () => null,
    SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    SelectItem: ({ value, children, disabled }: { value: string; children: React.ReactNode; disabled?: boolean }) => {
        const onChange = React.useContext(SelectContext);
        return <button type="button" disabled={disabled} onClick={() => onChange(value)}>{children}</button>;
    },
}));
const SelectContext = React.createContext<(value: string) => void>(() => {});

const props = {
    open: true, onOpenChange: mocks.close, productVariantId: 'test-variant', productName: 'Test product', variantName: 'Test variant', skuCode: 'TEST-01', unit: 'KG', defaultQuantity: 100,
    machines: [{ id: 'machine-test', name: 'Test machine', code: 'TEST-M', type: 'EXTRUDER', status: 'ACTIVE' }],
    locations: [{ id: 'location-test', name: 'Test output', slug: 'test-output', locationPurpose: 'FINISHED_GOOD' }],
};

beforeEach(() => {
    vi.resetAllMocks();
    mocks.preview.mockResolvedValue({ success: true, data: { kind: 'order', orderCount: 1 } });
    mocks.create.mockResolvedValue({ success: true, data: { routed: false, order: { id: 'created-order' } } });
    mocks.quick.mockResolvedValue({ success: true, data: { id: 'quick-order' } });
    Element.prototype.scrollIntoView = vi.fn();
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(cleanup);

async function submitDemand(name: string) {
    await screen.findByText(/Akan membuat/);
    fireEvent.click(screen.getByRole('button', { name: 'Test output' }));
    fireEvent.click(screen.getByRole('button', { name }));
}

describe('demand creation outcome', () => {
    it('previews one SPK and opens the created order', async () => {
        render(<CreateSpkFromDemandDialog {...props} />);
        await submitDemand('Buat SPK');
        await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/production/orders/created-order'));
        expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ productVariantId: 'test-variant', plannedQuantity: 100, locationId: 'location-test', idempotencyKey: expect.stringMatching(/^demand-/) }));
        expect(mocks.success).toHaveBeenCalledWith(expect.stringContaining('SPK berhasil dibuat'));
        expect(mocks.close).toHaveBeenCalledWith(false);
    });
    it('previews routing steps and opens the created parent run', async () => {
        mocks.preview.mockResolvedValue({ success: true, data: { kind: 'run', routeName: 'Test route', orderCount: 3 } });
        mocks.create.mockResolvedValue({ success: true, data: { routed: true, run: { id: 'created-run' } } });
        render(<CreateSpkFromDemandDialog {...props} />);
        await submitDemand('Buat Rangkaian Produksi');
        expect(screen.getByText('Akan membuat rangkaian dengan 3 SPK.')).toBeTruthy();
        await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/production/runs/created-run'));
        expect(mocks.success).toHaveBeenCalledWith(expect.stringContaining('Rangkaian Produksi berhasil dibuat'));
    });
    it('uses the actual server result if routing changed after preview', async () => {
        mocks.create.mockResolvedValue({ success: true, data: { routed: true, run: { id: 'changed-run' } } });
        render(<CreateSpkFromDemandDialog {...props} />);
        await submitDemand('Buat SPK');
        await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/production/runs/changed-run'));
    });
    it('does not allow saving after a preview error; retry can recover', async () => {
        mocks.preview.mockResolvedValueOnce({ success: false, error: 'Preview unavailable' });
        render(<CreateSpkFromDemandDialog {...props} />);
        await screen.findByText('Preview unavailable');
        expect((screen.getByRole('button', { name: 'Buat SPK' }) as HTMLButtonElement).disabled).toBe(true);
        expect(mocks.create).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'Coba lagi' }));
        await screen.findByText('Akan membuat 1 SPK.');
    });
    it('handles rejected preview promises and ignores stale responses after switching products', async () => {
        let resolveOld!: (value: unknown) => void;
        mocks.preview.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }));
        const view = render(<CreateSpkFromDemandDialog {...props} />);
        view.rerender(<CreateSpkFromDemandDialog {...props} productVariantId="second-variant" />);
        await screen.findByText('Akan membuat 1 SPK.');
        await act(async () => resolveOld({ success: true, data: { kind: 'run', routeName: 'Stale route', orderCount: 9 } }));
        expect(screen.queryByText(/9 SPK/)).toBeNull();
        mocks.preview.mockRejectedValueOnce(new Error('Network'));
        view.rerender(<CreateSpkFromDemandDialog {...props} productVariantId="third-variant" />);
        await screen.findByText(/Gagal memeriksa hasil pembuatan/);
    });
    it('keeps the dialog open and the idempotency key on a failed create followed by retry', async () => {
        mocks.create.mockResolvedValueOnce({ success: false, error: 'Create unavailable' });
        render(<CreateSpkFromDemandDialog {...props} />);
        await submitDemand('Buat SPK');
        await waitFor(() => expect(mocks.error).toHaveBeenCalledWith('Create unavailable'));
        expect(mocks.close).not.toHaveBeenCalled();
        expect(mocks.push).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'Buat SPK' }));
        await waitFor(() => expect(mocks.push).toHaveBeenCalled());
        expect(mocks.create.mock.calls[0][0].idempotencyKey).toBe(mocks.create.mock.calls[1][0].idempotencyKey);
    });
});

describe('quick SPK', () => {
    it('explains one SPK, not a product master, and opens the created order', async () => {
        render(<QuickProduceDialog open onOpenChange={mocks.close} boms={[{ id: 'bom-test', name: 'Test recipe', category: 'EXTRUSION', productVariant: { id: 'variant-test', name: 'Test variant', product: { name: 'Test product' } } }]} machines={props.machines} />);
        expect(screen.getByText(/Akan membuat 1 SPK/)).toBeTruthy();
        fireEvent.click(screen.getByRole('combobox'));
        fireEvent.click(await screen.findByRole('option'));
        fireEvent.change(screen.getByLabelText('Jumlah'), { target: { value: '100' } });
        fireEvent.click(screen.getByRole('button', { name: /TEST-M/ }));
        fireEvent.click(screen.getByRole('button', { name: 'Buat SPK Cepat' }));
        await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/production/orders/quick-order'));
        expect(mocks.quick).toHaveBeenCalledWith({ bomId: 'bom-test', plannedQuantity: 100, machineId: 'machine-test' });
    });
});
