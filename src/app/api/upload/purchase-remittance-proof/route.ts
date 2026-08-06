import { NextRequest, NextResponse } from 'next/server';
import { requirePurchasingRemittanceCreator } from '@/lib/auth/purchasing-access';
import {
    getTenantPrefix,
    buildRemittanceProofKey,
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

function guessImageTypeFromName(name: string): string {
    const ext = name.split('.').pop()?.toLowerCase() ?? '';
    if (['jpg', 'jpeg', 'heic', 'heif'].includes(ext)) return 'image/jpeg';
    if (ext === 'png') return 'image/png';
    if (ext === 'webp') return 'image/webp';
    return '';
}

function isAllowedImageType(mime: string, filename: string): boolean {
    // iOS Safari/WA-shared screenshots: empty MIME; infer from filename
    if (!mime) {
        const guessed = guessImageTypeFromName(filename);
        return guessed.startsWith('image/');
    }
    return ALLOWED_IMAGE_TYPES.includes(mime);
}

export async function POST(request: NextRequest) {
    try {
        const session = await requirePurchasingRemittanceCreator();

        const formData = await request.formData();
        const file = formData.get('file') as File | null;

        if (!file) {
            return NextResponse.json(
                { error: 'No file provided' },
                { status: 400 },
            );
        }

        if (!isAllowedImageType(file.type, file.name)) {
            return NextResponse.json(
                {
                    error: 'Tipe file tidak didukung. Gunakan JPG, PNG, WebP, atau HEIC.',
                },
                { status: 400 },
            );
        }

        if (file.size > MAX_SIZE) {
            return NextResponse.json(
                { error: 'File terlalu besar. Maksimal 10MB.' },
                { status: 400 },
            );
        }

        const tenant = await getTenantPrefix();
        const key = buildRemittanceProofKey(tenant, session.user.id, file.name);

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
        console.error('Purchase remittance proof upload error:', error);
        const message =
            error instanceof Error ? error.message : 'Upload failed';
        return NextResponse.json(
            { error: `Upload gagal: ${message}` },
            { status: 500 },
        );
    }
}
