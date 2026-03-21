import { describe, it, expect, vi, beforeEach } from 'vitest';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { SalesReturnService } from '../returns-service';
import { prisma } from '@/lib/prisma';
import { AutoJournalService } from '../../finance/auto-journal-service';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    salesReturn: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    inventory: {
      upsert: vi.fn(),
    },
    stockMovement: {
      create: vi.fn(),
    },
    $transaction: vi.fn((callback) => callback(prisma)),
  }
}));

vi.mock('@/lib/audit', () => ({
  logActivity: vi.fn(),
}));

vi.mock('../../finance/auto-journal-service', () => ({
  AutoJournalService: {
    handleSalesReturnReceived: vi.fn(),
  }
}));

describe('SalesReturnService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('receiveReturn', () => {
    it('should catch and log error if AutoJournalService fails', async () => {
      // Arrange
      const mockReturnId = 'return-123';
      const mockUserId = 'user-123';

      const mockSalesReturn = {
        id: mockReturnId,
        returnNumber: 'SR-20231026-0001',
        status: 'CONFIRMED',
        returnLocationId: 'loc-1',
        items: [
          { productVariantId: 'pv-1', returnedQty: 10, condition: 'GOOD' }
        ],
        salesOrder: { id: 'so-1' }
      };

      (prisma.salesReturn.findUnique as any).mockResolvedValueOnce(mockSalesReturn as any);
      (prisma.salesReturn.update as any).mockResolvedValueOnce({ ...mockSalesReturn, status: 'RECEIVED' } as any);

      const expectedError = new Error('Auto-journal failed');
      (AutoJournalService.handleSalesReturnReceived as any).mockRejectedValueOnce(expectedError);

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // Mock getReturnById which is called at the end
      vi.spyOn(SalesReturnService, 'getReturnById').mockResolvedValueOnce({ ...mockSalesReturn, status: 'RECEIVED' } as any);

      // Act
      const result = await SalesReturnService.receiveReturn(mockReturnId, mockUserId);

      // Assert
      expect(AutoJournalService.handleSalesReturnReceived).toHaveBeenCalledWith(mockReturnId);
      expect(consoleErrorSpy).toHaveBeenCalledWith("Failed to generate auto-journal for Sales Return:", expectedError);
      expect(result).toBeDefined();
      expect(result.status).toBe('RECEIVED');
    });
  });
});
