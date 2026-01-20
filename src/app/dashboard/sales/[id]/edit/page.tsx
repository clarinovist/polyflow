import { getSalesOrderById } from '@/actions/sales';
import { getCustomers } from '@/actions/customer';
import { getLocations } from '@/actions/inventory';
import { getProductVariants } from '@/actions/inventory';
import { SalesOrderForm } from '@/components/sales/SalesOrderForm';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { notFound } from 'next/navigation';

interface PageProps {
    params: Promise<{
        id: string;
    }>
}

export default async function EditSalesOrderPage({ params }: PageProps) {
    const { id } = await params;

    const [order, customers, locations, products] = await Promise.all([
        getSalesOrderById(id),
        getCustomers(),
        getLocations(),
        getProductVariants()
    ]);

    if (!order) {
        notFound();
    }

    // Transform order items to match form values (convert Decimals to numbers)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items = (order as any).items || [];
    const initialData = {
        id: order.id,
        customerId: order.customerId || undefined,
        sourceLocationId: order.sourceLocationId || '',
        orderDate: order.orderDate,
        expectedDate: order.expectedDate || undefined,
        orderType: order.orderType,
        notes: order.notes || undefined,
        items: items.map((item: any) => ({
            id: item.id,
            productVariantId: item.productVariantId,
            quantity: Number(item.quantity),
            unitPrice: Number(item.unitPrice)
        }))
    };

    return (
        <div className="p-6 max-w-5xl mx-auto">
            <Card>
                <CardHeader>
                    <CardTitle>Edit Sales Order</CardTitle>
                </CardHeader>
                <CardContent>
                    <SalesOrderForm
                        customers={customers.map((c) => ({
                            ...c,
                            creditLimit: c.creditLimit ? Number(c.creditLimit) : null,
                            discountPercent: c.discountPercent ? Number(c.discountPercent) : null
                        }))}
                        locations={locations}
                        products={products
                            .filter((p) => p.product.productType === 'FINISHED_GOOD' || p.product.productType === 'SCRAP')
                            .map((p) => ({
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
                        mode="edit"
                        initialData={initialData}
                    />
                </CardContent>
            </Card>
        </div>
    );
}
