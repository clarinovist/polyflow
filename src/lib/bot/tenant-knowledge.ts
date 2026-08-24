import { prisma } from '@/lib/core/prisma';import type {
    TenantKnowledgeArticle,
    } from '@prisma/client';
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