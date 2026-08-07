import { NextRequest, NextResponse } from 'next/server';
import { withTenantRoute } from '@/lib/core/tenant';
import { requireAuth } from '@/lib/tools/auth-checks';
import { requireModuleOrNextResponse } from '@/lib/modules/guard';
import { buildInvoiceDocument } from '@/services/printing/escp-invoice-document';
import { escpAttachmentResponse } from '@/services/printing/escp-download';

export const GET = withTenantRoute(async (req: NextRequest) => {
    try {
        // ── Module entitlement guard ──
        const denied = await requireModuleOrNextResponse('FINANCE');
        if (denied) return denied;

        await requireAuth();

        const invoiceId = req.nextUrl.searchParams.get('id');
        if (!invoiceId) {
            return NextResponse.json(
                { error: 'Missing invoice id' },
                { status: 400 },
            );
        }

        const document = await buildInvoiceDocument(invoiceId);
        if (!document) {
            return NextResponse.json(
                { error: 'Invoice not found' },
                { status: 404 },
            );
        }

        return escpAttachmentResponse(document.bytes, document.documentNumber);
    } catch (error) {
        console.error('[ESC/P Download] Error:', error);
        return NextResponse.json(
            { error: 'Failed to generate ESC/P file' },
            { status: 500 },
        );
    }
});
