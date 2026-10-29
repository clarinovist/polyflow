// @vitest-environment jsdom

import {
    cleanup,
    fireEvent,
    render,
    screen,
    waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetHppReportData, mockLockPeriod, mockUnlockPeriod } = vi.hoisted(
    () => ({
        mockGetHppReportData: vi.fn(),
        mockLockPeriod: vi.fn(),
        mockUnlockPeriod: vi.fn(),
    }),
);

vi.mock('@/actions/finance/hpp-report', () => ({
    getHppReportData: mockGetHppReportData,
    lockPeriod: mockLockPeriod,
    unlockPeriod: mockUnlockPeriod,
}));

vi.mock('sonner', () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn(),
    },
}));

import { HppLockChangeNotice } from '../HppLockChangeNotice';
import HppReportClient from '../HppReportClient';
import type { HppReportData } from '@/lib/utils/hpp-report';
import type { HppPeriodLockInfo } from '@/lib/finance/hpp-period-snapshot';

const makeReportData = (
    overrides: Partial<HppReportData> = {},
): HppReportData => ({
    summary: {
        totalCogm: 300_000,
        totalQuantity: 100,
        materialShare: 80,
        laborShare: 10,
        machineShare: 10,
        overheadShare: 0,
        productCount: 1,
        orderCount: 2,
    },
    products: [
        {
            bomId: 'bom-1',
            bomName: 'BOM Standar',
            productName: 'Produk Standar',
            productSku: 'SKU-01',
            category: 'FILM',
            totalQuantity: 100,
            orderCount: 2,
            materialPerUnit: 2_400,
            laborPerUnit: 300,
            machinePerUnit: 300,
            overheadPerUnit: 0,
            hppPerUnit: 3_000,
            standardCost: 2_900,
            varianceAmount: 100,
            variancePercent: 3.4,
        },
    ],
    orders: [
        {
            orderId: 'po-1',
            orderNumber: 'WO-001',
            bomId: 'bom-1',
            productName: 'Produk Standar',
            productSku: 'SKU-01',
            quantity: 60,
            materialCost: 140_000,
            laborCost: 20_000,
            machineCost: 20_000,
            overheadCost: 0,
            totalCost: 180_000,
            unitCost: 3_000,
        },
        {
            orderId: 'po-3',
            orderNumber: 'WO-003',
            bomId: 'bom-1',
            productName: 'Produk Standar',
            productSku: 'SKU-01',
            quantity: 40,
            materialCost: 100_000,
            laborCost: 10_000,
            machineCost: 10_000,
            overheadCost: 0,
            totalCost: 120_000,
            unitCost: 3_000,
        },
    ],
    conversion: {
        enabled: false,
        pool: 0,
        allocated: 0,
        unallocated: 0,
        byAccount: [],
    },
    ...overrides,
});

