// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetIncomeStatement, mockGetAdjustmentDetails } = vi.hoisted(() => ({
    mockGetIncomeStatement: vi.fn(),
    mockGetAdjustmentDetails: vi.fn(),
}));

vi.mock('@/actions/finance/accounting', () => ({
    getIncomeStatement: mockGetIncomeStatement,
    getInventoryAdjustmentReportDetails: mockGetAdjustmentDetails,
}));

import IncomeStatementPage from '../page';

const report = {
    revenue: [],
    cogs: [],
    opex: [],
    other: [
        {
            id: 'gain',
            code: '81100',
            name: 'Inventory Adjustment Gain',
            type: 'REVENUE',
            netBalance: 3000,
        },
        {
            id: 'loss',
            code: '91100',
            name: 'Inventory Adjustment Loss',
            type: 'EXPENSE',
            netBalance: 1000,
        },
    ],
    totalRevenue: 0,
    totalManufacturingCosts: 0,
    inventoryChange: 0,
    totalCOGS: 0,
    grossProfit: 0,
    totalOpEx: 0,
    operatingIncome: 0,
    totalOther: 2000,
    netIncome: 2000,
};

describe('income statement adjustment disclosure', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetIncomeStatement.mockResolvedValue({
            success: true,
            data: report,
        });
        mockGetAdjustmentDetails.mockResolvedValue({
            success: true,
            data: {
                accountId: 'gain',
                accountCode: '81100',
                accountName: 'Inventory Adjustment Gain',
                direction: 'GAIN',
                eventCount: 1,
                totalAmount: 3000,
                events: [
                    {
                        journalId: 'journal-1',
                        journalNumber: 'JE-001',
                        movementId: 'movement-1',
                        direction: 'GAIN',
                        effectiveDate: '2026-10-01',
                        recordedAt: '2026-10-01T08:17:00.000Z',
                        productVariantId: 'variant-1',
                        productName: 'HD',
                        variantName: 'HD 1',
                        unit: 'KG',
                        locationName: 'Gudang Bahan Baku',
                        quantity: 2,
                        amount: 3000,
                        unitCost: 1500,
                        costBasis: 'INFERRED',
                        sourceType: 'STOCK_OPNAME',
                        sourceId: 'opname-1',
                        sourceLabel: 'OPN-202610-0001',
                        reason: 'OPN-202610-0001',
                        actorName: null,
                        systemQuantity: 10,
                        countedQuantity: 12,
                    },
                ],
            },
        });
    });

    it('uses compact info buttons and opens event details from the amount', async () => {
        render(<IncomeStatementPage />);

        expect(
            await screen.findByText('Inventory Adjustment Gain'),
        ).toBeTruthy();
        expect(
            screen.getByRole('button', {
                name: 'Info Inventory Adjustment Gain',
            }),
        ).toBeTruthy();
        expect(
            screen.getByRole('button', {
                name: 'Info Inventory Adjustment Loss',
            }),
        ).toBeTruthy();

        fireEvent.click(
            screen.getByRole('button', {
                name: 'Info Inventory Adjustment Gain',
            }),
        );
        expect(
            await screen.findByText(/bukan pendapatan penjualan/),
        ).toBeTruthy();
        fireEvent.click(
            screen.getByRole('button', { name: 'Lihat rincian' }),
        );

        expect(
            await screen.findByRole('heading', {
                name: 'Stok bertambah karena penyesuaian',
            }),
        ).toBeTruthy();
        await waitFor(() =>
            expect(mockGetAdjustmentDetails).toHaveBeenCalledWith(
                'gain',
                expect.any(Date),
                expect.any(Date),
            ),
        );
        expect(await screen.findByText('Gudang Bahan Baku · 2026-10-01')).toBeTruthy();
        expect(screen.getByText('Biaya diinferensikan')).toBeTruthy();
        expect(screen.getByText(/Stok sistem/).textContent).toContain(
            'Stok sistem 10 KG → hasil opname 12 KG',
        );
        expect(screen.getByRole('link', { name: /Lihat sumber/ }).getAttribute('href')).toBe(
            '/warehouse/opname/opname-1',
        );
        expect(screen.getByRole('link', { name: 'Jurnal' }).getAttribute('href')).toBe(
            '/finance/journals/journal-1',
        );
    });
});
