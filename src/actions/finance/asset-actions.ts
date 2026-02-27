'use server';

import { withTenant } from "@/lib/tenant";
import { prisma as db } from '@/lib/prisma';
import { AssetFormValues, assetSchema } from '@/lib/schemas/finance';
import { revalidatePath } from 'next/cache';

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
        console.error('Error fetching assets:', error);
        return { success: false, error: 'Failed to fetch assets' };
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
        console.error('Error creating asset:', error);
        return { success: false, error: 'Failed to create asset' };
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
        console.error('Error updating asset:', error);
        return { success: false, error: 'Failed to update asset' };
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
        console.error('Error deleting asset:', error);
        return { success: false, error: 'Failed to delete asset' };
    }
}
);
