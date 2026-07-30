import { NextRequest, NextResponse } from 'next/server';
import {
    getTenantPrefix,
    buildAttendancePhotoKey,
    uploadToR2,
} from '@/lib/storage/r2';
import { getEmployeeSession } from '@/lib/auth/employee-session';
import { resolveTenantContext } from '@/lib/core/tenant';
import { getMainPrisma } from '@/lib/core/prisma';

const ALLOWED_TYPES = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
];
const MAX_BYTES = 1 * 1024 * 1024; // 1MB

function guessImageTypeFromName(name: string): string {
    const ext = name.split('.').pop()?.toLowerCase() ?? '';
    if (['jpg', 'jpeg', 'heic', 'heif'].includes(ext)) return 'image/jpeg';
    if (ext === 'png') return 'image/png';
    if (ext === 'webp') return 'image/webp';
    return '';
}

export async function POST(req: NextRequest) {
    try {
        // Session-bound — cookie path /my, so /api/... cannot read it.
        // This route lives under /my so emp_session cookie is sent.
        const session = await getEmployeeSession().catch(() => null);
        if (!session) {
            console.warn('[attendance-photo:my] rejected', {
                reason: 'unauthorized',
            });
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Resolve tenant DB correctly (self-service portal under /my)
        const tenantResult = await resolveTenantContext(req.headers);
        let tenantDb = null as ReturnType<typeof getMainPrisma> | null;
        if (tenantResult.type === 'RESOLVED') {
            tenantDb = tenantResult.tenantDb as unknown as ReturnType<typeof getMainPrisma>;
        }
        const db = tenantDb ?? getMainPrisma();

        const emp = await db.employee.findUnique({
            where: { id: session.employeeId },
            select: { id: true, status: true },
        });
        if (!emp || emp.status !== 'ACTIVE') {
            console.warn('[attendance-photo:my] rejected', {
                reason: 'unauthorized',
                employeeId: session.employeeId,
            });
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const formData = await req.formData();
        const file = formData.get('file') as File | null;
        const kindRaw = (formData.get('kind') as string | null) ?? 'clock_in';
        const kind = kindRaw === 'clock_out' ? 'clock_out' : 'clock_in';

        console.log('[attendance-photo:my] request', {
            employeeId: session.employeeId,
            kind,
        });

        if (!file) {
            console.warn('[attendance-photo:my] rejected', {
                reason: 'file_missing',
                employeeId: session.employeeId,
            });
            return NextResponse.json({ error: 'file is required' }, { status: 400 });
        }

        const mime = file.type || '';
        if (mime && !ALLOWED_TYPES.includes(mime)) {
            const guessed = guessImageTypeFromName(file.name);
            if (!guessed || !ALLOWED_TYPES.includes(guessed)) {
                console.warn('[attendance-photo:my] rejected', {
                    reason: 'invalid_mime',
                    employeeId: session.employeeId,
                    mime,
                });
                return NextResponse.json(
                    { error: 'Only JPEG, PNG, WebP, and HEIC images are allowed' },
                    { status: 400 },
                );
            }
        }

        if (file.size > MAX_BYTES) {
            console.warn('[attendance-photo:my] rejected', {
                reason: 'file_too_large',
                employeeId: session.employeeId,
                size: file.size,
            });
            return NextResponse.json(
                { error: 'File size must be under 1MB' },
                { status: 400 },
            );
        }

        const tenant = await getTenantPrefix();
        const key = buildAttendancePhotoKey(
            tenant,
            session.employeeId,
            kind,
            file.name,
        );
        const buffer = Buffer.from(await file.arrayBuffer());
        const publicUrl = await uploadToR2(key, buffer, file.type);

        console.log('[attendance-photo:my] success', {
            employeeId: session.employeeId,
            kind,
            key,
        });
        return NextResponse.json({ success: true, publicUrl, key });
    } catch (error) {
        console.error('Failed to upload attendance photo (my):', error);
        return NextResponse.json(
            { error: 'Failed to upload photo' },
            { status: 500 },
        );
    }
}
