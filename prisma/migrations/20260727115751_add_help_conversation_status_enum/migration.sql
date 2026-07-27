-- CreateEnum
CREATE TYPE "HelpConversationStatus" AS ENUM ('ACTIVE', 'CLOSED', 'EXPIRED');

-- Drop default first, then alter type, then set new default
ALTER TABLE "HelpConversation" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "HelpConversation" ALTER COLUMN "status" TYPE "HelpConversationStatus" 
  USING ("status"::"HelpConversationStatus");
ALTER TABLE "HelpConversation" ALTER COLUMN "status" SET DEFAULT 'ACTIVE'::"HelpConversationStatus";
