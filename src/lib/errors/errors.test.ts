import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import {
    safeAction,
    InsufficientStockError,
    ProductionRuleViolationError,
    ConflictError,
} from './errors';

describe('ApplicationError classes', () => {
    it('sets code and statusCode correctly for InsufficientStockError', () => {
        const err = new InsufficientStockError('Stock is missing');
        expect(err.message).toBe('Stock is missing');
        expect(err.code).toBe('INSUFFICIENT_STOCK');
        expect(err.statusCode).toBe(422);
    });

    it('sets code and statusCode correctly for ProductionRuleViolationError', () => {
        const err = new ProductionRuleViolationError('Invalid step');
        expect(err.message).toBe('Invalid step');
        expect(err.code).toBe('PRODUCTION_RULE_VIOLATION');
        expect(err.statusCode).toBe(422);
    });
});

describe('safeAction helper', () => {
    it('returns success: true when fn resolves successfully', async () => {
        const res = await safeAction(async () => 'hello');
        expect(res).toEqual({ success: true, data: 'hello' });
    });

    it('catches ApplicationError and returns success: false with correct error code', async () => {
        const res = await safeAction(async () => {
            throw new InsufficientStockError('Insufficient stock');
        });
        expect(res).toEqual({
            success: false,
            error: 'Insufficient stock',
            code: 'INSUFFICIENT_STOCK'
        });
    });

    it('catches generic Error and returns generic INTERNAL_ERROR code', async () => {
        const res = await safeAction(async () => {
            throw new Error('Something went wrong');
        });
        expect(res).toEqual({
            success: false,
            error: 'Terjadi kesalahan yang tidak terduga',
            code: 'INTERNAL_ERROR'
        });
    });

    it('re-throws NEXT_REDIRECT errors', async () => {
        const redirectError = Object.assign(new Error('NEXT_REDIRECT'), {
            digest: 'NEXT_REDIRECT;replace;/dashboard',
        });
        await expect(
            safeAction(async () => {
                throw redirectError;
            })
        ).rejects.toThrow('NEXT_REDIRECT');
    });

    it('re-throws NEXT_NOT_FOUND errors', async () => {
        const notFoundError = Object.assign(new Error('NEXT_NOT_FOUND'), {
            digest: 'NEXT_NOT_FOUND',
        });
        await expect(
            safeAction(async () => {
                throw notFoundError;
            })
        ).rejects.toThrow('NEXT_NOT_FOUND');
    });
});

describe('safeAction with Prisma errors', () => {
    it('maps P2002 (unique constraint) to CONFLICT via safeAction', async () => {
        const prismaErr = new Prisma.PrismaClientKnownRequestError(
            'Unique constraint',
            {
                code: 'P2002',
                clientVersion: '5.22.0',
                meta: { target: ['email'] },
            }
        );
        const res = await safeAction(async () => {
            throw prismaErr;
        });
        expect(res.success).toBe(false);
        if (!res.success) {
            expect(res.code).toBe('CONFLICT');
            expect(res.error).toContain('email');
        }
    });

    it('maps P2025 (record not found) to NOT_FOUND with Indonesian message via safeAction', async () => {
        const prismaErr = new Prisma.PrismaClientKnownRequestError(
            'Record not found',
            {
                code: 'P2025',
                clientVersion: '5.22.0',
            }
        );
        const res = await safeAction(async () => {
            throw prismaErr;
        });
        expect(res.success).toBe(false);
        if (!res.success) {
            expect(res.code).toBe('NOT_FOUND');
            expect(res.error).toContain('tidak ditemukan');
        }
    });

    it('maps P2024 (connection timeout) via safeAction', async () => {
        const prismaErr = new Prisma.PrismaClientKnownRequestError(
            'Connection pool timeout',
            {
                code: 'P2024',
                clientVersion: '5.22.0',
            }
        );
        const res = await safeAction(async () => {
            throw prismaErr;
        });
        expect(res.success).toBe(false);
        if (!res.success) {
            expect(res.code).toBe('EXTERNAL_SERVICE_ERROR');
            expect(res.error).toContain('timeout');
        }
    });

    it('returns generic for unknown Prisma error codes via safeAction', async () => {
        const prismaErr = new Prisma.PrismaClientKnownRequestError(
            'Unknown error',
            {
                code: 'P2999',
                clientVersion: '5.22.0',
            }
        );
        const res = await safeAction(async () => {
            throw prismaErr;
        });
        expect(res.success).toBe(false);
        if (!res.success) {
            expect(res.code).toBe('INTERNAL_ERROR');
        }
    });

    it('preserves existing BusinessRuleError path (no Prisma)', async () => {
        const res = await safeAction(async () => {
            throw new ConflictError('Custom business conflict');
        });
        expect(res.success).toBe(false);
        if (!res.success) {
            expect(res.code).toBe('CONFLICT');
            expect(res.error).toBe('Custom business conflict');
        }
    });
});
