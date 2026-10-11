-- Correct a hybrid-COA suspense classification without relying on tenant identity.
-- Account 1-199 is the canonical suspense-clearing account, not cash or bank.
-- Guard every identifying attribute so other tenants and similarly-coded accounts
-- remain untouched. Re-running is idempotent.
UPDATE "Account"
SET "isCashAccount" = false,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "code" = '1-199'
  AND "name" = 'Rekening Sementara'
  AND "type" = 'ASSET'
  AND "category" = 'CURRENT_ASSET'
  AND "isCashAccount" = true;
