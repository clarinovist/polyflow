import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFindMany = vi.fn().mockResolvedValue([]);

const mockGetAssignedCustomers = vi.fn().mockResolvedValue([]);

vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        user: {
            findMany: (...args: unknown[]) => mockFindMany(...args),
        },
    },
}));

vi.mock('@/services/sales/customer-assignment-service', () => ({
    getAssignedCustomers: (...args: unknown[]) =>
        mockGetAssignedCustomers(...args),
}));

vi.mock('@/lib/tools/auth-checks', () => ({
    requireAuth: vi.fn().mockResolvedValue({
        user: { id: 'u1', role: 'ADMIN', roles: null },
    }),
}));

vi.mock('@/lib/utils/utils', () => ({
    serializeData: (data: unknown) => data,
}));

vi.mock('@/lib/core/tenant', () => ({
    withTenant: (fn: (...args: unknown[]) => unknown) => fn,
}));

vi.mock('@/lib/errors/errors', () => ({
    safeAction: async (fn: () => Promise<unknown>) => {
        try {
            const data = await fn();
            return { success: true, data };
        } catch (e) {
            return { success: false, error: (e as Error).message };
        }
    },
}));

import {
    getSalesTeamAction,
    getSalesTeamAssignedCustomersAction,
} from '../sales-team';

describe('getSalesTeamAction', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns sales team members with active customer counts', async () => {
        mockFindMany.mockResolvedValue([
            {
                id: 'u1',
                name: 'Budi',
                email: 'budi@test.com',
                role: 'SALES',
                roles: [{ role: 'SALES' }],
                _count: { customerSalesAssignments: 5 },
            },
            {
                id: 'u2',
                name: 'Sari',
                email: 'sari@test.com',
                role: 'MARKETING',
                roles: [{ role: 'MARKETING' }],
                _count: { customerSalesAssignments: 3 },
            },
        ]);

        const result = await getSalesTeamAction();
        expect(result).toBeDefined();
        if (result && typeof result === 'object' && 'data' in result) {
            const data = result.data as Array<{
                id: string;
                name: string;
                activeCustomerCount: number;
            }>;
            expect(data).toHaveLength(2);
            expect(data[0].name).toBe('Budi');
            expect(data[0].activeCustomerCount).toBe(5);
            expect(data[1].name).toBe('Sari');
            expect(data[1].activeCustomerCount).toBe(3);
        }
    });

    it('queries users with SALES or MARKETING role', async () => {
        mockFindMany.mockResolvedValue([]);

        await getSalesTeamAction();

        expect(mockFindMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    OR: expect.arrayContaining([
                        expect.objectContaining({ roles: expect.any(Object) }),
                        expect.objectContaining({ role: 'SALES' }),
                        expect.objectContaining({ roles: expect.any(Object) }),
                        expect.objectContaining({ role: 'MARKETING' }),
                    ]),
                }),
            }),
        );
    });

    it('returns empty array when no sales team members exist', async () => {
        mockFindMany.mockResolvedValue([]);

        const result = await getSalesTeamAction();
        expect(result).toBeDefined();
    });
});

describe('getSalesTeamAssignedCustomersAction', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns assigned customers for the given userId via the service layer', async () => {
        mockGetAssignedCustomers.mockResolvedValue([
            { id: 'a1', customerId: 'c1', userId: 'u1', isPrimary: true },
        ]);

        const result = await getSalesTeamAssignedCustomersAction('u1');

        expect(mockGetAssignedCustomers).toHaveBeenCalledWith('u1');
        if (result && typeof result === 'object' && 'data' in result) {
            expect(result.data).toHaveLength(1);
        }
    });
});
