import { getSuppliers } from '@/actions/supplier';
import { getLocations, getProductVariants } from '@/actions/inventory';
import { getPurchaseOrders } from '@/actions/purchasing';
import { PurchaseReturnForm } from '@/components/purchasing/PurchaseReturnForm';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default async function CreatePurchaseReturnPage() {
    // Fetch all required lookup data
    const [suppliers, locations, products, purchaseOrders] = await Promise.all([
        getSuppliers(),
        getLocations(),
        getProductVariants(),
        getPurchaseOrders()
    ]);

    return (
        <div className="p-6 max-w-5xl mx-auto">
            <Card>
                <CardHeader>
                    <CardTitle>Create New Purchase Return</CardTitle>
                </CardHeader>
                <CardContent>
                    <PurchaseReturnForm
                        suppliers={suppliers}
                        locations={locations}
                        purchaseOrders={purchaseOrders.map(po => ({
                            ...po,
                            totalAmount: po.totalAmount ? Number(po.totalAmount) : null
                        }))}
                        products={products.map(p => ({
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
                                ...inv,
                                quantity: inv.quantity ? Number(inv.quantity) : 0
                            })) || []
                        }))}
                        mode="create"
                    />
                </CardContent>
            </Card>
        </div>
    );
}
