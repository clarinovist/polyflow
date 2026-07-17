import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { serializeData } from "../utils/utils";

export type ActionResponse<T = unknown> = {
    success: boolean;
    data?: T;
    error?: string;
    fieldErrors?: Record<string, string[]>;
    code?: string;
};

import { ApplicationError } from './errors';
import { AppError } from './error-map';
import { mapPrismaError } from './prisma-error-map';

/**
 * Normalizes various error types into a consistent ActionResponse format.
 */
export function handleError(error: unknown): ActionResponse {
    console.error("Action Error:", error);

    // Zod Validation Errors
    if (error instanceof ZodError) {
        return {
            success: false,
            error: "Validation failed",
            fieldErrors: error.flatten().fieldErrors as Record<string, string[]>,
            code: "VALIDATION_ERROR",
        };
    }

    // Prisma Database Errors → centralized mapper (DRY with safeAction)
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
        const mapped = mapPrismaError(error);
        if (mapped) {
            console.error('[handleError] Prisma mapped:', {
                code: mapped.code,
                details: mapped.details,
            });
            return {
                success: false,
                error: mapped.message,
                code: mapped.code,
            };
        }
        // Unknown Prisma code — log full error, return generic (never leak raw message)
        console.error('[handleError] Unmapped Prisma error:', {
            code: error.code,
            meta: error.meta,
            message: error.message,
        });
        return {
            success: false,
            error: "Terjadi kesalahan database. Silakan coba lagi.",
            code: "INTERNAL_ERROR",
        };
    }

    // Custom Application Errors from errors.ts
    if (error instanceof ApplicationError) {
        return {
            success: false,
            error: error.message,
            code: error.code,
        };
    }

    // Custom AppError from error-map.ts
    if (error instanceof AppError) {
        return {
            success: false,
            error: error.message,
            code: error.code,
        };
    }

    // Generic Error with message
    if (error instanceof Error) {
        return {
            success: false,
            error: error.message,
            code: "INTERNAL_ERROR",
        };
    }

    // Unknown Errors
    return {
        success: false,
        error: "An unexpected error occurred. Please try again.",
        code: "UNKNOWN_ERROR",
    };
}

/**
 * Wrapper for Server Actions to automatically handle errors and serialize data.
 */
export async function catchError<T>(
    action: () => Promise<T>
): Promise<ActionResponse<T>> {
    try {
        const data = await action();
        return { success: true, data: serializeData(data) as T };
    } catch (error: unknown) {
        if (error && typeof error === 'object' && 'message' in error) {
            const err = error as { message: string, digest?: string };
            if (err.message === 'NEXT_REDIRECT' || err.message === 'NEXT_NOT_FOUND' || err.digest?.startsWith('NEXT_REDIRECT')) {
                throw error;
            }
        }
        return handleError(error) as ActionResponse<T>;
    }
}
