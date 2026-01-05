import { AdjustmentForm } from '@/components/inventory/AdjustmentForm';
import { getLocations, getProductVariants, getInventoryStats, InventoryWithRelations } from '@/actions/inventory';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default async function AdjustmentPage() {
    const [locationsData, productsData, inventory] = await Promise.all([
        getLocations(),
        getProductVariants(),
        getInventoryStats(),
    ]);

    // Exclude Decimals by selecting only plain fields and using JSON round-trip for safety
    const locations = JSON.parse(JSON.stringify(locationsData.map(l => ({ id: l.id, name: l.name }))));
    const products = JSON.parse(JSON.stringify(productsData.map(p => ({ id: p.id, name: p.name, skuCode: p.skuCode }))));
    const serializedInventory = JSON.parse(JSON.stringify(inventory.map((item: InventoryWithRelations) => ({
        locationId: item.locationId,
        productVariantId: item.productVariantId,
        quantity: item.quantity.toNumber(),
    }))));

    return (
        <div className="max-w-2xl mx-auto">
            <Card>
                <CardHeader>
                    <CardTitle>Stock Adjustment (Opname)</CardTitle>
                </CardHeader>
                <CardContent>
                    <AdjustmentForm
                        locations={locations}
                        products={products}
                        inventory={serializedInventory}
                    />
                </CardContent>
            </Card>
        </div>
    );
}
