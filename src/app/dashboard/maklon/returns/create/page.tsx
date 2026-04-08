import { getCustomers } from '@/actions/sales/customer';
import { getCustomerOwnedLocations } from '@/actions/inventory/locations';
import { getProductVariants } from '@/actions/inventory/inventory';
import { MaklonReturnForm } from '@/components/planning/maklon/MaklonReturnForm';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default async function CreateMaklonReturnPage() {
    // Fetch all required lookup data
    const [customersRes, locationsRes, productsRes] = await Promise.all([
        getCustomers(),
        getCustomerOwnedLocations(),
        getProductVariants()
    ]);

    const customers = customersRes.success && customersRes.data ? customersRes.data : [];
    const locations = locationsRes.success && locationsRes.data ? locationsRes.data : [];
    const products = productsRes.success && productsRes.data ? productsRes.data : [];

    return (
        <div className="flex flex-col gap-6">
            <Card className="rounded-xl border bg-white dark:bg-sidebar">
                <CardHeader>
                    <CardTitle>Create New Maklon Return</CardTitle>
                </CardHeader>
                <CardContent>
                    <MaklonReturnForm
                        customers={customers}
                        locations={locations}
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        products={products.map((p: any) => ({
                            ...p,
                            price: p.price ? Number(p.price) : null,
                            buyPrice: p.buyPrice ? Number(p.buyPrice) : null,
                            sellPrice: p.sellPrice ? Number(p.sellPrice) : null,
                            conversionFactor: p.conversionFactor ? Number(p.conversionFactor) : 1,
                            standardCost: p.standardCost ? Number(p.standardCost) : null,
                            minStockAlert: p.minStockAlert ? Number(p.minStockAlert) : null,
                            reorderPoint: p.reorderPoint ? Number(p.reorderPoint) : null,
                            reorderQuantity: p.reorderQuantity ? Number(p.reorderQuantity) : null,
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            inventories: p.inventories?.map((inv: any) => ({
                                ...inv,
                                quantity: inv.quantity ? Number(inv.quantity) : 0
                            })) || []
                        }))}
                    />
                </CardContent>
            </Card>
        </div>
    );
}
