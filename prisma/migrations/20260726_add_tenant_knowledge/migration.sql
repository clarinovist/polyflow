-- TenantKnowledgeArticle: private SOP and knowledge per tenant
CREATE TABLE "TenantKnowledgeArticle" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',
    "bodyMd" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "modules" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sensitivity" TEXT NOT NULL DEFAULT 'INTERNAL',
    "allowedResources" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "source" TEXT NOT NULL DEFAULT 'HUMAN',
    "version" INTEGER NOT NULL DEFAULT 1,
    "publishedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantKnowledgeArticle_pkey" PRIMARY KEY ("id")
);

-- Unique constraint: slug per tenant
CREATE UNIQUE INDEX "TenantKnowledgeArticle_tenantId_slug_key" ON "TenantKnowledgeArticle"("tenantId", "slug");

-- Indexes for retrieval
CREATE INDEX "TenantKnowledgeArticle_tenantId_status_updatedAt_idx" ON "TenantKnowledgeArticle"("tenantId", "status", "updatedAt" DESC);
CREATE INDEX "TenantKnowledgeArticle_tenantId_status_modules_idx" ON "TenantKnowledgeArticle"("tenantId", "status", "modules");

-- TenantAlias: terminology dictionary per tenant
CREATE TABLE "TenantAlias" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantAlias_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TenantAlias_tenantId_term_key" ON "TenantAlias"("tenantId", "term");
