import { requireLearningOwner } from '@/lib/learning/authorization';
import { getProductLearningOverview, learningBrief } from '@/services/admin/product-learning.service';

export async function GET(request: Request) {
    try { await requireLearningOwner(); } catch { return new Response('Forbidden', { status: 403 }); }
    const area = new URL(request.url).searchParams.get('module') || undefined;
    if (area && !['assistant', 'mobile', 'analytics'].includes(area)) return new Response('Invalid module', { status: 400 });
    try {
        const overview = await getProductLearningOverview();
        return new Response(learningBrief(overview.findings, area), {
            headers: { 'Content-Type': 'text/markdown; charset=utf-8', 'Cache-Control': 'private, no-store', 'Content-Disposition': 'attachment; filename="product-learning.md"' },
        });
    } catch {
        return new Response('Learning unavailable', { status: 503 });
    }
}
