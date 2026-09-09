import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { barterTestClient, verifyDisposable } from './barter-postgres-fixture';
describe('barter PostgreSQL safety gate', () => {
    it.each([
        undefined,
        'postgresql://user:pass@remote.example.invalid:5432/polyflow_barter_test',
        'postgresql://user:pass@127.0.0.1:5432/polyflow',
        'postgresql://user:pass@127.0.0.1/polyflow_barter_test',
        'postgresql://user:pass@127.0.0.1:5432/polyflow_barter_test?host=remote.example.invalid',
        'https://127.0.0.1:5432/polyflow_barter_test',
    ])('rejects missing or non-disposable URL before creating a client: %s', url => {
        expect(() => barterTestClient(url, 'polyflow_barter_test')).toThrow();
    });
    it('requires matching DB identity and explicit marker before destructive fixture setup', async () => {
        const db = { $queryRaw: vi.fn().mockResolvedValueOnce([{ name: 'wrong', recovery: false }]) };
        await expect(verifyDisposable(db as unknown as PrismaClient, 'polyflow_barter_test')).rejects.toThrow('identity');
        db.$queryRaw.mockResolvedValueOnce([{ name: 'polyflow_barter_test', recovery: false }]).mockResolvedValueOnce([]);
        await expect(verifyDisposable(db as unknown as PrismaClient, 'polyflow_barter_test')).rejects.toThrow('marker');
    });
});
