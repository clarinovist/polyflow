// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WarehouseShiftBoardComponent } from '../WarehouseShiftBoard';
import type { WarehouseShiftBoard } from '@/actions/dashboard/warehouse-dashboard';

const data: WarehouseShiftBoard = {
    counts: {
        receivablePOs: 1,
        openLoadOrders: 1,
        materialQueue: 1,
        lowStock: 1,
        suggestedReorder: 1,
    },
    today: { goodsReceipts: 2, deliveriesShipped: 3, materialIssues: 4 },
    attention: {
        loadingUnverified: [
            { id: 'sj-1', number: 'SJ-001', customerName: 'Pelanggan A' },
        ],
        partialPOs: [
            { id: 'po-1', orderNumber: 'PO-001', supplierName: 'Pemasok A' },
        ],
        waitingMaterial: [{ id: 'spk-1', orderNumber: 'SPK-001' }],
    },
};

describe('WarehouseShiftBoardComponent', () => {
    it('keeps positive-count cards and attention items linked to their targets', () => {
        render(<WarehouseShiftBoardComponent data={data} />);

        expect(
            screen.getByText('Terima').closest('a')?.getAttribute('href'),
        ).toBe('/warehouse/incoming');
        expect(screen.getByText('SJ-001').closest('a')?.getAttribute('href')).toBe(
            '/warehouse/outgoing/sj-1',
        );
        expect(screen.getByText('PO-001').closest('a')?.getAttribute('href')).toBe(
            '/warehouse/incoming/orders/po-1',
        );
        expect(screen.getByText('SPK-001').closest('a')?.getAttribute('href')).toBe(
            '/warehouse/materials?orderId=spk-1',
        );
    });

    it('shows zero-count cards without link semantics, action styling, or CTA', () => {
        const zeroData: WarehouseShiftBoard = {
            ...data,
            counts: {
                ...data.counts,
                receivablePOs: 0,
            },
        };

        render(<WarehouseShiftBoardComponent data={zeroData} />);

        const title = screen.getByText('Terima');
        expect(title.closest('a')).toBeNull();
        expect(
            title
                .closest('[data-slot="card"]')
                ?.classList.contains('cursor-pointer'),
        ).toBe(false);
        expect(screen.getAllByText('Buka')).toHaveLength(2);
    });

    it('uses Indonesian operational terminology and tabular activity figures', () => {
        const { container } = render(<WarehouseShiftBoardComponent data={data} />);

        expect(screen.getByText('Perlu dipesan ulang')).toBeTruthy();
        expect(screen.getByText('Pengeluaran bahan:')).toBeTruthy();
        expect(container.querySelectorAll('.tabular-nums').length).toBeGreaterThan(4);
    });
});
