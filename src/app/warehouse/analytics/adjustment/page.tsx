import { getInventoryStats, getLocations, getProductVariants } from '@/actions/inventory/inventory';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AdjustmentForm } from '@/components/warehouse/inventory/AdjustmentForm';
import { ImportStockDialog } from '@/components/warehouse/inventory/ImportStockDialog';

export default async function AdjustmentPage() {
    const [liveInventoryRes, locationsRes, productsDataRes] = await Promise.all([
        getInventoryStats(),
        getLocations(),
        getProductVariants(),
    ]);
    
    const liveInventory = liveInventoryRes.success && liveInventoryRes.data ? liveInventoryRes.data : [];
    const locations = locationsRes.success && locationsRes.data ? locationsRes.data : [];
    const productsData = productsDataRes.success && productsDataRes.data ? productsDataRes.data : [];

    const formLocations = locations.map(l => ({ id: l.id, name: l.name }));
    const formProducts = productsData.map(p => ({ id: p.id, name: p.name, skuCode: p.skuCode }));
    const liveInventorySimple = liveInventory.map(i => ({
        locationId: i.locationId,
        productVariantId: i.productVariantId,
        quantity: i.quantity.toNumber(),
    }));

    return (
        <div className="flex-1 space-y-4 p-8 pt-6">
            <div className="flex items-center justify-between space-y-2">
                <h2 className="text-3xl font-bold tracking-tight">Stock Adjustment</h2>
                <ImportStockDialog />
            </div>
            <div className="grid gap-4 grid-cols-1">
                <Card>
                    <CardHeader>
                        <CardTitle>Adjust Stock Level</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <AdjustmentForm
                            locations={formLocations}
                            products={formProducts}
                            inventory={liveInventorySimple}
                        />
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
