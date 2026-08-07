/**
 * Surat Jalan: database row → ESC/P byte stream.
 *

 * See docs/plan/2026-08-07-escp-surat-jalan-dan-cetak-gabungan.md.
 */

import { prisma } from '@/lib/core/prisma';
import { getCompanyConfigWithOverridesAsync } from '@/lib/config/company-settings';
import { loadLogoBitmap, type EscpDocument } from './escp-documents';
import {
    generateEscpDeliveryNote,
    type EscpDeliveryData,
} from './escp-delivery';

/**
 * Surat Jalan. Returns null when the id does not exist so the caller can
 * answer 404 — never a half-printed document.
 */
export async function buildDeliveryNoteDocument(
    deliveryOrderId: string,
): Promise<EscpDocument | null> {
    const order = await prisma.deliveryOrder.findUnique({
        where: { id: deliveryOrderId },
        include: {
            salesOrder: { include: { customer: true } },
            vehicle: true,
            items: {
                include: {
                    productVariant: { include: { product: true } },
                },
            },
        },
    });

    if (!order) return null;

    const company = await getCompanyConfigWithOverridesAsync();
    const logoBitmap = await loadLogoBitmap(company);
    const customer = order.salesOrder?.customer;

    const escpData: EscpDeliveryData = {
        companyName: company.name,
        companyAddress: company.address.replace(/\n/g, ', '),
        companyPhone: company.phone,
        companyWhatsapp: company.whatsapp,
        companyEmail: company.email,
        customerName: customer?.name || '-',
        // Same fallback chain as the HTML version, so both prints agree.
        destinationAddress:
            order.destinationAddress ||
            customer?.shippingAddress ||
            customer?.billingAddress ||
            '-',
        deliveryNumber: order.orderNumber,
        deliveryDate: new Date(order.deliveryDate),
        salesOrderNumber: order.salesOrder?.orderNumber || '',
        vehiclePlate: order.vehicle?.plateNumber || '',
        items: order.items.map((item) => ({
            name:
                item.productVariant?.product?.name ||
                item.productVariant?.name ||
                '-',
            qty: Number(item.enteredQuantity ?? item.quantity ?? 0),
            unit:
                item.enteredUnit ||
                item.productVariant?.salesUnit ||
                item.productVariant?.primaryUnit ||
                '',
            note: item.notes || '',
        })),
        paperHeightCm: company.paperSize.heightCm,
        paperWidthCm: company.paperSize.widthCm,
        logoBitmap,
    };

    return {
        bytes: generateEscpDeliveryNote(escpData),
        documentNumber: order.orderNumber,
    };
}
