import { NextRequest, NextResponse } from 'next/server';
import {
    getTenantPrefix,
    buildAttendancePhotoKey,
    uploadToR2,
} from '@/lib/storage/r2';
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

        console.log('[attendance-photo] request', { employeeId, kind });

        if (!EMP_ID_RE.test(employeeId) || employeeId.length > 64) {
            console.warn('[attendance-photo] rejected', {
                reason: 'invalid_employee_id',
                employeeId,
            });
            return NextResponse.json(
                { error: 'Invalid employeeId' },
                { status: 400 },
            );
        }

        // Resolve tenant DB correctly (route not under withTenantRoute)
        // For kiosk selfies the check must run against the tenant DB (kiyowo), not main polyflow.
        const tenantResult = await resolveTenantContext(req.headers);
        let tenantDb = null as ReturnType<typeof getMainPrisma> | null;
        if (tenantResult.type === 'RESOLVED') {
            tenantDb = tenantResult.tenantDb as unknown as ReturnType<typeof getMainPrisma>;
        } else if (tenantResult.type === 'NOT_FOUND') {
            // Tenant missing - but allow fallback to main for superadmin/debug, log warning
            console.warn(
                `[attendance-photo] Tenant not found for subdomain=${tenantResult.subdomain}, falling back to main DB`,
            );
        }
        const db = tenantDb ?? getMainPrisma();

        // Tenant isolation + ensure employee exists and active for this tenant DB
        const empExists = await db.employee.findFirst({
            where: { id: employeeId, status: 'ACTIVE' },
            select: { id: true },
        });
        if (!empExists) {
            console.warn('[attendance-photo] rejected', {
                reason: 'employee_not_found',
                employeeId,
            });
            return NextResponse.json(
                { error: 'Employee not found or inactive' },
                { status: 404 },
            );
        }

        const mime = file.type || '';
        if (mime && !ALLOWED_TYPES.includes(mime)) {
            const guessed = guessImageTypeFromName(file.name);
            if (!guessed || !ALLOWED_TYPES.includes(guessed)) {
                console.warn('[attendance-photo] rejected', {
                    reason: 'invalid_mime',
                    employeeId,
                    mime,
                });
                return NextResponse.json(
                    { error: 'Only JPEG, PNG, WebP, and HEIC images are allowed' },
                    { status: 400 },
                );
            }
        }

        if (file.size > MAX_BYTES) {
            console.warn('[attendance-photo] rejected', {
                reason: 'file_too_large',
                employeeId,
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
            employeeId,
            kind,
            file.name,
        );
        const buffer = Buffer.from(await file.arrayBuffer());
        const publicUrl = await uploadToR2(key, buffer, file.type);

        console.log('[attendance-photo] success', { employeeId, kind, key });
        return NextResponse.json({ success: true, publicUrl, key });
    } catch (error) {
        console.error('Failed to upload attendance photo:', error);
        return NextResponse.json(
            { error: 'Failed to upload photo' },
            { status: 500 },
        );
    }
}
