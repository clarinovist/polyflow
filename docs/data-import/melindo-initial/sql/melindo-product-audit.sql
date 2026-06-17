SELECT current_database() AS db;

SELECT p.name AS product_name, p."productType", a_rev.code AS revenue_code, a_rev.name AS revenue_name,
       a_inv.code AS inventory_code, a_inv.name AS inventory_name,
       a_cogs.code AS cogs_code, a_cogs.name AS cogs_name,
       a_wip.code AS wip_code, a_wip.name AS wip_name,
       COUNT(pv.id) AS variant_count
FROM "Product" p
LEFT JOIN "ProductVariant" pv ON pv."productId" = p.id
LEFT JOIN "Account" a_rev ON a_rev.id = p."revenueAccountId"
LEFT JOIN "Account" a_inv ON a_inv.id = p."inventoryAccountId"
LEFT JOIN "Account" a_cogs ON a_cogs.id = p."cogsAccountId"
LEFT JOIN "Account" a_wip ON a_wip.id = p."wipAccountId"
GROUP BY p.id, p.name, p."productType", a_rev.code, a_rev.name, a_inv.code, a_inv.name, a_cogs.code, a_cogs.name, a_wip.code, a_wip.name
ORDER BY p.name;

SELECT pv."primaryUnit", COUNT(*)
FROM "ProductVariant" pv
GROUP BY pv."primaryUnit"
ORDER BY pv."primaryUnit";

SELECT pv."skuCode", pv.name, pv."primaryUnit", p.name AS parent_product
FROM "ProductVariant" pv
JOIN "Product" p ON p.id = pv."productId"
WHERE pv.name ILIKE '%pack%' OR pv.name ILIKE '%karton%' OR pv."skuCode" ILIKE '%PACK%' OR pv."skuCode" ILIKE '%KRT%'
ORDER BY pv.name
LIMIT 100;

SELECT pv."skuCode", pv.name, pv."primaryUnit", p.name AS parent_product
FROM "ProductVariant" pv
JOIN "Product" p ON p.id = pv."productId"
ORDER BY pv.name
LIMIT 40;
