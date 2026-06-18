import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        account: {
            findUnique: vi.fn(),
            findFirst: vi.fn(),
        },
    }
}));

import { prisma } from '@/lib/core/prisma';
import { resolveAccount, clearAccountCache } from '../account-resolver';

describe('account-resolver', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        clearAccountCache();
    });

    describe('resolveAccount', () => {
        it('resolves account by exact code match (Kiyowo format)', async () => {
            vi.mocked(prisma.account.findUnique).mockResolvedValue({
                id: 'acc-ar-1',
                code: '11210',
                name: 'Accounts Receivable',
            } as never);

            const result = await resolveAccount('accounts-receivable');

            expect(result).toEqual({ id: 'acc-ar-1', code: '11210', name: 'Accounts Receivable' });
            expect(prisma.account.findUnique).toHaveBeenCalledWith({ where: { code: '11210' } });
        });

        it('falls back to name pattern when code not found', async () => {
            vi.mocked(prisma.account.findUnique).mockResolvedValue(null); // code match fails
            vi.mocked(prisma.account.findFirst).mockResolvedValue({
                id: 'acc-melindo-ar',
                code: '1-115b',
                name: 'Piutang Dagang Rafia',
            } as never);

            const result = await resolveAccount('accounts-receivable');

            expect(result).toEqual({ id: 'acc-melindo-ar', code: '1-115b', name: 'Piutang Dagang Rafia' });
            expect(prisma.account.findFirst).toHaveBeenCalledWith({
                where: { name: { contains: 'Piutang Dagang', mode: 'insensitive' } }
            });
        });

        it('throws with descriptive error when no account found', async () => {
            vi.mocked(prisma.account.findUnique).mockResolvedValue(null);
            vi.mocked(prisma.account.findFirst).mockResolvedValue(null);

            await expect(resolveAccount('nonexistent-role' as never)).rejects.toThrow(
                'Unknown account role: nonexistent-role'
            );
        });

        it('throws when all patterns exhausted for valid role', async () => {
            vi.mocked(prisma.account.findUnique).mockResolvedValue(null);
            vi.mocked(prisma.account.findFirst).mockResolvedValue(null);

            await expect(resolveAccount('accounts-receivable')).rejects.toThrow(
                'Account not found for role "accounts-receivable"'
            );
        });

        it('caches resolved account for subsequent calls', async () => {
            vi.mocked(prisma.account.findUnique).mockResolvedValue({
                id: 'acc-ar-1',
                code: '11210',
                name: 'Accounts Receivable',
            } as never);

            // First call — hits DB
            await resolveAccount('accounts-receivable');
            // Second call — should use cache
            await resolveAccount('accounts-receivable');

            // findUnique called only once (first call), cached for second
            expect(prisma.account.findUnique).toHaveBeenCalledTimes(1);
        });

        it('clears cache on clearAccountCache()', async () => {
            vi.mocked(prisma.account.findUnique).mockResolvedValue({
                id: 'acc-ar-1',
                code: '11210',
                name: 'Accounts Receivable',
            } as never);

            await resolveAccount('accounts-receivable');
            clearAccountCache();
            await resolveAccount('accounts-receivable');

            // After clear, cache miss → DB hit again
            expect(prisma.account.findUnique).toHaveBeenCalledTimes(2);
        });
    });
});
