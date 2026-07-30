import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/tools/auth-checks';
import {
    getTenantPrefix,
    buildCustomerPhotoKey,
    uploadToR2,
} from '@/lib/storage/r2';

const ALLOWED_TYPES = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
];
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

function guessImageTypeFromName(name: string): string {
    const ext = name.split('.').pop()?.toLowerCase() ?? '';
    if (['jpg', 'jpeg', 'heic', 'heif'].includes(ext)) return 'image/jpeg';
    if (ext === 'png') return 'image/png';
    if (ext === 'webp') return 'image/webp';
    return '';
}

export async function POST(request: NextRequest) {
    try {
        await requireAuth();

        const formData = await request.formData();
        const file = formData.get('file') as File | null;
        const customerId = formData.get('customerId') as string | null;

        if (!file) {
            return NextResponse.json(
                { error: 'No file provided' },
                { status: 400 },
            );
        }

        const mime = file.type || '';
        if (mime && !ALLOWED_TYPES.includes(mime)) {
            const guessed = guessImageTypeFromName(file.name);
            if (!guessed || !ALLOWED_TYPES.includes(guessed)) {
                return NextResponse.json(
                    { error: 'File type not allowed. Use JPG, PNG, WebP, or HEIC.' },
                    { status: 400 },
                );
            }
        }

        if (file.size > MAX_SIZE) {
            return NextResponse.json(
                { error: 'File too large. Maximum size is 5MB.' },
                { status: 400 },
            );
        }

        const tenant = await getTenantPrefix();
        const key = customerId
            ? buildCustomerPhotoKey(tenant, customerId, file.name)
            : `${tenant}/uploads/${Date.now()}.${file.name.split('.').pop()}`;

        const buffer = Buffer.from(await file.arrayBuffer());
        const publicUrl = await uploadToR2(key, buffer, file.type);

        return NextResponse.json({ success: true, url: publicUrl, key });
    } catch (error) {
        console.error('Upload error:', error);
        return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
    }
}
