-- CreateConversation: persistent chat conversations for the AI assistant
CREATE TABLE "HelpConversation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'web',
    "title" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "summary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HelpConversation_pkey" PRIMARY KEY ("id")
);

-- CreateMessage: individual messages in a conversation
CREATE TABLE "HelpMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "evidenceJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HelpMessage_pkey" PRIMARY KEY ("id")
);

-- CreateToolExecution: audit trail for tool calls within conversations
CREATE TABLE "HelpToolExecution" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "interactionId" TEXT,
    "toolName" TEXT NOT NULL,
    "permissionResource" TEXT NOT NULL DEFAULT '',
    "allowed" BOOLEAN NOT NULL DEFAULT true,
    "outcome" TEXT NOT NULL DEFAULT 'SUCCESS',
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "evidenceMetaJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HelpToolExecution_pkey" PRIMARY KEY ("id")
);

-- Indexes for HelpConversation
CREATE INDEX "HelpConversation_tenantId_userId_lastMessageAt_idx" ON "HelpConversation"("tenantId", "userId", "lastMessageAt" DESC);
CREATE INDEX "HelpConversation_tenantId_status_idx" ON "HelpConversation"("tenantId", "status");

-- Indexes for HelpMessage
CREATE INDEX "HelpMessage_conversationId_createdAt_idx" ON "HelpMessage"("conversationId", "createdAt" ASC);

-- Indexes for HelpToolExecution
CREATE INDEX "HelpToolExecution_conversationId_idx" ON "HelpToolExecution"("conversationId");
CREATE INDEX "HelpToolExecution_toolName_idx" ON "HelpToolExecution"("toolName");

-- Add conversationId to HelpInteraction for linking
ALTER TABLE "HelpInteraction" ADD COLUMN "conversationId" TEXT;

-- Add citedSlugs to HelpInteraction for evidence tracking
ALTER TABLE "HelpInteraction" ADD COLUMN "citedSlugs" TEXT[];
