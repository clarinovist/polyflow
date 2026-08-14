import { describe, test, expect } from 'vitest';
import { getTotalScrapQuantity } from '../order-overview-tab';
import { ExtendedProductionOrder } from '@/components/production/order-detail/types';

type Execution = ExtendedProductionOrder['executions'][number];
type ExecutionOverrides = {
    id?: string;
    status?: string;
    scrapQuantity?: number;
    scrapDaunQty?: number;
    scrapProngkolQty?: number;
};

function makeExecution(overrides: ExecutionOverrides): Execution {
    return {
        id: 'exec-1',
        status: 'COMPLETED',
        scrapQuantity: 0,
        scrapDaunQty: 0,
        scrapProngkolQty: 0,
        ...overrides,
    } as unknown as Execution;
}

describe('getTotalScrapQuantity', () => {
    test('sums scrapQuantity alone, without re-adding the daun/prongkol breakdown', () => {
        // Regression for WO-260812-003: scrapQuantity is already the aggregate of
        // scrapDaunQty + scrapProngkolQty, so adding all three doubled the total
        // (202.3 KG real scrap was displayed as 404.6 KG).
        const executions = [
            makeExecution({
                id: 'e1',
                scrapQuantity: 47.3,
                scrapDaunQty: 47.3,
                scrapProngkolQty: 0,
            }),
            makeExecution({
                id: 'e2',
                scrapQuantity: 55.1,
                scrapDaunQty: 55.1,
                scrapProngkolQty: 0,
            }),
        ];

        expect(getTotalScrapQuantity(executions)).toBeCloseTo(102.4);
    });

    test('excludes VOIDED executions from the total', () => {
        const executions = [
            makeExecution({ id: 'e1', scrapQuantity: 10 }),
            makeExecution({ id: 'e2', scrapQuantity: 5, status: 'VOIDED' }),
        ];

        expect(getTotalScrapQuantity(executions)).toBe(10);
    });

    test('returns 0 when there are no executions', () => {
        expect(getTotalScrapQuantity([])).toBe(0);
    });
});
