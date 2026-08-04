import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetMainPrisma, mockLoggerWarn } = vi.hoisted(() => ({
    mockGetMainPrisma: vi.fn(),
    mockLoggerWarn: vi.fn(),
}));

vi.mock('@/lib/core/prisma', () => ({
    getMainPrisma: mockGetMainPrisma,
}));

vi.mock('@/lib/config/logger', () => ({
    logger: {
        warn: mockLoggerWarn,
        info: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
    },
}));

import {
    loadActiveTenantRevenueRules,
    parseRevenueMatchType,
} from '../tenant-revenue-rule-service';

describe('tenant-revenue-rule-service', () => {
    beforeEach(() => vi.clearAllMocks());

    describe('loadActiveTenantRevenueRules', () => {
        it('returns empty rules when no tenant id is provided', async () => {
            expect(await loadActiveTenantRevenueRules()).toEqual([]);
            expect(await loadActiveTenantRevenueRules(undefined)).toEqual([]);
            expect(await loadActiveTenantRevenueRules('')).toEqual([]);
            expect(mockGetMainPrisma).not.toHaveBeenCalled();
        });

        it('queries main DB filtered by tenantId + isActive, ordered by priority asc', async () => {
            const findMany = vi.fn().mockResolvedValue([]);
            mockGetMainPrisma.mockReturnValue({ tenantRevenueRule: { findMany } });

            await loadActiveTenantRevenueRules('tenant-1');

            expect(findMany).toHaveBeenCalledWith({
                where: { tenantId: 'tenant-1', isActive: true },
                orderBy: { priority: 'asc' },
            });
        });

        it('returns only active rules (inactive rows never reach loader result)', async () => {
            const findMany = vi.fn().mockResolvedValue([
                {
                    id: 'r1',
                    matchType: 'VARIANT_NAME_CONTAINS',
                    matchValue: 'Super',
                    accountCode: '4-102',
                    priority: 10,
                    isActive: true,
                },
                {
                    id: 'r2',
                    matchType: 'PRODUCT_NAME',
                    matchValue: 'Rafia',
                    accountCode: '4-101',
                    priority: 20,
                    isActive: true,
                },
            ]);
            mockGetMainPrisma.mockReturnValue({ tenantRevenueRule: { findMany } });

            const rules = await loadActiveTenantRevenueRules('tenant-1');

            // isActive filter is applied at query level; only active rows flow through.
            expect(findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({ isActive: true }),
                }),
            );
            expect(rules).toHaveLength(2);
        });

        it('ignores rows with unknown match types deterministically', async () => {
            const findMany = vi.fn().mockResolvedValue([
                {
                    matchType: 'CONTAINS',
                    matchValue: 'X',
                    accountCode: '4-101',
                    priority: 1,
                },
                {
                    matchType: 'SKU_PREFIX',
                    matchValue: 'RAF-',
                    accountCode: '4-105',
                    priority: 2,
                },
                {
                    matchType: 'PRODUCT_NAME',
                    matchValue: 'Rafia',
                    accountCode: '4-101',
                    priority: 3,
                },
            ]);
            mockGetMainPrisma.mockReturnValue({ tenantRevenueRule: { findMany } });

            const rules = await loadActiveTenantRevenueRules('tenant-1');

            expect(rules).toEqual([
                {
                    matchType: 'SKU_PREFIX',
                    matchValue: 'RAF-',
                    accountCode: '4-105',
                    priority: 2,
                },
                {
                    matchType: 'PRODUCT_NAME',
                    matchValue: 'Rafia',
                    accountCode: '4-101',
                    priority: 3,
                },
            ]);
        });

        it('maps nullable accountCode snapshots safely (skips null/blank)', async () => {
            const findMany = vi.fn().mockResolvedValue([
                {
                    matchType: 'PRODUCT_NAME',
                    matchValue: 'Rafia',
                    accountCode: null,
                    priority: 1,
                },
                {
                    matchType: 'PRODUCT_NAME',
                    matchValue: 'Sedotan',
                    accountCode: '   ',
                    priority: 2,
                },
                {
                    matchType: 'PRODUCT_NAME',
                    matchValue: 'Lakop',
                    accountCode: '4-111',
                    priority: 3,
                },
            ]);
            mockGetMainPrisma.mockReturnValue({ tenantRevenueRule: { findMany } });

            const rules = await loadActiveTenantRevenueRules('tenant-1');

            expect(rules).toEqual([
                {
                    matchType: 'PRODUCT_NAME',
                    matchValue: 'Lakop',
                    accountCode: '4-111',
                    priority: 3,
                },
            ]);
        });

        it('falls back to empty rules and logs a warning when main DB query fails', async () => {
            mockGetMainPrisma.mockReturnValue({
                tenantRevenueRule: {
                    findMany: vi.fn().mockRejectedValue(new Error('db down')),
                },
            });

            const rules = await loadActiveTenantRevenueRules('tenant-1');

            expect(rules).toEqual([]);
            expect(mockLoggerWarn).toHaveBeenCalled();
        });
    });

    describe('parseRevenueMatchType', () => {
        it('accepts the three supported match types', () => {
            expect(parseRevenueMatchType('VARIANT_NAME_CONTAINS')).toBe(
                'VARIANT_NAME_CONTAINS',
            );
            expect(parseRevenueMatchType('PRODUCT_NAME')).toBe(
                'PRODUCT_NAME',
            );
            expect(parseRevenueMatchType('SKU_PREFIX')).toBe('SKU_PREFIX');
        });

        it('returns null for unknown match types', () => {
            expect(parseRevenueMatchType('CONTAINS')).toBeNull();
            expect(parseRevenueMatchType('')).toBeNull();
            expect(parseRevenueMatchType('vendor_name')).toBeNull();
        });
    });
});
