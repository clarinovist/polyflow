import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/tools/auth-checks';
import {
    getTenantPrefix,
    buildWarehouseAttachmentKey,
    uploadToR2,
} from '@/lib/storage/r2';

const ALLOWED_IMAGE_TYPES = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

const VALID_CHECKPOINTS = ['LOAD', 'UNLOAD', 'DAMAGE', 'RECEIPT', 'OPNAME'];
const VALID_DOC_TYPES = ['PHOTO', 'SURAT_JALAN', 'NOTA_INVOICE', 'BERITA_ACARA', 'OTHER'];

function guessImageTypeFromName(name: string): string {
    const ext = name.split('.').pop()?.toLowerCase() ?? '';
    if (['jpg', 'jpeg', 'heic', 'heif'].includes(ext)) return 'image/jpeg';
    if (ext === 'png') return 'image/png';
    if (ext === 'webp') return 'image/webp';
    return '';
}

function isAllowedImageType(mime: string, filename: string): boolean {
    // iOS Safari: empty MIME from camera capture; infer from filename
    if (!mime) {
        const guessed = guessImageTypeFromName(filename);
        return guessed.startsWith('image/');
    }
    return ALLOWED_IMAGE_TYPES.includes(mime);
}

export async function POST(request: NextRequest) {
    try {
        await requireAuth();

        const formData = await request.formData();
        const file = formData.get('file') as File | null;
        const deliveryOrderId = formData.get('deliveryOrderId') as string | null;
        const goodsReceiptId = formData.get('goodsReceiptId') as string | null;
        const purchaseOrderId = formData.get('purchaseOrderId') as string | null;
        const stockOpnameId = formData.get('stockOpnameId') as string | null;
        const stockOpnameItemId = formData.get('stockOpnameItemId') as string | null;
        const checkpoint = formData.get('checkpoint') as string | null;
        const documentType = formData.get('documentType') as string | null;

        if (!file) {
            return NextResponse.json(
                { error: 'No file provided' },
                { status: 400 },
            );
        }

        const refs = [deliveryOrderId, goodsReceiptId, purchaseOrderId, stockOpnameId, stockOpnameItemId];
        if (!refs.some(Boolean)) {
            return NextResponse.json(
                { error: 'At least one entity reference required' },
                { status: 400 },
            );
        }

        const refCount = refs.filter(Boolean).length;
        if (refCount > 1 && !(stockOpnameId && stockOpnameItemId && refCount === 2)) {
            return NextResponse.json(
                { error: 'Only one entity reference allowed (stockOpnameId + stockOpnameItemId pair is OK)' },
                { status: 400 },
            );
        }

        if (!checkpoint || !VALID_CHECKPOINTS.includes(checkpoint)) {
            return NextResponse.json(
                { error: `checkpoint must be one of: ${VALID_CHECKPOINTS.join(', ')}` },
                { status: 400 },
            );
        }

        const docType = documentType || 'PHOTO';
        if (!VALID_DOC_TYPES.includes(docType)) {
            return NextResponse.json(
                { error: `documentType must be one of: ${VALID_DOC_TYPES.join(', ')}` },
                { status: 400 },
            );
        }

        if (docType === 'PHOTO') {
            if (!isAllowedImageType(file.type, file.name)) {
                return NextResponse.json(
                    { error: 'Tipe file tidak didukung. Gunakan JPG, PNG, WebP, HEIC, atau PDF.' },
                    { status: 400 },
                );
            }
        } else {
            // Document: image + pdf allowed; empty MIME inferred from name
            const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
            if (!isPdf && !isAllowedImageType(file.type, file.name)) {
                return NextResponse.json(
                    { error: 'Tipe file tidak didukung. Gunakan JPG, PNG, WebP, HEIC, atau PDF.' },
                    { status: 400 },
                );
            }
        }

        if (file.size > MAX_SIZE) {
            return NextResponse.json(
                { error: 'File terlalu besar. Maksimal 10MB.' },
                { status: 400 },
            );
        }

        const tenant = await getTenantPrefix();
        const entityId = deliveryOrderId || goodsReceiptId || purchaseOrderId || stockOpnameId || stockOpnameItemId!;
        const entityType = deliveryOrderId ? 'do' : goodsReceiptId ? 'gr' : purchaseOrderId ? 'po' : 'opname';
        const key = buildWarehouseAttachmentKey(
            tenant,
            entityType,
            entityId,
            checkpoint,
            file.name,
        );

        const buffer = Buffer.from(await file.arrayBuffer());
        const publicUrl = await uploadToR2(key, buffer, file.type);

        return NextResponse.json({
            success: true,
            url: publicUrl,
            key,
            originalName: file.name,
            mimeType: file.type,
            sizeBytes: file.size,
        });
    } catch (error) {
        console.error('Warehouse attachment upload error:', error);
        const message = error instanceof Error ? error.message : 'Upload failed';
        // Avoid leaking credentials but keep useful context
        return NextResponse.json({ error: `Upload gagal: ${message}` }, { status: 500 });
    }
}
