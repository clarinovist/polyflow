import { NextRequest, NextResponse } from 'next/server';
import { withTenantRoute } from '@/lib/core/tenant';
import { requireAuth } from '@/lib/tools/auth-checks';
import { requireAnyModuleOrNextResponse } from '@/lib/modules/guard';
import { buildDeliveryNoteDocument } from '@/services/printing/escp-delivery-document';
import { escpAttachmentResponse } from '@/services/printing/escp-download';

export const GET = withTenantRoute(async (req: NextRequest) => {
    try {
        // A delivery note is reachable from /sales and from /warehouse, and
        // the OPERATIONS package has INVENTORY without SALES — either
        // entitlement is enough.
        const denied = await requireAnyModuleOrNextResponse([
            'SALES',
            'INVENTORY',
        ]);
        if (denied) return denied;

        await requireAuth();

        const deliveryOrderId = req.nextUrl.searchParams.get('id');
        if (!deliveryOrderId) {
            return NextResponse.json(
                { error: 'Missing delivery order id' },
                { status: 400 },
            );
        }

        const document = await buildDeliveryNoteDocument(deliveryOrderId);
        if (!document) {
            return NextResponse.json(
                { error: 'Delivery order not found' },
                { status: 404 },
            );
        }

        return escpAttachmentResponse(document.bytes, document.documentNumber);
    } catch (error) {
        console.error('[ESC/P Delivery] Error:', error);
        return NextResponse.json(
            { error: 'Failed to generate ESC/P file' },
            { status: 500 },
        );
    }
});
