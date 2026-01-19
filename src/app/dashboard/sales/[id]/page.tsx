import { getSalesOrderById } from '@/actions/sales';
import { notFound } from 'next/navigation';
import { SalesOrderDetailClient } from '@/components/sales/SalesOrderDetailClient';

interface PageProps {
    params: Promise<{
        id: string;
    }>
}

export default async function SalesOrderDetailPage({ params }: PageProps) {
    const { id } = await params;
    const order = await getSalesOrderById(id);

    if (!order) {
        notFound();
    }

    return (
        <div className="p-6 max-w-5xl mx-auto">
            <SalesOrderDetailClient order={{
                id: order.id,
                orderNumber: order.orderNumber,
                customerId: order.customerId,
                orderDate: order.orderDate,
                expectedDate: order.expectedDate,
                orderType: order.orderType,
                status: order.status,
                sourceLocationId: order.sourceLocationId,
                notes: order.notes,
                createdById: order.createdById,
                createdAt: order.createdAt,
                updatedAt: order.updatedAt,
                totalAmount: order.totalAmount ? Number(order.totalAmount) : null,
                items: order.items.map((item) => ({
                    id: item.id,
                    salesOrderId: item.salesOrderId,
                    productVariantId: item.productVariantId,
                    quantity: Number(item.quantity),
                    unitPrice: Number(item.unitPrice),
                    subtotal: Number(item.subtotal),
                    deliveredQty: Number(item.deliveredQty),
                    createdAt: item.createdAt,
                    updatedAt: item.updatedAt,
                    productVariant: {
                        id: item.productVariant.id,
                        productId: item.productVariant.productId,
                        name: item.productVariant.name,
                        skuCode: item.productVariant.skuCode,
                        primaryUnit: item.productVariant.primaryUnit,
                        salesUnit: item.productVariant.salesUnit,
                        attributes: item.productVariant.attributes,
                        leadTimeDays: item.productVariant.leadTimeDays,
                        price: item.productVariant.price ? Number(item.productVariant.price) : null,
                        buyPrice: item.productVariant.buyPrice ? Number(item.productVariant.buyPrice) : null,
                        sellPrice: item.productVariant.sellPrice ? Number(item.productVariant.sellPrice) : null,
                        conversionFactor: Number(item.productVariant.conversionFactor || 0),
                        minStockAlert: item.productVariant.minStockAlert ? Number(item.productVariant.minStockAlert) : null,
                        reorderPoint: item.productVariant.reorderPoint ? Number(item.productVariant.reorderPoint) : null,
                        reorderQuantity: item.productVariant.reorderQuantity ? Number(item.productVariant.reorderQuantity) : null,
                        preferredSupplierId: item.productVariant.preferredSupplierId,
                        createdAt: item.productVariant.createdAt,
                        updatedAt: item.productVariant.updatedAt,
                        product: item.productVariant.product
                    }
                })),
                customer: order.customer ? {
                    id: order.customer.id,
                    name: order.customer.name,
                    code: order.customer.code,
                    email: order.customer.email,
                    phone: order.customer.phone,
                    billingAddress: order.customer.billingAddress,
                    shippingAddress: order.customer.shippingAddress,
                    taxId: order.customer.taxId,
                    paymentTermDays: order.customer.paymentTermDays,
                    isActive: order.customer.isActive,
                    createdAt: order.customer.createdAt,
                    updatedAt: order.customer.updatedAt,
                    creditLimit: order.customer.creditLimit ? Number(order.customer.creditLimit) : null,
                    discountPercent: order.customer.discountPercent ? Number(order.customer.discountPercent) : null,
                    notes: order.customer.notes
                } : null,
                createdBy: order.createdBy ? { name: order.createdBy.name || 'Unknown' } : null,
                sourceLocation: order.sourceLocation,
                productionOrders: order.productionOrders?.map((po) => ({
                    ...po,
                    plannedQuantity: Number(po.plannedQuantity),
                    actualQuantity: po.actualQuantity ? Number(po.actualQuantity) : null
                })) || [],
                invoices: order.invoices || [],
                movements: order.movements.map((m) => ({
                    id: m.id,
                    type: m.type,
                    productVariantId: m.productVariantId,
                    fromLocationId: m.fromLocationId,
                    toLocationId: m.toLocationId,
                    quantity: Number(m.quantity),
                    cost: m.cost ? Number(m.cost) : null,
                    reference: m.reference,
                    createdById: m.createdById,
                    createdAt: m.createdAt,
                    batchId: m.batchId,
                    salesOrderId: m.salesOrderId
                }))
            }} />
        </div>
    );
}
