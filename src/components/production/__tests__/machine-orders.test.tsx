// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ProductionMachinesPage from '@/app/production/machines/page';
import { AssignJobButton } from '../AssignJobButton';
import { MachineOrderList } from '../MachineOrderList';
import type { OrderChip } from '../schedule/MachineAllocationMatrix';

const mocks = vi.hoisted(() => ({
    machines: vi.fn(), orders: vi.fn(), update: vi.fn(), refresh: vi.fn(), success: vi.fn(), error: vi.fn(),
}));
vi.mock('@/actions/production/machines', () => ({ getMachines: mocks.machines }));
vi.mock('@/actions/production/production-orders', () => ({ getProductionOrders: mocks.orders }));
vi.mock('@/actions/production/production', () => ({ updateProductionOrder: mocks.update }));
vi.mock('@/actions/production/machine-stage-settings', () => ({ getMachineStageMap: async () => ({ success: true, data: {} }) }));
vi.mock('@/actions/admin/employees', () => ({ getEmployees: async () => ({ success: true, data: [] }) }));
vi.mock('@/actions/admin/work-shifts', () => ({ getWorkShifts: async () => ({ success: true, data: [] }) }));
vi.mock('@/components/production/ReassignMachineButton', () => ({ ReassignMachineButton: () => null }));
vi.mock('@/components/production/ShiftManagerDialog', () => ({ ShiftManagerDialog: () => null }));
vi.mock('@/components/production/MachineActions', () => ({ MachineActions: () => null }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock('sonner', () => ({ toast: { success: mocks.success, error: mocks.error } }));

const machine = { id: 'machine-a', code: 'TEST-A', type: 'EXTRUDER', status: 'ACTIVE' };
function order(id: string, status = 'RELEASED', machineId: string | null = machine.id) {
    return {
        id, orderNumber: `WO-TEST-${id}`, status, machineId,
        machine: machineId ? { id: machineId } : null,
        plannedQuantity: 1234.5, plannedStartDate: '2026-09-28T17:00:00.000Z', shifts: [],
        bom: { category: 'EXTRUSION', productVariant: { name: `Produk ${id}`, primaryUnit: 'KG' } },
    };
}
const choices: OrderChip[] = [
    { id: 'new', orderNumber: 'WO-NEW', bomName: 'Produk baru', bomCategory: 'EXTRUSION', status: 'RELEASED', plannedQuantity: 100, machineId: null },
    { id: 'draft', orderNumber: 'WO-DRAFT', bomName: 'Produk draf', bomCategory: 'EXTRUSION', status: 'DRAFT', plannedQuantity: 100, machineId: null },
    { id: 'waiting', orderNumber: 'WO-WAITING', bomName: 'Produk menunggu bahan', bomCategory: 'EXTRUSION', status: 'WAITING_MATERIAL', plannedQuantity: 100, machineId: null },
    ...['IN_PROGRESS', 'COMPLETED', 'CANCELLED'].map((status) => ({ id: status, orderNumber: status, bomName: status, bomCategory: 'EXTRUSION', status, plannedQuantity: 100, machineId: null })),
    { id: 'same', orderNumber: 'WO-SAME', bomName: 'Sudah di sini', bomCategory: 'EXTRUSION', status: 'RELEASED', plannedQuantity: 100, machineId: machine.id },
    { id: 'mix', orderNumber: 'WO-MIX', bomName: 'Produk mixing', bomCategory: 'MIXING', status: 'RELEASED', plannedQuantity: 100, machineId: null },
    { id: 'other', orderNumber: 'WO-OTHER', bomName: 'Mesin lain', bomCategory: 'EXTRUSION', status: 'RELEASED', plannedQuantity: 100, machineId: 'machine-b' },
];

beforeEach(() => {
    vi.clearAllMocks();
    mocks.update.mockResolvedValue({ success: true });
    mocks.machines.mockResolvedValue({ success: true, data: [{ ...machine, name: 'Test machine', executions: [], location: null }] });
    mocks.orders.mockResolvedValue([]);
    Element.prototype.scrollIntoView = vi.fn();
    Element.prototype.hasPointerCapture = vi.fn(() => false);
    Element.prototype.releasePointerCapture = vi.fn();
});
afterEach(cleanup);

async function openPicker() {
    fireEvent.click(screen.getByRole('button', { name: 'Tambah SPK ke TEST-A' }));
    fireEvent.keyDown(await screen.findByRole('combobox'), { key: 'ArrowDown' });
    await screen.findByRole('listbox');
}

describe('machine SPK board', () => {
    it('shows every unfinished assigned SPK, excludes other machines and history, and allows adding on a busy machine', async () => {
        mocks.orders.mockResolvedValue([
            order('progress', 'IN_PROGRESS'), order('released'), order('draft', 'DRAFT'), order('waiting', 'WAITING_MATERIAL'),
            order('completed', 'COMPLETED'), order('cancelled', 'CANCELLED'), order('other', 'RELEASED', 'machine-b'), order('unassigned', 'RELEASED', null),
        ]);
        render(await ProductionMachinesPage());
        const list = within(screen.getByRole('region', { name: 'Daftar SPK TEST-A' }));
        expect(list.getAllByRole('link')).toHaveLength(4);
        expect(list.getByText('SPK di Mesin Ini (4)')).toBeTruthy();
        for (const id of ['progress', 'released', 'draft', 'waiting']) {
            expect(list.getByRole('link', { name: new RegExp(`WO-TEST-${id}`) }).getAttribute('href')).toBe(`/production/orders/${id}`);
        }
        expect(list.getAllByText('Rencana: 1.234,5 KG')).toHaveLength(4);
        expect(list.getAllByText('Jadwal: 29 Sep 2026')).toHaveLength(4);
        expect(list.queryByText('Sedang Dikerjakan')).toBeNull();
        await openPicker();
        expect(screen.getByRole('option', { name: /WO-TEST-unassigned/ })).toBeTruthy();
    });

    it('keeps actual execution first without duplicating its SPK', async () => {
        const live = { ...order('live', 'IN_PROGRESS'), plannedStartDate: '2026-10-01' };
        mocks.machines.mockResolvedValue({ success: true, data: [{ ...machine, executions: [{ productionOrder: live }], location: null }] });
        mocks.orders.mockResolvedValue([order('queued'), live]);
        render(await ProductionMachinesPage());
        const list = within(screen.getByRole('region', { name: 'Daftar SPK TEST-A' }));
        expect(list.getAllByRole('link')).toHaveLength(2);
        expect(list.getAllByRole('link')[0].textContent).toContain('WO-TEST-live');
        expect(list.getByText('Sedang Dikerjakan')).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Tambah SPK ke TEST-A' })).toBeTruthy();
    });

    it('preserves an actual execution on the original machine when the SPK planning machine differs', async () => {
        const live = order('moved', 'IN_PROGRESS', 'machine-b');
        mocks.machines.mockResolvedValue({ success: true, data: [{ ...machine, executions: [{ productionOrder: live }], location: null }] });
        mocks.orders.mockResolvedValue([live]);
        render(await ProductionMachinesPage());
        expect(within(screen.getByRole('region', { name: 'Daftar SPK TEST-A' })).getByText('Sedang Dikerjakan')).toBeTruthy();
    });

    it('shows a useful empty state and an add button on an idle machine', async () => {
        render(await ProductionMachinesPage());
        expect(screen.getByText('Belum ada SPK yang dialokasikan.')).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Tambah SPK ke TEST-A' })).toBeTruthy();
    });

    it('sorts planned SPKs chronologically and by number on equal dates without mutating input', () => {
        const orders = ['b', 'c', 'a'].map((id) => ({ id, orderNumber: id, productName: 'Produk', status: 'RELEASED', plannedQuantity: 1, primaryUnit: 'PCS', plannedStartDate: id === 'c' ? '2026-10-01' : '2026-09-29' }));
        render(<MachineOrderList machineCode="TEST" orders={orders} />);
        expect(screen.getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual(['/production/orders/a', '/production/orders/b', '/production/orders/c']);
        expect(orders.map((o) => o.id)).toEqual(['b', 'c', 'a']);
    });
});

describe('add SPK through existing scheduling flow', () => {
    it('filters incompatible, already assigned, running and closed SPKs and schedules without any status change', async () => {
        render(<AssignJobButton machine={machine} orders={choices} />);
        await openPicker();
        expect(screen.getAllByRole('option')).toHaveLength(4);
        expect(screen.getByRole('option', { name: /Pindah Mesin.*WO-OTHER/ })).toBeTruthy();
        fireEvent.click(screen.getByRole('option', { name: /WO-NEW/ }));
        fireEvent.click(screen.getByRole('button', { name: 'Tugaskan Order' }));
        await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
        expect(mocks.update).toHaveBeenCalledExactlyOnceWith({ id: 'new', machineId: machine.id, plannedStartDate: expect.any(Date) });
        expect(screen.queryByRole('dialog')).toBeNull();
        // Closing/remounting the dialog must not retain the previous selection.
        fireEvent.click(screen.getByRole('button', { name: 'Tambah SPK ke TEST-A' }));
        expect((screen.getByRole('button', { name: 'Tugaskan Order' }) as HTMLButtonElement).disabled).toBe(true);
    });

    it('honors tenant machine-stage overrides', async () => {
        render(<AssignJobButton machine={machine} orders={choices} machineStageMap={{ MIXING: ['EXTRUDER'] }} />);
        await openPicker();
        expect(screen.getByRole('option', { name: /WO-MIX/ })).toBeTruthy();
    });

    it.each(['MAINTENANCE', 'INACTIVE'])('does not allocate to a %s machine', (status) => {
        render(<AssignJobButton machine={{ ...machine, status }} orders={choices} />);
        const button = screen.getByRole('button', { name: 'Tambah SPK ke TEST-A' }) as HTMLButtonElement;
        expect(button.disabled).toBe(true);
        fireEvent.click(button);
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('shows an empty picker without allowing a save', async () => {
        render(<AssignJobButton machine={machine} orders={[]} />);
        await openPicker();
        expect(screen.getByText('Tidak ada order yang bisa ditugaskan.')).toBeTruthy();
        fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Escape' });
        expect((screen.getByRole('button', { name: 'Tugaskan Order' }) as HTMLButtonElement).disabled).toBe(true);
        expect(mocks.update).not.toHaveBeenCalled();
    });

    it('keeps the dialog open on service errors and permits retry', async () => {
        mocks.update.mockResolvedValueOnce({ success: false, error: 'Alokasi ditolak' });
        render(<AssignJobButton machine={machine} orders={choices} />);
        await openPicker();
        fireEvent.click(screen.getByRole('option', { name: /WO-NEW/ }));
        fireEvent.click(screen.getByRole('button', { name: 'Tugaskan Order' }));
        await waitFor(() => expect(mocks.error).toHaveBeenCalledWith('Alokasi ditolak'));
        expect(screen.getByRole('dialog')).toBeTruthy();
        expect(mocks.refresh).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'Tugaskan Order' }));
        await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
    });
});
