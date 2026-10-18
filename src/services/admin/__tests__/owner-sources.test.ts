import { describe, expect, it, vi } from 'vitest';
import type { Prisma } from '@prisma/client';
import { collectOwnerUsage } from '../owner-usage-source';
import { collectOwnerCommerce } from '../owner-commerce-source';
const start = new Date('2026-10-01');
const end = new Date('2026-10-02');
describe('owner data projections', () => {
    it('binds tenant to usage SQL, excludes raw metadata, and reports bounded truncation', async () => {
        const raw = { userId: 'u', module: 'sales', views: BigInt(3), activeDays: BigInt(1), completed: BigInt(1), failed: BigInt(0), retries: BigInt(0) };
        const query = vi.fn().mockResolvedValue(Array.from({ length: 501 }, () => raw));
        const result = await collectOwnerUsage({ $queryRaw: query } as unknown as Prisma.TransactionClient, 'tenant-a', start, end);
        expect(result.truncated).toBe(true); expect(result.rows).toHaveLength(500);
        const sql = query.mock.calls[0][0]; expect(sql.values).toContain('tenant-a');
        expect(sql.strings.join('?')).not.toMatch(/metadata|sessionId|email|question/);
    });
    it('keeps document, price and movement bases separate and returns validated scalars', async () => {
        const query = vi.fn().mockResolvedValueOnce([{ customerId: 'c', orderType: 'MAKE_TO_STOCK', status: 'CONFIRMED', orderCount: BigInt(2), firstOrderAt: start, lastOrderAt: start, orderValue: '1200.50', missingValueCount: BigInt(0) }])
            .mockResolvedValueOnce([{ customerId: 'c', variantId: 'v', unit: 'KG', orderType: 'MAKE_TO_STOCK', ppnMode: 'INCLUDE', taxPercent: '11', discountPercent: '5', priceStatus: 'FINAL', reviewStatus: 'NOT_REQUIRED', basis: 'ENTERED_SNAPSHOT', lineCount: BigInt(2), quantity: '10.5', minPrice: '100', maxPrice: '110' }])
            .mockResolvedValueOnce([{ province: null, city: null, orderCount: BigInt(2) }])
            .mockResolvedValueOnce([{ customerId: 'c', variantId: 'v', unit: 'KG', kind: 'RETURN_RECEIVED', state: 'DAMAGED', quantity: '1', lineCount: BigInt(1) }]);
        const result = await collectOwnerCommerce({ $queryRaw: query } as unknown as Prisma.TransactionClient, start, end);
        expect(result.customers[0].orderValue).toBe('1200.50'); expect(result.prices[0].basis).toBe('ENTERED_SNAPSHOT'); expect(result.movements[0].state).toBe('DAMAGED');
        const sql = query.mock.calls.map(call => call[0].strings.join('?')).join('\n');
        expect(sql).toContain('stockCommittedAt'); expect(sql).toContain('receivedAt');
        expect(sql).not.toMatch(/phone|email|billingAddress|latitude|longitude|password|notes/);
    });
});
