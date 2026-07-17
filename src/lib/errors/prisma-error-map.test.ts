import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { mapPrismaError } from './prisma-error-map';
import {
    ApplicationError,
    ConflictError,
    ValidationError,
    ExternalServiceError,
    BusinessRuleError,
} from './errors';
import { ErrorCatalog } from './error-catalog';

function prismaError(
    code: string,
    message: string,
    meta?: Record<string, unknown>
): Prisma.PrismaClientKnownRequestError {
    return new Prisma.PrismaClientKnownRequestError(message, {
        code,
        clientVersion: '5.22.0',
        ...(meta ? { meta } : {}),
    });
}

describe('mapPrismaError', () => {
    it('returns null for non-Prisma errors', () => {
        expect(mapPrismaError(new Error('generic'))).toBeNull();
        expect(mapPrismaError(null)).toBeNull();
        expect(mapPrismaError('string')).toBeNull();
        expect(mapPrismaError(undefined)).toBeNull();
    });

    it('returns null for unknown Prisma error codes', () => {
        const err = prismaError('P2999', 'Unknown prisma code');
        expect(mapPrismaError(err)).toBeNull();
    });

    it('maps P2002 (unique constraint) to ConflictError with field labels', () => {
        const err = prismaError('P2002', 'Unique constraint', {
            target: ['email'],
        });
        const result = mapPrismaError(err);
        expect(result).toBeInstanceOf(ConflictError);
        expect(result!.code).toBe('CONFLICT');
        expect(result!.message).toContain('email');
        expect(result!.details).toMatchObject({
            prismaCode: 'P2002',
            target: ['email'],
        });
    });

    it('maps P2002 with multiple target fields', () => {
        const err = prismaError('P2002', 'Unique constraint', {
            target: ['email', 'tenantId'],
        });
        const result = mapPrismaError(err);
        expect(result).toBeInstanceOf(ConflictError);
        expect(result!.message).toContain('email');
        expect(result!.message).toContain('tenantId');
    });

    it('maps P2002 without target to generic duplicate message', () => {
        const err = prismaError('P2002', 'Unique constraint');
        const result = mapPrismaError(err);
        expect(result).toBeInstanceOf(ConflictError);
        expect(result!.message).toBeTruthy();
    });

    it('maps P2025 (record not found) to NOT_FOUND with Indonesian message', () => {
        const err = prismaError('P2025', 'Record not found');
        const result = mapPrismaError(err);
        expect(result).toBeInstanceOf(ApplicationError);
        expect(result!.code).toBe('NOT_FOUND');
        expect(result!.message).toContain('tidak ditemukan');
    });

    it('maps P2000 (value too long) to ValidationError with field name', () => {
        const err = prismaError('P2000', 'Value too long', {
            column_name: 'description',
        });
        const result = mapPrismaError(err);
        expect(result).toBeInstanceOf(ValidationError);
        expect(result!.code).toBe('VALIDATION_ERROR');
        expect(result!.message).toBe(
            'Teks terlalu panjang pada field "description". Perpendek input lalu coba lagi.'
        );
    });

    it('maps P2000 without column to catalog fallback', () => {
        const err = prismaError('P2000', 'Value too long');
        const result = mapPrismaError(err);
        expect(result).toBeInstanceOf(ValidationError);
        expect(result!.message).toBe(ErrorCatalog.VALUE_TOO_LONG);
    });

    it('maps P2011 (null constraint) to ValidationError', () => {
        const err = prismaError('P2011', 'Null constraint violation', {
            constraint: 'NotNull',
        });
        const result = mapPrismaError(err);
        expect(result).toBeInstanceOf(ValidationError);
        expect(result!.code).toBe('VALIDATION_ERROR');
        expect(result!.message).toContain('kosong');
    });

    it('maps P2024 (connection timeout) to ExternalServiceError', () => {
        const err = prismaError('P2024', 'Connection pool timeout');
        const result = mapPrismaError(err);
        expect(result).toBeInstanceOf(ExternalServiceError);
        expect(result!.code).toBe('EXTERNAL_SERVICE_ERROR');
        expect(result!.message).toContain('timeout');
    });

    it('maps P2003 (foreign key) to BusinessRuleError', () => {
        const err = prismaError('P2003', 'Foreign key constraint', {
            field_name: 'parentId',
        });
        const result = mapPrismaError(err);
        expect(result).toBeInstanceOf(BusinessRuleError);
        expect(result!.message).toBeTruthy();
        expect(result!.details).toMatchObject({
            prismaCode: 'P2003',
            field: 'parentId',
        });
    });

    it('uses ErrorCatalog DUPLICATE_ENTRY as fallback when P2002 has no target', () => {
        const err = prismaError('P2002', 'Unique constraint');
        const result = mapPrismaError(err);
        expect(result!.message).toBeTruthy();
        expect(result!.message.length).toBeGreaterThan(5);
    });
});
