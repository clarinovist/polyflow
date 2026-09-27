-- Expand-only foundation for central identities and explicit tenant memberships.
-- The Prisma schema is shared by MAIN and tenant databases. Platform rows belong
-- only in MAIN; tenant databases receive the empty tables so migrations remain uniform.

CREATE TYPE "UserAuthMode" AS ENUM ('LOCAL', 'CENTRAL');
CREATE TYPE "GlobalAccountStatus" AS ENUM ('ACTIVE', 'SUSPENDED');
CREATE TYPE "TenantMembershipStatus" AS ENUM ('PENDING', 'ACTIVE', 'REVOKED');
CREATE TYPE "TenantInvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED');

ALTER TABLE "User"
  ADD COLUMN "authMode" "UserAuthMode" NOT NULL DEFAULT 'LOCAL',
  ADD COLUMN "centralAccountId" TEXT,
  ADD COLUMN "centralAuthVersion" INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX "User_centralAccountId_key" ON "User"("centralAccountId");

CREATE TABLE "GlobalAccount" (
  "id" TEXT NOT NULL,
  "issuer" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "emailVerified" BOOLEAN NOT NULL DEFAULT false,
  "status" "GlobalAccountStatus" NOT NULL DEFAULT 'ACTIVE',
  "revocationVersion" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GlobalAccount_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GlobalAccount_verified_email_required" CHECK (NOT "emailVerified" OR length(trim("email")) > 0)
);

CREATE UNIQUE INDEX "GlobalAccount_issuer_subject_key" ON "GlobalAccount"("issuer", "subject");
CREATE INDEX "GlobalAccount_email_idx" ON "GlobalAccount"("email");
CREATE INDEX "GlobalAccount_status_idx" ON "GlobalAccount"("status");

CREATE TABLE "TenantMembership" (
  "id" TEXT NOT NULL,
  "globalAccountId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "tenantUserId" TEXT NOT NULL,
  "status" "TenantMembershipStatus" NOT NULL DEFAULT 'PENDING',
  "membershipVersion" INTEGER NOT NULL DEFAULT 0,
  "activatedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TenantMembership_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TenantMembership_status_timestamps" CHECK (
    ("status" = 'PENDING' AND "activatedAt" IS NULL AND "revokedAt" IS NULL) OR
    ("status" = 'ACTIVE' AND "activatedAt" IS NOT NULL AND "revokedAt" IS NULL) OR
    ("status" = 'REVOKED' AND "revokedAt" IS NOT NULL)
  ),
  CONSTRAINT "TenantMembership_globalAccountId_fkey" FOREIGN KEY ("globalAccountId") REFERENCES "GlobalAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TenantMembership_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "TenantMembership_globalAccountId_tenantId_key" ON "TenantMembership"("globalAccountId", "tenantId");
CREATE UNIQUE INDEX "TenantMembership_tenantId_tenantUserId_key" ON "TenantMembership"("tenantId", "tenantUserId");
CREATE INDEX "TenantMembership_tenantId_status_idx" ON "TenantMembership"("tenantId", "status");
CREATE INDEX "TenantMembership_globalAccountId_status_idx" ON "TenantMembership"("globalAccountId", "status");

CREATE TABLE "TenantInvitation" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "tenantUserId" TEXT NOT NULL,
  "recipientEmailNormalized" TEXT NOT NULL,
  "role" "Role" NOT NULL,
  "tokenDigest" TEXT NOT NULL,
  "status" "TenantInvitationStatus" NOT NULL DEFAULT 'PENDING',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "acceptedByAccountId" TEXT,
  "acceptedAt" TIMESTAMP(3),
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TenantInvitation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TenantInvitation_email_normalized" CHECK (
    "recipientEmailNormalized" = lower(trim("recipientEmailNormalized")) AND
    length("recipientEmailNormalized") > 3
  ),
  CONSTRAINT "TenantInvitation_acceptance_shape" CHECK (
    ("status" = 'ACCEPTED' AND "acceptedByAccountId" IS NOT NULL AND "acceptedAt" IS NOT NULL) OR
    ("status" <> 'ACCEPTED' AND "acceptedByAccountId" IS NULL AND "acceptedAt" IS NULL)
  ),
  CONSTRAINT "TenantInvitation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TenantInvitation_acceptedByAccountId_fkey" FOREIGN KEY ("acceptedByAccountId") REFERENCES "GlobalAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "TenantInvitation_tokenDigest_key" ON "TenantInvitation"("tokenDigest");
CREATE UNIQUE INDEX "TenantInvitation_one_pending_actor" ON "TenantInvitation"("tenantId", "tenantUserId") WHERE "status" = 'PENDING';
CREATE INDEX "TenantInvitation_tenantId_status_expiresAt_idx" ON "TenantInvitation"("tenantId", "status", "expiresAt");
CREATE INDEX "TenantInvitation_tenantId_tenantUserId_idx" ON "TenantInvitation"("tenantId", "tenantUserId");
CREATE INDEX "TenantInvitation_recipientEmailNormalized_status_idx" ON "TenantInvitation"("recipientEmailNormalized", "status");

CREATE TABLE "CentralIdentityEvent" (
  "id" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "globalAccountId" TEXT,
  "tenantId" TEXT,
  "tenantUserId" TEXT,
  "invitationId" TEXT,
  "actorType" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "details" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CentralIdentityEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CentralIdentityEvent_globalAccountId_fkey" FOREIGN KEY ("globalAccountId") REFERENCES "GlobalAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CentralIdentityEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "CentralIdentityEvent_globalAccountId_createdAt_idx" ON "CentralIdentityEvent"("globalAccountId", "createdAt");
CREATE INDEX "CentralIdentityEvent_tenantId_createdAt_idx" ON "CentralIdentityEvent"("tenantId", "createdAt");
CREATE INDEX "CentralIdentityEvent_action_createdAt_idx" ON "CentralIdentityEvent"("action", "createdAt");
