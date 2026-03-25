'use server';

import { withTenant } from "@/lib/core/tenant";
import { prisma as db } from '@/lib/core/prisma';
import { AssetFormValues, assetSchema } from '@/lib/schemas/finance';
import { revalidatePath } from 'next/cache';
import { logger } from '@/lib/config/logger';

export const getAssets = withTenant(
async function getAssets() {
    try {
        const assets = await db.fixedAsset.findMany({
            include: {
                assetAccount: true,
                accumDepreciationAccount: true,
                depreciationExpenseAccount: true
            },
            orderBy: { createdAt: 'desc' }
        });
        return {
            success: true,
            data: assets.map(a => ({
                ...a,
                purchaseValue: Number(a.purchaseValue),
                scrapValue: Number(a.scrapValue)
            }))
        };
    } catch (error) {
        logger.error('Failed to fetch assets', { error, module: 'AssetActions' });
        return { success: false, error: 'Failed to fetch assets. Please try again later.' };
    }
}
);

export const createAsset = withTenant(
async function createAsset(data: AssetFormValues) {
    try {
        const validated = assetSchema.parse(data);

        await db.fixedAsset.create({
            data: {
                ...validated,
                status: 'ACTIVE'
            }
        });

        revalidatePath('/finance/assets');
        return { success: true };
    } catch (error) {
        logger.error('Failed to create asset', { error, module: 'AssetActions' });
        return { success: false, error: 'Failed to create asset. Please verify details.' };
    }
}
);

export const updateAsset = withTenant(
async function updateAsset(id: string, data: Partial<AssetFormValues>) {
    try {

        await db.fixedAsset.update({
            where: { id },
            data: {
                ...data,
                updatedAt: new Date()
            }
        });

        revalidatePath('/finance/assets');
        return { success: true };
    } catch (error) {
        logger.error('Failed to update asset', { error, assetId: id, module: 'AssetActions' });
        return { success: false, error: 'Failed to update asset. Please check input.' };
    }
}
);

export const deleteAsset = withTenant(
async function deleteAsset(id: string) {
    try {
        await db.fixedAsset.delete({
            where: { id }
        });

        revalidatePath('/finance/assets');
        return { success: true };
    } catch (error) {
        logger.error('Failed to delete asset', { error, assetId: id, module: 'AssetActions' });
        return { success: false, error: 'Failed to delete asset.' };
    }
}
);
