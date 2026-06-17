SELECT code, name, email, phone
FROM "Customer"
WHERE name IN ('AEPUDIN', 'AGAPE JAYA PRATAMA, CV', 'GANDA GUNA BOX')
ORDER BY name;

SELECT code, name, email, phone
FROM "Supplier"
WHERE name IN ('AGUS SUPRIYANTO', 'AGUNG JAYA', 'CIPTA PLASTIK NUSANTARA, PT')
ORDER BY name;
