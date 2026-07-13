import { describe, it, expect, vi, beforeEach  } from 'vitest';
import { SalesReturnService } from '../returns-service';
import { prisma } from '@/lib/core/prisma';
import { AutoJournalService } from '../../finance/auto-journal-service';
import { logger } from '@/lib/config/logger';

vi.mock('@/lib/core/prisma', () => ({
  prisma: {
    salesReturn: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
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

vi.mock('@/lib/tools/audit', () => ({
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
       
      (prisma.salesReturn.update as any).mockResolvedValueOnce({ ...mockSalesReturn, status: 'RECEIVED' } as never);

      const expectedError = new Error('Auto-journal failed');
       
      (AutoJournalService.handleSalesReturnReceived as any).mockRejectedValueOnce(expectedError);

      const loggerErrorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});

      // Mock getReturnById which is called at the end
      vi.spyOn(SalesReturnService, 'getReturnById').mockResolvedValueOnce({ ...mockSalesReturn, status: 'RECEIVED' } as never);

      // Act
      const result = await SalesReturnService.receiveReturn(mockReturnId, mockUserId);

      // Assert
      expect(AutoJournalService.handleSalesReturnReceived).toHaveBeenCalledWith(mockReturnId);
      expect(loggerErrorSpy).toHaveBeenCalledWith("Failed to generate auto-journal for Sales Return", expect.objectContaining({ error: expectedError }));
      expect(result).toBeDefined();
      expect(result!.status).toBe('RECEIVED');
    });
  });

  describe('createReturn', () => {
    it('should create a new sales return', async () => {
      // Arrange
      const mockReturn = {
        id: 'return-1',
        returnNumber: 'SR-20240115-0001',
        salesOrderId: 'so-1',
        customerId: 'cust-1',
        returnLocationId: 'loc-1',
        reason: 'Defective product',
        totalAmount: 1000,
        status: 'DRAFT',
        items: [
          { productVariantId: 'pv-1', returnedQty: 10, unitPrice: 100 },
        ],
      };

      vi.mocked(prisma.salesReturn.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.salesReturn.create).mockResolvedValue(mockReturn as any);

      // Act
      const result = await SalesReturnService.createReturn({
        salesOrderId: 'so-1',
        customerId: 'cust-1',
        returnLocationId: 'loc-1',
        reason: 'Defective product',
        items: [
          { productVariantId: 'pv-1', returnedQty: 10, unitPrice: 100, reason: 'OTHER', condition: 'GOOD' },
        ],
      }, 'user-1');

      // Assert
      expect(result).toEqual(mockReturn);
      expect(prisma.salesReturn.create).toHaveBeenCalled();
    });
  });

  describe('confirmReturn', () => {
    it('should confirm a draft return', async () => {
      // Arrange
      const mockReturn = {
        id: 'return-1',
        returnNumber: 'SR-001',
        status: 'DRAFT',
      };

      vi.mocked(prisma.salesReturn.findUnique).mockResolvedValue(mockReturn as any);
      vi.mocked(prisma.salesReturn.update).mockResolvedValue({ ...mockReturn, status: 'CONFIRMED' } as any);

      // Act
      const result = await SalesReturnService.confirmReturn('return-1', 'user-1');

      // Assert
      expect(result.status).toBe('CONFIRMED');
    });

    it('should throw error when return not found', async () => {
      // Arrange
      vi.mocked(prisma.salesReturn.findUnique).mockResolvedValue(null);

      // Act & Assert
      await expect(
        SalesReturnService.confirmReturn('return-999', 'user-1')
      ).rejects.toThrow('Sales Return');
    });

    it('should throw error when return is not DRAFT', async () => {
      // Arrange
      vi.mocked(prisma.salesReturn.findUnique).mockResolvedValue({
        id: 'return-1',
        status: 'CONFIRMED',
      } as any);

      // Act & Assert
      await expect(
        SalesReturnService.confirmReturn('return-1', 'user-1')
      ).rejects.toThrow('Only DRAFT returns can be confirmed');
    });
  });

  describe('completeReturn', () => {
    it('should complete a received return', async () => {
      // Arrange
      const mockReturn = {
        id: 'return-1',
        returnNumber: 'SR-001',
        status: 'RECEIVED',
      };

      vi.mocked(prisma.salesReturn.findUnique).mockResolvedValue(mockReturn as any);
      vi.mocked(prisma.salesReturn.update).mockResolvedValue({ ...mockReturn, status: 'COMPLETED' } as any);

      // Act
      const result = await SalesReturnService.completeReturn('return-1', 'user-1');

      // Assert
      expect(result.status).toBe('COMPLETED');
    });

    it('should throw error when return is not RECEIVED', async () => {
      // Arrange
      vi.mocked(prisma.salesReturn.findUnique).mockResolvedValue({
        id: 'return-1',
        status: 'CONFIRMED',
      } as any);

      // Act & Assert
      await expect(
        SalesReturnService.completeReturn('return-1', 'user-1')
      ).rejects.toThrow('Only RECEIVED returns can be completed');
    });
  });
});
