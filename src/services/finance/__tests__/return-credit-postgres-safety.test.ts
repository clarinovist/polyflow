import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { returnTestClient, verifyReturnTestDatabase } from './return-credit-postgres-fixture';

describe('return-credit PostgreSQL safety guard',()=>{
    it.each([
        undefined,
        'postgresql://postgres@remote.example.invalid:55439/polyflow_return_credit_scope_test',
        'postgresql://postgres@127.0.0.1:5432/polyflow_return_credit_scope_test',
        'postgresql://postgres@127.0.0.1:55439/polyflow',
        'postgresql://postgres@127.0.0.1:55439/polyflow_return_credit_scope_test?host=remote.example.invalid',
        'https://127.0.0.1:55439/polyflow_return_credit_scope_test',
    ])('rejects unsafe connection before client creation',url=>{expect(()=>returnTestClient(url)).toThrow();});
    it('requires both database identity and dedicated marker before destructive fixtures',async()=>{
        const db={$queryRaw:vi.fn().mockResolvedValueOnce([{name:'wrong',recovery:false}])};
        await expect(verifyReturnTestDatabase(db as unknown as PrismaClient)).rejects.toThrow('identity');
        db.$queryRaw.mockResolvedValueOnce([{name:'polyflow_return_credit_scope_test',recovery:false}]).mockResolvedValueOnce([]);
        await expect(verifyReturnTestDatabase(db as unknown as PrismaClient)).rejects.toThrow('marker');
    });
});
