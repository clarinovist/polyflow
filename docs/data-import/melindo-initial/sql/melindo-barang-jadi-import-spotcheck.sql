SELECT "skuCode", name, "primaryUnit"
FROM "ProductVariant"
WHERE "skuCode" IN ('RBS0760', 'RRS0810', 'MLD-BJ-001', 'MLD-BJ-010', 'MLD-BJ-030')
ORDER BY "skuCode";
