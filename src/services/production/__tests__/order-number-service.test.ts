// @ts-nocheck
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createProductionOrderWithGeneratedNumber } from '../order-number-service';
import { Prisma } from '@prisma/client';

// Mock prisma
vi.mock('@/lib/core/prisma', () => ({
    prisma: {},
}));

describe('order-number-service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('createProductionOrderWithGeneratedNumber', () => {
        it('should create production order with generated order number', async () => {
            // Arrange
            const mockTx = {
                productionOrder: {
                    create: vi.fn().mockResolvedValue({
                        id: 'po-1',
                        orderNumber: 'WO-ABC123',
                        status: 'DRAFT',
                    }),
                },
            };

            const data = {
                status: 'DRAFT',
                plannedQuantity: 100,
            };

            // Act
            const result = await createProductionOrderWithGeneratedNumber(mockTx as any, data);

            // Assert
            expect(result).toBeDefined();
            expect(result.id).toBe('po-1');
            expect(mockTx.productionOrder.create).toHaveBeenCalled();
        });

        it('should use custom prefix when provided', async () => {
            // Arrange
            const mockTx = {
                productionOrder: {
                    create: vi.fn().mockResolvedValue({
                        id: 'po-1',
                        orderNumber: 'PROD-ABC123',
                    }),
                },
            };

            const data = {
                status: 'DRAFT',
            };

            // Act
            await createProductionOrderWithGeneratedNumber(mockTx as any, data, {
                prefix: 'PROD',
            });

            // Assert
            const createCall = mockTx.productionOrder.create.mock.calls[0][0];
            expect(createCall.data.orderNumber).toMatch(/^PROD-/);
        });

        it('should include product variant ID in order number when provided', async () => {
            // Arrange
            const mockTx = {
                productionOrder: {
                    create: vi.fn().mockResolvedValue({
                        id: 'po-1',
                        orderNumber: 'WO-ABCD-123XYZ',
                    }),
                },
            };

            const data = {
                status: 'DRAFT',
            };

            // Act
            await createProductionOrderWithGeneratedNumber(mockTx as any, data, {
                productVariantId: 'abcd-1234-5678',
            });

            // Assert
            const createCall = mockTx.productionOrder.create.mock.calls[0][0];
            expect(createCall.data.orderNumber).toMatch(/^WO-ABCD-/);
        });

        it('should retry on unique constraint violation', async () => {
            // Arrange
            const prismaError = new Prisma.PrismaClientKnownRequestError(
                'Unique constraint failed on the fields: (`orderNumber`)',
                {
                    code: 'P2002',
                    clientVersion: '5.0.0',
                    meta: { target: ['orderNumber'] },
                }
            );

            const mockTx = {
                productionOrder: {
                    create: vi.fn()
                        .mockRejectedValueOnce(prismaError)
                        .mockResolvedValueOnce({
                            id: 'po-1',
                            orderNumber: 'WO-ABC123',
                        }),
                },
            };

            const data = {
                status: 'DRAFT',
            };

            // Act
            const result = await createProductionOrderWithGeneratedNumber(mockTx as any, data);

            // Assert
            expect(result).toBeDefined();
            expect(mockTx.productionOrder.create).toHaveBeenCalledTimes(2);
        });

        it('should throw error after max attempts', async () => {
            // Arrange
            const prismaError = new Prisma.PrismaClientKnownRequestError(
                'Unique constraint failed on the fields: (`orderNumber`)',
                {
                    code: 'P2002',
                    clientVersion: '5.0.0',
                    meta: { target: ['orderNumber'] },
                }
            );

            const mockTx = {
                productionOrder: {
                    create: vi.fn().mockRejectedValue(prismaError),
                },
            };

            const data = {
                status: 'DRAFT',
            };

            // Act & Assert
            await expect(
                createProductionOrderWithGeneratedNumber(mockTx as any, data, { maxAttempts: 2 })
            ).rejects.toThrow();

            expect(mockTx.productionOrder.create).toHaveBeenCalledTimes(2);
        });

        it('should throw non-P2002 errors immediately', async () => {
            // Arrange
            const dbError = new Error('Database connection failed');
            const mockTx = {
                productionOrder: {
                    create: vi.fn().mockRejectedValue(dbError),
                },
            };

            const data = {
                status: 'DRAFT',
            };

            // Act & Assert
            await expect(
                createProductionOrderWithGeneratedNumber(mockTx as any, data)
            ).rejects.toThrow('Database connection failed');
        });
    });
});
