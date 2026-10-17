import { verifyCronAuth } from '@/lib/core/cron-auth';
import { runProductLearning } from '@/services/admin/product-learning.service';

export async function GET(request: Request) {
    const authorization = verifyCronAuth(request);
    if (!authorization.ok) return new Response(authorization.body, { status: authorization.status });
    try {
        const result = await runProductLearning();
        const failed = ['FAILED', 'POLICY_CONFLICT', 'POLICY_REQUIRED'].includes(result.state);
        return Response.json(result, { status: failed ? 503 : 200, headers: { 'Cache-Control': 'no-store' } });
    } catch {
        // No raw database errors, query parameters or data in operational logs.
        console.error('[ProductLearning] JOB_FAILED');
        return Response.json({ state: 'JOB_FAILED' }, { status: 503 });
    }
}
