import { z } from "zod";
import { AssetStatus } from "@prisma/client";

export const assetSchema = z.object({
    name: z.string().min(3, "Name is required"),
    assetCode: z.string().min(3, "Asset Code is required"),
    category: z.string().min(1, "Category is required"), // Can be enum later if needed
    purchaseDate: z.date(),
    purchaseValue: z.coerce.number().min(0, "Price must be positive"),
    scrapValue: z.coerce.number().min(0, "Scrap value must be positive").default(0),
    usefulLifeMonths: z.coerce.number().int().min(1, "Useful life must be at least 1 month"),
    depreciationMethod: z.string().default("STRAIGHT_LINE"),
    status: z.nativeEnum(AssetStatus).default(AssetStatus.ACTIVE),

    // Accounts linkage
    assetAccountId: z.string().min(1, "Asset Account is required"),
    depreciationAccountId: z.string().min(1, "Depreciation Expense Account is required"),
    accumulatedDepreciationAccountId: z.string().min(1, "Accumulated Depreciation Account is required"),

    locationId: z.string().optional(),
});

export type AssetFormValues = z.infer<typeof assetSchema>;

export const budgetSchema = z.object({
    accountId: z.string().min(1, "Account is required"),
    year: z.coerce.number().int().min(2000).max(2100),
    month: z.coerce.number().int().min(1).max(12),
    amount: z.coerce.number().min(0, "Amount must be positive"),
});

export type BudgetFormValues = z.infer<typeof budgetSchema>;
