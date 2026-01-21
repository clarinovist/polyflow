import { getCustomers } from '@/actions/customer';
import { getProductVariants } from '@/actions/inventory';
import { SalesQuotationForm } from '@/components/sales/quotations/SalesQuotationForm';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default async function CreateSalesQuotationPage() {
    const [customers, products] = await Promise.all([
        getCustomers(),
        getProductVariants()
    ]);

    return (
        <div className="p-6 max-w-5xl mx-auto">
            <Card>
                <CardHeader>
                    <CardTitle>Create New Quotation</CardTitle>
                </CardHeader>
                <CardContent>
                    <SalesQuotationForm
                        customers={customers.map(c => ({
                            ...c,
                            creditLimit: c.creditLimit ? Number(c.creditLimit) : null,
                            discountPercent: c.discountPercent ? Number(c.discountPercent) : null
                        }))}
                        products={products
                            .filter(p => p.product.productType === 'FINISHED_GOOD' || p.product.productType === 'SCRAP')
                            .map(p => ({
                                ...p,
                                price: p.price ? Number(p.price) : null,
                                buyPrice: p.buyPrice ? Number(p.buyPrice) : null,
                                sellPrice: p.sellPrice ? Number(p.sellPrice) : null,
                                conversionFactor: Number(p.conversionFactor),
                                minStockAlert: p.minStockAlert ? Number(p.minStockAlert) : null,
                                reorderPoint: p.reorderPoint ? Number(p.reorderPoint) : null,
                                reorderQuantity: p.reorderQuantity ? Number(p.reorderQuantity) : null,
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
