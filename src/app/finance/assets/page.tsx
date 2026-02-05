import { getAssets } from "@/actions/finance/asset-actions";
import { getAccounts } from "@/actions/finance/account-actions";
import { AssetListClient } from "@/components/finance/assets/AssetListClient";

export default async function AssetsPage() {
    const assetsRes = await getAssets();
    const accountsRes = await getAccounts();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const assets = assetsRes.success ? (assetsRes.data as any[]) : [];
    const accounts = accountsRes || [];

    return (
        <AssetListClient
            initialAssets={assets}
            accounts={accounts}
        />
    );
}
