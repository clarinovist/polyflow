'use strict';

/**
 * Prisma Error → ApplicationError mapper
 *
 * Maps known PrismaClientKnownRequestError codes to user-friendly
 * ApplicationError subclasses with Bahasa Indonesia messages.
 *
 * Unknown Prisma codes return null — safeAction keeps INTERNAL_ERROR.
 */

import { Prisma } from '@prisma/client';
import {
    ApplicationError,
    ConflictError,
    ValidationError,
    ExternalServiceError,
    BusinessRuleError,
} from './errors';
import { ErrorCatalog } from './error-catalog';

/**
 * Human-readable labels for common Prisma meta.target / column names.
 * Not exhaustive — extend as high-traffic fields are identified.
 */
const FIELD_LABELS: Record<string, string> = {
    email: 'email',
    code: 'kode',
    sku: 'SKU',
    voucherNumber: 'nomor voucher',
    entryNumber: 'nomor entri',
    name: 'nama',
    phone: 'telepon',
    number: 'nomor',
};

/**
 * Normalize Prisma meta.target to a string array.
 * Prisma sometimes returns a single string, sometimes an array.
 */
function normalizeTarget(
    target: unknown
): string[] {
    if (Array.isArray(target)) {
        return target.filter((t): t is string => typeof t === 'string');
    }
    if (typeof target === 'string') {
        return [target];
    }
    return [];
}

/**
 * Map a known Prisma error code to an ApplicationError.
 * Returns null for unknown codes — caller should fall through to generic handling.
 */
export function mapPrismaError(
    error: unknown
): ApplicationError | null {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
        return null;
    }

    switch (error.code) {
        case 'P2002': {
            // Unique constraint violation
            const target = normalizeTarget(error.meta?.target);
            const labels = target
                .map((t) => FIELD_LABELS[t] ?? t)
                .join(', ');
            return new ConflictError(
                labels
                    ? `Data dengan ${labels} yang sama sudah ada. Gunakan nilai lain.`
                    : ErrorCatalog.DUPLICATE_ENTRY,
                { prismaCode: 'P2002', target }
            );
        }

        case 'P2025': {
            // Record required not found (update/delete race)
            return new ApplicationError(ErrorCatalog.NOT_FOUND, 'NOT_FOUND', 404);
        }

        case 'P2000': {
            // Value too long for column
            const column = error.meta?.column_name;
            return new ValidationError(
                typeof column === 'string' && column.length > 0
                    ? `Teks terlalu panjang pada field "${column}". Perpendek input lalu coba lagi.`
                    : ErrorCatalog.VALUE_TOO_LONG,
                { prismaCode: 'P2000', column: typeof column === 'string' ? column : undefined }
            );
        }

        case 'P2011': {
            // Null constraint violation
            const constraint = error.meta?.constraint;
            return new ValidationError(
                ErrorCatalog.NULL_CONSTRAINT,
                {
                    prismaCode: 'P2011',
                    constraint: constraint as string | undefined,
                }
            );
        }

        case 'P2024': {
            // Connection pool timeout
            return new ExternalServiceError(
                ErrorCatalog.DB_TIMEOUT,
                'database',
                { prismaCode: 'P2024' }
            );
        }

        case 'P2003': {
            // Foreign key constraint
            const field = error.meta?.field_name;
            return new BusinessRuleError(
                ErrorCatalog.FOREIGN_KEY,
                {
                    prismaCode: 'P2003',
                    field: field as string | undefined,
                }
            );
        }

        default:
            // Unknown Prisma code — let caller handle as generic
            return null;
    }
}
