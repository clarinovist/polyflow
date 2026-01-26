import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { serializeData } from "./utils";

export type ActionResponse<T = unknown> = {
    success: boolean;
    data?: T;
    error?: string;
    fieldErrors?: Record<string, string[]>;
    code?: string;
};

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

    // Prisma Database Errors
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
        switch (error.code) {
            case "P2002": // Unique constraint
                const target = (error.meta?.target as string[])?.join(", ") || "field";
                return {
                    success: false,
                    error: `Record with this ${target} already exists.`,
                    code: "UNIQUE_CONSTRAINT",
                };
            case "P2003": // Foreign key constraint
                return {
                    success: false,
                    error: "Related record not found or cannot be deleted due to dependencies.",
                    code: "FOREIGN_KEY_CONSTRAINT",
                };
            case "P2025": // Record not found
                return {
                    success: false,
                    error: "The requested record was not found.",
                    code: "NOT_FOUND",
                };
            default:
                return {
                    success: false,
                    error: `Database error: ${error.message}`,
                    code: `PRISMA_${error.code}`,
                };
        }
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
        return { success: true, data: serializeData(data) };
    } catch (error) {
        return handleError(error) as ActionResponse<T>;
    }
}
