// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VoidExecutionButton } from '../VoidExecutionButton';
import { voidProductionOutput } from '@/actions/production/production';

vi.mock('@/actions/production/production', () => ({ voidProductionOutput: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
beforeEach(() => vi.resetAllMocks());
afterEach(cleanup);
function open() {
    render(<VoidExecutionButton executionId="exec" productionOrderId="order" orderNumber="SPK-TEST" />);
    fireEvent.click(screen.getByRole('button', { name: 'Batalkan output SPK-TEST' }));
}

describe('void error feedback', () => {
    it('keeps the dialog open on rejection and closes only after confirmed success', async () => {
        vi.mocked(voidProductionOutput).mockResolvedValueOnce({ success: false, code: 'PRODUCTION_REVERSAL_UNRESOLVED', error: 'jurnal ambigu' }).mockResolvedValueOnce({ success: true, data: null });
        open();
        fireEvent.click(screen.getByRole('button', { name: 'Void Eksekusi' }));
        const alert = await screen.findByRole('alert');
        expect(alert.textContent).toContain('Pembatalan belum dilakukan');
        expect(alert.textContent).not.toContain('ambigu');
        expect(screen.getByRole('alertdialog')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Void Eksekusi' }));
        await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    });

    it('does not blame permissions when the response is lost', async () => {
        vi.mocked(voidProductionOutput).mockRejectedValueOnce(new Error('Failed to fetch'));
        open();
        fireEvent.click(screen.getByRole('button', { name: 'Void Eksekusi' }));
        const alert = await screen.findByRole('alert');
        expect(alert.textContent).toContain('Status penyimpanan belum diketahui');
        expect(alert.textContent).toContain('riwayat pembatalan');
    });
});
