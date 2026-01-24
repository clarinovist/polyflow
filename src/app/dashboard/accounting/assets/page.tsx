
import { getFixedAssets, getChartOfAccounts } from '@/actions/accounting';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { AssetFormDialog } from './asset-form-dialog';
import { DepreciationDialog } from './depreciation-dialog';

import { formatRupiah } from '@/lib/utils';

interface Asset {
    id: string;
    assetCode: string;
    name: string;
    category: string;
    purchaseDate: string | Date;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    purchaseValue: any;
    usefulLifeMonths: number;
    status: string;
    lastDepreciationDate?: string | Date | null;
}

export default async function FixedAssetsPage() {
    const [assets, accounts] = await Promise.all([
        getFixedAssets(),
        getChartOfAccounts()
    ]);

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Fixed Assets</h1>
                    <p className="text-muted-foreground">
                        Manage capital assets and automated depreciation schedules.
                    </p>
                </div>
                <div className="flex gap-2">
                    <DepreciationDialog />
                    <AssetFormDialog accounts={accounts} />
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Asset Register</CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Asset Code</TableHead>
                                <TableHead>Name</TableHead>
                                <TableHead>Category</TableHead>
                                <TableHead>Purchase Date</TableHead>
                                <TableHead className="text-right">Original Value</TableHead>
                                <TableHead>Life (Months)</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Last Depr.</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {assets.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={8} className="text-center h-24 text-muted-foreground">
                                        No fixed assets registered.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                assets.map((asset: Asset) => (
                                    <TableRow key={asset.id}>
                                        <TableCell className="font-mono text-xs">{asset.assetCode}</TableCell>
                                        <TableCell className="font-bold">{asset.name}</TableCell>
                                        <TableCell>{asset.category}</TableCell>
                                        <TableCell>{new Date(asset.purchaseDate).toLocaleDateString('id-ID')}</TableCell>
                                        <TableCell className="text-right">{formatRupiah(Number(asset.purchaseValue))}</TableCell>
                                        <TableCell>{asset.usefulLifeMonths} mo</TableCell>
                                        <TableCell>
                                            <Badge variant={asset.status === 'ACTIVE' ? 'default' : 'secondary'}>
                                                {asset.status}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-sm text-muted-foreground">
                                            {asset.lastDepreciationDate ? new Date(asset.lastDepreciationDate).toLocaleDateString('id-ID', { month: 'short', year: 'numeric' }) : '-'}
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
