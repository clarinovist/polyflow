import { NextRequest, NextResponse } from 'next/server';
import { withTenantRoute } from '@/lib/core/tenant';
import { requireAuth } from '@/lib/tools/auth-checks';
import {
    requireAnyModuleOrNextResponse,
    requireModuleOrNextResponse,
} from '@/lib/modules/guard';
import type { EscpDocument } from '@/services/printing/escp-documents';
import { buildDeliveryNoteDocument } from '@/services/printing/escp-delivery-document';
import { buildInvoiceDocument } from '@/services/printing/escp-invoice-document';
import { escpAttachmentResponse } from '@/services/printing/escp-download';
import {
    parseBundleDocs,
    type BundleDocRef,
} from '@/services/printing/escp-bundle';

function buildDocument(ref: BundleDocRef): Promise<EscpDocument | null> {
    return ref.type === 'delivery'
        ? buildDeliveryNoteDocument(ref.id)
        : buildInvoiceDocument(ref.id);
}

export const GET = withTenantRoute(async (req: NextRequest) => {
    try {
        const { docs, error } = parseBundleDocs(
            req.nextUrl.searchParams.getAll('doc'),
        );
        if (error) {
            return NextResponse.json({ error }, { status: 400 });
        }

        // Entitlement is checked per document type actually requested, so a
        // tenant without FINANCE can still bundle delivery notes — but cannot
        // slip an invoice through this endpoint.
        if (docs.some((doc) => doc.type === 'invoice')) {
            const denied = await requireModuleOrNextResponse('FINANCE');
            if (denied) return denied;
        }
        if (docs.some((doc) => doc.type === 'delivery')) {
            const denied = await requireAnyModuleOrNextResponse([
                'SALES',
                'INVENTORY',
            ]);
            if (denied) return denied;
        }

        await requireAuth();

        const bytes: number[] = [];
        let firstDocumentNumber = '';

        for (const ref of docs) {
            const document = await buildDocument(ref);
            // Never silently skip: the operator must know a document is
            // missing rather than discover it after the goods have left.
            if (!document) {
                return NextResponse.json(
                    { error: `Document not found: ${ref.type}:${ref.id}` },
                    { status: 404 },
                );
            }
            bytes.push(...document.bytes);
            if (!firstDocumentNumber) {
                firstDocumentNumber = document.documentNumber;
            }
        }

        return escpAttachmentResponse(bytes, `${firstDocumentNumber}-bundle`);
    } catch (error) {
        console.error('[ESC/P Bundle] Error:', error);
        return NextResponse.json(
            { error: 'Failed to generate ESC/P file' },
            { status: 500 },
        );
    }
});
