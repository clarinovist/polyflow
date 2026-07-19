import { NextRequest, NextResponse } from 'next/server';
import { getTenantPrefix, buildHrdDocKey, uploadToR2 } from '@/lib/storage/r2';

const ALLOWED_TYPES = [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
];
const MAX_BYTES = 2 * 1024 * 1024; // 2 MB

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        const file = formData.get('file') as File | null;
        const entityId = formData.get('entityId') as string | null;
        const categoryRaw = (formData.get('category') as string | null) ?? 'disciplinary';
        const category: 'disciplinary' | 'leave' | 'loan' | 'employee' =
            categoryRaw === 'leave'
                ? 'leave'
                : categoryRaw === 'loan'
                  ? 'loan'
                  : categoryRaw === 'employee'
                    ? 'employee'
                    : 'disciplinary';

        if (!file || !entityId) {
            return NextResponse.json({ error: 'file and entityId are required' }, { status: 400 });
        }
        if (!ALLOWED_TYPES.includes(file.type)) {
            return NextResponse.json({ error: 'Only PDF, JPEG, PNG, WebP allowed' }, { status: 400 });
        }
        if (file.size > MAX_BYTES) {
            return NextResponse.json({ error: 'File size must be under 2MB' }, { status: 400 });
        }

        const tenant = await getTenantPrefix();
        const key = buildHrdDocKey(tenant, category, entityId, file.name);
        const buffer = Buffer.from(await file.arrayBuffer());
        const publicUrl = await uploadToR2(key, buffer, file.type);

        return NextResponse.json({ success: true, publicUrl, key });
    } catch (error) {
        console.error('Failed to upload HRD document:', error);
        return NextResponse.json({ error: 'Failed to upload document' }, { status: 500 });
    }
}
