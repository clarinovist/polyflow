import { NextRequest, NextResponse } from 'next/server';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { headers } from 'next/headers';
import { auth } from '@/auth';
import { extractSubdomain } from '@/lib/core/subdomain';
import { r2Client, BUCKET } from '@/lib/storage/r2';
import { hasAnyRole } from '@/lib/auth/roles';
import { HRD_DOC_FINANCE_ROLES, rolesForHrdDocCategory } from '@/lib/hrd/hrd-doc-access';

/**
 * Proxy endpoint for R2 images.
 * Serves images through the same domain — no CORS issues, no R2 public access needed.
 * Usage: /api/images/kiyowo/production/xxx/photo.jpg
 *
 * Access rules (hardening 2026-10-21):
 *  - only image extensions are served, so DB dumps (`*.sql.gz`, `*.dump`) are unreachable;
 *  - backup/archive path segments are rejected outright — those keys are deterministic per
 *    date, which previously made every tenant database downloadable without a login;
 *  - a key must belong to the tenant that owns the request host (anonymous kiosk keeps
 *    working), or to the signed-in user's own tenant; super admins may read any tenant;
 *  - HRD documents (`<tenant>/hrd-docs/<category>/...`) additionally need a signed-in user of
 *    that tenant (or a super admin) whose role fits the category (ADMIN/HRD, plus FINANCE for
 *    loans) — a matching host alone is not enough;
 *  - employee attendance selfies (`<tenant>/attendance/...`) need a signed-in ADMIN/FINANCE/HRD
 *    user of that tenant (or a super admin); the kiosk does not display them;
 *  - the response Content-Type comes from the key extension, never from storage metadata,
 *    and is sent with `nosniff`.
 */
const CONTENT_TYPE_BY_EXTENSION: ReadonlyMap<string, string> = new Map([
    ['jpg', 'image/jpeg'],
    ['jpeg', 'image/jpeg'],
    ['png', 'image/png'],
    ['webp', 'image/webp'],
]);
const ALLOWED_EXTENSIONS: ReadonlySet<string> = new Set(CONTENT_TYPE_BY_EXTENSION.keys());

const HRD_DOCS_SEGMENT = 'hrd-docs';
const ATTENDANCE_SEGMENT = 'attendance';

/** Path segments that must never be served by the image proxy. */
const BLOCKED_SEGMENTS = new Set(['backups', 'backup', 'archive', 'dump', 'dumps', 'exports']);

const notFound = () => new NextResponse('Image not found', { status: 404 });

/** Tenant subdomain implied by the current request host, if any. */
async function requestSubdomain(): Promise<string | null> {
    try {
        const headersList = await headers();
        const host = headersList.get('host') || '';
        const forwardedHost = headersList.get('x-forwarded-host') || '';
        return extractSubdomain(host) || extractSubdomain(forwardedHost) || null;
    } catch {
        return null;
    }
}

/** True when the caller may read objects under `<tenantPrefix>/...`. */
async function isAllowedForCaller(tenantPrefix: string): Promise<boolean> {
    const subdomain = await requestSubdomain();
    if (subdomain && subdomain.toLowerCase() === tenantPrefix) return true;

    const session = await auth().catch(() => null);
    const user = session?.user;
    if (!user) return false;
    if (user.isSuperAdmin) return true;
    return user.tenantSubdomain?.toLowerCase() === tenantPrefix;
}

function isHrdDocKey(path: string[]): boolean {
    return path[1]?.toLowerCase() === HRD_DOCS_SEGMENT;
}

function isAttendanceKey(path: string[]): boolean {
    return path[1]?.toLowerCase() === ATTENDANCE_SEGMENT;
}

/** Signed-in user of the owning tenant (or a super admin) holding one of `roles`. */
async function isAllowedForRoles(
    tenantPrefix: string,
    roles: readonly string[],
): Promise<boolean> {
    const session = await auth().catch(() => null);
    const user = session?.user;
    if (!user) return false;
    if (user.isSuperAdmin) return true;
    if (!hasAnyRole(user, [...roles])) return false;
    return user.tenantSubdomain?.toLowerCase() === tenantPrefix;
}

/** Access check for the key's prefix; only HRD documents and selfies need a role. */
function isAllowedForKey(path: string[], tenantPrefix: string): Promise<boolean> {
    if (isHrdDocKey(path)) {
        return isAllowedForRoles(tenantPrefix, rolesForHrdDocCategory(path[2]));
    }
    if (isAttendanceKey(path)) {
        return isAllowedForRoles(tenantPrefix, HRD_DOC_FINANCE_ROLES);
    }
    return isAllowedForCaller(tenantPrefix);
}

function contentTypeForKey(key: string): string {
    const extension = key.split('.').pop()!.toLowerCase();
    return CONTENT_TYPE_BY_EXTENSION.get(extension) ?? 'application/octet-stream';
}

/** Storage key from a route path, or null when the path is not a usable image key. */
function resolveImageKey(rawPath: string[] | undefined): string | null {
    const segments = rawPath ?? [];

    if (segments.length < 2) return null;

    // Reject empty and traversal segments instead of normalising them away.
    if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
        return null;
    }

    if (segments.some((segment) => BLOCKED_SEGMENTS.has(segment.toLowerCase()))) {
        return null;
    }

    const filename = segments[segments.length - 1];
    const extension = filename.includes('.')
        ? filename.split('.').pop()!.toLowerCase()
        : '';
    if (!ALLOWED_EXTENSIONS.has(extension)) return null;

    return segments.join('/');
}

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ path: string[] }> },
) {
    try {
        const { path } = await params;

        if (!path || path.length === 0) {
            return new NextResponse('Missing path', { status: 400 });
        }

        const key = resolveImageKey(path);
        if (!key) {
            return notFound();
        }

        const tenantPrefix = path[0].toLowerCase();
        if (!(await isAllowedForKey(path, tenantPrefix))) {
            return notFound();
        }

        const command = new GetObjectCommand({
            Bucket: BUCKET,
            Key: key,
        });

        const response = await r2Client.send(command);

        if (!response.Body) {
            return notFound();
        }

        // Transform to stream for NextResponse
        const stream = response.Body.transformToWebStream();

        return new NextResponse(stream, {
            status: 200,
            headers: {
                'Content-Type': contentTypeForKey(key),
                'X-Content-Type-Options': 'nosniff',
                // Per-tenant access: do not let shared caches reuse the response.
                'Cache-Control': 'private, max-age=86400',
            },
        });
    } catch (error) {
        console.error('Image proxy error:', error);
        return notFound();
    }
}
