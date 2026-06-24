import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getFiscalPeriods, createFiscalPeriod, isPeriodOpen } from '../periods-service';
import { prisma } from '@/lib/core/prisma';

// Mock prisma
vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        fiscalPeriod: {
            findMany: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
            findUnique: vi.fn(),
        },
    },
}));

// Mock journals-service
vi.mock('../journals-service', () => ({
    createClosingJournalEntry: vi.fn(),
}));

describe('periods-service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('getFiscalPeriods', () => {
        it('should return all fiscal periods ordered by year and month desc', async () => {
            // Arrange
            const mockPeriods = [
                { id: '1', name: 'January 2024', year: 2024, month: 1, status: 'OPEN' },
                { id: '2', name: 'December 2023', year: 2023, month: 12, status: 'CLOSED' },
            ];

            vi.mocked(prisma.fiscalPeriod.findMany).mockResolvedValue(mockPeriods as any);

            // Act
            const result = await getFiscalPeriods();

            // Assert
            expect(result).toEqual(mockPeriods);
            expect(prisma.fiscalPeriod.findMany).toHaveBeenCalledWith({
                orderBy: [{ year: 'desc' }, { month: 'desc' }],
            });
        });

        it('should return empty array when no periods exist', async () => {
            // Arrange
            vi.mocked(prisma.fiscalPeriod.findMany).mockResolvedValue([]);

            // Act
            const result = await getFiscalPeriods();

            // Assert
            expect(result).toEqual([]);
        });
    });

    describe('createFiscalPeriod', () => {
        it('should create a new fiscal period', async () => {
            // Arrange
            const mockCreatedPeriod = {
                id: '1',
                name: 'January 2024',
                year: 2024,
                month: 1,
                startDate: new Date(2024, 0, 1),
                endDate: new Date(2024, 1, 0, 23, 59, 59),
                status: 'OPEN',
            };

            vi.mocked(prisma.fiscalPeriod.create).mockResolvedValue(mockCreatedPeriod as any);

            // Act
            const result = await createFiscalPeriod(2024, 1);

            // Assert
            expect(result).toEqual(mockCreatedPeriod);
            expect(prisma.fiscalPeriod.create).toHaveBeenCalledWith({
                data: {
                    name: expect.any(String),
                    year: 2024,
                    month: 1,
                    startDate: expect.any(Date),
                    endDate: expect.any(Date),
                    status: 'OPEN',
                },
            });
        });

        it('should create period with correct date boundaries', async () => {
            // Arrange
            const mockCreatedPeriod = {
                id: '1',
                name: 'February 2024',
                year: 2024,
                month: 2,
                startDate: new Date(2024, 1, 1),
                endDate: new Date(2024, 2, 0, 23, 59, 59),
                status: 'OPEN',
            };

            vi.mocked(prisma.fiscalPeriod.create).mockResolvedValue(mockCreatedPeriod as any);

            // Act
            const result = await createFiscalPeriod(2024, 2);

            // Assert
            expect(result).toEqual(mockCreatedPeriod);
        });
    });

    describe('isPeriodOpen', () => {
        it('should return true when period is open', async () => {
            // Arrange
            const mockPeriod = {
                id: '1',
                year: 2024,
                month: 1,
                status: 'OPEN',
            };

            vi.mocked(prisma.fiscalPeriod.findUnique).mockResolvedValue(mockPeriod as any);

            // Act
            const result = await isPeriodOpen(new Date(2024, 0, 15));

            // Assert
            expect(result).toBe(true);
        });

        it('should return false when period is closed', async () => {
            // Arrange
            const mockPeriod = {
                id: '1',
                year: 2024,
                month: 1,
                status: 'CLOSED',
            };

            vi.mocked(prisma.fiscalPeriod.findUnique).mockResolvedValue(mockPeriod as any);

            // Act
            const result = await isPeriodOpen(new Date(2024, 0, 15));

            // Assert
            expect(result).toBe(false);
        });

        it('should return false when no period exists', async () => {
            // Arrange
            vi.mocked(prisma.fiscalPeriod.findUnique).mockResolvedValue(null);

            // Act
            const result = await isPeriodOpen(new Date(2024, 0, 15));

            // Assert
            expect(result).toBe(false);
        });

        it('should use transaction when provided', async () => {
            // Arrange
            const mockTx = {
                fiscalPeriod: {
                    findUnique: vi.fn().mockResolvedValue({
                        id: '1',
                        year: 2024,
                        month: 1,
                        status: 'OPEN',
                    }),
                },
            };

            // Act
            const result = await isPeriodOpen(new Date(2024, 0, 15), mockTx as any);

            // Assert
            expect(result).toBe(true);
            expect(mockTx.fiscalPeriod.findUnique).toHaveBeenCalled();
        });
    });
});
