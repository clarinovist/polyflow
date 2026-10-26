// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';

const { mockStopExecution } = vi.hoisted(() => ({ mockStopExecution: vi.fn() }));
vi.mock('@/actions/production/production', () => ({
    stopExecution: (...args: unknown[]) => mockStopExecution(...args),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { KioskStopDialog } from '../KioskStopDialog';

function Harness() {
    const [open, setOpen] = useState(true);
    return (
        <>
            <button type="button" onClick={() => setOpen(true)}>
                buka
            </button>
            <KioskStopDialog
                open={open}
                onOpenChange={setOpen}
                executionId="exec-1"
                productName="Produk A"
                primaryUnit="KG"
                currentProduced={10}
                targetQuantity={100}
                logs={[]}
                onSuccess={() => {}}
            />
        </>
    );
}

afterEach(cleanup);
beforeEach(() => {
    mockStopExecution.mockReset();
    mockStopExecution.mockResolvedValue({ success: true, data: null });
});

describe('KioskStopDialog', () => {
    it('does not keep a hidden "SPK selesai" choice after cancel and reopen', async () => {
        render(<Harness />);
        fireEvent.click(screen.getByLabelText(/Tandai SPK Selesai/));
        fireEvent.click(screen.getByRole('button', { name: 'Batal' }));
        await waitFor(() => expect(screen.queryByLabelText(/Tandai SPK Selesai/)).toBeNull());

        fireEvent.click(screen.getByRole('button', { name: 'buka' }));
        const checkbox = (await screen.findByLabelText(/Tandai SPK Selesai/)) as HTMLInputElement;
        expect(checkbox.checked).toBe(false);

        fireEvent.click(screen.getByRole('button', { name: /Hentikan & Simpan/ }));
        await waitFor(() => expect(mockStopExecution).toHaveBeenCalledTimes(1));
        expect(mockStopExecution.mock.calls[0][0]).toMatchObject({ completed: false });
    });

    it('sends the completed choice when it is ticked', async () => {
        render(<Harness />);
        fireEvent.click(screen.getByLabelText(/Tandai SPK Selesai/));
        fireEvent.click(screen.getByRole('button', { name: /Hentikan & Simpan/ }));

        await waitFor(() => expect(mockStopExecution).toHaveBeenCalledTimes(1));
        expect(mockStopExecution.mock.calls[0][0]).toMatchObject({ completed: true, executionId: 'exec-1' });
    });
});
