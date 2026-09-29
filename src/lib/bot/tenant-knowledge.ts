import { prisma, tenantContext, tenantIdContext } from '@/lib/core/prisma';
import { Prisma, type TenantKnowledgeArticle } from '@prisma/client';
import type { AssistantUserContext } from './assistant-types';
import { searchHelpArticles } from './help-articles';
import { helpSearchTerms } from './help-search-terms';
import { isFeatureEnabled } from './feature-flags';
import { escapeDocumentLike } from './document-search';
export type CombinedKnowledgeResult = {
    id: string; slug: string; title: string; summary: string; bodyExcerpt: string;
    source: 'global-kb' | 'tenant-kb';
};

/** Read only; published tenant rows never cross a live tenant or resource boundary. */
export async function searchCombinedKnowledge(query: string, module: string | undefined, context: AssistantUserContext | undefined, limit = 3): Promise<CombinedKnowledgeResult[]> {
    const cap = Math.max(1, Math.min(5, limit));
    const global = (await searchHelpArticles(query, module, cap)).map(r => ({ ...r, id: r.slug, source: 'global-kb' as const }));
    if (!isFeatureEnabled('assistant.tenantKnowledge') || !context?.tenantId || !context.userId) return global;
    const db = tenantContext.getStore();
    if (!db || tenantIdContext.getStore() !== context.tenantId) throw new Error('Konteks tenant knowledge tidak cocok.');
    const terms = helpSearchTerms(query).flat().slice(0, 12);
    if (!terms.length) return global;
    const matches = Prisma.join(terms.map(term => {
        const pattern = '%' + escapeDocumentLike(term) + '%';
        return Prisma.sql`(a.title ILIKE ${pattern} OR a.summary ILIKE ${pattern} OR a."bodyMd" ILIKE ${pattern})`;
    }), ' OR ');
    const resourceGrants = context.allowedResources === 'ALL' ? Prisma.sql`TRUE` : Prisma.sql`NOT EXISTS (
        SELECT 1 FROM unnest(a."allowedResources") required(resource)
        WHERE NOT EXISTS (SELECT 1 FROM unnest(${context.allowedResources}::text[]) granted(resource)
            WHERE required.resource = granted.resource OR left(required.resource, length(granted.resource) + 1) = granted.resource || '/')
    )`;
    const tenant = await db.$transaction(async tx => {
        await tx.$executeRaw`SET TRANSACTION READ ONLY`;
        return tx.$queryRaw<CombinedKnowledgeResult[]>(Prisma.sql`
            SELECT a.id, a.slug, a.title, a.summary, LEFT(a."bodyMd", 6000) AS "bodyExcerpt", 'tenant-kb' AS source
            FROM "TenantKnowledgeArticle" a
            WHERE a."tenantId" = ${context.tenantId} AND a.status = 'PUBLISHED'
                AND a.sensitivity = 'INTERNAL' AND (${resourceGrants}) AND (${matches})
                ${module ? Prisma.sql`AND ${module} = ANY(a.modules)` : Prisma.empty}
            ORDER BY a."updatedAt" DESC, a.id ASC LIMIT ${cap}
        `);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 5000 });
    // Reserve a slot for each source when both match; private SOP cannot be drowned by global KB.
    return tenant.length ? [...tenant.slice(0, global.length ? Math.max(1, cap - 1) : cap), ...global].slice(0, cap) : global;
}

const MAX_BODY_LENGTH = 50000;
const MAX_TITLE_LENGTH = 200;
const MAX_SUMMARY_LENGTH = 500;

// ---------------------------------------------------------------------------
// Audit helper
// ---------------------------------------------------------------------------

async function auditTenantKnowledge(input: {
    action: string;
    articleId: string;
    tenantId: string;
    userId?: string;
    details?: string;
}): Promise<void> {
    try {
        await prisma.auditLog.create({
            data: {
                userId: input.userId || 'system',
                action: input.action,
                entityType: 'TenantKnowledgeArticle',
                entityId: input.articleId,
                details: input.details,
            },
        });
    } catch {
        // Non-blocking — audit failure should not break CRUD
    }
}
// ---------------------------------------------------------------------------
// CRUD Operations (tenant-scoped)
// ---------------------------------------------------------------------------

export async function createTenantKnowledge(input: {
    tenantId: string;
    slug: string;
    title: string;
    summary?: string;
    bodyMd: string;
    modules?: string[];
    tags?: string[];
    sensitivity?: 'INTERNAL' | 'RESTRICTED';
    allowedResources?: string[];
    createdBy?: string;
}): Promise<TenantKnowledgeArticle> {
    const article = await prisma.tenantKnowledgeArticle.create({
        data: {
            tenantId: input.tenantId,
            slug: input.slug,
            title: input.title.slice(0, MAX_TITLE_LENGTH),
            summary: (input.summary ?? '').slice(0, MAX_SUMMARY_LENGTH),
            bodyMd: input.bodyMd.slice(0, MAX_BODY_LENGTH),
            modules: input.modules ?? [],
            tags: input.tags ?? [],
            sensitivity: input.sensitivity ?? 'INTERNAL',
            allowedResources: input.allowedResources ?? [],
            source: 'HUMAN',
            status: 'DRAFT',
            createdBy: input.createdBy,
            updatedBy: input.createdBy,
        },
    });

    await auditTenantKnowledge({
        action: 'KNOWLEDGE_CREATE',
        articleId: article.id,
        tenantId: input.tenantId,
        userId: input.createdBy,
        details: `Created article: ${input.title}`,
    });

    return article;
}