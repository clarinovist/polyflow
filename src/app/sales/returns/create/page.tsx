import { getCustomers } from '@/actions/customer';
import { getLocations, getProductVariants } from '@/actions/inventory';
import { getSalesOrders } from '@/actions/sales';
import { SalesReturnForm } from '@/components/sales/SalesReturnForm';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default async function CreateSalesReturnPage() {
    // Fetch all required lookup data
    const [customers, locations, products, salesOrders] = await Promise.all([
        getCustomers(),
        getLocations(),
        getProductVariants(),
        getSalesOrders()
    ]);

    return (
        <div className="p-6 max-w-5xl mx-auto">
            <Card>
                <CardHeader>
                    <CardTitle>Create New Sales Return</CardTitle>
                </CardHeader>
                <CardContent>
                    <SalesReturnForm
                        customers={customers.map(c => ({
                            ...c,
                            creditLimit: c.creditLimit ? Number(c.creditLimit) : null,
                            discountPercent: c.discountPercent ? Number(c.discountPercent) : null
                        }))}
                        locations={locations}
                        salesOrders={salesOrders.map(so => ({
                            ...so,
                            totalAmount: so.totalAmount ? Number(so.totalAmount) : null
                        }))}
                        products={products.map(p => ({
                            ...p,
                            price: p.price ? Number(p.price) : null,
                            buyPrice: p.buyPrice ? Number(p.buyPrice) : null,
                            sellPrice: p.sellPrice ? Number(p.sellPrice) : null,
                            conversionFactor: Number(p.conversionFactor),
                        }))}
                        mode="create"
                    />
                </CardContent>
            </Card>
        </div>
    );
}
