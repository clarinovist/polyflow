-- Melindo Rafia Sales Import
-- Generated from Penjualan spreadsheet

-- Invoice: 55/INV/V/2026 -> OB-AR-0014 (Customer: JANTAN, TOKO)
INSERT INTO "SalesOrder" (id, "orderNumber", "customerId", "orderDate", "expectedDate", "orderType", status, "totalAmount", "createdAt", "updatedAt")
VALUES ('so-0014', 'OB-AR-0014', 'e2b6de17-718b-406d-80cc-7cead8fcb0eb', '2026-06-02'::timestamp, '2026-06-02'::timestamp, 'MAKE_TO_STOCK', 'CONFIRMED', 8160000.00, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z');
INSERT INTO "SalesOrderItem" (id, "salesOrderId", "productVariantId", quantity, "unitPrice", subtotal, "deliveredQty", "createdAt", "updatedAt")
SELECT 'so-0014-item-2de00a2d', 'so-0014', id, 32.0, 255000.0, 8160000.0, 32.0, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z' FROM "ProductVariant" WHERE "skuCode" = 'MLD-BJ-015';

-- Invoice: 56/INV/V/2026 -> OB-AR-0015 (Customer: PLASTIK SAMUDRA)
INSERT INTO "SalesOrder" (id, "orderNumber", "customerId", "orderDate", "expectedDate", "orderType", status, "totalAmount", "createdAt", "updatedAt")
VALUES ('so-0015', 'OB-AR-0015', '8c1ad62c-0237-4771-8197-baa9e5ee11ec', '2026-06-02'::timestamp, '2026-06-16'::timestamp, 'MAKE_TO_STOCK', 'CONFIRMED', 51650000.00, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z');
INSERT INTO "SalesOrderItem" (id, "salesOrderId", "productVariantId", quantity, "unitPrice", subtotal, "deliveredQty", "createdAt", "updatedAt")
SELECT 'so-0015-item-39ea2565', 'so-0015', id, 325.0, 122000.0, 39650000.0, 325.0, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z' FROM "ProductVariant" WHERE "skuCode" = 'RHK1010';
INSERT INTO "SalesOrderItem" (id, "salesOrderId", "productVariantId", quantity, "unitPrice", subtotal, "deliveredQty", "createdAt", "updatedAt")
SELECT 'so-0015-item-7b2af7bc', 'so-0015', id, 50.0, 160000.0, 8000000.0, 50.0, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z' FROM "ProductVariant" WHERE "skuCode" = 'RMK1010';
INSERT INTO "SalesOrderItem" (id, "salesOrderId", "productVariantId", quantity, "unitPrice", subtotal, "deliveredQty", "createdAt", "updatedAt")
SELECT 'so-0015-item-34db115f', 'so-0015', id, 25.0, 160000.0, 4000000.0, 25.0, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z' FROM "ProductVariant" WHERE "skuCode" = 'RRK0110';

-- Invoice: 01/INV/VI/2026 -> OB-AR-0016 (Customer: BAROKAH PLASTIK)
INSERT INTO "SalesOrder" (id, "orderNumber", "customerId", "orderDate", "expectedDate", "orderType", status, "totalAmount", "createdAt", "updatedAt")
VALUES ('so-0016', 'OB-AR-0016', '85577c3a-3831-48b2-89ab-5fdb9a6e2c6d', '2026-06-03'::timestamp, '2026-06-17'::timestamp, 'MAKE_TO_STOCK', 'CONFIRMED', 21700000.00, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z');
INSERT INTO "SalesOrderItem" (id, "salesOrderId", "productVariantId", quantity, "unitPrice", subtotal, "deliveredQty", "createdAt", "updatedAt")
SELECT 'so-0016-item-e82f41b0', 'so-0016', id, 40.0, 235000.0, 9400000.0, 40.0, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z' FROM "ProductVariant" WHERE "skuCode" = 'MLD-BJ-013';
INSERT INTO "SalesOrderItem" (id, "salesOrderId", "productVariantId", quantity, "unitPrice", subtotal, "deliveredQty", "createdAt", "updatedAt")
SELECT 'so-0016-item-fcf2dbad', 'so-0016', id, 100.0, 123000.0, 12300000.0, 100.0, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z' FROM "ProductVariant" WHERE "skuCode" = 'RHK1010';

-- Invoice: 02/INV/VI/2026 -> OB-AR-0017 (Customer: UDIN)
INSERT INTO "SalesOrder" (id, "orderNumber", "customerId", "orderDate", "expectedDate", "orderType", status, "totalAmount", "createdAt", "updatedAt")
VALUES ('so-0017', 'OB-AR-0017', 'd5ab1a14-7a89-4c1f-943e-98a9018167e2', '2026-06-03'::timestamp, '2026-06-03'::timestamp, 'MAKE_TO_STOCK', 'CONFIRMED', 500000.00, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z');
INSERT INTO "SalesOrderItem" (id, "salesOrderId", "productVariantId", quantity, "unitPrice", subtotal, "deliveredQty", "createdAt", "updatedAt")
SELECT 'so-0017-item-26f70f38', 'so-0017', id, 25.0, 20000.0, 500000.0, 25.0, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z' FROM "ProductVariant" WHERE "skuCode" = 'BJ000015';

-- Invoice: 03/INV/VI/2026 -> OB-AR-0018 (Customer: KISWANTO)
INSERT INTO "SalesOrder" (id, "orderNumber", "customerId", "orderDate", "expectedDate", "orderType", status, "totalAmount", "createdAt", "updatedAt")
VALUES ('so-0018', 'OB-AR-0018', 'f6451b82-9f50-4da0-ae52-bb78d6e1ff6c', '2026-06-03'::timestamp, '2026-06-03'::timestamp, 'MAKE_TO_STOCK', 'CONFIRMED', 290000.00, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z');
INSERT INTO "SalesOrderItem" (id, "salesOrderId", "productVariantId", quantity, "unitPrice", subtotal, "deliveredQty", "createdAt", "updatedAt")
SELECT 'so-0018-item-b7cd8483', 'so-0018', id, 1.0, 290000.0, 290000.0, 1.0, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z' FROM "ProductVariant" WHERE "skuCode" = 'MLD-BJ-015';

-- Invoice: 04/INV/VI/2026 -> OB-AR-0019 (Customer: ALI)
INSERT INTO "SalesOrder" (id, "orderNumber", "customerId", "orderDate", "expectedDate", "orderType", status, "totalAmount", "createdAt", "updatedAt")
VALUES ('so-0019', 'OB-AR-0019', '8e8e301f-432d-44a2-95cc-218a5394c41e', '2026-06-04'::timestamp, '2026-06-04'::timestamp, 'MAKE_TO_STOCK', 'CONFIRMED', 49911500.00, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z');
INSERT INTO "SalesOrderItem" (id, "salesOrderId", "productVariantId", quantity, "unitPrice", subtotal, "deliveredQty", "createdAt", "updatedAt")
SELECT 'so-0019-item-1891b4b1', 'so-0019', id, 3010.1, 10700.0, 32208500.0, 3010.1, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z' FROM "ProductVariant" WHERE "skuCode" = 'RHK0000';
INSERT INTO "SalesOrderItem" (id, "salesOrderId", "productVariantId", quantity, "unitPrice", subtotal, "deliveredQty", "createdAt", "updatedAt")
SELECT 'so-0019-item-874b7431', 'so-0019', id, 30.0, 99000.0, 2970000.0, 30.0, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z' FROM "ProductVariant" WHERE "skuCode" = 'RWM0410';
INSERT INTO "SalesOrderItem" (id, "salesOrderId", "productVariantId", quantity, "unitPrice", subtotal, "deliveredQty", "createdAt", "updatedAt")
SELECT 'so-0019-item-93fea139', 'so-0019', id, 10.0, 99000.0, 990000.0, 10.0, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z' FROM "ProductVariant" WHERE "skuCode" = 'RRS0410';
INSERT INTO "SalesOrderItem" (id, "salesOrderId", "productVariantId", quantity, "unitPrice", subtotal, "deliveredQty", "createdAt", "updatedAt")
SELECT 'so-0019-item-4ffffffa', 'so-0019', id, 100.0, 93800.0, 9380000.0, 100.0, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z' FROM "ProductVariant" WHERE "skuCode" = 'RWM0760';
INSERT INTO "SalesOrderItem" (id, "salesOrderId", "productVariantId", quantity, "unitPrice", subtotal, "deliveredQty", "createdAt", "updatedAt")
SELECT 'so-0019-item-8e714b65', 'so-0019', id, 10.0, 108000.0, 1080000.0, 10.0, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z' FROM "ProductVariant" WHERE "skuCode" = 'RBS0760';
INSERT INTO "SalesOrderItem" (id, "salesOrderId", "productVariantId", quantity, "unitPrice", subtotal, "deliveredQty", "createdAt", "updatedAt")
SELECT 'so-0019-item-09aef5b3', 'so-0019', id, 25.0, 93800.0, 2345000.0, 25.0, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z' FROM "ProductVariant" WHERE "skuCode" = 'RMS0760';
INSERT INTO "SalesOrderItem" (id, "salesOrderId", "productVariantId", quantity, "unitPrice", subtotal, "deliveredQty", "createdAt", "updatedAt")
SELECT 'so-0019-item-af583d60', 'so-0019', id, 10.0, 93800.0, 938000.0, 10.0, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z' FROM "ProductVariant" WHERE "skuCode" = 'RJS0760';

-- Invoice: 05/INV/VI/2026 -> OB-AR-0020 (Customer: CHERRY)
INSERT INTO "SalesOrder" (id, "orderNumber", "customerId", "orderDate", "expectedDate", "orderType", status, "totalAmount", "createdAt", "updatedAt")
VALUES ('so-0020', 'OB-AR-0020', 'f3a93dc5-85e2-43d6-8f18-c3675b6d06fe', '2026-06-04'::timestamp, '2026-06-11'::timestamp, 'MAKE_TO_STOCK', 'CONFIRMED', 480000.00, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z');
INSERT INTO "SalesOrderItem" (id, "salesOrderId", "productVariantId", quantity, "unitPrice", subtotal, "deliveredQty", "createdAt", "updatedAt")
SELECT 'so-0020-item-d2055674', 'so-0020', id, 96.0, 5000.0, 480000.0, 96.0, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z' FROM "ProductVariant" WHERE "skuCode" = 'SDP00JT6';

-- Invoice: 06/INV/VI/2026 -> OB-AR-0021 (Customer: HARI ABDURAKHMAN)
INSERT INTO "SalesOrder" (id, "orderNumber", "customerId", "orderDate", "expectedDate", "orderType", status, "totalAmount", "createdAt", "updatedAt")
VALUES ('so-0021', 'OB-AR-0021', '619354d5-290e-464c-9764-80de9f1a28fe', '2026-06-04'::timestamp, '2026-06-18'::timestamp, 'MAKE_TO_STOCK', 'CONFIRMED', 1810500.00, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z');
INSERT INTO "SalesOrderItem" (id, "salesOrderId", "productVariantId", quantity, "unitPrice", subtotal, "deliveredQty", "createdAt", "updatedAt")
SELECT 'so-0021-item-6c0e70ca', 'so-0021', id, 5.0, 166500.0, 832500.0, 5.0, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z' FROM "ProductVariant" WHERE "skuCode" = 'RHK1010';
INSERT INTO "SalesOrderItem" (id, "salesOrderId", "productVariantId", quantity, "unitPrice", subtotal, "deliveredQty", "createdAt", "updatedAt")
SELECT 'so-0021-item-8320adfc', 'so-0021', id, 65.2, 15000.0, 978000.0, 65.2, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z' FROM "ProductVariant" WHERE "skuCode" = 'RHK0000';

-- Invoice: 07/INV/VI/2026 -> OB-AR-0022 (Customer: DENNY)
INSERT INTO "SalesOrder" (id, "orderNumber", "customerId", "orderDate", "expectedDate", "orderType", status, "totalAmount", "createdAt", "updatedAt")
VALUES ('so-0022', 'OB-AR-0022', '5ebdb82b-9270-4012-ad1b-6b2764be3732', '2026-06-04'::timestamp, '2026-06-04'::timestamp, 'MAKE_TO_STOCK', 'CONFIRMED', 5550000.00, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z');
INSERT INTO "SalesOrderItem" (id, "salesOrderId", "productVariantId", quantity, "unitPrice", subtotal, "deliveredQty", "createdAt", "updatedAt")
SELECT 'so-0022-item-361b43e5', 'so-0022', id, 15.0, 185000.0, 2775000.0, 15.0, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z' FROM "ProductVariant" WHERE "skuCode" = 'RMK1010';
INSERT INTO "SalesOrderItem" (id, "salesOrderId", "productVariantId", quantity, "unitPrice", subtotal, "deliveredQty", "createdAt", "updatedAt")
SELECT 'so-0022-item-a9fe1b43', 'so-0022', id, 15.0, 185000.0, 2775000.0, 15.0, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z' FROM "ProductVariant" WHERE "skuCode" = 'RKK1010';

-- Invoice: 08/INV/VI/2026 -> OB-AR-0023 (Customer: FIMA PLASTIK)
INSERT INTO "SalesOrder" (id, "orderNumber", "customerId", "orderDate", "expectedDate", "orderType", status, "totalAmount", "createdAt", "updatedAt")
VALUES ('so-0023', 'OB-AR-0023', '8982ec44-1c98-45db-b83e-7a932b970875', '2026-06-04'::timestamp, '2026-06-04'::timestamp, 'MAKE_TO_STOCK', 'CONFIRMED', 39880000.00, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z');
INSERT INTO "SalesOrderItem" (id, "salesOrderId", "productVariantId", quantity, "unitPrice", subtotal, "deliveredQty", "createdAt", "updatedAt")
SELECT 'so-0023-item-8e40fdfb', 'so-0023', id, 50.0, 125000.0, 6250000.0, 50.0, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z' FROM "ProductVariant" WHERE "skuCode" = 'RHK1010';
INSERT INTO "SalesOrderItem" (id, "salesOrderId", "productVariantId", quantity, "unitPrice", subtotal, "deliveredQty", "createdAt", "updatedAt")
SELECT 'so-0023-item-120f261b', 'so-0023', id, 25.0, 255000.0, 6375000.0, 25.0, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z' FROM "ProductVariant" WHERE "skuCode" = 'MLD-BJ-015';
INSERT INTO "SalesOrderItem" (id, "salesOrderId", "productVariantId", quantity, "unitPrice", subtotal, "deliveredQty", "createdAt", "updatedAt")
SELECT 'so-0023-item-edf438b9', 'so-0023', id, 25.0, 255000.0, 6375000.0, 25.0, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z' FROM "ProductVariant" WHERE "skuCode" = 'MLD-BJ-016';
INSERT INTO "SalesOrderItem" (id, "salesOrderId", "productVariantId", quantity, "unitPrice", subtotal, "deliveredQty", "createdAt", "updatedAt")
SELECT 'so-0023-item-9722018f', 'so-0023', id, 11600.0, 1800.0, 20880000.0, 11600.0, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z' FROM "ProductVariant" WHERE "skuCode" = 'BJ000007';

-- Invoice: 09/INV/VI/2026 -> OB-AR-0024 (Customer: ISIS PRATITNO)
INSERT INTO "SalesOrder" (id, "orderNumber", "customerId", "orderDate", "expectedDate", "orderType", status, "totalAmount", "createdAt", "updatedAt")
VALUES ('so-0024', 'OB-AR-0024', 'c963a648-fbed-4369-ad8c-b0cd101af37f', '2026-06-05'::timestamp, '2026-06-05'::timestamp, 'MAKE_TO_STOCK', 'CONFIRMED', 37418000.00, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z');
INSERT INTO "SalesOrderItem" (id, "salesOrderId", "productVariantId", quantity, "unitPrice", subtotal, "deliveredQty", "createdAt", "updatedAt")
SELECT 'so-0024-item-8c807ec2', 'so-0024', id, 1039.4, 10700.0, 11122000.0, 1039.4, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z' FROM "ProductVariant" WHERE "skuCode" = 'RHK0000';
INSERT INTO "SalesOrderItem" (id, "salesOrderId", "productVariantId", quantity, "unitPrice", subtotal, "deliveredQty", "createdAt", "updatedAt")
SELECT 'so-0024-item-6b00e091', 'so-0024', id, 408.5, 20500.0, 8374500.0, 408.5, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z' FROM "ProductVariant" WHERE "skuCode" = 'RMS0000';
INSERT INTO "SalesOrderItem" (id, "salesOrderId", "productVariantId", quantity, "unitPrice", subtotal, "deliveredQty", "createdAt", "updatedAt")
SELECT 'so-0024-item-78b054d8', 'so-0024', id, 153.0, 20500.0, 3136500.0, 153.0, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z' FROM "ProductVariant" WHERE "skuCode" = 'RKS0000';
INSERT INTO "SalesOrderItem" (id, "salesOrderId", "productVariantId", quantity, "unitPrice", subtotal, "deliveredQty", "createdAt", "updatedAt")
SELECT 'so-0024-item-2f72b4bd', 'so-0024', id, 250.4, 20500.0, 5133500.0, 250.4, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z' FROM "ProductVariant" WHERE "skuCode" = 'RJS0000';
INSERT INTO "SalesOrderItem" (id, "salesOrderId", "productVariantId", quantity, "unitPrice", subtotal, "deliveredQty", "createdAt", "updatedAt")
SELECT 'so-0024-item-88d63f6b', 'so-0024', id, 470.8, 20500.0, 9651500.0, 470.8, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z' FROM "ProductVariant" WHERE "skuCode" = 'RRS0000';

-- Invoice: 10/INV/VI/2026 -> OB-AR-0025 (Customer: SUPERPLAST ADIPERKASA INDONESIA, PT)
INSERT INTO "SalesOrder" (id, "orderNumber", "customerId", "orderDate", "expectedDate", "orderType", status, "totalAmount", "createdAt", "updatedAt")
VALUES ('so-0025', 'OB-AR-0025', 'a29bfc3e-0d72-4340-8230-1f0493b355b2', '2026-06-05'::timestamp, '2026-06-19'::timestamp, 'MAKE_TO_STOCK', 'CONFIRMED', 5550000.00, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z');
INSERT INTO "SalesOrderItem" (id, "salesOrderId", "productVariantId", quantity, "unitPrice", subtotal, "deliveredQty", "createdAt", "updatedAt")
SELECT 'so-0025-item-31320307', 'so-0025', id, 40.0, 138750.0, 5550000.0, 40.0, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z' FROM "ProductVariant" WHERE "skuCode" = 'RHK1010';

-- Invoice: 10a/INV/VI/2026 -> OB-AR-0026 (Customer: PELITA TOMANGMAS, PT)
INSERT INTO "SalesOrder" (id, "orderNumber", "customerId", "orderDate", "expectedDate", "orderType", status, "totalAmount", "createdAt", "updatedAt")
VALUES ('so-0026', 'OB-AR-0026', '3da93de7-07c3-4e03-9e08-76951e23c1f9', '2026-06-05'::timestamp, '2026-06-05'::timestamp, 'MAKE_TO_STOCK', 'CONFIRMED', 137500.00, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z');
INSERT INTO "SalesOrderItem" (id, "salesOrderId", "productVariantId", quantity, "unitPrice", subtotal, "deliveredQty", "createdAt", "updatedAt")
SELECT 'so-0026-item-f51439de', 'so-0026', id, 1.0, 137500.0, 137500.0, 1.0, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z' FROM "ProductVariant" WHERE "skuCode" = 'RHK1010';

-- Invoice: 11/INV/VI/2026 -> OB-AR-0027 (Customer: JANTAN, TOKO)
INSERT INTO "SalesOrder" (id, "orderNumber", "customerId", "orderDate", "expectedDate", "orderType", status, "totalAmount", "createdAt", "updatedAt")
VALUES ('so-0027', 'OB-AR-0027', 'e2b6de17-718b-406d-80cc-7cead8fcb0eb', '2026-06-06'::timestamp, '2026-06-06'::timestamp, 'MAKE_TO_STOCK', 'CONFIRMED', 13515000.00, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z');
INSERT INTO "SalesOrderItem" (id, "salesOrderId", "productVariantId", quantity, "unitPrice", subtotal, "deliveredQty", "createdAt", "updatedAt")
SELECT 'so-0027-item-89fd58db', 'so-0027', id, 53.0, 255000.0, 13515000.0, 53.0, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z' FROM "ProductVariant" WHERE "skuCode" = 'MLD-BJ-015';

-- Invoice: 12/INV/VI/2026 -> OB-AR-0028 (Customer: AGAPE JAYA PRATAMA, CV)
INSERT INTO "SalesOrder" (id, "orderNumber", "customerId", "orderDate", "expectedDate", "orderType", status, "totalAmount", "createdAt", "updatedAt")
VALUES ('so-0028', 'OB-AR-0028', 'cc5659cf-3c58-478a-94ab-c124cc9ac3b9', '2026-06-06'::timestamp, '2026-06-20'::timestamp, 'MAKE_TO_STOCK', 'CONFIRMED', 6650000.00, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z');
INSERT INTO "SalesOrderItem" (id, "salesOrderId", "productVariantId", quantity, "unitPrice", subtotal, "deliveredQty", "createdAt", "updatedAt")
SELECT 'so-0028-item-198fec1e', 'so-0028', id, 50.0, 133000.0, 6650000.0, 50.0, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z' FROM "ProductVariant" WHERE "skuCode" = 'RHK9510';

-- Invoice: 13/INV/VI/2026 -> OB-AR-0029 (Customer: LAMINDO AGENG MANDIRI, PT)
INSERT INTO "SalesOrder" (id, "orderNumber", "customerId", "orderDate", "expectedDate", "orderType", status, "totalAmount", "createdAt", "updatedAt")
VALUES ('so-0029', 'OB-AR-0029', '7177fb18-6ca8-444f-bd36-ea79986b4077', '2026-06-06'::timestamp, '2026-06-20'::timestamp, 'MAKE_TO_STOCK', 'CONFIRMED', 3444000.00, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z');
INSERT INTO "SalesOrderItem" (id, "salesOrderId", "productVariantId", quantity, "unitPrice", subtotal, "deliveredQty", "createdAt", "updatedAt")
SELECT 'so-0029-item-e6e85cd9', 'so-0029', id, 253.2, 13600.0, 3444000.0, 253.2, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z' FROM "ProductVariant" WHERE "skuCode" = 'RHK0000';

-- Invoice: 14/INV/VI/2026 -> OB-AR-0030 (Customer: RUKUN SEJAHTERA, CV)
INSERT INTO "SalesOrder" (id, "orderNumber", "customerId", "orderDate", "expectedDate", "orderType", status, "totalAmount", "createdAt", "updatedAt")
VALUES ('so-0030', 'OB-AR-0030', '382a9809-e661-4d19-876c-e9f92febd11a', '2026-06-06'::timestamp, '2026-07-06'::timestamp, 'MAKE_TO_STOCK', 'CONFIRMED', 815000.00, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z');
INSERT INTO "SalesOrderItem" (id, "salesOrderId", "productVariantId", quantity, "unitPrice", subtotal, "deliveredQty", "createdAt", "updatedAt")
SELECT 'so-0030-item-c52e7fc9', 'so-0030', id, 65.2, 12500.0, 815000.0, 65.2, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z' FROM "ProductVariant" WHERE "skuCode" = 'RHK0000';

-- Invoice: 15/INV/VI/2026 -> OB-AR-0031 (Customer: WIDODO)
INSERT INTO "SalesOrder" (id, "orderNumber", "customerId", "orderDate", "expectedDate", "orderType", status, "totalAmount", "createdAt", "updatedAt")
VALUES ('so-0031', 'OB-AR-0031', '12bca8cd-4ea6-4653-a112-1a6d0efad02c', '2026-06-06'::timestamp, '2026-06-06'::timestamp, 'MAKE_TO_STOCK', 'CONFIRMED', 338000.00, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z');
INSERT INTO "SalesOrderItem" (id, "salesOrderId", "productVariantId", quantity, "unitPrice", subtotal, "deliveredQty", "createdAt", "updatedAt")
SELECT 'so-0031-item-d1fc1997', 'so-0031', id, 13.0, 26000.0, 338000.0, 13.0, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z' FROM "ProductVariant" WHERE "skuCode" = 'SHP00ST9';

-- Invoice: 16/INV/VI/2026 -> OB-AR-0032 (Customer: NYOTO PLASTIK)
INSERT INTO "SalesOrder" (id, "orderNumber", "customerId", "orderDate", "expectedDate", "orderType", status, "totalAmount", "createdAt", "updatedAt")
VALUES ('so-0032', 'OB-AR-0032', 'cfe996cc-e55f-49b8-99be-960134342b03', '2026-06-06'::timestamp, '2026-06-06'::timestamp, 'MAKE_TO_STOCK', 'CONFIRMED', 13260000.00, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z');
INSERT INTO "SalesOrderItem" (id, "salesOrderId", "productVariantId", quantity, "unitPrice", subtotal, "deliveredQty", "createdAt", "updatedAt")
SELECT 'so-0032-item-e75e4c5d', 'so-0032', id, 32.0, 255000.0, 8160000.0, 32.0, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z' FROM "ProductVariant" WHERE "skuCode" = 'MLD-BJ-015';
INSERT INTO "SalesOrderItem" (id, "salesOrderId", "productVariantId", quantity, "unitPrice", subtotal, "deliveredQty", "createdAt", "updatedAt")
SELECT 'so-0032-item-46cde8b1', 'so-0032', id, 20.0, 255000.0, 5100000.0, 20.0, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z' FROM "ProductVariant" WHERE "skuCode" = 'MLD-BJ-016';

-- Invoice: 17/INV/VI/2026 -> OB-AR-0033 (Customer: WIDOKO)
INSERT INTO "SalesOrder" (id, "orderNumber", "customerId", "orderDate", "expectedDate", "orderType", status, "totalAmount", "createdAt", "updatedAt")
VALUES ('so-0033', 'OB-AR-0033', '14c81f7b-fad1-4426-a1c0-817f2f0f2c0d', '2026-06-08'::timestamp, '2026-06-15'::timestamp, 'MAKE_TO_STOCK', 'CONFIRMED', 42700000.00, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z');
INSERT INTO "SalesOrderItem" (id, "salesOrderId", "productVariantId", quantity, "unitPrice", subtotal, "deliveredQty", "createdAt", "updatedAt")
SELECT 'so-0033-item-04968d40', 'so-0033', id, 350.0, 122000.0, 42700000.0, 350.0, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z' FROM "ProductVariant" WHERE "skuCode" = 'RHK1010';

-- Invoice: 18/INV/VI/2026 -> OB-AR-0034 (Customer: TOKO 234 RIZKI)
INSERT INTO "SalesOrder" (id, "orderNumber", "customerId", "orderDate", "expectedDate", "orderType", status, "totalAmount", "createdAt", "updatedAt")
VALUES ('so-0034', 'OB-AR-0034', 'fb183d9a-87ed-4250-9e9d-f70e1b9bfd20', '2026-06-08'::timestamp, '2026-06-08'::timestamp, 'MAKE_TO_STOCK', 'CONFIRMED', 290000.00, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z');
INSERT INTO "SalesOrderItem" (id, "salesOrderId", "productVariantId", quantity, "unitPrice", subtotal, "deliveredQty", "createdAt", "updatedAt")
SELECT 'so-0034-item-46f542aa', 'so-0034', id, 1.0, 290000.0, 290000.0, 1.0, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z' FROM "ProductVariant" WHERE "skuCode" = 'MLD-BJ-015';

-- Invoice: 19/INV/VI/2026 -> OB-AR-0035 (Customer: KISWANTO)
INSERT INTO "SalesOrder" (id, "orderNumber", "customerId", "orderDate", "expectedDate", "orderType", status, "totalAmount", "createdAt", "updatedAt")
VALUES ('so-0035', 'OB-AR-0035', 'f6451b82-9f50-4da0-ae52-bb78d6e1ff6c', '2026-06-08'::timestamp, '2026-06-08'::timestamp, 'MAKE_TO_STOCK', 'CONFIRMED', 580000.00, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z');
INSERT INTO "SalesOrderItem" (id, "salesOrderId", "productVariantId", quantity, "unitPrice", subtotal, "deliveredQty", "createdAt", "updatedAt")
SELECT 'so-0035-item-cf696845', 'so-0035', id, 2.0, 290000.0, 580000.0, 2.0, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z' FROM "ProductVariant" WHERE "skuCode" = 'MLD-BJ-015';

-- Invoice: 20/INV/VI/2026 -> OB-AR-0036 (Customer: ARIF)
INSERT INTO "SalesOrder" (id, "orderNumber", "customerId", "orderDate", "expectedDate", "orderType", status, "totalAmount", "createdAt", "updatedAt")
VALUES ('so-0036', 'OB-AR-0036', 'a7cc6c67-94dd-4ce9-9ea3-d032119261a0', '2026-06-09'::timestamp, '2026-06-09'::timestamp, 'MAKE_TO_STOCK', 'CONFIRMED', 23500000.00, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z');
INSERT INTO "SalesOrderItem" (id, "salesOrderId", "productVariantId", quantity, "unitPrice", subtotal, "deliveredQty", "createdAt", "updatedAt")
SELECT 'so-0036-item-302b4b46', 'so-0036', id, 100.0, 235000.0, 23500000.0, 100.0, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z' FROM "ProductVariant" WHERE "skuCode" = 'MLD-BJ-014';

-- Invoice: 21/INV/VI/2026 -> OB-AR-0037 (Customer: KOH RUDI_DAWUNG)
INSERT INTO "SalesOrder" (id, "orderNumber", "customerId", "orderDate", "expectedDate", "orderType", status, "totalAmount", "createdAt", "updatedAt")
VALUES ('so-0037', 'OB-AR-0037', 'd1000002-0000-4000-8000-000000000002', '2026-06-10'::timestamp, '2026-06-10'::timestamp, 'MAKE_TO_STOCK', 'CONFIRMED', 750000.00, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z');
INSERT INTO "SalesOrderItem" (id, "salesOrderId", "productVariantId", quantity, "unitPrice", subtotal, "deliveredQty", "createdAt", "updatedAt")
SELECT 'so-0037-item-6eca5a0c', 'so-0037', id, 5.0, 150000.0, 750000.0, 5.0, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z' FROM "ProductVariant" WHERE "skuCode" = 'RHK1010';

-- Invoice: 22/INV/VI/2026 -> OB-AR-0038 (Customer: SANTOSO JAYA PLASTIK, PT)
INSERT INTO "SalesOrder" (id, "orderNumber", "customerId", "orderDate", "expectedDate", "orderType", status, "totalAmount", "createdAt", "updatedAt")
VALUES ('so-0038', 'OB-AR-0038', '5d531cbd-d596-41d9-b05e-c35c28179832', '2026-06-11'::timestamp, '2026-06-25'::timestamp, 'MAKE_TO_STOCK', 'CONFIRMED', 5550000.00, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z');
INSERT INTO "SalesOrderItem" (id, "salesOrderId", "productVariantId", quantity, "unitPrice", subtotal, "deliveredQty", "createdAt", "updatedAt")
SELECT 'so-0038-item-0edf06c4', 'so-0038', id, 20.0, 138750.0, 2775000.0, 20.0, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z' FROM "ProductVariant" WHERE "skuCode" = 'RHK1010';
INSERT INTO "SalesOrderItem" (id, "salesOrderId", "productVariantId", quantity, "unitPrice", subtotal, "deliveredQty", "createdAt", "updatedAt")
SELECT 'so-0038-item-256692a1', 'so-0038', id, 20.0, 138750.0, 2775000.0, 20.0, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z' FROM "ProductVariant" WHERE "skuCode" = 'RHK1010';

-- Invoice: 23/INV/VI/2026 -> OB-AR-0039 (Customer: HARTONO LISTIYONO)
INSERT INTO "SalesOrder" (id, "orderNumber", "customerId", "orderDate", "expectedDate", "orderType", status, "totalAmount", "createdAt", "updatedAt")
VALUES ('so-0039', 'OB-AR-0039', '3ff2d01c-d394-489f-a8dc-78adcb89b02d', '2026-06-11'::timestamp, '2026-06-18'::timestamp, 'MAKE_TO_STOCK', 'CONFIRMED', 2540000.00, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z');
INSERT INTO "SalesOrderItem" (id, "salesOrderId", "productVariantId", quantity, "unitPrice", subtotal, "deliveredQty", "createdAt", "updatedAt")
SELECT 'so-0039-item-97b37085', 'so-0039', id, 20.0, 127000.0, 2540000.0, 20.0, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z' FROM "ProductVariant" WHERE "skuCode" = 'RHK1010';

-- Invoice: 24/INV/VI/2026 -> OB-AR-0040 (Customer: JANTAN, TOKO)
INSERT INTO "SalesOrder" (id, "orderNumber", "customerId", "orderDate", "expectedDate", "orderType", status, "totalAmount", "createdAt", "updatedAt")
VALUES ('so-0040', 'OB-AR-0040', 'e2b6de17-718b-406d-80cc-7cead8fcb0eb', '2026-06-11'::timestamp, '2026-06-18'::timestamp, 'MAKE_TO_STOCK', 'CONFIRMED', 3600000.00, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z');
INSERT INTO "SalesOrderItem" (id, "salesOrderId", "productVariantId", quantity, "unitPrice", subtotal, "deliveredQty", "createdAt", "updatedAt")
SELECT 'so-0040-item-f9dfffc5', 'so-0040', id, 120.0, 30000.0, 3600000.0, 120.0, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z' FROM "ProductVariant" WHERE "skuCode" = 'SDP00ST6';

-- Invoice: 25/INV/VI/2026 -> OB-AR-0041 (Customer: NYOTO PLASTIK)
INSERT INTO "SalesOrder" (id, "orderNumber", "customerId", "orderDate", "expectedDate", "orderType", status, "totalAmount", "createdAt", "updatedAt")
VALUES ('so-0041', 'OB-AR-0041', 'cfe996cc-e55f-49b8-99be-960134342b03', '2026-06-10'::timestamp, '2026-06-17'::timestamp, 'MAKE_TO_STOCK', 'CONFIRMED', 9690000.00, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z');
INSERT INTO "SalesOrderItem" (id, "salesOrderId", "productVariantId", quantity, "unitPrice", subtotal, "deliveredQty", "createdAt", "updatedAt")
SELECT 'so-0041-item-469dd076', 'so-0041', id, 38.0, 255000.0, 9690000.0, 38.0, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z' FROM "ProductVariant" WHERE "skuCode" = 'MLD-BJ-015';

-- Invoice: 26/INV/VI/2026 -> OB-AR-0042 (Customer: JOKO)
INSERT INTO "SalesOrder" (id, "orderNumber", "customerId", "orderDate", "expectedDate", "orderType", status, "totalAmount", "createdAt", "updatedAt")
VALUES ('so-0042', 'OB-AR-0042', '0bc26cdc-ee99-4d46-addd-f858555a2e2a', '2026-06-10'::timestamp, '2026-06-17'::timestamp, 'MAKE_TO_STOCK', 'CONFIRMED', 1275000.00, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z');
INSERT INTO "SalesOrderItem" (id, "salesOrderId", "productVariantId", quantity, "unitPrice", subtotal, "deliveredQty", "createdAt", "updatedAt")
SELECT 'so-0042-item-c7410fcc', 'so-0042', id, 5.0, 255000.0, 1275000.0, 5.0, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z' FROM "ProductVariant" WHERE "skuCode" = 'MLD-BJ-015';

-- Invoice: 27/INV/VI/2026 -> OB-AR-0043 (Customer: JANTAN, TOKO)
INSERT INTO "SalesOrder" (id, "orderNumber", "customerId", "orderDate", "expectedDate", "orderType", status, "totalAmount", "createdAt", "updatedAt")
VALUES ('so-0043', 'OB-AR-0043', 'e2b6de17-718b-406d-80cc-7cead8fcb0eb', '2026-06-11'::timestamp, '2026-06-11'::timestamp, 'MAKE_TO_STOCK', 'CONFIRMED', 6150000.00, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z');
INSERT INTO "SalesOrderItem" (id, "salesOrderId", "productVariantId", quantity, "unitPrice", subtotal, "deliveredQty", "createdAt", "updatedAt")
SELECT 'so-0043-item-b2afc5e2', 'so-0043', id, 10.0, 255000.0, 2550000.0, 10.0, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z' FROM "ProductVariant" WHERE "skuCode" = 'MLD-BJ-016';
INSERT INTO "SalesOrderItem" (id, "salesOrderId", "productVariantId", quantity, "unitPrice", subtotal, "deliveredQty", "createdAt", "updatedAt")
SELECT 'so-0043-item-cbd93ea7', 'so-0043', id, 120.0, 30000.0, 3600000.0, 120.0, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z' FROM "ProductVariant" WHERE "skuCode" = 'SDP00ST6';

-- Invoice: 28/INV/VI/2026 -> OB-AR-0044 (Customer: LIDYA)
INSERT INTO "SalesOrder" (id, "orderNumber", "customerId", "orderDate", "expectedDate", "orderType", status, "totalAmount", "createdAt", "updatedAt")
VALUES ('so-0044', 'OB-AR-0044', '6541cef6-0318-4126-8cea-7a5658139d5b', '2026-06-12'::timestamp, '2026-06-12'::timestamp, 'MAKE_TO_STOCK', 'CONFIRMED', 127000.00, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z');
INSERT INTO "SalesOrderItem" (id, "salesOrderId", "productVariantId", quantity, "unitPrice", subtotal, "deliveredQty", "createdAt", "updatedAt")
SELECT 'so-0044-item-6d27e7cf', 'so-0044', id, 1.0, 127000.0, 127000.0, 1.0, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z' FROM "ProductVariant" WHERE "skuCode" = 'RHK1010';

-- Invoice: 29/INV/VI/2026 -> OB-AR-0045 (Customer: HERI ALTARA)
INSERT INTO "SalesOrder" (id, "orderNumber", "customerId", "orderDate", "expectedDate", "orderType", status, "totalAmount", "createdAt", "updatedAt")
VALUES ('so-0045', 'OB-AR-0045', 'd1000001-0000-4000-8000-000000000001', '2026-06-12'::timestamp, '2026-06-12'::timestamp, 'MAKE_TO_STOCK', 'CONFIRMED', 15321500.00, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z');
INSERT INTO "SalesOrderItem" (id, "salesOrderId", "productVariantId", quantity, "unitPrice", subtotal, "deliveredQty", "createdAt", "updatedAt")
SELECT 'so-0045-item-56319fbe', 'so-0045', id, 1502.1, 10200.0, 15321500.0, 1502.1, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z' FROM "ProductVariant" WHERE "skuCode" = 'RJT0000';

-- Invoice: 30/INV/VI/2026 -> OB-AR-0046 (Customer: PANDA)
INSERT INTO "SalesOrder" (id, "orderNumber", "customerId", "orderDate", "expectedDate", "orderType", status, "totalAmount", "createdAt", "updatedAt")
VALUES ('so-0046', 'OB-AR-0046', 'a398ace9-f249-4c21-b491-a7359fabf548', '2026-06-14'::timestamp, '2026-06-14'::timestamp, 'MAKE_TO_STOCK', 'CONFIRMED', 45112500.00, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z');
INSERT INTO "SalesOrderItem" (id, "salesOrderId", "productVariantId", quantity, "unitPrice", subtotal, "deliveredQty", "createdAt", "updatedAt")
SELECT 'so-0046-item-00a60633', 'so-0046', id, 225.0, 125500.0, 28237500.0, 225.0, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z' FROM "ProductVariant" WHERE "skuCode" = 'RHK1010';
INSERT INTO "SalesOrderItem" (id, "salesOrderId", "productVariantId", quantity, "unitPrice", subtotal, "deliveredQty", "createdAt", "updatedAt")
SELECT 'so-0046-item-141c66b8', 'so-0046', id, 75.0, 109000.0, 8175000.0, 75.0, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z' FROM "ProductVariant" WHERE "skuCode" = 'RHK8510';
INSERT INTO "SalesOrderItem" (id, "salesOrderId", "productVariantId", quantity, "unitPrice", subtotal, "deliveredQty", "createdAt", "updatedAt")
SELECT 'so-0046-item-df319960', 'so-0046', id, 100.0, 87000.0, 8700000.0, 100.0, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z' FROM "ProductVariant" WHERE "skuCode" = 'RHK6510';

-- Invoice: 31/INV/VI/2026 -> OB-AR-0047 (Customer: ARIF)
INSERT INTO "SalesOrder" (id, "orderNumber", "customerId", "orderDate", "expectedDate", "orderType", status, "totalAmount", "createdAt", "updatedAt")
VALUES ('so-0047', 'OB-AR-0047', 'a7cc6c67-94dd-4ce9-9ea3-d032119261a0', '2026-06-14'::timestamp, '2026-06-14'::timestamp, 'MAKE_TO_STOCK', 'CONFIRMED', 35250000.00, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z');
INSERT INTO "SalesOrderItem" (id, "salesOrderId", "productVariantId", quantity, "unitPrice", subtotal, "deliveredQty", "createdAt", "updatedAt")
SELECT 'so-0047-item-5078fd54', 'so-0047', id, 150.0, 235000.0, 35250000.0, 150.0, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z' FROM "ProductVariant" WHERE "skuCode" = 'MLD-BJ-013';

-- Invoice: 32/INV/VI/2026 -> OB-AR-0048 (Customer: JANTAN, TOKO)
INSERT INTO "SalesOrder" (id, "orderNumber", "customerId", "orderDate", "expectedDate", "orderType", status, "totalAmount", "createdAt", "updatedAt")
VALUES ('so-0048', 'OB-AR-0048', 'e2b6de17-718b-406d-80cc-7cead8fcb0eb', '2026-06-17'::timestamp, '2026-06-17'::timestamp, 'MAKE_TO_STOCK', 'CONFIRMED', 12750000.00, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z');
INSERT INTO "SalesOrderItem" (id, "salesOrderId", "productVariantId", quantity, "unitPrice", subtotal, "deliveredQty", "createdAt", "updatedAt")
SELECT 'so-0048-item-8d5bef5b', 'so-0048', id, 50.0, 255000.0, 12750000.0, 50.0, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z' FROM "ProductVariant" WHERE "skuCode" = 'MLD-BJ-015';

-- Invoice: 33/INV/VI/2026 -> OB-AR-0049 (Customer: SANTOSO JAYA PLASTIK, PT)
INSERT INTO "SalesOrder" (id, "orderNumber", "customerId", "orderDate", "expectedDate", "orderType", status, "totalAmount", "createdAt", "updatedAt")
VALUES ('so-0049', 'OB-AR-0049', '5d531cbd-d596-41d9-b05e-c35c28179832', '2026-06-17'::timestamp, '2026-07-01'::timestamp, 'MAKE_TO_STOCK', 'CONFIRMED', 2931500.00, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z');
INSERT INTO "SalesOrderItem" (id, "salesOrderId", "productVariantId", quantity, "unitPrice", subtotal, "deliveredQty", "createdAt", "updatedAt")
SELECT 'so-0049-item-c54bd0fe', 'so-0049', id, 4.0, 244200.0, 977000.0, 4.0, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z' FROM "ProductVariant" WHERE "skuCode" = 'RJS1010';
INSERT INTO "SalesOrderItem" (id, "salesOrderId", "productVariantId", quantity, "unitPrice", subtotal, "deliveredQty", "createdAt", "updatedAt")
SELECT 'so-0049-item-be4c4563', 'so-0049', id, 3.0, 244200.0, 733000.0, 3.0, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z' FROM "ProductVariant" WHERE "skuCode" = 'RKS1010';
INSERT INTO "SalesOrderItem" (id, "salesOrderId", "productVariantId", quantity, "unitPrice", subtotal, "deliveredQty", "createdAt", "updatedAt")
SELECT 'so-0049-item-4fb9e162', 'so-0049', id, 3.0, 244200.0, 733000.0, 3.0, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z' FROM "ProductVariant" WHERE "skuCode" = 'RUS0110';
INSERT INTO "SalesOrderItem" (id, "salesOrderId", "productVariantId", quantity, "unitPrice", subtotal, "deliveredQty", "createdAt", "updatedAt")
SELECT 'so-0049-item-d8cfd352', 'so-0049', id, 2.0, 244200.0, 488500.0, 2.0, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z' FROM "ProductVariant" WHERE "skuCode" = 'RRS1010';

-- Invoice: 34/INV/VI/2026 -> OB-AR-0050 (Customer: LARNO)
INSERT INTO "SalesOrder" (id, "orderNumber", "customerId", "orderDate", "expectedDate", "orderType", status, "totalAmount", "createdAt", "updatedAt")
VALUES ('so-0050', 'OB-AR-0050', 'd078421c-1591-442f-9b87-119748ce0aa9', '2026-06-17'::timestamp, '2026-06-17'::timestamp, 'MAKE_TO_STOCK', 'CONFIRMED', 290000.00, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z');
INSERT INTO "SalesOrderItem" (id, "salesOrderId", "productVariantId", quantity, "unitPrice", subtotal, "deliveredQty", "createdAt", "updatedAt")
SELECT 'so-0050-item-30d0cceb', 'so-0050', id, 1.0, 290000.0, 290000.0, 1.0, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z' FROM "ProductVariant" WHERE "skuCode" = 'MLD-BJ-015';

-- Invoice: 36/INV/VI/2026 -> OB-AR-0051 (Customer: TOKO PLASTIK JEMPOL)
INSERT INTO "SalesOrder" (id, "orderNumber", "customerId", "orderDate", "expectedDate", "orderType", status, "totalAmount", "createdAt", "updatedAt")
VALUES ('so-0051', 'OB-AR-0051', 'f50322ac-a520-4e4f-a3b6-3f413f04202c', '2026-06-17'::timestamp, '2026-06-17'::timestamp, 'MAKE_TO_STOCK', 'CONFIRMED', 32745000.00, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z');
INSERT INTO "SalesOrderItem" (id, "salesOrderId", "productVariantId", quantity, "unitPrice", subtotal, "deliveredQty", "createdAt", "updatedAt")
SELECT 'so-0051-item-6f697f1a', 'so-0051', id, 11675.0, 2400.0, 28020000.0, 11675.0, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z' FROM "ProductVariant" WHERE "skuCode" = 'BJ000009';
INSERT INTO "SalesOrderItem" (id, "salesOrderId", "productVariantId", quantity, "unitPrice", subtotal, "deliveredQty", "createdAt", "updatedAt")
SELECT 'so-0051-item-40ed9e77', 'so-0051', id, 45.0, 21000.0, 945000.0, 45.0, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z' FROM "ProductVariant" WHERE "skuCode" = 'SMLD0ST6';
INSERT INTO "SalesOrderItem" (id, "salesOrderId", "productVariantId", quantity, "unitPrice", subtotal, "deliveredQty", "createdAt", "updatedAt")
SELECT 'so-0051-item-52bb146d', 'so-0051', id, 45.0, 21000.0, 945000.0, 45.0, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z' FROM "ProductVariant" WHERE "skuCode" = 'SJLD0ST6';
INSERT INTO "SalesOrderItem" (id, "salesOrderId", "productVariantId", quantity, "unitPrice", subtotal, "deliveredQty", "createdAt", "updatedAt")
SELECT 'so-0051-item-2dd7eca4', 'so-0051', id, 45.0, 21000.0, 945000.0, 45.0, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z' FROM "ProductVariant" WHERE "skuCode" = 'SRLD0ST6';
INSERT INTO "SalesOrderItem" (id, "salesOrderId", "productVariantId", quantity, "unitPrice", subtotal, "deliveredQty", "createdAt", "updatedAt")
SELECT 'so-0051-item-cccabd82', 'so-0051', id, 45.0, 21000.0, 945000.0, 45.0, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z' FROM "ProductVariant" WHERE "skuCode" = 'SKLD0ST6';
INSERT INTO "SalesOrderItem" (id, "salesOrderId", "productVariantId", quantity, "unitPrice", subtotal, "deliveredQty", "createdAt", "updatedAt")
SELECT 'so-0051-item-808840b0', 'so-0051', id, 45.0, 21000.0, 945000.0, 45.0, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z' FROM "ProductVariant" WHERE "skuCode" = 'SPLD0ST6';

-- Invoice: 37/INV/VI/2026 -> OB-AR-0052 (Customer: SINUK)
INSERT INTO "SalesOrder" (id, "orderNumber", "customerId", "orderDate", "expectedDate", "orderType", status, "totalAmount", "createdAt", "updatedAt")
VALUES ('so-0052', 'OB-AR-0052', '64e74b33-1eb5-4c80-843e-316e7db449a9', '2026-06-17'::timestamp, '2026-06-17'::timestamp, 'MAKE_TO_STOCK', 'CONFIRMED', 325500.00, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z');
INSERT INTO "SalesOrderItem" (id, "salesOrderId", "productVariantId", quantity, "unitPrice", subtotal, "deliveredQty", "createdAt", "updatedAt")
SELECT 'so-0052-item-321f3705', 'so-0052', id, 6.5, 21000.0, 136500.0, 6.5, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z' FROM "ProductVariant" WHERE "skuCode" = 'RMS0000';
INSERT INTO "SalesOrderItem" (id, "salesOrderId", "productVariantId", quantity, "unitPrice", subtotal, "deliveredQty", "createdAt", "updatedAt")
SELECT 'so-0052-item-b8542d02', 'so-0052', id, 9.0, 21000.0, 189000.0, 9.0, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z' FROM "ProductVariant" WHERE "skuCode" = 'R000000';

-- Invoice: 38/INV/VI/2026 -> OB-AR-0053 (Customer: MITRA BOGA SUKSES, CV)
INSERT INTO "SalesOrder" (id, "orderNumber", "customerId", "orderDate", "expectedDate", "orderType", status, "totalAmount", "createdAt", "updatedAt")
VALUES ('so-0053', 'OB-AR-0053', '2c05be1d-e5ac-4773-b7c6-a8730800b439', '2026-06-18'::timestamp, '2026-07-02'::timestamp, 'MAKE_TO_STOCK', 'CONFIRMED', 6180000.00, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z');
INSERT INTO "SalesOrderItem" (id, "salesOrderId", "productVariantId", quantity, "unitPrice", subtotal, "deliveredQty", "createdAt", "updatedAt")
SELECT 'so-0053-item-95b5b772', 'so-0053', id, 143.1, 25000.0, 3577500.0, 143.1, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z' FROM "ProductVariant" WHERE "skuCode" = 'RBS0000';
INSERT INTO "SalesOrderItem" (id, "salesOrderId", "productVariantId", quantity, "unitPrice", subtotal, "deliveredQty", "createdAt", "updatedAt")
SELECT 'so-0053-item-6ade2b09', 'so-0053', id, 104.1, 25000.0, 2602500.0, 104.1, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z' FROM "ProductVariant" WHERE "skuCode" = 'ROS0000';

-- Invoice: 39/INV/VI/2026 -> OB-AR-0054 (Customer: YOPI)
INSERT INTO "SalesOrder" (id, "orderNumber", "customerId", "orderDate", "expectedDate", "orderType", status, "totalAmount", "createdAt", "updatedAt")
VALUES ('so-0054', 'OB-AR-0054', '5faf1845-7bed-4f7b-a281-6e9aa187e1ed', '2026-06-19'::timestamp, '2026-06-19'::timestamp, 'MAKE_TO_STOCK', 'CONFIRMED', 19087500.00, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z');
INSERT INTO "SalesOrderItem" (id, "salesOrderId", "productVariantId", quantity, "unitPrice", subtotal, "deliveredQty", "createdAt", "updatedAt")
SELECT 'so-0054-item-47c62c17', 'so-0054', id, 50.0, 240000.0, 12000000.0, 50.0, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z' FROM "ProductVariant" WHERE "skuCode" = 'MLD-BJ-013';
INSERT INTO "SalesOrderItem" (id, "salesOrderId", "productVariantId", quantity, "unitPrice", subtotal, "deliveredQty", "createdAt", "updatedAt")
SELECT 'so-0054-item-7ceb08f9', 'so-0054', id, 10.0, 400000.0, 4000000.0, 10.0, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z' FROM "ProductVariant" WHERE "skuCode" = 'SWS00WL-11';
INSERT INTO "SalesOrderItem" (id, "salesOrderId", "productVariantId", quantity, "unitPrice", subtotal, "deliveredQty", "createdAt", "updatedAt")
SELECT 'so-0054-item-e621cb7c', 'so-0054', id, 25.0, 123500.0, 3087500.0, 25.0, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z' FROM "ProductVariant" WHERE "skuCode" = 'RHK1010';

-- Invoice: 40/INV/VI/2026 -> OB-AR-0055 (Customer: ISIS PRATITNO)
INSERT INTO "SalesOrder" (id, "orderNumber", "customerId", "orderDate", "expectedDate", "orderType", status, "totalAmount", "createdAt", "updatedAt")
VALUES ('so-0055', 'OB-AR-0055', 'c963a648-fbed-4369-ad8c-b0cd101af37f', '2026-06-20'::timestamp, '2026-06-20'::timestamp, 'MAKE_TO_STOCK', 'CONFIRMED', 39670500.00, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z');
INSERT INTO "SalesOrderItem" (id, "salesOrderId", "productVariantId", quantity, "unitPrice", subtotal, "deliveredQty", "createdAt", "updatedAt")
SELECT 'so-0055-item-412c7b43', 'so-0055', id, 502.6, 20500.0, 10303500.0, 502.6, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z' FROM "ProductVariant" WHERE "skuCode" = 'RMS0000';
INSERT INTO "SalesOrderItem" (id, "salesOrderId", "productVariantId", quantity, "unitPrice", subtotal, "deliveredQty", "createdAt", "updatedAt")
SELECT 'so-0055-item-0763d859', 'so-0055', id, 502.1, 20500.0, 10293500.0, 502.1, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z' FROM "ProductVariant" WHERE "skuCode" = 'RRS0000';
INSERT INTO "SalesOrderItem" (id, "salesOrderId", "productVariantId", quantity, "unitPrice", subtotal, "deliveredQty", "createdAt", "updatedAt")
SELECT 'so-0055-item-1b13caee', 'so-0055', id, 103.2, 20500.0, 2116000.0, 103.2, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z' FROM "ProductVariant" WHERE "skuCode" = 'RKS0000';
INSERT INTO "SalesOrderItem" (id, "salesOrderId", "productVariantId", quantity, "unitPrice", subtotal, "deliveredQty", "createdAt", "updatedAt")
SELECT 'so-0055-item-cc988dd6', 'so-0055', id, 135.3, 20500.0, 2774000.0, 135.3, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z' FROM "ProductVariant" WHERE "skuCode" = 'RJS0000';
INSERT INTO "SalesOrderItem" (id, "salesOrderId", "productVariantId", quantity, "unitPrice", subtotal, "deliveredQty", "createdAt", "updatedAt")
SELECT 'so-0055-item-bd62477f', 'so-0055', id, 325.3, 10400.0, 3383500.0, 325.3, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z' FROM "ProductVariant" WHERE "skuCode" = 'RJT0000';
INSERT INTO "SalesOrderItem" (id, "salesOrderId", "productVariantId", quantity, "unitPrice", subtotal, "deliveredQty", "createdAt", "updatedAt")
SELECT 'so-0055-item-efb49ec5', 'so-0055', id, 90.0, 20000.0, 1800000.0, 90.0, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z' FROM "ProductVariant" WHERE "skuCode" = 'SMLD0ST6';
INSERT INTO "SalesOrderItem" (id, "salesOrderId", "productVariantId", quantity, "unitPrice", subtotal, "deliveredQty", "createdAt", "updatedAt")
SELECT 'so-0055-item-0982848a', 'so-0055', id, 90.0, 20000.0, 1800000.0, 90.0, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z' FROM "ProductVariant" WHERE "skuCode" = 'SJLD0ST6';
INSERT INTO "SalesOrderItem" (id, "salesOrderId", "productVariantId", quantity, "unitPrice", subtotal, "deliveredQty", "createdAt", "updatedAt")
SELECT 'so-0055-item-68a28602', 'so-0055', id, 90.0, 20000.0, 1800000.0, 90.0, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z' FROM "ProductVariant" WHERE "skuCode" = 'SKLD0ST6';
INSERT INTO "SalesOrderItem" (id, "salesOrderId", "productVariantId", quantity, "unitPrice", subtotal, "deliveredQty", "createdAt", "updatedAt")
SELECT 'so-0055-item-fe90e9b5', 'so-0055', id, 90.0, 20000.0, 1800000.0, 90.0, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z' FROM "ProductVariant" WHERE "skuCode" = 'SPLD0ST6';
INSERT INTO "SalesOrderItem" (id, "salesOrderId", "productVariantId", quantity, "unitPrice", subtotal, "deliveredQty", "createdAt", "updatedAt")
SELECT 'so-0055-item-5fcc70ad', 'so-0055', id, 90.0, 20000.0, 1800000.0, 90.0, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z' FROM "ProductVariant" WHERE "skuCode" = 'SULD0ST6';
INSERT INTO "SalesOrderItem" (id, "salesOrderId", "productVariantId", quantity, "unitPrice", subtotal, "deliveredQty", "createdAt", "updatedAt")
SELECT 'so-0055-item-b0bcd3ae', 'so-0055', id, 90.0, 20000.0, 1800000.0, 90.0, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z' FROM "ProductVariant" WHERE "skuCode" = 'SRLD0ST6';

-- Invoice: 41/INV/VI/2026 -> OB-AR-0056 (Customer: JOKO)
INSERT INTO "SalesOrder" (id, "orderNumber", "customerId", "orderDate", "expectedDate", "orderType", status, "totalAmount", "createdAt", "updatedAt")
VALUES ('so-0056', 'OB-AR-0056', '0bc26cdc-ee99-4d46-addd-f858555a2e2a', '2026-06-22'::timestamp, '2026-06-22'::timestamp, 'MAKE_TO_STOCK', 'CONFIRMED', 24630000.00, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z');
INSERT INTO "SalesOrderItem" (id, "salesOrderId", "productVariantId", quantity, "unitPrice", subtotal, "deliveredQty", "createdAt", "updatedAt")
SELECT 'so-0056-item-555015f4', 'so-0056', id, 50.0, 255000.0, 12750000.0, 50.0, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z' FROM "ProductVariant" WHERE "skuCode" = 'MLD-BJ-015';
INSERT INTO "SalesOrderItem" (id, "salesOrderId", "productVariantId", quantity, "unitPrice", subtotal, "deliveredQty", "createdAt", "updatedAt")
SELECT 'so-0056-item-2646d161', 'so-0056', id, 90.0, 33000.0, 2970000.0, 90.0, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z' FROM "ProductVariant" WHERE "skuCode" = 'SBLM0ST6';
INSERT INTO "SalesOrderItem" (id, "salesOrderId", "productVariantId", quantity, "unitPrice", subtotal, "deliveredQty", "createdAt", "updatedAt")
SELECT 'so-0056-item-9f4911d0', 'so-0056', id, 90.0, 33000.0, 2970000.0, 90.0, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z' FROM "ProductVariant" WHERE "skuCode" = 'SBLR0ST6';
INSERT INTO "SalesOrderItem" (id, "salesOrderId", "productVariantId", quantity, "unitPrice", subtotal, "deliveredQty", "createdAt", "updatedAt")
SELECT 'so-0056-item-bb9dc16a', 'so-0056', id, 90.0, 33000.0, 2970000.0, 90.0, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z' FROM "ProductVariant" WHERE "skuCode" = 'SBLH0ST6';
INSERT INTO "SalesOrderItem" (id, "salesOrderId", "productVariantId", quantity, "unitPrice", subtotal, "deliveredQty", "createdAt", "updatedAt")
SELECT 'so-0056-item-ad140275', 'so-0056', id, 90.0, 33000.0, 2970000.0, 90.0, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z' FROM "ProductVariant" WHERE "skuCode" = 'SBLP0ST6';

-- Invoice: 42/INV/VI/2026 -> OB-AR-0057 (Customer: TOKO 234 RIZKI)
INSERT INTO "SalesOrder" (id, "orderNumber", "customerId", "orderDate", "expectedDate", "orderType", status, "totalAmount", "createdAt", "updatedAt")
VALUES ('so-0057', 'OB-AR-0057', 'fb183d9a-87ed-4250-9e9d-f70e1b9bfd20', '2026-06-22'::timestamp, '2026-06-22'::timestamp, 'MAKE_TO_STOCK', 'CONFIRMED', 580000.00, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z');
INSERT INTO "SalesOrderItem" (id, "salesOrderId", "productVariantId", quantity, "unitPrice", subtotal, "deliveredQty", "createdAt", "updatedAt")
SELECT 'so-0057-item-114cfe64', 'so-0057', id, 2.0, 290000.0, 580000.0, 2.0, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z' FROM "ProductVariant" WHERE "skuCode" = 'MLD-BJ-015';

-- Invoice: 43/INV/VI/2026 -> OB-AR-0058 (Customer: ANJAR)
INSERT INTO "SalesOrder" (id, "orderNumber", "customerId", "orderDate", "expectedDate", "orderType", status, "totalAmount", "createdAt", "updatedAt")
VALUES ('so-0058', 'OB-AR-0058', 'b9fb2269-255c-4d7d-a384-78dc30e4a408', '2026-06-22'::timestamp, '2026-06-22'::timestamp, 'MAKE_TO_STOCK', 'CONFIRMED', 46989000.00, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z');
INSERT INTO "SalesOrderItem" (id, "salesOrderId", "productVariantId", quantity, "unitPrice", subtotal, "deliveredQty", "createdAt", "updatedAt")
SELECT 'so-0058-item-cdac5750', 'so-0058', id, 200.0, 122000.0, 24400000.0, 200.0, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z' FROM "ProductVariant" WHERE "skuCode" = 'RHK1010';
INSERT INTO "SalesOrderItem" (id, "salesOrderId", "productVariantId", quantity, "unitPrice", subtotal, "deliveredQty", "createdAt", "updatedAt")
SELECT 'so-0058-item-0a72aa22', 'so-0058', id, 20.0, 150000.0, 3000000.0, 20.0, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z' FROM "ProductVariant" WHERE "skuCode" = 'RMK1010';
INSERT INTO "SalesOrderItem" (id, "salesOrderId", "productVariantId", quantity, "unitPrice", subtotal, "deliveredQty", "createdAt", "updatedAt")
SELECT 'so-0058-item-4ddee2a4', 'so-0058', id, 10.0, 150000.0, 1500000.0, 10.0, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z' FROM "ProductVariant" WHERE "skuCode" = 'RJK0110';
INSERT INTO "SalesOrderItem" (id, "salesOrderId", "productVariantId", quantity, "unitPrice", subtotal, "deliveredQty", "createdAt", "updatedAt")
SELECT 'so-0058-item-ea1a7ffe', 'so-0058', id, 10.0, 150000.0, 1500000.0, 10.0, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z' FROM "ProductVariant" WHERE "skuCode" = 'RKK1010';
INSERT INTO "SalesOrderItem" (id, "salesOrderId", "productVariantId", quantity, "unitPrice", subtotal, "deliveredQty", "createdAt", "updatedAt")
SELECT 'so-0058-item-c2f5f6f6', 'so-0058', id, 10.0, 150000.0, 1500000.0, 10.0, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z' FROM "ProductVariant" WHERE "skuCode" = 'RRK0110';
INSERT INTO "SalesOrderItem" (id, "salesOrderId", "productVariantId", quantity, "unitPrice", subtotal, "deliveredQty", "createdAt", "updatedAt")
SELECT 'so-0058-item-fb973d7b', 'so-0058', id, 20.0, 150000.0, 3000000.0, 20.0, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z' FROM "ProductVariant" WHERE "skuCode" = 'RWK1010';
INSERT INTO "SalesOrderItem" (id, "salesOrderId", "productVariantId", quantity, "unitPrice", subtotal, "deliveredQty", "createdAt", "updatedAt")
SELECT 'so-0058-item-536e25ca', 'so-0058', id, 42.0, 101400.0, 4259000.0, 42.0, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z' FROM "ProductVariant" WHERE "skuCode" = 'RHK0810';
INSERT INTO "SalesOrderItem" (id, "salesOrderId", "productVariantId", quantity, "unitPrice", subtotal, "deliveredQty", "createdAt", "updatedAt")
SELECT 'so-0058-item-8c4fa2cf', 'so-0058', id, 40.0, 90600.0, 3624000.0, 40.0, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z' FROM "ProductVariant" WHERE "skuCode" = 'RHK0710';
INSERT INTO "SalesOrderItem" (id, "salesOrderId", "productVariantId", quantity, "unitPrice", subtotal, "deliveredQty", "createdAt", "updatedAt")
SELECT 'so-0058-item-45b28c42', 'so-0058', id, 20.0, 84500.0, 1690000.0, 20.0, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z' FROM "ProductVariant" WHERE "skuCode" = 'RWK0510';
INSERT INTO "SalesOrderItem" (id, "salesOrderId", "productVariantId", quantity, "unitPrice", subtotal, "deliveredQty", "createdAt", "updatedAt")
SELECT 'so-0058-item-c6d9b8fc', 'so-0058', id, 10.0, 71000.0, 710000.0, 10.0, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z' FROM "ProductVariant" WHERE "skuCode" = 'RHK0510';
INSERT INTO "SalesOrderItem" (id, "salesOrderId", "productVariantId", quantity, "unitPrice", subtotal, "deliveredQty", "createdAt", "updatedAt")
SELECT 'so-0058-item-10d6638f', 'so-0058', id, 30.0, 60200.0, 1806000.0, 30.0, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z' FROM "ProductVariant" WHERE "skuCode" = 'RHK0410';

-- Invoice: 44/INV/VI/2026 -> OB-AR-0059 (Customer: ISWANTO)
INSERT INTO "SalesOrder" (id, "orderNumber", "customerId", "orderDate", "expectedDate", "orderType", status, "totalAmount", "createdAt", "updatedAt")
VALUES ('so-0059', 'OB-AR-0059', 'c2d80688-07a6-4adf-b1d9-1329369d2203', '2026-06-22'::timestamp, '2026-06-22'::timestamp, 'MAKE_TO_STOCK', 'CONFIRMED', 2650000.00, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z');
INSERT INTO "SalesOrderItem" (id, "salesOrderId", "productVariantId", quantity, "unitPrice", subtotal, "deliveredQty", "createdAt", "updatedAt")
SELECT 'so-0059-item-7250fbae', 'so-0059', id, 10.0, 265000.0, 2650000.0, 10.0, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z' FROM "ProductVariant" WHERE "skuCode" = 'MLD-BJ-015';

-- Invoice: 45/INV/VI/2026 -> OB-AR-0060 (Customer: AMAR)
INSERT INTO "SalesOrder" (id, "orderNumber", "customerId", "orderDate", "expectedDate", "orderType", status, "totalAmount", "createdAt", "updatedAt")
VALUES ('so-0060', 'OB-AR-0060', '41fa9237-5ab8-4c50-ae5b-f9c89d4018da', '2026-06-22'::timestamp, '2026-06-22'::timestamp, 'MAKE_TO_STOCK', 'CONFIRMED', 71404500.00, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z');
INSERT INTO "SalesOrderItem" (id, "salesOrderId", "productVariantId", quantity, "unitPrice", subtotal, "deliveredQty", "createdAt", "updatedAt")
SELECT 'so-0060-item-9d686a5c', 'so-0060', id, 7000.4, 10200.0, 71404500.0, 7000.4, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z' FROM "ProductVariant" WHERE "skuCode" = 'RJT0000';

-- Invoice: 46/INV/VI/2026 -> OB-AR-0061 (Customer: TOKO JANTAN)
INSERT INTO "SalesOrder" (id, "orderNumber", "customerId", "orderDate", "expectedDate", "orderType", status, "totalAmount", "createdAt", "updatedAt")
VALUES ('so-0061', 'OB-AR-0061', 'd1000003-0000-4000-8000-000000000003', '2026-06-23'::timestamp, '2026-06-23'::timestamp, 'MAKE_TO_STOCK', 'CONFIRMED', 12750000.00, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z');
INSERT INTO "SalesOrderItem" (id, "salesOrderId", "productVariantId", quantity, "unitPrice", subtotal, "deliveredQty", "createdAt", "updatedAt")
SELECT 'so-0061-item-20e850ef', 'so-0061', id, 50.0, 12750000.0, 12750000.0, 50.0, '2026-06-23T12:38:39.000Z', '2026-06-23T12:38:39.000Z' FROM "ProductVariant" WHERE "skuCode" = 'MLD-BJ-015';

-- END