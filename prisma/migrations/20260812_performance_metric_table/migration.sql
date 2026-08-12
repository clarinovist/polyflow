-- Migration: PerformanceMetric — generic timing samples per route, written by
-- server actions (fire-and-forget) and read by the superadmin panel
-- (admin.polyflow.uk/admin/performance) to track query/render latency over
-- time instead of relying on one-off EXPLAIN ANALYZE checks.
-- plan: docs/plan/2026-08-12-spk-list-performance-metrics.md
-- Date: 2026-08-12

-- CreateTable
CREATE TABLE "PerformanceMetric" (
    "id" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PerformanceMetric_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PerformanceMetric_route_createdAt_idx" ON "PerformanceMetric"("route", "createdAt");
