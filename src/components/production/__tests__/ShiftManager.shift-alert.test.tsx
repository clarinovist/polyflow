// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ShiftManager } from '../ShiftManager';

vi.mock('@/actions/production/production', () => ({
    addProductionShift: vi.fn(),
    deleteProductionShift: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

afterEach(cleanup);

const baseProps = {
    orderId: 'order-1',
    operators: [{ id: 'op-1', name: 'Operator', code: 'OP1' }],
    helpers: [],
    workShifts: [],
    machines: [],
};

function shift(id: string, startMs: number, endMs: number) {
    return {
        id,
        shiftName: `Shift ${id}`,
        startTime: new Date(startMs),
        endTime: new Date(endMs),
        operator: null,
        helpers: [],
    };
}

describe('ShiftManager — peringatan shift aktif', () => {
    it('menampilkan peringatan bila tidak ada shift yang mencakup sekarang', async () => {
        const now = Date.now();
        render(
            <ShiftManager
                {...baseProps}
                shifts={[shift('stale', now - 48 * 3600 * 1000, now - 40 * 3600 * 1000)]}
            />,
        );
        const alert = await screen.findByRole('status');
        expect(alert.textContent).toContain('Tidak ada shift yang mencakup');
        expect(alert.textContent).toContain('salah tanggal');
    });

    it('tidak menampilkan peringatan bila shift aktif sedang berjalan', async () => {
        const now = Date.now();
        render(
            <ShiftManager
                {...baseProps}
                shifts={[shift('active', now - 3600 * 1000, now + 3600 * 1000)]}
            />,
        );
        await screen.findAllByText('Shift active');
        expect(screen.queryByRole('status')).toBeNull();
    });

    it('tidak menampilkan peringatan pada mode readOnly (SPK selesai)', async () => {
        const now = Date.now();
        render(
            <ShiftManager
                {...baseProps}
                readOnly
                shifts={[shift('stale', now - 48 * 3600 * 1000, now - 40 * 3600 * 1000)]}
            />,
        );
        await screen.findAllByText('Shift stale');
        expect(screen.queryByRole('status')).toBeNull();
    });
});
