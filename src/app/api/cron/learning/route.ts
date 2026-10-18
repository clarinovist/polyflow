import { verifyCronAuth } from '@/lib/core/cron-auth';
import { runProductLearning } from '@/services/admin/product-learning.service';
import { runOwnerLearning } from '@/services/admin/owner-learning.service';

export async function GET(request: Request) {
    const authorization = verifyCronAuth(request);
    if (!authorization.ok) return new Response(authorization.body, { status: authorization.status });
    try {
        // Independent jobs: an owner-tenant failure must not stop global product learning.
        const [product, owner] = await Promise.allSettled([runProductLearning(), runOwnerLearning()]);
        const result = product.status === 'fulfilled' ? product.value : { state: 'JOB_FAILED', processed: 0 };
        const ownerResult = owner.status === 'fulfilled' ? owner.value : { state: 'JOB_FAILED', processed: 0 };
        const failed = ['FAILED', 'POLICY_CONFLICT', 'POLICY_REQUIRED', 'JOB_FAILED'].includes(result.state) ||
            ['PARTIAL_FAILED', 'POLICY_REQUIRED', 'OWNER_UNAVAILABLE', 'JOB_FAILED'].includes(ownerResult.state);
        return Response.json({ ...result, owner: ownerResult }, { status: failed ? 503 : 200, headers: { 'Cache-Control': 'no-store' } });
    } catch {
        // No raw database errors, query parameters or data in operational logs.
        console.error('[ProductLearning] JOB_FAILED');
        return Response.json({ state: 'JOB_FAILED' }, { status: 503 });
    }
}
