'use server';

import { withTenant } from "@/lib/core/tenant";
import { prisma as db } from '@/lib/core/prisma';
import { AssetFormValues, assetSchema } from '@/lib/schemas/finance';
import { revalidatePath } from 'next/cache';
import { logger } from '@/lib/config/logger';
import { safeAction, BusinessRuleError, ValidationError } from '@/lib/errors/errors';

export const getAssets = withTenant(
async function getAssets() {
    return safeAction(async () => {
        try {
            const assets = await db.fixedAsset.findMany({
                include: {
                    assetAccount: true,
                    accumDepreciationAccount: true,
                    depreciationExpenseAccount: true
                },
                orderBy: { createdAt: 'desc' }
            });
            return assets.map(a => ({
                ...a,
                purchaseValue: Number(a.purchaseValue),
                scrapValue: Number(a.scrapValue)
            }));
        } catch (error) {
            logger.error('Failed to fetch assets', { error, module: 'AssetActions' });
            throw new BusinessRuleError('Failed to fetch assets. Please try again later.');
        }
    });
}
);

export const createAsset = withTenant(
async function createAsset(data: AssetFormValues) {
    return safeAction(async () => {
        try {
            const result = assetSchema.safeParse(data);
            if (!result.success) {
                throw new ValidationError(result.error.issues[0].message);
            }

            await db.fixedAsset.create({
                data: {
                    ...result.data,
                    status: 'ACTIVE'
                }
            });

            revalidatePath('/finance/assets');
        } catch (error) {
            // Re-throw known errors
            if (error instanceof ValidationError) throw error;
            
            logger.error('Failed to create asset', { error, module: 'AssetActions' });
            throw new BusinessRuleError('Failed to create asset. Please verify details.');
        }
    });
}
);

export const updateAsset = withTenant(
async function updateAsset(id: string, data: Partial<AssetFormValues>) {
    return safeAction(async () => {
        try {
            await db.fixedAsset.update({
                where: { id },
                data: {
                    ...data,
                    updatedAt: new Date()
                }
            });

            revalidatePath('/finance/assets');
        } catch (error) {
            logger.error('Failed to update asset', { error, assetId: id, module: 'AssetActions' });
            throw new BusinessRuleError('Failed to update asset. Please check input.');
        }
    });
}
);

export const deleteAsset = withTenant(
async function deleteAsset(id: string) {
    return safeAction(async () => {
        try {
            await db.fixedAsset.delete({
                where: { id }
            });

            revalidatePath('/finance/assets');
        } catch (error) {
            logger.error('Failed to delete asset', { error, assetId: id, module: 'AssetActions' });
            throw new BusinessRuleError('Failed to delete asset.');
        }
    });
}
);
