SELECT code, name, type, category
FROM "Account"
WHERE name ILIKE '%opening%'
   OR name ILIKE '%saldo awal%'
   OR name ILIKE '%penyesuaian%'
   OR name ILIKE '%sementara%'
   OR name ILIKE '%laba%'
   OR name ILIKE '%modal%'
ORDER BY code;