describe('HppLockChangeNotice', () => {
    afterEach(() => {
        cleanup();
    });

    it('renders nothing when period is unlocked', () => {
        const { container } = render(
            <HppLockChangeNotice lock={null} liveReport={makeReportData()} />,
        );
        expect(container.firstChild).toBeNull();
    });

    it('renders legacy notice when period was locked before snapshot existed', () => {
        const legacyLock: HppPeriodLockInfo = {
            lockedAt: '2026-10-20T08:00:00.000Z',
            lockedByName: 'Finance Admin',
            notes: null,
            snapshot: null,
        };

        render(
            <HppLockChangeNotice
                lock={legacyLock}
                liveReport={makeReportData()}
            />,
        );

        expect(
            screen.getByText(
                /Dikunci sebelum snapshot tersedia; kunci ulang untuk memantau perubahan/i,
            ),
        ).toBeTruthy();
    });

    it('renders nothing when locked snapshot matches live report', () => {
        const report = makeReportData();
        const matchingLock: HppPeriodLockInfo = {
            lockedAt: '2026-10-28T08:00:00.000Z',
            lockedByName: 'Finance Admin',
            notes: null,
            snapshot: {
                version: 1,
                computedAt: '2026-10-28T08:00:00.000Z',
                totalCogm: 300_000,
                totalQuantity: 100,
                orderCount: 2,
                orders: [
                    {
                        productionOrderId: 'po-1',
                        orderNumber: 'WO-001',
                        totalCost: 180_000,
                    },
                    {
                        productionOrderId: 'po-3',
                        orderNumber: 'WO-003',
                        totalCost: 120_000,
                    },
                ],
            },
        };

        const { container } = render(
            <HppLockChangeNotice lock={matchingLock} liveReport={report} />,
        );
        expect(container.firstChild).toBeNull();
    });

    it('renders warning banner with total delta and changed/added/removed SPKs when numbers shifted', () => {
        const shiftedLock: HppPeriodLockInfo = {
            lockedAt: '2026-10-28T08:00:00.000Z',
            lockedByName: 'Finance Admin',
            notes: null,
            snapshot: {
                version: 1,
                computedAt: '2026-10-28T08:00:00.000Z',
                totalCogm: 250_000,
                totalQuantity: 90,
                orderCount: 2,
                orders: [
                    {
                        productionOrderId: 'po-1',
                        orderNumber: 'WO-001',
                        totalCost: 150_000,
                    },
                    {
                        productionOrderId: 'po-2',
                        orderNumber: 'WO-002',
                        totalCost: 100_000,
                    },
                ],
            },
        };

        render(
            <HppLockChangeNotice
                lock={shiftedLock}
                liveReport={makeReportData()}
            />,
        );

        expect(
            screen.getByText(/Angka berubah sejak dikunci/i),
        ).toBeTruthy();
        expect(screen.getByText(/WO-001/)).toBeTruthy();
        expect(screen.getByText(/\(berubah\)/i)).toBeTruthy();
        expect(screen.getByText(/WO-002/)).toBeTruthy();
        expect(screen.getByText(/\(keluar\)/i)).toBeTruthy();
        expect(screen.getByText(/WO-003/)).toBeTruthy();
        expect(screen.getByText(/\(masuk\)/i)).toBeTruthy();
    });
});

describe('HppReportClient lock integration', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        cleanup();
    });

    it('loads period lock state from getHppReportData and displays warning banner when changed', async () => {
        const lock: HppPeriodLockInfo = {
            lockedAt: '2026-10-28T08:00:00.000Z',
            lockedByName: 'Approver Satu',
            notes: null,
            snapshot: {
                version: 1,
                computedAt: '2026-10-28T08:00:00.000Z',
                totalCogm: 200_000,
                totalQuantity: 100,
                orderCount: 2,
                orders: [
                    {
                        productionOrderId: 'po-1',
                        orderNumber: 'WO-001',
                        totalCost: 100_000,
                    },
                    {
                        productionOrderId: 'po-3',
                        orderNumber: 'WO-003',
                        totalCost: 100_000,
                    },
                ],
            },
        };

        mockGetHppReportData.mockResolvedValue({
            success: true,
            data: makeReportData({ lock }),
        });

        render(<HppReportClient />);

        await waitFor(() => {
            expect(screen.getByText('Periode Terkunci')).toBeTruthy();
        });
        expect(screen.getByText(/Approver Satu/)).toBeTruthy();
        expect(
            screen.getByText(/Angka berubah sejak dikunci/i),
        ).toBeTruthy();

        mockUnlockPeriod.mockResolvedValueOnce({
            success: true,
            data: { success: true },
        });
        fireEvent.click(screen.getByRole('button', { name: /Buka Kunci/i }));

        await waitFor(() => {
            expect(screen.getByText('Periode Terbuka')).toBeTruthy();
        });

        mockLockPeriod.mockResolvedValueOnce({
            success: true,
            data: {
                success: true,
                lock: {
                    lockedAt: '2026-10-29T09:00:00.000Z',
                    lockedByName: 'Approver Dua',
                    notes: null,
                    snapshot: {
                        version: 1,
                        computedAt: '2026-10-29T09:00:00.000Z',
                        totalCogm: 300_000,
                        totalQuantity: 100,
                        orderCount: 2,
                        orders: [
                            {
                                productionOrderId: 'po-1',
                                orderNumber: 'WO-001',
                                totalCost: 180_000,
                            },
                            {
                                productionOrderId: 'po-3',
                                orderNumber: 'WO-003',
                                totalCost: 120_000,
                            },
                        ],
                    },
                },
            },
        });
        fireEvent.click(
            screen.getByRole('button', { name: /Kunci Periode Ini/i }),
        );

        await waitFor(() => {
            expect(screen.getByText('Periode Terkunci')).toBeTruthy();
        });
        expect(screen.getByText(/Approver Dua/)).toBeTruthy();
        expect(screen.queryByText(/Angka berubah sejak dikunci/i)).toBeNull();
    });
});
