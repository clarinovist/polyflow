import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/core/tenant', () => ({
    withTenant: <T extends (...args: unknown[]) => unknown>(action: T) => action,
}));
vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/telegram/permissions', () => ({
    resolveAllowedResources: vi.fn(),
}));

const { mockFinding } = vi.hoisted(() => ({
    mockFinding: { count: vi.fn(), findMany: vi.fn() },
}));
vi.mock('@/lib/core/prisma', () => ({ prisma: { finding: mockFinding } }));

import { countMyOpenFindings } from '../finding-count-actions';
import { auth } from '@/auth';
import { resolveAllowedResources } from '@/lib/telegram/permissions';

describe('countMyOpenFindings', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    it('returns 0 without querying when nobody is logged in', async () => {
        vi.mocked(auth).mockResolvedValue(null as never);

        expect(await countMyOpenFindings()).toBe(0);
        expect(mockFinding.count).not.toHaveBeenCalled();
        expect(mockFinding.findMany).not.toHaveBeenCalled();
    });

    it('counts every open finding for an ADMIN', async () => {
        vi.mocked(auth).mockResolvedValue({ user: { id: 'u1' } } as never);
        vi.mocked(resolveAllowedResources).mockResolvedValue('ALL');
        mockFinding.count.mockResolvedValue(12);

        expect(await countMyOpenFindings()).toBe(12);
    });

    it('counts only findings a warehouse-like role may open', async () => {
        vi.mocked(auth).mockResolvedValue({ user: { id: 'u2' } } as never);
        vi.mocked(resolveAllowedResources).mockResolvedValue(['/warehouse']);
        mockFinding.findMany.mockResolvedValue([
            { requiredResources: ['/sales/invoices', '/finance/invoices'] },
            { requiredResources: ['/warehouse/inventory'] },
        ]);

        expect(await countMyOpenFindings()).toBe(1);
    });

    it('returns 0 and logs instead of throwing when the query fails', async () => {
        vi.mocked(auth).mockResolvedValue({ user: { id: 'u1' } } as never);
        vi.mocked(resolveAllowedResources).mockResolvedValue('ALL');
        mockFinding.count.mockRejectedValue(new Error('db down'));

        expect(await countMyOpenFindings()).toBe(0);
        expect(console.error).toHaveBeenCalled();
    });
});
