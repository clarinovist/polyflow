// @vitest-environment jsdom
import {
    cleanup,
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
    StockLedgerHealth,
    StockLedgerPairHistory,
} from '@/services/inventory/stock-ledger-health-service';

const mocks = vi.hoisted(() => ({
    listGaps: vi.fn(),
    getHistory: vi.fn(),
}));
vi.mock('@/actions/inventory/stock-ledger-gaps', () => ({
    listStockLedgerGaps: mocks.listGaps,
    getStockLedgerGapHistory: mocks.getHistory,
}));

import { StockLedgerGaps } from '../StockLedgerGaps';
import StockLedgerGapsPage from '@/app/warehouse/inventory/ledger-gaps/page';

const sampleHealth: StockLedgerHealth = {
    mismatches: [
        {
            productVariantId: 'pv-mat',
            locationId: 'loc-b',
            skuCode: 'SKU-MAT-01',
            locationName: 'Gudang B',
            live: '5',
            ledger: '30.5',
            diff: '-25.5',
        },
        {
            productVariantId: 'pv-round',
            locationId: 'loc-a',
            skuCode: 'SKU-ROUND-01',
            locationName: 'Gudang A',
            live: '10.0005',
            ledger: '10',
            diff: '0.0005',
        },
    ],
    roundingCount: 1,
    materialCount: 1,
    findings: 2,
};

const sampleHistory: StockLedgerPairHistory = {
    productVariantId: 'pv-mat',
    locationId: 'loc-b',
    live: '5',
    ledger: '30.5',
    diff: '-25.5',
    openingBalance: '0',
    truncated: false,
    totalMovements: 2,
    firstNegative: {
        id: 'mov-2',
        createdAt: '2026-10-02T08:00:00.000Z',
        type: 'OUT',
        reference: 'DO-001',
        inQuantity: '0',
        outQuantity: '15',
        delta: '-15',
        runningBalance: '-5',
    },
    movements: [
        {
            id: 'mov-1',
            createdAt: '2026-10-01T08:00:00.000Z',
            type: 'IN',
            reference: 'GR-001',
            inQuantity: '10',
            outQuantity: '0',
            delta: '10',
            runningBalance: '10',
        },
        {
            id: 'mov-2',
            createdAt: '2026-10-02T08:00:00.000Z',
            type: 'OUT',
            reference: 'DO-001',
            inQuantity: '0',
            outQuantity: '15',
            delta: '-15',
            runningBalance: '-5',
        },
    ],
};

beforeEach(() => {
    vi.clearAllMocks();
});
afterEach(cleanup);

describe('StockLedgerGaps', () => {
    it('renders summary counts, diagnostic notice without correction buttons, and classifies pembulatan vs material', () => {
        render(<StockLedgerGaps health={sampleHealth} />);

        expect(screen.getByText(/hanya.*diagnosis/i)).toBeTruthy();
        expect(screen.getByText(/koreksi terjaga/i)).toBeTruthy();
        expect(screen.getByText(/admin\/Finance/i)).toBeTruthy();
        expect(
            screen.queryByRole('button', {
                name: /koreksi|selaraskan|perbaiki|simpan/i,
            }),
        ).toBeNull();

        expect(
            within(screen.getByLabelText('Ringkasan selisih')).getByText('2'),
        ).toBeTruthy();

        const matRow = screen.getByText('SKU-MAT-01').closest('tr')!;
        expect(within(matRow).getByText('Gudang B')).toBeTruthy();
        expect(within(matRow).getByText('5')).toBeTruthy();
        expect(within(matRow).getByText('30.5')).toBeTruthy();
        expect(within(matRow).getByText('-25.5')).toBeTruthy();
        expect(within(matRow).getByText('material')).toBeTruthy();

        const roundRow = screen.getByText('SKU-ROUND-01').closest('tr')!;
        expect(within(roundRow).getByText('Gudang A')).toBeTruthy();
        expect(within(roundRow).getByText('10.0005')).toBeTruthy();
        expect(within(roundRow).getByText('10')).toBeTruthy();
        expect(within(roundRow).getByText('+0.0005')).toBeTruthy();
        expect(within(roundRow).getByText('pembulatan')).toBeTruthy();
    });

    it('renders the clean empty state when no mismatches exist', () => {
        render(
            <StockLedgerGaps
                health={{
                    mismatches: [],
                    roundingCount: 0,
                    materialCount: 0,
                    findings: 0,
                }}
            />,
        );

        expect(
            screen.getByText('Semua saldo cocok dengan kartu stok'),
        ).toBeTruthy();
    });

    it('loads pair movement history and highlights the first negative ledger position on row click', async () => {
        mocks.getHistory.mockResolvedValue({
            success: true,
            data: sampleHistory,
        });
        render(<StockLedgerGaps health={sampleHealth} />);

        fireEvent.click(screen.getByText('SKU-MAT-01').closest('tr')!);

        await waitFor(() =>
            expect(mocks.getHistory).toHaveBeenCalledWith({
                productVariantId: 'pv-mat',
                locationId: 'loc-b',
            }),
        );

        const historyPanel = await screen.findByLabelText(
            'Riwayat mutasi pasangan',
        );
        expect(within(historyPanel).getByText('GR-001')).toBeTruthy();
        expect(within(historyPanel).getAllByText('DO-001').length).toBeGreaterThan(
            0,
        );
        expect(
            within(historyPanel).getByText(/Pertama kali kartu stok negatif/i),
        ).toBeTruthy();
        expect(within(historyPanel).getAllByText('-5').length).toBeGreaterThan(
            0,
        );
    });

    it('shows truncated window opening balance and handles load failure', async () => {
        mocks.getHistory
            .mockResolvedValueOnce({
                success: false,
                error: 'Gagal memuat riwayat pasangan',
            })
            .mockResolvedValueOnce({
                success: true,
                data: {
                    ...sampleHistory,
                    truncated: true,
                    openingBalance: '12.5',
                    totalMovements: 250,
                    firstNegative: null,
                },
            });

        render(<StockLedgerGaps health={sampleHealth} />);

        fireEvent.click(screen.getByText('SKU-MAT-01').closest('tr')!);
        const alert = await screen.findByRole('alert');
        expect(alert.textContent).toContain('Gagal memuat riwayat pasangan');

        fireEvent.click(screen.getByText('SKU-ROUND-01').closest('tr')!);
        const historyPanel = await screen.findByLabelText(
            'Riwayat mutasi pasangan',
        );
        expect(
            within(historyPanel).getByText(/Saldo sebelum jendela: 12.5/),
        ).toBeTruthy();
    });

    it('renders StockLedgerGapsPage for both success and error responses', async () => {
        mocks.listGaps.mockResolvedValueOnce({
            success: true,
            data: sampleHealth,
        });
        render(await StockLedgerGapsPage());
        expect(
            screen.getByRole('heading', { name: 'Selisih Kartu Stok' }),
        ).toBeTruthy();
        expect(screen.getByText('SKU-MAT-01')).toBeTruthy();

        cleanup();
        mocks.listGaps.mockResolvedValueOnce({
            success: false,
            error: 'Akses ditolak',
        });
        render(await StockLedgerGapsPage());
        expect(screen.getByRole('alert').textContent).toContain(
            'Akses ditolak',
        );
    });
});
