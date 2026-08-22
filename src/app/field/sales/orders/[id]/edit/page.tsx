import { getFieldSalesOrderById } from '@/actions/sales/field-actions';
import { getProductVariants } from '@/actions/inventory/inventory';
import { notFound, redirect } from 'next/navigation';
import { EditOrderClient } from './EditOrderClient';

/**
 * Status yang masih boleh diedit — cerminan guard di
 * `SalesService.updateOrder` (menolak SHIPPED / DELIVERED / CANCELLED /
 * QUOTATION_REJECTED / QUOTATION_EXPIRED).
 *
 * Rute ini sengaja berada di bawah `/field` supaya otomatis lolos kedua gate
 * middleware (allowlist mobile + gate role SALES). Jangan pindahkan ke
 * `/sales/...` — sales field akan langsung ter-redirect balik.
 *
 * Plan: docs/plan/2026-08-22-edit-item-so-sales-field.md
 */
const EDITABLE_STATUSES = [
    'QUOTATION',
    'QUOTATION_SENT',
    'DRAFT',
    'CONFIRMED',
    'IN_PRODUCTION',
    'READY_TO_SHIP',
];

export default async function FieldSalesOrderEditPage(props: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await props.params;

    const [orderRes, productsRes] = await Promise.all([
        getFieldSalesOrderById(id),
        getProductVariants(),
    ]);

    if (!orderRes?.success || !orderRes.data) {
        notFound();
    }

    const order = orderRes.data as Record<string, unknown>;

    // Status terlarang → balik ke detail, jangan tampilkan form yang pasti
    // ditolak backend.
    if (!EDITABLE_STATUSES.includes(String(order.status))) {
        redirect(`/field/sales/orders/${id}`);
    }

    const products =
        productsRes?.success && productsRes.data ? productsRes.data : [];

    const serializedProducts = products
        .filter(
            (p) =>
                p.product.productType === 'FINISHED_GOOD' ||
                p.product.productType === 'PACKAGING',
        )
        .map((p) => ({
            id: p.id,
            name: p.name,
            productName: p.product.name,
            skuCode: p.skuCode,
            sellPrice: p.sellPrice ? Number(p.sellPrice) : null,
            displayUnit:
                p.salesUnit && p.salesUnit !== p.primaryUnit
                    ? p.salesUnit
                    : p.primaryUnit,
        }));

    const items = (order.items as Array<Record<string, unknown>>) || [];

    const serializedOrder = {
        id: String(order.id),
        orderNumber: String(order.orderNumber),
        status: String(order.status),
        customerName:
            (order.customer as { name?: string } | null)?.name ?? '-',
        customerId: (order.customerId as string | null) ?? undefined,
        salesRepId: (order.salesRepId as string | null) ?? null,
        sourceLocationId: (order.sourceLocationId as string | null) ?? '',
        orderDate: String(order.orderDate),
        expectedDate: order.expectedDate ? String(order.expectedDate) : null,
        notes: (order.notes as string | null) ?? '',
        shippingCost: order.shippingCost ? Number(order.shippingCost) : 0,
        // Harga dikunci bila invoice sudah terbit — backend menolak perubahan
        // unitPrice pada kondisi ini.
        hasInvoices: Array.isArray(order.invoices)
            ? (order.invoices as unknown[]).length > 0
            : false,
        items: items.map((item) => ({
            id: String(item.id),
            productVariantId: String(item.productVariantId),
            productName:
                (
                    (item.productVariant as Record<string, unknown>)
                        ?.product as { name?: string }
                )?.name ?? '',
            variantName:
                ((item.productVariant as { name?: string })?.name as string) ??
                '',
            quantity: Number(item.quantity),
            unitPrice: Number(item.unitPrice),
            discountPercent: item.discountPercent
                ? Number(item.discountPercent)
                : 0,
            taxPercent: item.taxPercent ? Number(item.taxPercent) : 0,
            dppOtherAmount:
                item.dppOtherAmount != null ? Number(item.dppOtherAmount) : null,
            ppnMode:
                (item.ppnMode as 'INCLUDE' | 'EXCLUDE' | undefined) ??
                'EXCLUDE',
            isFreeItem: Boolean(item.isFreeItem),
            deliveredQty: Number(item.deliveredQty ?? 0),
        })),
    };

    return (
        <EditOrderClient order={serializedOrder} products={serializedProducts} />
    );
}
