import { NextRequest, NextResponse } from 'next/server';
import {
    getTenantPrefix,
    buildAttendancePhotoKey,
    uploadToR2,
} from '@/lib/storage/r2';
import { prisma } from '@/lib/core/prisma';

const ALLOWED_TYPES = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
];
const MAX_BYTES = 1 * 1024 * 1024; // 1MB post-compress
const EMP_ID_RE = /^[a-zA-Z0-9_-]+$/;

function guessImageTypeFromName(name: string): string {
    const ext = name.split('.').pop()?.toLowerCase() ?? '';
    if (['jpg', 'jpeg', 'heic', 'heif'].includes(ext)) return 'image/jpeg';
    if (ext === 'png') return 'image/png';
    if (ext === 'webp') return 'image/webp';
    return '';
}

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        const file = formData.get('file') as File | null;
        const employeeId = (formData.get('employeeId') as string | null)?.trim() || null;
        const kindRaw = (formData.get('kind') as string | null) ?? 'clock_in';
        const kind = kindRaw === 'clock_out' ? 'clock_out' : 'clock_in';

        if (!file || !employeeId) {
            return NextResponse.json(
                { error: 'file and employeeId are required' },
                { status: 400 },
            );
        }

        if (!EMP_ID_RE.test(employeeId) || employeeId.length > 64) {
            return NextResponse.json(
                { error: 'Invalid employeeId' },
                { status: 400 },
            );
        }

        // Tenant isolation + ensure employee exists and active for this tenant DB
        const empExists = await prisma.employee.findFirst({
            where: { id: employeeId, status: 'ACTIVE' },
            select: { id: true },
        });
        if (!empExists) {
            return NextResponse.json(
                { error: 'Employee not found or inactive' },
                { status: 404 },
            );
        }

        const mime = file.type || '';
        if (mime && !ALLOWED_TYPES.includes(mime)) {
            const guessed = guessImageTypeFromName(file.name);
            if (!guessed || !ALLOWED_TYPES.includes(guessed)) {
                return NextResponse.json(
                    { error: 'Only JPEG, PNG, WebP, and HEIC images are allowed' },
                    { status: 400 },
                );
            }
        }

        if (file.size > MAX_BYTES) {
            return NextResponse.json(
                { error: 'File size must be under 1MB' },
                { status: 400 },
            );
        }

        const tenant = await getTenantPrefix();
        const key = buildAttendancePhotoKey(
            tenant,
            employeeId,
            kind,
            file.name,
        );
        const buffer = Buffer.from(await file.arrayBuffer());
        const publicUrl = await uploadToR2(key, buffer, file.type);

        return NextResponse.json({ success: true, publicUrl, key });
    } catch (error) {
        console.error('Failed to upload attendance photo:', error);
        return NextResponse.json(
            { error: 'Failed to upload photo' },
            { status: 500 },
        );
    }
}
