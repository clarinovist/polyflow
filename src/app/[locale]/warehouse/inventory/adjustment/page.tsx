import { getInventoryStats, getLocations, getProductVariants } from '@/actions/inventory';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AdjustmentForm } from '@/components/warehouse/inventory/AdjustmentForm';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { ArrowLeft, PackagePlus } from 'lucide-react';
import { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Stock Adjustment | PolyFlow Warehouse',
};

export default async function WarehouseAdjustmentPage() {
    const [liveInventory, locations, productsData] = await Promise.all([
        getInventoryStats(),
        getLocations(),
        getProductVariants(),
    ]);

    const formLocations = locations.map(l => ({ id: l.id, name: l.name }));
    const formProducts = productsData.map(p => ({ id: p.id, name: p.name, skuCode: p.skuCode }));
    const liveInventorySimple = liveInventory.map(i => ({
        locationId: i.locationId,
        productVariantId: i.productVariantId,
        quantity: i.quantity.toNumber(),
    }));

    return (
        <div className="flex-1 space-y-4 p-8 pt-6">
            <Card className="border shadow-sm">
                <CardHeader className="bg-muted/30 border-b py-3 flex flex-row items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600">
                            <PackagePlus className="h-4 w-4" />
                        </div>
                        <div>
                            <CardTitle className="text-lg font-bold text-slate-900">Stock Adjustment</CardTitle>
                            <p className="text-xs text-muted-foreground">Manually correct stock levels</p>
                        </div>
                    </div>
                    <Button variant="ghost" size="sm" asChild className="h-8 text-xs">
                        <Link href="/warehouse/inventory">
                            <ArrowLeft className="mr-2 h-3 w-3" /> Back to Inventory
                        </Link>
                    </Button>
                </CardHeader>
                <CardContent className="pt-6">
                    <AdjustmentForm
                        locations={formLocations}
                        products={formProducts}
                        inventory={liveInventorySimple}
                    />
                </CardContent>
            </Card>
        </div>
    );
}
