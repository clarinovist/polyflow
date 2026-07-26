import type { ComponentProps } from 'react';
import { getAssets } from '@/actions/finance/asset-actions';
import { getAccounts } from '@/actions/finance/account-actions';
import { AssetListClient } from '@/components/finance/assets/AssetListClient';

type InitialAssets = ComponentProps<typeof AssetListClient>['initialAssets'];

export default async function AssetsPage() {
    const assetsRes = await getAssets();
    const accountsRes = await getAccounts();

    const assets = (
        assetsRes.success && assetsRes.data ? assetsRes.data : []
    ) as InitialAssets;
    const accounts =
        accountsRes.success && accountsRes.data ? accountsRes.data : [];

    return <AssetListClient initialAssets={assets} accounts={accounts} />;
}
