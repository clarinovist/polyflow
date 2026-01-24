import { getInventoryStats, getLocations, getProductVariants } from '@/actions/inventory';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TransferForm } from '@/components/warehouse/inventory/TransferForm';

export default async function TransferPage() {
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
            <div className="flex items-center justify-between space-y-2">
                <h2 className="text-3xl font-bold tracking-tight">Internal Stock Transfer</h2>
            </div>
            <div className="grid gap-4 grid-cols-1">
                <Card>
                    <CardHeader>
                        <CardTitle>Transfer Stock</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <TransferForm
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
