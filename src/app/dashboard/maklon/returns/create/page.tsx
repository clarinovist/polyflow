import { getCustomers } from '@/actions/sales/customer';
import { getCustomerOwnedLocations } from '@/actions/inventory/locations';
import { getProductVariants } from '@/actions/inventory/inventory';
import { MaklonReturnForm } from '@/components/planning/maklon/MaklonReturnForm';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { serializeData } from '@/lib/utils/utils';

export default async function CreateMaklonReturnPage() {
    // Fetch all required lookup data
    const [customersRes, locationsRes, productsRes] = await Promise.all([
        getCustomers(),
        getCustomerOwnedLocations(),
        getProductVariants()
    ]);

    const customers = customersRes.success && customersRes.data ? serializeData(customersRes.data) : [];
    const locations = locationsRes.success && locationsRes.data ? serializeData(locationsRes.data) : [];
    const rawProducts = productsRes.success && productsRes.data ? serializeData(productsRes.data) : [];

    /* eslint-disable @typescript-eslint/no-explicit-any */
    const products = rawProducts.map((p: any) => ({
        ...p,
        price: p.price ? Number(p.price) : null,
        buyPrice: p.buyPrice ? Number(p.buyPrice) : null,
        sellPrice: p.sellPrice ? Number(p.sellPrice) : null,
        conversionFactor: p.conversionFactor ? Number(p.conversionFactor) : 1,
        standardCost: p.standardCost ? Number(p.standardCost) : null,
        minStockAlert: p.minStockAlert ? Number(p.minStockAlert) : null,
        reorderPoint: p.reorderPoint ? Number(p.reorderPoint) : null,
        reorderQuantity: p.reorderQuantity ? Number(p.reorderQuantity) : null,
        inventories: p.inventories?.map((inv: any) => ({
            locationId: inv.locationId,
            quantity: inv.quantity ? Number(inv.quantity) : 0
        })) || []
    }));
    /* eslint-enable @typescript-eslint/no-explicit-any */

    return (
        <div className="flex flex-col gap-6">
            <Card className="rounded-xl border bg-white dark:bg-sidebar">
                <CardHeader>
                    <CardTitle>Create New Maklon Return</CardTitle>
                    <CardDescription>
                        Return leftover customer-owned materials from Maklon Packing Area first, or from another customer-owned stage when needed.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <MaklonReturnForm
                        customers={customers}
                        locations={locations}
                        products={products}
                    />
                </CardContent>
            </Card>
        </div>
    );
}
