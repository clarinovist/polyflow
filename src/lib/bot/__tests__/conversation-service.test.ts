import { beforeEach, describe, expect, it, vi } from 'vitest';

const findUnique = vi.fn();

vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        helpConversation: {
            findUnique: (...args: unknown[]) => findUnique(...args),
        },
    },
}));

import { loadConversationContext } from '../conversation-service';

describe('loadConversationContext contextual history', () => {
    beforeEach(() => vi.clearAllMocks());

    it('filters in the database by context key and does not reuse legacy summary', async () => {
        findUnique.mockResolvedValue({
            id: 'conv-1',
            summary: 'Ringkasan finance lama',
            messages: [
                {
                    role: 'ASSISTANT',
                    content: 'Jawaban produksi',
                    evidenceJson: {
                        contextKey: 'production:/production/orders/order-1',
                        entities: [
                            {
                                type: 'ProductionOrder',
                                id: 'order-1',
                                label: 'SPK-001',
                            },
                        ],
                    },
                },
            ],
        });

        const context = await loadConversationContext(
            'conv-1',
            'production:/production/orders/order-1',
        );

        expect(findUnique.mock.calls[0][0].select.messages.where).toEqual({
            evidenceJson: {
                path: ['contextKey'],
                equals: 'production:/production/orders/order-1',
            },
        });
        expect(context.summary).toBeUndefined();
        expect(context.history).toEqual([
            { role: 'assistant', content: 'Jawaban produksi' },
        ]);
        expect(context.resolvedEntities.get('ProductionOrder:order-1')).toEqual(
            {
                type: 'ProductionOrder',
                id: 'order-1',
                label: 'SPK-001',
            },
        );
    });

    it('retains legacy summary when no context filter is requested', async () => {
        findUnique.mockResolvedValue({
            id: 'conv-1',
            summary: 'Ringkasan umum',
            messages: [],
        });
        const context = await loadConversationContext('conv-1');
        expect(context.summary).toBe('Ringkasan umum');
        expect(findUnique.mock.calls[0][0].select.messages.where).toBeUndefined();
    });
});
