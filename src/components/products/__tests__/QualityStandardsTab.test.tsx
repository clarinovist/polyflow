// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/actions/production/production-quality-standards', () => ({
    getQualityStandardsForVariant: vi.fn(), createQualityCheckParameter: vi.fn(),
    updateQualityCheckParameter: vi.fn(), deleteQualityCheckParameter: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
import { getQualityStandardsForVariant, createQualityCheckParameter, updateQualityCheckParameter } from '@/actions/production/production-quality-standards';
import { QualityStandardsTab } from '../QualityStandardsTab';
const variants = [{ id: 'v', name: 'Synthetic Variant', skuCode: 'SKU-1' }];
afterEach(cleanup);
beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getQualityStandardsForVariant).mockResolvedValue({ success: true, data: [] });
    vi.mocked(createQualityCheckParameter).mockResolvedValue({ success: true, data: {} } as never);
    vi.mocked(updateQualityCheckParameter).mockResolvedValue({ success: true, data: {} } as never);
});
describe('quality settings modes', () => {
    it('creates display-only by default without forcing kiosk measurement', async () => {
        render(<QualityStandardsTab variants={variants} />);
        await screen.findByText(/Belum ada standar kualitas/);
        fireEvent.click(screen.getByRole('button', { name: /Tambah Parameter/ }));
        const required = screen.getByLabelText('Wajib catat hasil ukur di kiosk') as HTMLInputElement;
        expect(required.checked).toBe(false);
        fireEvent.change(screen.getByLabelText('Nama Parameter'), { target: { value: 'Berat per meter' } });
        fireEvent.change(screen.getByLabelText('Satuan'), { target: { value: 'g/m' } });
        fireEvent.change(screen.getByLabelText('Min'), { target: { value: '11.5' } });
        fireEvent.change(screen.getByLabelText('Maks'), { target: { value: '12' } });
        fireEvent.click(screen.getByRole('button', { name: 'Simpan' }));
        await waitFor(() => expect(createQualityCheckParameter).toHaveBeenCalledWith(expect.objectContaining({ requireMeasurement: false, minValue: 11.5, maxValue: 12, targetValue: null })));
    });
    it('preserves mandatory legacy QC on edit and supports explicit opt-out', async () => {
        vi.mocked(getQualityStandardsForVariant).mockResolvedValue({ success: true, data: [{ id: 'p', name: 'Length', unit: 'cm', minValue: 1, maxValue: 2, targetValue: null, requireMeasurement: true }] } as never);
        render(<QualityStandardsTab variants={variants} />);
        fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
        const checkbox = screen.getByLabelText('Wajib catat hasil ukur di kiosk') as HTMLInputElement;
        expect(checkbox.checked).toBe(true);
        fireEvent.click(checkbox);
        fireEvent.change(screen.getByLabelText('Maks'), { target: { value: '' } });
        fireEvent.click(screen.getByRole('button', { name: 'Simpan' }));
        await waitFor(() => expect(updateQualityCheckParameter).toHaveBeenCalledWith(expect.objectContaining({ id: 'p', requireMeasurement: false, maxValue: null })));
    });
});
