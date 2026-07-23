'use strict';

/**
 * PolyFlow Application Error Hierarchy
 * 
 * Centralized error classes following the error-handling-patterns skill.
 * Use these instead of generic `throw new Error(...)` in services.
 */

export class ApplicationError extends Error {
    public readonly code: string;
    public readonly statusCode: number;
    public readonly details?: Record<string, unknown>;
    public readonly timestamp: Date;

    constructor(
        message: string,
        code: string,
        statusCode: number = 500,
        details?: Record<string, unknown>
    ) {
        super(message);
        this.name = this.constructor.name;
        this.code = code;
        this.statusCode = statusCode;
        this.details = details;
        this.timestamp = new Date();

        // Maintain proper stack trace in V8
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor);
        }
    }

    toJSON() {
        return {
            error: this.name,
            code: this.code,
            message: this.message,
            statusCode: this.statusCode,
            details: this.details,
            timestamp: this.timestamp.toISOString(),
        };
    }
}

// ─── Client Errors (4xx) ────────────────────────────────────────────

/** Validation failed (bad input, schema mismatch) */
export class ValidationError extends ApplicationError {
    constructor(message: string, details?: Record<string, unknown>) {
        super(message, 'VALIDATION_ERROR', 400, details);
    }
}

/** Authentication required or failed */
export class AuthenticationError extends ApplicationError {
    constructor(message: string = 'Autentikasi diperlukan') {
        super(message, 'AUTHENTICATION_ERROR', 401);
    }
}

/** Authenticated but not authorized for this action */
export class AuthorizationError extends ApplicationError {
    constructor(message: string = 'Tidak memiliki izin yang cukup') {
        super(message, 'AUTHORIZATION_ERROR', 403);
    }
}

/** Map English resource names to Indonesian labels for user-facing messages */
export const RESOURCE_LABELS: Record<string, string> = {
    'Account': 'Akun',
    'Account for role': 'Akun untuk peran',
    'AppSettings': 'Pengaturan Aplikasi',
    'BankReconciliation': 'Rekonsiliasi Bank',
    'Customer': 'Pelanggan',
    'Delivery Order': 'Surat Jalan',
    'Fiscal Period': 'Periode Fiskal',
    'GoodsReceipt': 'Penerimaan Barang',
    'Invoice': 'Invoice',
    'Journal': 'Jurnal',
    'JournalLine': 'Baris Jurnal',
    'Location': 'Lokasi',
    'MaterialIssue': 'Pengeluaran Material',
    'Payment': 'Pembayaran',
    'Product': 'Produk',
    'Product Variant': 'Varian Produk',
    'Production Order': 'Order Produksi',
    'ProductionExecution': 'Eksekusi Produksi',
    'Purchase Invoice': 'Faktur Pembelian',
    'Purchase Order': 'Purchase Order',
    'Purchase Request': 'Permintaan Pembelian',
    'Purchase Return': 'Retur Pembelian',
    'Sales Order': 'Sales Order',
    'Sales Order Item': 'Item Sales Order',
    'Sales Quotation': 'Penawaran Penjualan',
    'Sales Return': 'Retur Penjualan',
    'ScrapRecord': 'Catatan Scrap',
    'Stock Reservation': 'Reservasi Stok',
    'StockOpname': 'Stok Opname',
    'User': 'Pengguna',
    // composite like "Account for role 'x'" handled via prefix match below
};

/** Translate resource label if known, otherwise keep original */
export function translateResource(resource: string): string {
    // exact match
    if (RESOURCE_LABELS[resource]) return RESOURCE_LABELS[resource];
    // prefix match for "Account for role 'x'" etc
    for (const [en, id] of Object.entries(RESOURCE_LABELS)) {
        if (resource.startsWith(en + ' ')) {
            return resource.replace(en, id);
        }
    }
    return resource;
}

/** Resource not found */
export class NotFoundError extends ApplicationError {
    constructor(resource: string, id?: string) {
        const localizedResource = translateResource(resource);
        const msg = id ? `${localizedResource} '${id}' tidak ditemukan` : `${localizedResource} tidak ditemukan`;
        super(msg, 'NOT_FOUND', 404, { resource, id, localizedResource });
    }
}

/** Resource state conflict (e.g. duplicate, already completed) */
export class ConflictError extends ApplicationError {
    constructor(message: string, details?: Record<string, unknown>) {
        super(message, 'CONFLICT', 409, details);
    }
}

/** Business rule violation */
export class BusinessRuleError extends ApplicationError {
    constructor(
        message: string,
        details?: Record<string, unknown>,
        code: string = 'BUSINESS_RULE_VIOLATION'
    ) {
        super(message, code, 422, details);
    }
}

/** Insufficient stock for inventory transactions */
export class InsufficientStockError extends BusinessRuleError {
    constructor(message: string, details?: Record<string, unknown>) {
        super(message, details, 'INSUFFICIENT_STOCK');
    }
}

/** Production-specific business rule violation */
export class ProductionRuleViolationError extends BusinessRuleError {
    constructor(message: string, details?: Record<string, unknown>) {
        super(message, details, 'PRODUCTION_RULE_VIOLATION');
    }
}

// ─── Server Errors (5xx) ────────────────────────────────────────────

/** External service failure (DB, API, etc.) */
export class ExternalServiceError extends ApplicationError {
    public readonly service: string;

    constructor(message: string, service: string, details?: Record<string, unknown>) {
        super(message, 'EXTERNAL_SERVICE_ERROR', 502, { ...details, service });
        this.service = service;
    }
}

// ─── Helper: Safe error handler for Server Actions ──────────────────

/**
 * Wraps a server action with consistent error handling.
 * Returns `{ success, data, error }` instead of throwing.
 * 
 * Usage:
 * ```ts
 * export async function createOpname(data: OpnameInput) {
 *   return safeAction(async () => {
 *     // ... business logic
 *     return result;
 *   });
 * }
 * ```
 */
export async function safeAction<T>(
    fn: () => Promise<T>
): Promise<
    | { success: true; data: T }
    | { success: false; error: string; code: string; details?: Record<string, unknown> }
> {
    try {
        const data = await fn();
        return { success: true, data };
    } catch (error) {
        // Re-throw Next.js internal errors (redirect, notFound) — they use thrown errors as control flow
        if (error && typeof error === 'object' && 'message' in error) {
            const err = error as { message: string; digest?: string };
            if (err.message === 'NEXT_REDIRECT' || err.message === 'NEXT_NOT_FOUND' || err.digest?.startsWith('NEXT_REDIRECT')) {
                throw error;
            }
        }
        if (error instanceof ApplicationError) {
            return {
                success: false,
                error: error.message,
                code: error.code,
                ...(error.details ? { details: error.details } : {}),
            };
        }

        // Prisma known errors → mapped ApplicationError with user-friendly message
        const { mapPrismaError } = await import('./prisma-error-map');
        const prismaMapped = mapPrismaError(error);
        if (prismaMapped) {
            console.error('[safeAction] Prisma mapped:', {
                code: prismaMapped.code,
                details: prismaMapped.details,
            });
            return {
                success: false,
                error: prismaMapped.message,
                code: prismaMapped.code,
                ...(prismaMapped.details ? { details: prismaMapped.details } : {}),
            };
        }

        // Unknown error — log and return generic message
        console.error('[safeAction] Unexpected error:', error);
        return { success: false, error: 'Terjadi kesalahan yang tidak terduga', code: 'INTERNAL_ERROR' };
    }
}
