import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import {
    claimNumberPrefix,
    formatClaimNumber,
    isUniqueViolationOn,
    nextClaimNumber,
} from '../expense-claim-number';

const p2002 = (target: unknown) =>
    new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
        meta: { target },
    });

describe('claim number', () => {
    it('uses the WIB month, not the UTC month', () => {
        // 2026-11-30 20:00 UTC is already 1 Dec in WIB
        expect(claimNumberPrefix(new Date('2026-11-30T20:00:00Z'))).toBe('RMB-202612-');
        expect(claimNumberPrefix(new Date('2026-11-30T05:00:00Z'))).toBe('RMB-202611-');
    });

    it('pads the sequence to three digits and keeps longer ones', () => {
        const now = new Date('2026-11-24T05:00:00Z');
        expect(formatClaimNumber(now, 7)).toBe('RMB-202611-007');
        expect(formatClaimNumber(now, 1234)).toBe('RMB-202611-1234');
    });

    it('allocates count + 1 within the month prefix', async () => {
        const count = vi.fn().mockResolvedValue(4);
        const number = await nextClaimNumber(
            { expenseClaim: { count } } as never,
            new Date('2026-11-24T05:00:00Z'),
        );
        expect(number).toBe('RMB-202611-005');
        expect(count).toHaveBeenCalledWith({
            where: { claimNumber: { startsWith: 'RMB-202611-' } },
        });
    });
});

describe('isUniqueViolationOn', () => {
    it('matches an array target', () => {
        expect(isUniqueViolationOn(p2002(['claimNumber']), 'claimNumber')).toBe(true);
        expect(isUniqueViolationOn(p2002(['userId', 'clientClaimId']), 'clientClaimId')).toBe(true);
    });

    it('matches a constraint-name string target', () => {
        expect(isUniqueViolationOn(p2002('ExpenseClaim_claimNumber_key'), 'claimNumber')).toBe(true);
    });

    it('does not match another field, another code, a missing target or a plain error', () => {
        expect(isUniqueViolationOn(p2002(['claimNumber']), 'clientClaimId')).toBe(false);
        expect(isUniqueViolationOn(p2002(undefined), 'claimNumber')).toBe(false);
        expect(
            isUniqueViolationOn(
                new Prisma.PrismaClientKnownRequestError('x', { code: 'P2025', clientVersion: 't' }),
                'claimNumber',
            ),
        ).toBe(false);
        expect(isUniqueViolationOn(new Error('claimNumber'), 'claimNumber')).toBe(false);
    });
});
