SELECT code, name, type, category
FROM "Account"
WHERE name ILIKE '%konstruksi%'
   OR name ILIKE '%pengerjaan%'
   OR name ILIKE '%wip%'
   OR name ILIKE '%dalam proses%'
ORDER BY code;