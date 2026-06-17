SELECT current_database() AS db;

SELECT
  COUNT(*) FILTER (WHERE p.name = 'Produk FINISHED GOOD Rafia') AS fg_variant_total,
  COUNT(*) FILTER (WHERE pv."skuCode" LIKE 'MLD-BJ-%') AS mld_bj_variant_total
FROM "ProductVariant" pv
JOIN "Product" p ON p.id = pv."productId";
