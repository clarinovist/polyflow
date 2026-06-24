import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TaxService } from '../tax-service';
import { prisma } from '@/lib/core/prisma';

// Mock prisma
vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        journalLine: {
            aggregate: vi.fn(),
        },
    },
}));

// Mock account-resolver
vi.mock('@/services/accounting/account-resolver', () => ({
    resolveAccount: vi.fn(),
}));

describe('TaxService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('getTaxSummary', () => {
        it('should calculate tax summary correctly', async () => {
            // Arrange
            const { resolveAccount } = await import('@/services/accounting/account-resolver');

            vi.mocked(resolveAccount)
                .mockResolvedValueOnce({ id: 'vat-output-id' } as any)
                .mockResolvedValueOnce({ id: 'vat-input-id' } as any)
                .mockResolvedValueOnce({ id: 'income-tax-id' } as any);

            // VAT Output: Credit - Debit = 1000 - 0 = 1000
            vi.mocked(prisma.journalLine.aggregate)
                .mockResolvedValueOnce({
                    _sum: { debit: { toNumber: () => 0 }, credit: { toNumber: () => 1000 } },
                } as any)
                // VAT Input: Credit - Debit = 0 - 500 = -500
                .mockResolvedValueOnce({
                    _sum: { debit: { toNumber: () => 500 }, credit: { toNumber: () => 0 } },
                } as any)
                // Income Tax: Credit - Debit = 200 - 0 = 200
                .mockResolvedValueOnce({
                    _sum: { debit: { toNumber: () => 0 }, credit: { toNumber: () => 200 } },
                } as any);

            const startDate = new Date(2024, 0, 1);
            const endDate = new Date(2024, 0, 31);

            // Act
            const result = await TaxService.getTaxSummary(startDate, endDate);

            // Assert
            expect(result.vatOutputBalance).toBe(1000);
            expect(result.vatInputBalance).toBe(-500);
            expect(result.netVatPayable).toBe(500); // 1000 + (-500)
            expect(result.incomeTaxPayable).toBe(200);
            expect(result.periodStart).toBe(startDate);
            expect(result.periodEnd).toBe(endDate);
        });

        it('should return zero when no tax accounts found', async () => {
            // Arrange
            const { resolveAccount } = await import('@/services/accounting/account-resolver');

            vi.mocked(resolveAccount).mockResolvedValue(undefined as any);

            vi.mocked(prisma.journalLine.aggregate).mockResolvedValue({
                _sum: { debit: null, credit: null },
            } as any);

            const startDate = new Date(2024, 0, 1);
            const endDate = new Date(2024, 0, 31);

            // Act
            const result = await TaxService.getTaxSummary(startDate, endDate);

            // Assert
            expect(result.vatOutputBalance).toBe(0);
            expect(result.vatInputBalance).toBe(0);
            expect(result.netVatPayable).toBe(0);
            expect(result.incomeTaxPayable).toBe(0);
        });

        it('should handle null aggregate results', async () => {
            // Arrange
            const { resolveAccount } = await import('@/services/accounting/account-resolver');

            vi.mocked(resolveAccount)
                .mockResolvedValueOnce({ id: 'vat-output-id' } as any)
                .mockResolvedValueOnce({ id: 'vat-input-id' } as any)
                .mockResolvedValueOnce({ id: 'income-tax-id' } as any);

            vi.mocked(prisma.journalLine.aggregate).mockResolvedValue({
                _sum: { debit: null, credit: null },
            } as any);

            const startDate = new Date(2024, 0, 1);
            const endDate = new Date(2024, 0, 31);

            // Act
            const result = await TaxService.getTaxSummary(startDate, endDate);

            // Assert
            expect(result.vatOutputBalance).toBe(0);
            expect(result.vatInputBalance).toBe(0);
            expect(result.netVatPayable).toBe(0);
            expect(result.incomeTaxPayable).toBe(0);
        });
    });
});
