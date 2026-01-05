import { TransferForm } from '@/components/inventory/TransferForm';
import { getLocations, getProductVariants, getInventoryStats } from '@/actions/inventory';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default async function TransferPage() {
    const locationsData = await getLocations();
    const productsData = await getProductVariants();
    const inventoryData = await getInventoryStats();

    const locations = locationsData.map(l => ({ id: l.id, name: l.name }));
    const products = productsData.map(p => ({ id: p.id, name: p.name, skuCode: p.skuCode }));
    const inventory = inventoryData.map(i => ({
        locationId: i.locationId,
        productVariantId: i.productVariantId,
        quantity: i.quantity.toNumber(),
    }));

    return (
        <div className="max-w-2xl mx-auto">
            <Card>
                <CardHeader>
                    <CardTitle>Internal Stock Transfer</CardTitle>
                </CardHeader>
                <CardContent>
                    <TransferForm
                        locations={locations}
                        products={products}
                        inventory={inventory}
                    />
                </CardContent>
            </Card>
        </div>
    );
}
