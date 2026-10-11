// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { WarehouseShiftBoard } from '@/actions/dashboard/warehouse-dashboard';
import { WarehouseShiftBoardComponent } from '../WarehouseShiftBoard';

const data: WarehouseShiftBoard = {
    generatedAt: '2026-10-09T08:00:00.000Z',
    health: {
        operational: {
            status: 'AVAILABLE',
            data: {
                receivablePOs: 1,
                openLoadOrders: 2,
                materialQueue: 3,
            },
        },
        inventory: {
            status: 'AVAILABLE',
            data: { lowStock: 1, suggestedReorder: 1 },
        },
    },
    today: {
        status: 'AVAILABLE',
        data: {
            goodsReceipts: 4,
            deliveriesShipped: 5,
            materialIssues: 6,
        },
    },
    attention: {
        status: 'AVAILABLE',
        data: {
            loadingUnverified: {
                total: 8,
                returned: 1,
                items: [
                    {
                        id: 'sj-1',
                        number: 'SJ-001',
                        customerName: 'Pelanggan A',
                        deliveryDate: '2026-10-01T08:00:00.000Z',
                    },
                ],
            },
            partialPOs: {
                total: 2,
                returned: 1,
                items: [
                    {
                        id: 'po-1',
                        orderNumber: 'PO-001',
                        supplierName: 'Pemasok A',
                        expectedDate: null,
                    },
                ],
            },
            waitingMaterial: {
                total: 3,
                returned: 1,
                items: [
                    {
                        id: 'spk-1',
                        orderNumber: 'SPK-001',
                        createdAt: '2026-10-01T08:00:00.000Z',
                    },
                ],
            },
        },
    },
    drivers: {
        status: 'AVAILABLE',
        data: {
            lowStock: [
                {
                    id: 'variant-1',
                    name: 'Resin A',
                    skuCode: 'RM-A',
                    unit: 'KG',
                    eligibleQuantity: 2,
                    threshold: 10,
                    shortageRatio: 0.8,
                },
                {
                    id: 'variant-2',
                    name: 'Botol A',
                    skuCode: 'FG-A',
                    unit: 'PCS',
                    eligibleQuantity: 5,
                    threshold: 20,
                    shortageRatio: 0.75,
                },
            ],
        },
    },
};

describe('WarehouseShiftBoardComponent', () => {
    it('renders condition then attention then direction with server freshness', () => {
        render(<WarehouseShiftBoardComponent data={data} />);

        const health = screen.getByText('Kondisi');
        const attention = screen.getByText('Perlu perhatian');
        const drivers = screen.getByText('Arah utama');
        expect(
            health.compareDocumentPosition(attention) &
                Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
        expect(
            attention.compareDocumentPosition(drivers) &
                Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
        const freshness = screen.getByText(/Diperbarui/).closest('time');
        expect(freshness?.getAttribute('datetime')).toBe(
            '2026-10-09T08:00:00.000Z',
        );
    });

    it('preserves operational links and bounded backlog links with touch-safe targets', () => {
        render(<WarehouseShiftBoardComponent data={data} />);

        expect(
            screen.getByText('Terima').closest('a')?.getAttribute('href'),
        ).toBe('/warehouse/incoming');
        expect(screen.getByText('SJ-001').closest('a')).toHaveProperty(
            'className',
            expect.stringContaining('min-h-11'),
        );
        expect(
            screen.getByText('SJ-001').closest('a')?.getAttribute('href'),
        ).toBe('/warehouse/outgoing/sj-1');
        expect(
            screen.getByText('PO-001').closest('a')?.getAttribute('href'),
        ).toBe('/warehouse/incoming/orders/po-1');
        expect(
            screen.getByText('SPK-001').closest('a')?.getAttribute('href'),
        ).toBe('/warehouse/materials?orderId=spk-1');
        expect(screen.getByText('1 dari 8')).toBeTruthy();
        expect(screen.getAllByText('1 dari 2')).toHaveLength(1);
    });

    it('shows explicit null-date copy and each driver in its own unit', () => {
        render(<WarehouseShiftBoardComponent data={data} />);

        expect(screen.getByText('Tanggal harapan belum diisi')).toBeTruthy();
        expect(screen.getByText('2 / 10 KG')).toBeTruthy();
        expect(screen.getByText('5 / 20 PCS')).toBeTruthy();
        expect(screen.queryByText(/KG \+ PCS/)).toBeNull();
    });

    it('renders valid zero and empty states as available rather than unavailable', () => {
        const zeroData: WarehouseShiftBoard = {
            ...data,
            health: {
                operational: {
                    status: 'AVAILABLE',
                    data: {
                        receivablePOs: 0,
                        openLoadOrders: 0,
                        materialQueue: 0,
                    },
                },
                inventory: {
                    status: 'AVAILABLE',
                    data: { lowStock: 0, suggestedReorder: 0 },
                },
            },
            today: {
                status: 'AVAILABLE',
                data: {
                    goodsReceipts: 0,
                    deliveriesShipped: 0,
                    materialIssues: 0,
                },
            },
            attention: {
                status: 'AVAILABLE',
                data: {
                    loadingUnverified: {
                        total: 0,
                        returned: 0,
                        items: [],
                    },
                    partialPOs: { total: 0, returned: 0, items: [] },
                    waitingMaterial: { total: 0, returned: 0, items: [] },
                },
            },
            drivers: {
                status: 'AVAILABLE',
                data: { lowStock: [] },
            },
        };

        render(<WarehouseShiftBoardComponent data={zeroData} />);

        expect(screen.getAllByText('Antrean kosong')).toHaveLength(3);
        expect(screen.getAllByText('Tidak ada peringatan')).toHaveLength(2);
        expect(
            screen.getByText('Tidak ada varian di bawah batas minimum.'),
        ).toBeTruthy();
        expect(screen.queryByText(/tidak tersedia/i)).toBeNull();
        expect(screen.getByText('Terima').closest('a')).toBeNull();
    });

    it('does not emit the removed analytics reorder link', () => {
        render(<WarehouseShiftBoardComponent data={data} />);

        expect(
            screen.queryByRole('link', { name: /Perlu dipesan ulang/i }),
        ).toBeNull();
        expect(
            document.querySelector('a[href="/warehouse/analytics#reorder"]'),
        ).toBeNull();
    });

    it('keeps successful operational and today data visible when inventory is unavailable', () => {
        const partialData: WarehouseShiftBoard = {
            ...data,
            health: {
                ...data.health,
                inventory: { status: 'UNAVAILABLE', data: null },
            },
            drivers: { status: 'UNAVAILABLE', data: null },
        };

        render(<WarehouseShiftBoardComponent data={partialData} />);

        expect(screen.getByText('Terima')).toBeTruthy();
        expect(screen.getByText('4 GR')).toBeTruthy();
        expect(
            screen.getByText('Kondisi persediaan tidak tersedia'),
        ).toBeTruthy();
        expect(screen.getByText('Penyumbang stok tidak tersedia')).toBeTruthy();
        expect(screen.queryByText('Stok menipis')).toBeNull();
    });

    it('renders whole-board failure without healthy-looking zeroes or operational links', () => {
        render(<WarehouseShiftBoardComponent data={null} />);

        expect(
            screen.getByText('Dashboard gudang tidak tersedia'),
        ).toBeTruthy();
        expect(screen.queryByText('Terima')).toBeNull();
        expect(screen.queryByText('0 GR')).toBeNull();
        expect(screen.queryByRole('link')).toBeNull();
    });
});
