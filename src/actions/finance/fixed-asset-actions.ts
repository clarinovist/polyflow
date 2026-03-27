'use server';

import { withTenant } from "@/lib/core/tenant";
import { FixedAssetService } from '@/services/finance/fixed-asset-service';
import { requireAuth } from '@/lib/tools/auth-checks';
import { serializeData } from '@/lib/utils/utils';
import { safeAction } from '@/lib/errors/errors';
import { revalidatePath } from 'next/cache';

export const getFixedAssets = withTenant(
async function getFixedAssets() {
    return safeAction(async () => {
        await requireAuth();
        const data = await FixedAssetService.getAssets();
        return serializeData(data);
    });
}
);

export const runDepreciation = withTenant(
async function runDepreciation() {
    return safeAction(async () => {
        const session = await requireAuth();
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth() + 1;
        const results = await FixedAssetService.runDepreciation(year, month, session.user.id);
        revalidatePath('/finance/fixed-assets');
        return serializeData({ count: results.length, message: `Successfully processed depreciation for ${results.length} assets.` });
    });
}
);
