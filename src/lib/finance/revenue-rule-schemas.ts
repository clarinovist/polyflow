/**
 * Shared Zod schemas + match-type constants for revenue rules.
 *
 * Must live outside 'use server' files — Next.js App Router forbids
 * exporting non-function values from server action files.
 */
import { z } from 'zod';

export const REVENUE_MATCH_TYPES = [
    'VARIANT_NAME_CONTAINS',
    'PRODUCT_NAME',
    'SKU_PREFIX',
] as const;

export const revenueRuleCreateSchema = z.object({
    matchType: z.enum(REVENUE_MATCH_TYPES),
    matchValue: z.string().trim().min(1, 'Match value tidak boleh kosong'),
    accountCode: z.string().trim().min(1, 'Account code wajib diisi'),
    priority: z.number().int().min(0, 'Priority minimal 0').max(10000, 'Priority maksimal 10000').default(100),
});

export const revenueRuleUpdateSchema = z.object({
    matchType: z.enum(REVENUE_MATCH_TYPES).optional(),
    matchValue: z.string().trim().min(1).optional(),
    accountCode: z.string().trim().min(1).optional(),
    priority: z.number().int().min(0).max(10000).optional(),
    isActive: z.boolean().optional(),
});
