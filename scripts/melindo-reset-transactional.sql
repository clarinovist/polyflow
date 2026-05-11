BEGIN;

DELETE FROM "SalesOrderItem";
DELETE FROM "PurchaseOrderItem";
DELETE FROM "DeliveryOrderItem";
DELETE FROM "GoodsReceiptItem";
DELETE FROM "PurchaseInvoice";
DELETE FROM "PurchasePayment";
DELETE FROM "ProductionMaterial";
DELETE FROM "ProductionExecution";
DELETE FROM "ProductionIssue";
DELETE FROM "MaterialIssue";
DELETE FROM "ScrapRecord";
DELETE FROM "QualityInspection";
DELETE FROM "MachineDowntime";
DELETE FROM "BomItem";
DELETE FROM "StockReservation";
DELETE FROM "StockOpnameItem";
DELETE FROM "SalesReturnItem";
DELETE FROM "PurchaseReturnItem";
DELETE FROM "MaklonMaterialReturnItem";
DELETE FROM "PurchaseRequestItem";
DELETE FROM "SalesQuotationItem";

DELETE FROM "DeliveryOrder";
DELETE FROM "GoodsReceipt";
DELETE FROM "Payment";
DELETE FROM "StockOpname";
DELETE FROM "CostHistory";
DELETE FROM "SupplierProduct";
DELETE FROM "SalesReturn";
DELETE FROM "PurchaseReturn";
DELETE FROM "MaklonCostItem";
DELETE FROM "MaklonMaterialReturn";
DELETE FROM "PettyCashTransaction";
DELETE FROM "PurchaseRequest";
DELETE FROM "SalesQuotation";

DELETE FROM "Invoice";
DELETE FROM "SalesOrder";
DELETE FROM "PurchaseOrder";

DELETE FROM "StockMovement";
DELETE FROM "Inventory";
DELETE FROM "Batch";
DELETE FROM "ProductionShift";
DELETE FROM "ProductionOrder";
DELETE FROM "WorkShift";
DELETE FROM "Bom";
DELETE FROM "FixedAsset";
DELETE FROM "Budget";

DELETE FROM "JournalLine";
DELETE FROM "JournalEntry";

COMMIT;
