import { auth } from '@/auth';
import { withTenantRoute } from '@/lib/core/tenant';
import { getTenantIdFromContext } from '@/lib/core/prisma';
import { NextRequest, NextResponse } from 'next/server';
import { createTenantKnowledge } from '@/lib/bot/tenant-knowledge';

const MAX_IMPORT_SIZE = 50000;
const MAX_ARTICLES_PER_REQUEST = 10;

export const POST = withTenantRoute(async function POST(req: NextRequest) {
    const session = await auth();
    if (!session?.user) {
        return NextResponse.json(
            { success: false, error: 'Unauthorized' },
            { status: 401 },
        );
    }

    const tenantId = getTenantIdFromContext();
    if (!tenantId) {
        return NextResponse.json(
            { success: false, error: 'Tenant context missing' },
            { status: 400 },
        );
    }
    const userId = (session.user as { id?: string }).id;

    const body = (await req.json().catch(() => null)) as {
        articles?: Array<{
            slug: string;
            title: string;
            summary?: string;
            bodyMd: string;
            modules?: string[];
            tags?: string[];
            sensitivity?: 'INTERNAL' | 'RESTRICTED';
        }>;
    } | null;

    if (!body?.articles || !Array.isArray(body.articles)) {
        return NextResponse.json(
            { success: false, error: 'articles array is required.' },
            { status: 400 },
        );
    }

    if (body.articles.length > MAX_ARTICLES_PER_REQUEST) {
        return NextResponse.json(
            {
                success: false,
                error: `Maximum ${MAX_ARTICLES_PER_REQUEST} articles per request.`,
            },
            { status: 400 },
        );
    }

    const results: Array<{ slug: string; success: boolean; error?: string }> =
        [];

    for (const article of body.articles) {
        try {
            if (!article.slug || !article.title || !article.bodyMd) {
                results.push({
                    slug: article.slug || 'unknown',
                    success: false,
                    error: 'Missing required fields (slug, title, bodyMd)',
                });
                continue;
            }

            if (article.bodyMd.length > MAX_IMPORT_SIZE) {
                results.push({
                    slug: article.slug,
                    success: false,
                    error: `Body too long (max ${MAX_IMPORT_SIZE} chars)`,
                });
                continue;
            }

            await createTenantKnowledge({
                tenantId,
                slug: article.slug,
                title: article.title,
                summary: article.summary,
                bodyMd: article.bodyMd,
                modules: article.modules,
                tags: article.tags,
                sensitivity: article.sensitivity,
                createdBy: userId,
            });

            results.push({ slug: article.slug, success: true });
        } catch (error) {
            results.push({
                slug: article.slug,
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    }

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;

    return NextResponse.json({
        success: true,
        data: {
            imported: successCount,
            failed: failCount,
            results,
        },
    });
});
