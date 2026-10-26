// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockStopExecution } = vi.hoisted(() => ({ mockStopExecution: vi.fn() }));
vi.mock('@/actions/production/production', () => ({
    stopExecution: (...args: unknown[]) => mockStopExecution(...args),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { KioskStopDialog } from '../KioskStopDialog';

const props = {
    open: true,
    onOpenChange: vi.fn(),
    executionId: 'exec-1',
    orderNumber: 'WO-001',
    progressLabel: '80 KG dari 200 KG',
    remainingLabel: '120 KG',
    operatorId: 'op-1',
    onRecordOutput: vi.fn(),
    onSuccess: vi.fn(),
};

const zeroOutput = {
    executionId: 'exec-1',
    quantityProduced: 0,
    scrapQuantity: 0,
    scrapProngkolQty: 0,
    scrapDaunQty: 0,
    operatorId: 'op-1',
};

afterEach(cleanup);
beforeEach(() => {
    vi.clearAllMocks();
    mockStopExecution.mockResolvedValue({ success: true, data: null });
});

describe('KioskStopDialog', () => {
    it('asks for no quantities: the last output goes through Catat Hasil', () => {
        render(<KioskStopDialog {...props} />);

        expect(screen.getByRole('heading', { name: 'Akhiri pekerjaan di WO-001?' })).toBeTruthy();
        expect(screen.queryByRole('spinbutton')).toBeNull();
        expect(screen.queryByRole('textbox')).toBeNull();
    });

    it('pauses: closes this shift without completing the SPK', async () => {
        render(<KioskStopDialog {...props} />);

        fireEvent.click(screen.getByRole('button', { name: /^Jeda/ }));

        await waitFor(() => expect(props.onSuccess).toHaveBeenCalled());
        expect(mockStopExecution).toHaveBeenCalledWith({ ...zeroOutput, notes: '', completed: false });
        expect(props.onOpenChange).toHaveBeenCalledWith(false);
    });

    it('closes the SPK at its current output', async () => {
        render(<KioskStopDialog {...props} />);

        const finish = screen.getByRole('button', { name: /^SPK selesai/ });
        expect(finish.textContent).toContain('80 KG dari 200 KG');
        expect(finish.textContent).toContain('Sisa 120 KG tidak dikerjakan');
        fireEvent.click(finish);

        await waitFor(() => expect(mockStopExecution).toHaveBeenCalledWith({ ...zeroOutput, notes: '', completed: true }));
    });

    it('sends the operator to Catat Hasil first when output is still unrecorded', () => {
        render(<KioskStopDialog {...props} />);

        fireEvent.click(screen.getByRole('button', { name: 'Catat hasil' }));

        expect(props.onOpenChange).toHaveBeenCalledWith(false);
        expect(props.onRecordOutput).toHaveBeenCalledTimes(1);
        expect(mockStopExecution).not.toHaveBeenCalled();
    });

    it('keeps the dialog open and shows the server reason when stopping fails', async () => {
        mockStopExecution.mockResolvedValue({ success: false, error: 'Masih ada permintaan bahan tambahan.' });
        render(<KioskStopDialog {...props} />);

        fireEvent.click(screen.getByRole('button', { name: /^SPK selesai/ }));

        expect((await screen.findByRole('alert')).textContent).toContain('Masih ada permintaan bahan tambahan.');
        expect(props.onOpenChange).not.toHaveBeenCalledWith(false);
    });
});
