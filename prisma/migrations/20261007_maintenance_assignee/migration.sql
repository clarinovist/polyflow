-- Link a maintenance assignment to an active application user.
-- assigneeName is retained for existing rows and immutable display history.
ALTER TABLE "MaintenanceRequest" ADD COLUMN "assigneeId" TEXT;

CREATE INDEX "MaintenanceRequest_assigneeId_status_idx"
ON "MaintenanceRequest"("assigneeId", "status");

ALTER TABLE "MaintenanceRequest"
ADD CONSTRAINT "MaintenanceRequest_assigneeId_fkey"
FOREIGN KEY ("assigneeId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- Existing FACTORY_MANAGER installations were already seeded before this route
-- existed, so add the nested grant idempotently for every tenant database.
INSERT INTO "RolePermission" ("id", "role", "resource", "canAccess", "createdAt", "updatedAt")
VALUES (gen_random_uuid()::text, 'FACTORY_MANAGER', '/production/maintenance', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("role", "resource") DO NOTHING;
