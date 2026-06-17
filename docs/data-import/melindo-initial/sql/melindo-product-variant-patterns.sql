SELECT pv."skuCode", pv.name, pv."primaryUnit", pv."salesUnit", pv."conversionFactor", pv.attributes
FROM "ProductVariant" pv
JOIN "Product" p ON p.id = pv."productId"
WHERE p.name = 'Produk FINISHED GOOD Rafia'
  AND (
    pv.name ILIKE 'Rafia %'
    OR pv.name ILIKE 'Sedotan %'
  )
ORDER BY pv.name
LIMIT 80;
