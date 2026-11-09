import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Prisma } from '@prisma/client';

const mocks = vi.hoisted(() => ({ audit: vi.fn(), transaction: vi.fn() }));
vi.mock('@/lib/core/prisma', () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock('@/lib/tools/audit', () => ({ logActivity: mocks.audit }));

import { setOrderPackagingMode } from '../order-packaging-mode-service';
import { ProductionService } from '../production-service';

const tx = {
    $queryRaw: vi.fn(),
    productionOrder: { findUnique: vi.fn(), update: vi.fn() },
    productionExecution: { count: vi.fn() },
};
const client = tx as unknown as Prisma.TransactionClient;

const orderRow = (overrides: Record<string, unknown> = {}) => ({
    id: 'po-1',
    status: 'RELEASED',
    actualPackagingEnabled: false,
    requestedOutputVariantId: null,
    ...overrides,
});

describe('setOrderPackagingMode', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        tx.$queryRaw.mockResolvedValue([{ id: 'po-1' }]);
        tx.productionOrder.findUnique.mockResolvedValue(orderRow());
        tx.productionOrder.update.mockResolvedValue({});
        tx.productionExecution.count.mockResolvedValue(0);
        mocks.transaction.mockImplementation((fn) => fn(client));
    });

    it('is exposed through the ProductionService facade', () => {
        expect(ProductionService.setPackagingMode).toBe(setOrderPackagingMode);
    });

    it('turns packaging on when the order has no executions', async () => {
        await setOrderPackagingMode({ id: 'po-1', enabled: true, userId: 'user-1' });

        expect(String(tx.$queryRaw.mock.calls[0][0])).toContain('FOR UPDATE');
        expect(tx.productionExecution.count).toHaveBeenCalledWith({ where: { productionOrderId: 'po-1' } });
        expect(tx.productionOrder.update).toHaveBeenCalledWith({
            where: { id: 'po-1' },
            data: { actualPackagingEnabled: true },
        });
    });

    it('turns packaging off when it was on and no execution exists', async () => {
        tx.productionOrder.findUnique.mockResolvedValue(orderRow({ actualPackagingEnabled: true }));

        await setOrderPackagingMode({ id: 'po-1', enabled: false, userId: 'user-1' });

        expect(tx.productionOrder.update).toHaveBeenCalledWith({
            where: { id: 'po-1' },
            data: { actualPackagingEnabled: false },
        });
    });

    it('rejects when the order already has executions and writes nothing', async () => {
        tx.productionExecution.count.mockResolvedValue(2);

        await expect(
            setOrderPackagingMode({ id: 'po-1', enabled: true, userId: 'user-1' }),
        ).rejects.toThrow('sudah punya hasil');
        expect(tx.productionOrder.update).not.toHaveBeenCalled();
        expect(mocks.audit).not.toHaveBeenCalled();
    });

    it.each(['CANCELLED', 'CLOSED', 'COMPLETED'])('rejects terminal status %s', async (status) => {
        tx.productionOrder.findUnique.mockResolvedValue(orderRow({ status }));

        await expect(
            setOrderPackagingMode({ id: 'po-1', enabled: true, userId: 'user-1' }),
        ).rejects.toThrow('selesai atau dibatalkan');
        expect(tx.productionOrder.update).not.toHaveBeenCalled();
        expect(mocks.audit).not.toHaveBeenCalled();
    });

    it('rejects a missing order', async () => {
        tx.productionOrder.findUnique.mockResolvedValue(null);

        await expect(
            setOrderPackagingMode({ id: 'missing', enabled: true, userId: 'user-1' }),
        ).rejects.toThrow();
        expect(tx.productionOrder.update).not.toHaveBeenCalled();
    });

    it('is idempotent: an unchanged value neither writes nor audits', async () => {
        tx.productionOrder.findUnique.mockResolvedValue(orderRow({ actualPackagingEnabled: true }));

        await setOrderPackagingMode({ id: 'po-1', enabled: true, userId: 'user-1' });

        expect(tx.productionOrder.update).not.toHaveBeenCalled();
        expect(mocks.audit).not.toHaveBeenCalled();
    });

    it('audits the change inside the same transaction with the tx client', async () => {
        await setOrderPackagingMode({ id: 'po-1', enabled: true, userId: 'user-1' });

        expect(mocks.audit).toHaveBeenCalledTimes(1);
        expect(mocks.audit).toHaveBeenCalledWith(
            expect.objectContaining({
                userId: 'user-1',
                action: 'SET_PRODUCTION_ORDER_PACKAGING_MODE',
                entityType: 'ProductionOrder',
                entityId: 'po-1',
                changes: { actualPackagingEnabled: { from: false, to: true } },
                tx: client,
            }),
        );
    });

    it('rejects turning packaging off for an order mapped to a requested output variant', async () => {
        tx.productionOrder.findUnique.mockResolvedValue(
            orderRow({ actualPackagingEnabled: true, requestedOutputVariantId: 'variant-1' }),
        );

        await expect(
            setOrderPackagingMode({ id: 'po-1', enabled: false, userId: 'user-1' }),
        ).rejects.toThrow('pemetaan');
        expect(tx.productionOrder.update).not.toHaveBeenCalled();
        expect(mocks.audit).not.toHaveBeenCalled();
    });

    it('still allows leaving packaging on for a mapped order (idempotent)', async () => {
        tx.productionOrder.findUnique.mockResolvedValue(
            orderRow({ actualPackagingEnabled: true, requestedOutputVariantId: 'variant-1' }),
        );

        await expect(
            setOrderPackagingMode({ id: 'po-1', enabled: true, userId: 'user-1' }),
        ).resolves.toBeUndefined();
    });
});
