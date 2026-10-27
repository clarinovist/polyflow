// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OpnameDetailClient, type OpnameSession } from '../OpnameDetailClient';

const mocks = vi.hoisted(() => ({
    complete: vi.fn(),
    remove: vi.fn(),
    add: vi.fn(),
    variants: vi.fn(),
    refresh: vi.fn(),
    push: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
}));

vi.mock('next/navigation', () => ({
    useRouter: () => ({ refresh: mocks.refresh, push: mocks.push }),
}));
vi.mock('sonner', () => ({
    toast: { success: mocks.success, error: mocks.error },
}));
vi.mock('@/actions/inventory/opname', () => ({
    completeOpname: mocks.complete,
    deleteOpnameSession: mocks.remove,
    addItemToOpname: mocks.add,
}));
vi.mock('@/actions/production/boms', () => ({
    getProductVariants: mocks.variants,
}));
vi.mock('../OpnameCounter', () => ({
    OpnameCounter: () => <div>Penghitung Opname</div>,
}));
vi.mock('../OpnameVariance', () => ({
    OpnameVariance: () => <div>Rincian Selisih</div>,
}));
vi.mock('../FinalizeOpnameDialog', () => ({
    FinalizeOpnameDialog: ({ open, onConfirm, failure }: { open: boolean; onConfirm: (date: string) => void; failure?: { title: string; message: string } }) =>
        open ? <div role="dialog">Dialog Finalisasi<button onClick={() => onConfirm('2026-10-01')}>Konfirmasi uji</button>{failure && <p role="alert">{failure.title} {failure.message}</p>}</div> : null,
}));
vi.mock('@/components/warehouse/WarehouseAttachmentPanel', () => ({
    WarehouseAttachmentPanel: () => <div>Panel Bukti</div>,
}));
vi.mock('@/components/shared/EntityStatusTimeline', () => ({
    EntityStatusTimeline: () => <div>Riwayat Audit</div>,
}));

const session: OpnameSession = {
    id: 'opname-1',
    status: 'OPEN',
    remarks: 'Hitung bulanan',
    opnameNumber: 'OP-2026-001',
    location: { name: 'Gudang Uji' },
    createdBy: { name: 'Operator Uji' },
    items: [
        {
            id: 'item-counted',
            systemQuantity: 10,
            countedQuantity: 8,
            notes: null,
            productVariant: {
                name: 'Varian A',
                skuCode: 'A',
                primaryUnit: 'PCS',
                product: { name: 'Produk A' },
            },
        },
        {
            id: 'item-pending',
            systemQuantity: 5,
            countedQuantity: null,
            notes: null,
            productVariant: {
                name: 'Varian B',
                skuCode: 'B',
                primaryUnit: 'PCS',
                product: { name: 'Produk B' },
            },
        },
    ],
};

beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal(
        'ResizeObserver',
        class {
            observe() {}
            unobserve() {}
            disconnect() {}
        },
    );
    Element.prototype.scrollIntoView = vi.fn();
    mocks.complete.mockResolvedValue({ success: true });
    mocks.remove.mockResolvedValue({ success: true });
    mocks.add.mockResolvedValue({ success: true });
    mocks.variants.mockResolvedValue({ success: true, data: [] });
});

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

describe('OpnameDetailClient command center', () => {
    it('passes a finalization rejection into the persistent dialog', async () => {
        mocks.complete.mockResolvedValueOnce({ success: false, code: 'OPERATIONAL_ADJUSTMENT_MISSING_SOURCE_BASIS', error: 'jurnal tidak cukup' });
        render(<OpnameDetailClient session={session} currentUserId="user-1" />);
        fireEvent.click(screen.getByRole('button', { name: 'Finalisasi Opname' }));
        fireEvent.click(screen.getByRole('button', { name: 'Konfirmasi uji' }));
        const alert = await screen.findByRole('alert');
        expect(alert.textContent).toContain('Opname belum difinalisasi');
        expect(alert.textContent).toContain('Finance');
        expect(mocks.refresh).not.toHaveBeenCalled();
    });

    it('surfaces readiness and keeps evidence and audit behind tabs', async () => {
        render(
            <OpnameDetailClient
                session={session}
                currentUserId="user-1"
                attachments={[
                    {
                        id: 'attachment-1',
                        checkpoint: 'OPNAME',
                        documentType: 'PHOTO',
                        url: '/evidence.jpg',
                        createdAt: '2026-10-08',
                    },
                ]}
            />,
        );

        expect(
            screen.getByRole('region', { name: 'Ringkasan stock opname' }),
        ).toBeDefined();
        expect(screen.getByText('1 dari 2 item dihitung')).toBeDefined();
        expect(screen.getByText('1 item berselisih')).toBeDefined();
        expect(
            screen.getAllByText('1 item belum dihitung').length,
        ).toBeGreaterThanOrEqual(1);
        const actions = screen.getByRole('group', {
            name: 'Aksi stock opname',
        });
        expect(actions).toBeDefined();
        expect(
            actions.querySelectorAll('[data-variant="default"]'),
        ).toHaveLength(1);
        expect(screen.getByRole('tab', { name: /Bukti/ })).toBeDefined();
        const audit = screen.getByRole('tab', { name: 'Audit Status' });
        fireEvent.mouseDown(audit, { button: 0 });
        await waitFor(() =>
            expect(audit.getAttribute('aria-selected')).toBe('true'),
        );
        expect(screen.getByText('Riwayat Audit')).toBeDefined();
    });

    it('moves deletion into the overflow menu and requires confirmation', async () => {
        render(
            <OpnameDetailClient
                session={session}
                currentUserId="user-1"
            />,
        );

        fireEvent.keyDown(screen.getByRole('button', { name: 'Lainnya' }), {
            key: 'Enter',
        });
        const menu = await screen.findByRole('menu');
        fireEvent.click(
            within(menu).getByRole('menuitem', { name: 'Hapus Sesi' }),
        );
        expect(mocks.remove).not.toHaveBeenCalled();
        const dialog = await screen.findByRole('alertdialog');
        const back = within(dialog).getByRole('button', { name: 'Kembali' });
        await waitFor(() => expect(document.activeElement).toBe(back));
        fireEvent.click(
            within(dialog).getByRole('button', { name: 'Hapus Sesi' }),
        );
        await waitFor(() =>
            expect(mocks.remove).toHaveBeenCalledWith('opname-1'),
        );
        expect(mocks.push).toHaveBeenCalledWith('/warehouse/opname');
    });

    it('opens finalization from the single primary command', () => {
        render(
            <OpnameDetailClient
                session={session}
                currentUserId="user-1"
            />,
        );
        fireEvent.click(
            screen.getByRole('button', { name: 'Finalisasi Opname' }),
        );
        expect(screen.getByRole('dialog').textContent).toContain(
            'Dialog Finalisasi',
        );
    });

    it('does not expose mutation controls for a completed session', () => {
        render(
            <OpnameDetailClient
                session={{ ...session, status: 'COMPLETED' }}
                currentUserId="user-1"
            />,
        );
        expect(
            screen.queryByRole('group', { name: 'Aksi stock opname' }),
        ).toBeNull();
        expect(screen.getByText('Selesai')).toBeDefined();
    });
});
