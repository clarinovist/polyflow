import { auth } from '@/auth';
import { resolveTenantContext } from '@/lib/core/tenant';
import { ownerLearningPolicy } from '@/lib/learning/owner-contracts';

/** Tenant-specific transparency; never exposes the owner ID or tenant allowlist. */
export async function GET(request: Request) {
    const session = await auth();
    if (!session?.user?.id) return Response.json({ active: false }, { status: 401 });
    const policy = ownerLearningPolicy();
    if (!policy.enabled) return Response.json({ active: false });
    const tenant = await resolveTenantContext(request.headers);
    const active = tenant.type === 'RESOLVED' && policy.tenantIds.includes(tenant.tenantId);
    return Response.json({ active, ...(active ? { version: policy.version } : {}) }, { headers: { 'Cache-Control': 'private, no-store' } });
}
