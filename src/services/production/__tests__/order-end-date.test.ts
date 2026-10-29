import { describe, expect, it, vi } from 'vitest';
import { completionEndDate } from '../order-end-date';

describe('completionEndDate', () => {
    it('uses the last non-voided output of the SPK, not the moment it was closed', async () => {
        const lastOutput = new Date('2026-10-20T02:08:00Z');
        const tx = { productionExecution: { aggregate: vi.fn(async () => ({ _max: { endTime: lastOutput } })) } };

        await expect(completionEndDate(tx as never, 'po-1', new Date('2026-10-28T11:44:00Z'))).resolves.toBe(lastOutput);
        expect(tx.productionExecution.aggregate).toHaveBeenCalledWith({
            _max: { endTime: true },
            where: { productionOrderId: 'po-1', status: { not: 'VOIDED' }, quantityProduced: { gt: 0 } },
        });
    });

    it('falls back to the closing moment when the SPK never recorded output', async () => {
        const closedAt = new Date('2026-10-28T11:44:00Z');
        const tx = { productionExecution: { aggregate: vi.fn(async () => ({ _max: { endTime: null } })) } };

        await expect(completionEndDate(tx as never, 'po-1', closedAt)).resolves.toBe(closedAt);
    });

    it('excludes a specific execution when recalculating the end date during void', async () => {
        const previousOutput = new Date('2026-10-19T14:00:00Z');
        const tx = { productionExecution: { aggregate: vi.fn(async () => ({ _max: { endTime: previousOutput } })) } };

        await expect(
            completionEndDate(tx as never, 'po-1', new Date('2026-10-20T02:08:00Z'), 'exec-void'),
        ).resolves.toBe(previousOutput);
        expect(tx.productionExecution.aggregate).toHaveBeenCalledWith({
            _max: { endTime: true },
            where: {
                productionOrderId: 'po-1',
                id: { not: 'exec-void' },
                status: { not: 'VOIDED' },
                quantityProduced: { gt: 0 },
            },
        });
    });
});
