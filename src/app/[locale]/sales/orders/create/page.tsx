import { getCustomers } from '@/actions/customer';
import { getLocations } from '@/actions/inventory';
import { getProductVariants } from '@/actions/inventory';
import { SalesOrderForm } from '@/components/sales/SalesOrderForm';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default async function CreateSalesOrderPage() {
    const [customers, locations, products] = await Promise.all([
        getCustomers(),
        getLocations(),
        getProductVariants()
    ]);

    // Filter locations: Only Finished Goods & Scrap
    // Assuming slugs are 'finished-goods' and 'scrap-warehouse' or similar
    // For now we pass all locations but the Form will filter if needed, 
    // or we filter here if we know the slugs.
    // Let's pass all and let the user decide / component filtering. 
    // But strict requirement says ONLY FG/Scrap.

    return (
        <div className="p-6 max-w-5xl mx-auto">
            <Card>
                <CardHeader>
                    <CardTitle>Create New Sales Order</CardTitle>
                </CardHeader>
                <CardContent>
                    <SalesOrderForm
                        customers={customers.map(c => ({
                            ...c,
                            creditLimit: c.creditLimit ? Number(c.creditLimit) : null,
                            discountPercent: c.discountPercent ? Number(c.discountPercent) : null
                        }))}
                        locations={locations}
                        products={products
                            .filter(p => p.product.productType === 'FINISHED_GOOD' || p.product.productType === 'SCRAP' || p.product.productType === 'PACKAGING')
                            .map(p => ({
                                ...p,
                                price: p.price ? Number(p.price) : null,
                                buyPrice: p.buyPrice ? Number(p.buyPrice) : null,
                                sellPrice: p.sellPrice ? Number(p.sellPrice) : null,
                                conversionFactor: Number(p.conversionFactor),
                                minStockAlert: p.minStockAlert ? Number(p.minStockAlert) : null,
                                reorderPoint: p.reorderPoint ? Number(p.reorderPoint) : null,
                                reorderQuantity: p.reorderQuantity ? Number(p.reorderQuantity) : null,
                                standardCost: p.standardCost ? Number(p.standardCost) : null,
                                inventories: p.inventories?.map((inv) => ({
                                    locationId: inv.locationId,
                                    quantity: Number(inv.quantity)
                                })) || []
                            }))}
                        mode="create"
                    />
                </CardContent>
            </Card>
        </div>
    );
}
