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
    constructor(message: string = 'Authentication required') {
        super(message, 'AUTHENTICATION_ERROR', 401);
    }
}

/** Authenticated but not authorized for this action */
export class AuthorizationError extends ApplicationError {
    constructor(message: string = 'Insufficient permissions') {
        super(message, 'AUTHORIZATION_ERROR', 403);
    }
}

/** Resource not found */
export class NotFoundError extends ApplicationError {
    constructor(resource: string, id?: string) {
        const msg = id ? `${resource} '${id}' not found` : `${resource} not found`;
        super(msg, 'NOT_FOUND', 404, { resource, id });
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
    constructor(message: string, details?: Record<string, unknown>) {
        super(message, 'BUSINESS_RULE_VIOLATION', 422, details);
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
): Promise<{ success: true; data: T } | { success: false; error: string; code: string }> {
    try {
        const data = await fn();
        return { success: true, data };
    } catch (error) {
        if (error instanceof ApplicationError) {
            return { success: false, error: error.message, code: error.code };
        }
        // Unknown error — log and return generic message
        console.error('[safeAction] Unexpected error:', error);
        return { success: false, error: 'An unexpected error occurred', code: 'INTERNAL_ERROR' };
    }
}
