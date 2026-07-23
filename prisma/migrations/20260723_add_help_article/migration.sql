-- CreateEnum
CREATE TYPE "HelpArticleStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "HelpArticleSource" AS ENUM ('SEED', 'HUMAN', 'AUTO_LEARN');

-- CreateTable
CREATE TABLE "HelpArticle" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',
    "bodyMd" TEXT NOT NULL,
    "status" "HelpArticleStatus" NOT NULL DEFAULT 'DRAFT',
    "locale" TEXT NOT NULL DEFAULT 'id',
    "modules" TEXT[],
    "tags" TEXT[],
    "errorCodes" TEXT[],
    "source" "HelpArticleSource" NOT NULL DEFAULT 'SEED',
    "version" INTEGER NOT NULL DEFAULT 1,
    "publishedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "helpfulCount" INTEGER NOT NULL DEFAULT 0,
    "notHelpfulCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HelpArticle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HelpArticle_slug_key" ON "HelpArticle"("slug");

-- CreateIndex
CREATE INDEX "HelpArticle_status_createdAt_idx" ON "HelpArticle"("status", "createdAt");

-- CreateIndex
CREATE INDEX "HelpArticle_slug_idx" ON "HelpArticle"("slug");

-- CreateIndex
CREATE INDEX "HelpArticle_status_modules_idx" ON "HelpArticle"("status", "modules");
