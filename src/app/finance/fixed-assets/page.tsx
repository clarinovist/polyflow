'use client';

import { useState, useCallback, useEffect } from 'react';
import { getFixedAssets, runDepreciation } from '@/actions/finance/fixed-asset-actions';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatRupiah } from '@/lib/utils/utils';
import { Play, CheckCircle } from "lucide-react";
import { toast } from 'sonner';

interface Asset {
    assetCode: string;
    name: string;
    category: string;
    purchaseDate: string | Date;
    purchaseValue: number | string;
    usefulLifeMonths: number;
    lastDepreciationDate: string | Date | null;
}

export default function FixedAssetsPage() {
    const [assets, setAssets] = useState<Asset[]>([]);
    const [loading, setLoading] = useState(true);
    const [running, setRunning] = useState(false);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const res = await getFixedAssets();
            if (res.success) {
                setAssets(res.data as unknown as Asset[]);
            }
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleRunDepreciation = async () => {
        setRunning(true);
        try {
            const res = await runDepreciation();
            if (res.success) {
                const data = res.data as { count: number, message: string };
                toast.success(data.message);
                fetchData();
            } else {
                toast.error(res.error || "Failed to run depreciation");
            }
        } catch (_e) {
            toast.error("An error occurred");
        } finally {
            setRunning(false);
        }
    };

    return (
        <div className="space-y-6 max-w-7xl mx-auto pb-10">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Fixed Assets</h1>
                    <p className="text-muted-foreground">Manage assets and automated depreciation</p>
                </div>
                <Button 
                    onClick={handleRunDepreciation} 
                    disabled={running} 
                    className="gap-2 bg-indigo-600 hover:bg-indigo-700"
                >
                    <Play className="h-4 w-4" />
                    {running ? 'Processing...' : 'Run Monthly Depreciation'}
                </Button>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Asset Register</CardTitle>
                    <CardDescription>All company fixed assets</CardDescription>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="py-8 text-center text-muted-foreground text-sm flex justify-center items-center gap-2">
                            Loading assets...
                        </div>
                    ) : assets.length === 0 ? (
                        <div className="py-8 text-center text-muted-foreground text-sm">
                            No active fixed assets tracked.
                        </div>
                    ) : (
                        <div className="relative w-full overflow-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b transition-colors bg-muted/20 text-muted-foreground">
                                        <th className="h-10 px-4 text-left font-medium">Asset Code</th>
                                        <th className="h-10 px-4 text-left font-medium">Name</th>
                                        <th className="h-10 px-4 text-left font-medium">Category</th>
                                        <th className="h-10 px-4 text-left font-medium">Purchase Date</th>
                                        <th className="h-10 px-4 text-right font-medium">Purchase Value</th>
                                        <th className="h-10 px-4 text-right font-medium">Useful Life</th>
                                        <th className="h-10 px-4 text-left font-medium">Last Depreciated</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {assets.map((a, i) => (
                                        <tr key={i} className="border-b transition-colors hover:bg-muted/50">
                                            <td className="p-4 align-middle font-mono">{a.assetCode}</td>
                                            <td className="p-4 align-middle font-medium">{a.name}</td>
                                            <td className="p-4 align-middle">
                                                <span className="px-2 py-1 bg-amber-100 text-amber-800 text-xs rounded-full uppercase font-medium">
                                                    {a.category}
                                                </span>
                                            </td>
                                            <td className="p-4 align-middle">{new Date(a.purchaseDate).toLocaleDateString()}</td>
                                            <td className="p-4 align-middle text-right font-mono">
                                                {formatRupiah(typeof a.purchaseValue === 'number' ? a.purchaseValue : parseFloat(a.purchaseValue))}
                                            </td>
                                            <td className="p-4 align-middle text-right">{a.usefulLifeMonths} mos</td>
                                            <td className="p-4 align-middle">
                                                {a.lastDepreciationDate ? (
                                                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                                        <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
                                                        {new Date(a.lastDepreciationDate).toLocaleDateString()}
                                                    </span>
                                                ) : (
                                                    <span className="text-xs text-muted-foreground italic">Never</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
