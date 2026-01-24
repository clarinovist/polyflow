import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

interface OpnameItem {
    id: string;
    systemQuantity: number;
    countedQuantity: number | null;
    productVariant: {
        name: string;
        skuCode: string;
    };
}

interface OpnameVarianceProps {
    items: OpnameItem[];
}

export function OpnameVariance({ items }: OpnameVarianceProps) {
    // Filter to show only items with variance or specific interest?
    // For now show all, sorted by variance magnitude?

    const itemsWithVariance = items.map(item => {
        const sys = Number(item.systemQuantity);
        const count = item.countedQuantity !== null ? Number(item.countedQuantity) : sys; // assume no variance if not counted?
        // Actually if not counted, we should probably warn. But lets handle null as 0 if user intends 0, or equal if skipped.
        // For report sake, let's treat null as "Not Counted" (Variance 0 or N/A)

        const delta = item.countedQuantity !== null ? count - sys : 0;
        const status = item.countedQuantity === null ? 'PENDING' : delta === 0 ? 'MATCH' : 'VARIANCE';

        return { ...item, sys, count, delta, status };
    });

    const totalVarianceItems = itemsWithVariance.filter(i => i.status === 'VARIANCE').length;

    return (
        <div className="space-y-4">
            <div className="flex gap-4">
                <div className="p-4 bg-slate-50 border rounded-lg">
                    <div className="text-sm text-slate-500">Total Items</div>
                    <div className="text-2xl font-bold">{items.length}</div>
                </div>
                <div className="p-4 bg-orange-50 border border-orange-100 rounded-lg">
                    <div className="text-sm text-orange-600">Items with Variance</div>
                    <div className="text-2xl font-bold text-orange-700">{totalVarianceItems}</div>
                </div>
            </div>

            <div className="border rounded-md">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-[300px]">Product</TableHead>
                            <TableHead className="text-right">System Qty</TableHead>
                            <TableHead className="text-right">Counted Qty</TableHead>
                            <TableHead className="text-right">Variance</TableHead>
                            <TableHead className="text-center">Status</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {itemsWithVariance.map((item) => (
                            <TableRow key={item.id}>
                                <TableCell className="font-medium">
                                    {item.productVariant.name}
                                    <div className="text-xs text-slate-500">
                                        {item.productVariant.skuCode}
                                    </div>
                                </TableCell>
                                <TableCell className="text-right">{item.sys.toLocaleString()}</TableCell>
                                <TableCell className="text-right">
                                    {item.countedQuantity !== null ? item.count.toLocaleString() : '-'}
                                </TableCell>
                                <TableCell className={`text-right font-bold ${item.delta > 0 ? 'text-green-600' : item.delta < 0 ? 'text-red-600' : 'text-slate-400'
                                    }`}>
                                    {item.delta > 0 ? '+' : ''}{item.delta.toLocaleString()}
                                </TableCell>
                                <TableCell className="text-center">
                                    {item.status === 'MATCH' && <Badge variant="outline" className="text-emerald-600 border-emerald-200 bg-emerald-50">Match</Badge>}
                                    {item.status === 'VARIANCE' && <Badge variant="destructive">Variance</Badge>}
                                    {item.status === 'PENDING' && <Badge variant="secondary" className="text-slate-500">Pending</Badge>}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
