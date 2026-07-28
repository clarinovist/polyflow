-- Transform role PROCUREMENT resource permission /finance/invoices to /purchasing/invoices
INSERT INTO "RolePermission" ("id", "role", "resource", "canAccess", "createdAt", "updatedAt")
SELECT 
    gen_random_uuid()::text,
    "role",
    '/purchasing/invoices',
    "canAccess",
    NOW(),
    NOW()
FROM "RolePermission"
WHERE "role" = 'PROCUREMENT'::"Role" AND "resource" = '/finance/invoices'
ON CONFLICT ("role", "resource") DO UPDATE 
SET "canAccess" = EXCLUDED."canAccess", "updatedAt" = NOW();

DELETE FROM "RolePermission" 
WHERE "role" = 'PROCUREMENT'::"Role" AND "resource" = '/finance/invoices';
