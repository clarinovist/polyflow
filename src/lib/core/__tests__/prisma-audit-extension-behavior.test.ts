import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/core/actor-context', () => ({
    getActorUserId: vi.fn(() => 'actor-1'),
}));

import { withStatusAudit } from '../prisma-audit-extension';

type Hook = (input: {
    model: string;
    args: Record<string, unknown>;
    query: (args: Record<string, unknown>) => Promise<unknown>;
}) => Promise<unknown>;

const mocks = {
    auditCreate: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
};

/** Runs the real extension against a fake client; `$extends` just hands back the hooks. */
function hooks() {
    const delegate = { findFirst: mocks.findFirst, findMany: mocks.findMany };
    const client = {
        $extends: (config: { query: { $allModels: Record<string, Hook> } }) =>
            config.query.$allModels,
        auditLog: { create: mocks.auditCreate },
        expenseClaim: delegate,
        salesOrder: delegate,
    };
    return withStatusAudit(client as never) as unknown as Record<'update' | 'updateMany', Hook>;
}

const query = vi.fn(async () => ({ count: 1 }));
const statusArgs = { where: { id: 'x' }, data: { status: 'PAID' } };

beforeEach(() => {
    vi.clearAllMocks();
    mocks.findFirst.mockResolvedValue({ id: 'x', status: 'APPROVED' });
    mocks.findMany.mockResolvedValue([{ id: 'x', status: 'APPROVED' }]);
});

describe('withStatusAudit', () => {
    it.each(['update', 'updateMany'] as const)(
        'does not write an outer-client audit row for an ExpenseClaim %s (manual in-transaction audit is authoritative)',
        async (method) => {
            await hooks()[method]({ model: 'ExpenseClaim', args: statusArgs, query });

            expect(query).toHaveBeenCalledWith(statusArgs);
            expect(mocks.findFirst).not.toHaveBeenCalled();
            expect(mocks.findMany).not.toHaveBeenCalled();
            expect(mocks.auditCreate).not.toHaveBeenCalled();
        },
    );

    it.each(['update', 'updateMany'] as const)(
        'still writes a STATUS_CHANGE audit row for other auditable models on %s',
        async (method) => {
            await hooks()[method]({ model: 'SalesOrder', args: statusArgs, query });

            expect(mocks.auditCreate).toHaveBeenCalledTimes(1);
            expect(mocks.auditCreate.mock.calls[0][0].data).toMatchObject({
                userId: 'actor-1',
                action: 'STATUS_CHANGE',
                entityType: 'SalesOrder',
                fromStatus: 'APPROVED',
                toStatus: 'PAID',
            });
        },
    );

    it('keeps excluding the Learning models', async () => {
        await hooks().updateMany({ model: 'LearningFinding', args: statusArgs, query });
        expect(mocks.auditCreate).not.toHaveBeenCalled();
    });
});
