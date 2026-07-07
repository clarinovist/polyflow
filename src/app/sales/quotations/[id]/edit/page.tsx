import { getQuotationById } from '@/actions/sales/quotations';
import { getCustomers } from '@/actions/sales/customer';
import { getProductVariants } from '@/actions/inventory/inventory';
import { SalesQuotationForm } from '@/components/sales/quotations/SalesQuotationForm';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { notFound } from 'next/navigation';
import { serializeData } from '@/lib/utils/utils';

export default async function EditSalesQuotationPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const [quotationRes, customersRes, productsRes] = await Promise.all([
        getQuotationById(id),
        getCustomers(),
        getProductVariants()
    ]);

    const quotation = quotationRes?.success && quotationRes.data ? quotationRes.data : null;
    if (!quotation) notFound();

    // Block edit for CONVERTED/EXPIRED/REJECTED
    if (['CONVERTED', 'EXPIRED', 'REJECTED'].includes(quotation.status)) {
        return (
            <div className="p-6 max-w-5xl mx-auto">
                <Card>
                    <CardContent className="py-12 text-center">
                        <p className="text-lg font-semibold text-muted-foreground">
                            Penawaran dengan status {quotation.status} tidak bisa diedit.
                        </p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    const customers = customersRes.success && customersRes.data ? customersRes.data : [];
    const products = productsRes.success && productsRes.data ? productsRes.data : [];

    // Serialize quotation for the form
    const serialized = serializeData(quotation) as unknown as {
        id: string;
        customerId: string | null;
        quotationDate: string;
        validUntil: string | null;
        notes: string | null;
        status: string;
        items: {
            productVariantId: string;
            quantity: number;
            unitPrice: number;
            enteredQuantity?: number;
            enteredUnit?: string;
            conversionFactorSnapshot?: number;
            enteredUnitPrice?: number;
            discountPercent?: number;
            taxPercent?: number;
        }[];
    };

    return (
        <div className="p-6 max-w-5xl mx-auto">
            <Card>
                <CardHeader>
                    <CardTitle>Edit Penawaran {serialized.id ? quotation.quotationNumber : ''}</CardTitle>
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
                                customerPrices: p.customerPrices?.map((price) => ({
                                    customerId: price.customerId,
                                    unitPrice: Number(price.unitPrice),
                                    isActive: price.isActive,
                                })) || [],
                                inventories: p.inventories?.map((inv) => ({
                                    locationId: inv.locationId,
                                    quantity: Number(inv.quantity)
                                })) || []
                            }))}
                        mode="edit"
                        initialData={{
                            id: serialized.id,
                            customerId: serialized.customerId || undefined,
                            quotationDate: new Date(serialized.quotationDate),
                            validUntil: serialized.validUntil ? new Date(serialized.validUntil) : undefined,
                            notes: serialized.notes || undefined,
                            items: serialized.items.map(item => ({
                                productVariantId: item.productVariantId,
                                quantity: item.enteredQuantity ?? item.quantity,
                                unitPrice: item.enteredUnitPrice ?? item.unitPrice,
                                enteredQuantity: item.enteredQuantity,
                                enteredUnit: item.enteredUnit as never,
                                conversionFactorSnapshot: item.conversionFactorSnapshot,
                                enteredUnitPrice: item.enteredUnitPrice,
                                discountPercent: item.discountPercent ?? 0,
                                taxPercent: item.taxPercent ?? 0,
                            })),
                        }}
                    />
                </CardContent>
            </Card>
        </div>
    );
}
