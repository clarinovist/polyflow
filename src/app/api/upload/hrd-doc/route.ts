import { NextRequest, NextResponse } from 'next/server';
import { unstable_rethrow } from 'next/navigation';
import { requireAuth } from '@/lib/tools/auth-checks';
import { getTenantPrefix, buildHrdDocKey, uploadToR2 } from '@/lib/storage/r2';
import { requireModuleFromRequest } from '@/lib/modules/guard';
import { hasAnyRole } from '@/lib/auth/roles';
import {
    HRD_DOC_FINANCE_ROLES,
    rolesForHrdDocCategory,
    type HrdDocCategory,
} from '@/lib/hrd/hrd-doc-access';

const MAX_BYTES = 2 * 1024 * 1024; // 2 MB
const ENTITY_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/** Allowed content types and the trusted storage extension for each. */
const EXTENSION_BY_TYPE: ReadonlyMap<string, string> = new Map([
    ['application/pdf', 'pdf'],
    ['image/jpeg', 'jpg'],
    ['image/png', 'png'],
    ['image/webp', 'webp'],
    ['image/heic', 'heic'],
    ['image/heif', 'heif'],
]);

/** Allowed content types by file-name extension (used only when MIME is empty). */
const TYPE_BY_EXTENSION: ReadonlyMap<string, string> = new Map([
    ['pdf', 'application/pdf'],
    ['jpg', 'image/jpeg'],
    ['jpeg', 'image/jpeg'],
    ['png', 'image/png'],
    ['webp', 'image/webp'],
    ['heic', 'image/heic'],
    ['heif', 'image/heif'],
]);

function guessTypeFromName(name: string): string | null {
    const dot = name.lastIndexOf('.');
    if (dot < 0) return null;
    return TYPE_BY_EXTENSION.get(name.slice(dot + 1).toLowerCase()) ?? null;
}

/**
 * Effective content type: the declared MIME when it is allowed, the file-name
 * guess only when no MIME was declared, otherwise null (reject).
 */
function resolveEffectiveType(mime: string, name: string): string | null {
    const declared = mime.trim().toLowerCase();
    if (!declared) return guessTypeFromName(name);
    const normalised = declared === 'image/jpg' ? 'image/jpeg' : declared;
    return EXTENSION_BY_TYPE.has(normalised) ? normalised : null;
}

function parseCategory(raw: string): HrdDocCategory {
    if (raw === 'leave' || raw === 'loan' || raw === 'employee') return raw;
    return 'disciplinary';
}

function forbidden() {
    return NextResponse.json(
        { error: 'Anda tidak memiliki akses untuk mengunggah dokumen HRD' },
        { status: 403 },
    );
}

function badRequest(error: string) {
    return NextResponse.json({ error }, { status: 400 });
}

export async function POST(req: NextRequest) {
    try {
        // ── Module entitlement guard: HRD documents belong to HRD ──
        const moduleDeny = await requireModuleFromRequest(req, 'HRD');
        if (moduleDeny) return moduleDeny;

        const session = await requireAuth();
        // Coarse gate before parsing the body; the per-category check follows below.
        if (!hasAnyRole(session.user, [...HRD_DOC_FINANCE_ROLES])) return forbidden();

        const formData = await req.formData();
        const file = formData.get('file') as File | null;
        const entityId = formData.get('entityId') as string | null;
        const category = parseCategory(
            (formData.get('category') as string | null) ?? 'disciplinary',
        );

        if (!hasAnyRole(session.user, [...rolesForHrdDocCategory(category)])) {
            return forbidden();
        }

        if (!file || !entityId) {
            return badRequest('file and entityId are required');
        }
        if (!ENTITY_ID_PATTERN.test(entityId)) {
            return badRequest('entityId is invalid');
        }
        const effectiveType = resolveEffectiveType(file.type || '', file.name);
        if (!effectiveType) {
            return badRequest('Only PDF, JPEG, PNG, WebP, HEIC allowed');
        }
        if (file.size > MAX_BYTES) {
            return badRequest('File size must be under 2MB');
        }

        const tenant = await getTenantPrefix();
        // Key extension comes from the verified type, never from the client name.
        const trustedName = `document.${EXTENSION_BY_TYPE.get(effectiveType)}`;
        const key = buildHrdDocKey(tenant, category, entityId, trustedName);
        const buffer = Buffer.from(await file.arrayBuffer());
        const publicUrl = await uploadToR2(key, buffer, effectiveType);

        return NextResponse.json({ success: true, publicUrl, key });
    } catch (error) {
        // Redirect ke /login (sesi habis) bukan kegagalan, lempar ulang.
        unstable_rethrow(error);
        console.error('Failed to upload HRD document:', error);
        return NextResponse.json(
            { error: 'Failed to upload document' },
            { status: 500 },
        );
    }
}
