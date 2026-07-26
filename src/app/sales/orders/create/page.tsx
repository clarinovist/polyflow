import { getCustomers } from '@/actions/sales/customer';
import { getLocations } from '@/actions/inventory/inventory';
import { getProductVariants } from '@/actions/inventory/inventory';
import { getSalesOrderById } from '@/actions/sales/sales';
import { SalesOrderForm } from '@/components/sales/SalesOrderForm';
import { SalesOrderIntentPicker } from '@/components/sales/SalesOrderIntentPicker';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { SalesOrderFormProps } from '@/components/sales/sales-order-types';
import type { SalesOrderType } from '@prisma/client';

type ReorderSource = NonNullable<
    Extract<
        Awaited<ReturnType<typeof getSalesOrderById>>,
        { success: true }
    >['data']
>;
type ReorderSourceItem = ReorderSource['items'][number];

/** Map intent query param to SalesOrderType */
function intentToOrderType(intent: string): SalesOrderType | undefined {
    switch (intent) {
        case 'quotation':
            return 'MAKE_TO_STOCK';
        case 'stock':
            return 'MAKE_TO_STOCK';
        case 'produce':
            return 'MAKE_TO_ORDER';
        case 'maklon':
            return 'MAKLON_JASA';
        default:
            return undefined;
    }
}

/** Map intent to documentIntent */
function intentToDocumentIntent(intent: string): 'order' | 'quotation' {
    return intent === 'quotation' ? 'quotation' : 'order';
}

interface CreateSalesOrderPageProps {
    searchParams: Promise<{ reorder?: string; intent?: string }>;
}

export default async function CreateSalesOrderPage({
    searchParams,
}: CreateSalesOrderPageProps) {
    const params = await searchParams;

    const intent = params.intent;
    const hasReorder = !!params.reorder;

    // If neither intent nor reorder, show intent picker
    if (!intent && !hasReorder) {
        return <SalesOrderIntentPicker />;
    }

    // Map intent to orderType (only when intent is a valid string)
    const lockedOrderType =
        intent && intentToOrderType(intent)
            ? intentToOrderType(intent)
            : undefined;

    // If intent is set but invalid and no reorder, show picker
    if (intent && !lockedOrderType && !hasReorder) {
        return <SalesOrderIntentPicker />;
    }

    const [customersRes, locationsRes, productsRes] = await Promise.all([
        getCustomers(),
        getLocations(),
        getProductVariants(),
    ]);

    const customers =
        customersRes.success && customersRes.data ? customersRes.data : [];
    const locations =
        locationsRes.success && locationsRes.data ? locationsRes.data : [];
    const products =
        productsRes.success && productsRes.data ? productsRes.data : [];

    // Fetch reorder source order if reorder param is present
    let reorderData: SalesOrderFormProps['reorderData'] | null = null;
    if (params.reorder) {
        const orderRes = await getSalesOrderById(params.reorder);
        if (orderRes.success && orderRes.data) {
            const o = orderRes.data;
            reorderData = {
                customerId: o.customerId || '',
                sourceLocationId: o.sourceLocationId || '',
                orderType: o.orderType || 'MAKE_TO_STOCK',
                notes: o.notes || '',
                shippingCost: Number(o.shippingCost) || 0,
                items: (o.items || []).map((item: ReorderSourceItem) => ({
                    productVariantId: item.productVariantId,
                    quantity:
                        Number(item.enteredQuantity) ||
                        Number(item.quantity) ||
                        1,
                    unitPrice:
                        Number(item.enteredUnitPrice) ||
                        Number(item.unitPrice) ||
                        0,
                    discountPercent: Number(item.discountPercent) || 0,
                    taxPercent: Number(item.taxPercent) || 0,
                })),
            };
        }
    }

    // Map intent to label for the page title
    const intentLabels: Record<string, string> = {
        quotation: 'Buat Penawaran',
        stock: 'Kirim dari Stok',
        produce: 'Produksi Dulu',
        maklon: 'Maklon Jasa',
    };

    return (
        <div className="p-6 max-w-5xl mx-auto">
            <Card>
                <CardHeader>
                    <CardTitle>
                        {reorderData
                            ? 'Pesan Ulang dari Order Sebelumnya'
                            : `Pesanan Baru — ${intent ? intentLabels[intent] || intent : 'Pesanan Baru'}`}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <SalesOrderForm
                        customers={customers.map((c) => ({
                            ...c,
                            creditLimit: c.creditLimit
                                ? Number(c.creditLimit)
                                : null,
                            discountPercent: c.discountPercent
                                ? Number(c.discountPercent)
                                : null,
                        }))}
                        locations={locations}
                        products={products
                            .filter(
                                (p) =>
                                    p.product.productType === 'FINISHED_GOOD' ||
                                    p.product.productType === 'SCRAP' ||
                                    p.product.productType === 'PACKAGING' ||
                                    p.product.productType === 'SERVICE' ||
                                    p.product.productType === 'RAW_MATERIAL',
                            )
                            .map((p) => ({
                                ...p,
                                price: p.price ? Number(p.price) : null,
                                buyPrice: p.buyPrice
                                    ? Number(p.buyPrice)
                                    : null,
                                sellPrice: p.sellPrice
                                    ? Number(p.sellPrice)
                                    : null,
                                conversionFactor: Number(p.conversionFactor),
                                minStockAlert: p.minStockAlert
                                    ? Number(p.minStockAlert)
                                    : null,
                                reorderPoint: p.reorderPoint
                                    ? Number(p.reorderPoint)
                                    : null,
                                reorderQuantity: p.reorderQuantity
                                    ? Number(p.reorderQuantity)
                                    : null,
                                standardCost: p.standardCost
                                    ? Number(p.standardCost)
                                    : null,
                                customerPrices:
                                    p.customerPrices?.map((price) => ({
                                        customerId: price.customerId,
                                        unitPrice: Number(price.unitPrice),
                                        isActive: price.isActive,
                                    })) || [],
                                inventories:
                                    p.inventories?.map((inv) => ({
                                        locationId: inv.locationId,
                                        quantity: Number(inv.quantity),
                                    })) || [],
                            }))}
                        mode="create"
                        lockedOrderType={lockedOrderType}
                        documentIntent={
                            intent ? intentToDocumentIntent(intent) : 'order'
                        }
                        reorderData={reorderData || undefined}
                    />
                </CardContent>
            </Card>
        </div>
    );
}
