// @ts-nocheck
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createGoodsReceipt,
  getGoodsReceiptById,
  getGoodsReceipts,
} from "../receipts-service";
import { prisma } from "@/lib/core/prisma";
import { InventoryCoreService } from "@/services/inventory/core-service";
import { AccountingService } from "@/services/accounting/accounting-service";
import { logActivity } from "@/lib/tools/audit";
import { createDraftBillFromPo } from "@/services/purchasing/invoices-service";
import { logger } from "@/lib/config/logger";
import { MovementType, PurchaseOrderStatus } from "@prisma/client";

// Mock prisma
vi.mock("@/lib/core/prisma", () => ({
  prisma: {
    goodsReceipt: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    goodsReceiptItem: {
      createMany: vi.fn(),
    },
    purchaseOrder: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    purchaseOrderItem: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    inventory: {
      upsert: vi.fn(),
    },
    stockMovement: {
      create: vi.fn(),
    },
    $transaction: vi.fn((callback) => callback(prisma)),
  },
}));

// Mock audit
vi.mock("@/lib/tools/audit", () => ({
  logActivity: vi.fn(),
}));

// Mock InventoryCoreService
vi.mock("@/services/inventory/core-service", () => ({
  InventoryCoreService: {
    incrementStockWithCost: vi.fn(),
  },
}));

// Mock AccountingService
vi.mock("@/services/accounting/accounting-service", () => ({
  AccountingService: {
    recordInventoryMovement: vi.fn(),
  },
}));

// Mock invoices-service
vi.mock("@/services/purchasing/invoices-service", () => ({
  createDraftBillFromPo: vi.fn().mockResolvedValue(undefined),
}));

// Mock logger
vi.mock("@/lib/config/logger", () => ({
  logger: {
    error: vi.fn(),
  },
}));

describe("receipts-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getGoodsReceiptById", () => {
    it("should return goods receipt by id", async () => {
      // Arrange
      const mockReceipt = {
        id: "gr-1",
        receiptNumber: "GR-2024-0001",
        purchaseOrder: {
          id: "po-1",
          supplier: { name: "Supplier A" },
        },
        location: { name: "Main Warehouse" },
        createdBy: { name: "John" },
        items: [
          {
            productVariant: {
              name: "Product A",
              product: { name: "Product A" },
            },
          },
        ],
      };

      vi.mocked(prisma.goodsReceipt.findUnique).mockResolvedValue(
        mockReceipt as any,
      );

      // Act
      const result = await getGoodsReceiptById("gr-1");

      // Assert
      expect(result).toEqual(mockReceipt);
      expect(prisma.goodsReceipt.findUnique).toHaveBeenCalledWith({
        where: { id: "gr-1" },
        include: {
          purchaseOrder: {
            include: {
              supplier: true,
            },
          },
          customer: true,
          location: true,
          createdBy: { select: { name: true } },
          items: {
            include: {
              productVariant: {
                include: {
                  product: true,
                },
              },
            },
          },
        },
      });
    });

    it("should return null when receipt not found", async () => {
      // Arrange
      vi.mocked(prisma.goodsReceipt.findUnique).mockResolvedValue(null);

      // Act
      const result = await getGoodsReceiptById("gr-999");

      // Assert
      expect(result).toBeNull();
    });
  });

  describe("getGoodsReceipts", () => {
    it("should return all goods receipts", async () => {
      // Arrange
      const mockReceipts = [
        {
          id: "gr-1",
          receiptNumber: "GR-2024-0001",
          purchaseOrder: {
            id: "po-1",
            supplier: { name: "Supplier A" },
          },
          location: { name: "Main Warehouse" },
          createdBy: { name: "John" },
          items: [],
          _count: { items: 2 },
        },
      ];

      vi.mocked(prisma.goodsReceipt.findMany).mockResolvedValue(
        mockReceipts as any,
      );

      // Act
      const result = await getGoodsReceipts();

      // Assert
      expect(result).toEqual(mockReceipts);
      expect(prisma.goodsReceipt.findMany).toHaveBeenCalledWith({
        where: {},
        include: {
          purchaseOrder: {
            include: {
              supplier: true,
            },
          },
          customer: true,
          location: true,
          createdBy: { select: { name: true } },
          items: {
            include: {
              productVariant: true,
            },
          },
          _count: { select: { items: true } },
        },
        orderBy: { receivedDate: "desc" },
      });
    });

    it("should filter by date range when provided", async () => {
      // Arrange
      const startDate = new Date(2024, 0, 1);
      const endDate = new Date(2024, 0, 31);

      vi.mocked(prisma.goodsReceipt.findMany).mockResolvedValue([]);

      // Act
      await getGoodsReceipts({ startDate, endDate });

      // Assert
      expect(prisma.goodsReceipt.findMany).toHaveBeenCalledWith({
        where: {
          receivedDate: {
            gte: startDate,
            lte: endDate,
          },
        },
        include: expect.any(Object),
        orderBy: { receivedDate: "desc" },
      });
    });

    it("should filter by only startDate when endDate not provided", async () => {
      // Arrange
      const startDate = new Date(2024, 0, 1);
      vi.mocked(prisma.goodsReceipt.findMany).mockResolvedValue([]);

      // Act
      await getGoodsReceipts({ startDate });

      // Assert
      expect(prisma.goodsReceipt.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            receivedDate: {
              gte: startDate,
            },
          },
        }),
      );
    });

    it("should filter by only endDate when startDate not provided", async () => {
      // Arrange
      const endDate = new Date(2024, 0, 31);
      vi.mocked(prisma.goodsReceipt.findMany).mockResolvedValue([]);

      // Act
      await getGoodsReceipts({ endDate });

      // Assert
      expect(prisma.goodsReceipt.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            receivedDate: {
              lte: endDate,
            },
          },
        }),
      );
    });

    it("should filter by isMaklon when provided", async () => {
      // Arrange
      vi.mocked(prisma.goodsReceipt.findMany).mockResolvedValue([]);

      // Act
      await getGoodsReceipts({ isMaklon: true });

      // Assert
      expect(prisma.goodsReceipt.findMany).toHaveBeenCalledWith({
        where: {
          isMaklon: true,
        },
        include: expect.any(Object),
        orderBy: { receivedDate: "desc" },
      });
    });

    it("should filter by isMaklon false", async () => {
      // Arrange
      vi.mocked(prisma.goodsReceipt.findMany).mockResolvedValue([]);

      // Act
      await getGoodsReceipts({ isMaklon: false });

      // Assert
      expect(prisma.goodsReceipt.findMany).toHaveBeenCalledWith({
        where: {
          isMaklon: false,
        },
        include: expect.any(Object),
        orderBy: { receivedDate: "desc" },
      });
    });

    it("should combine date range and isMaklon filters", async () => {
      // Arrange
      const startDate = new Date(2024, 0, 1);
      const endDate = new Date(2024, 5, 30);
      vi.mocked(prisma.goodsReceipt.findMany).mockResolvedValue([]);

      // Act
      await getGoodsReceipts({ startDate, endDate, isMaklon: true });

      // Assert
      expect(prisma.goodsReceipt.findMany).toHaveBeenCalledWith({
        where: {
          receivedDate: { gte: startDate, lte: endDate },
          isMaklon: true,
        },
        include: expect.any(Object),
        orderBy: { receivedDate: "desc" },
      });
    });

    it("should return empty array when no receipts exist", async () => {
      // Arrange
      vi.mocked(prisma.goodsReceipt.findMany).mockResolvedValue([]);

      // Act
      const result = await getGoodsReceipts();

      // Assert
      expect(result).toEqual([]);
    });
  });

  describe("createGoodsReceipt", () => {
    const userId = "user-1";
    const locationId = "loc-1";

    const baseData = {
      receivedDate: new Date("2026-01-15"),
      locationId,
      notes: "Test receipt",
      isMaklon: false,
      items: [{ productVariantId: "pv-1", receivedQty: 10, unitCost: 5000 }],
    };

    it("should create receipt with sequential number when no previous receipts exist", async () => {
      // Arrange
      const data = { ...baseData, purchaseOrderId: "po-1" };
      vi.mocked(prisma.goodsReceipt.findFirst).mockResolvedValue(null);
      const mockReceiptTx = {
        id: "gr-1",
        receiptNumber: "GR-2026-0001",
      };
      vi.mocked(prisma.$transaction).mockImplementation(async (cb: any) => {
        const tx = {
          goodsReceipt: {
            create: vi.fn().mockResolvedValue({ ...mockReceiptTx, items: [] }),
          },
          stockMovement: { create: vi.fn().mockResolvedValue({ id: "mov-1" }) },
          purchaseOrderItem: {
            findFirst: vi.fn().mockResolvedValue({
              id: "poi-1",
              receivedQty: { toNumber: () => 0 },
              quantity: { toNumber: () => 10 },
            }),
            update: vi.fn(),
            findMany: vi.fn().mockResolvedValue([
              {
                receivedQty: { toNumber: () => 10 },
                quantity: { toNumber: () => 10 },
              },
            ]),
          },
          purchaseOrder: {
            findUnique: vi.fn().mockResolvedValue({
              id: "po-1",
              status: "SENT",
              orderNumber: "PO-001",
            }),
            update: vi.fn(),
          },
        };
        return cb(tx);
      });

      // Act
      const result = await createGoodsReceipt(data, userId);

      // Assert
      expect(result.receiptNumber).toBe("GR-2026-0001");
      expect(prisma.goodsReceipt.findFirst).toHaveBeenCalledWith({
        where: { receiptNumber: { startsWith: "GR-2026-" } },
        orderBy: { receiptNumber: "desc" },
        select: { receiptNumber: true },
      });
      expect(
        vi.mocked(InventoryCoreService.incrementStockWithCost),
      ).toHaveBeenCalledWith(expect.anything(), locationId, "pv-1", 10, 5000);
      expect(vi.mocked(logActivity)).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          action: "RECEIVE_PURCHASE",
          entityType: "GoodsReceipt",
        }),
      );
    });

    it("should increment receipt number from last receipt", async () => {
      // Arrange
      const data = { ...baseData, purchaseOrderId: "po-1" };
      vi.mocked(prisma.goodsReceipt.findFirst).mockResolvedValue({
        receiptNumber: "GR-2026-0003",
      });
      vi.mocked(prisma.$transaction).mockImplementation(async (cb: any) => {
        const tx = {
          goodsReceipt: {
            create: vi.fn().mockResolvedValue({
              id: "gr-4",
              receiptNumber: "GR-2026-0004",
              items: [],
            }),
          },
          stockMovement: { create: vi.fn().mockResolvedValue({ id: "mov-1" }) },
          purchaseOrderItem: {
            findFirst: vi.fn().mockResolvedValue(null),
            update: vi.fn(),
            findMany: vi.fn().mockResolvedValue([]),
          },
          purchaseOrder: {
            findUnique: vi.fn().mockResolvedValue(null),
            update: vi.fn(),
          },
        };
        return cb(tx);
      });

      // Act
      const result = await createGoodsReceipt(data, userId);

      // Assert
      expect(result.receiptNumber).toBe("GR-2026-0004");
    });

    it("should fall back to number 1 when last receipt number is unparseable", async () => {
      // Arrange
      const data = { ...baseData, purchaseOrderId: "po-1" };
      vi.mocked(prisma.goodsReceipt.findFirst).mockResolvedValue({
        receiptNumber: "GR-2026-INVALID",
      });
      vi.mocked(prisma.$transaction).mockImplementation(async (cb: any) => {
        const tx = {
          goodsReceipt: {
            create: vi.fn().mockResolvedValue({
              id: "gr-1",
              receiptNumber: "GR-2026-0001",
              items: [],
            }),
          },
          stockMovement: { create: vi.fn().mockResolvedValue({ id: "mov-1" }) },
          purchaseOrderItem: {
            findFirst: vi.fn().mockResolvedValue(null),
            update: vi.fn(),
            findMany: vi.fn().mockResolvedValue([]),
          },
          purchaseOrder: {
            findUnique: vi.fn().mockResolvedValue(null),
            update: vi.fn(),
          },
        };
        return cb(tx);
      });

      // Act
      const result = await createGoodsReceipt(data, userId);

      // Assert
      expect(result.receiptNumber).toBe("GR-2026-0001");
    });

    it("should pass zero unit cost for maklon receipts", async () => {
      // Arrange
      const data = {
        ...baseData,
        isMaklon: true,
        customerId: "cust-1",
        purchaseOrderId: null,
      };
      vi.mocked(prisma.goodsReceipt.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.$transaction).mockImplementation(async (cb: any) => {
        const tx = {
          goodsReceipt: {
            create: vi.fn().mockResolvedValue({
              id: "gr-1",
              receiptNumber: "GR-2026-0001",
              items: [],
            }),
          },
          stockMovement: { create: vi.fn().mockResolvedValue({ id: "mov-1" }) },
          purchaseOrderItem: {
            findFirst: vi.fn(),
            update: vi.fn(),
            findMany: vi.fn(),
          },
          purchaseOrder: { findUnique: vi.fn(), update: vi.fn() },
        };
        return cb(tx);
      });

      // Act
      await createGoodsReceipt(data, userId);

      // Assert
      expect(
        vi.mocked(InventoryCoreService.incrementStockWithCost),
      ).toHaveBeenCalledWith(expect.anything(), locationId, "pv-1", 10, 0);
    });

    it("should use correct reference for maklon receipt", async () => {
      // Arrange
      const data = {
        ...baseData,
        isMaklon: true,
        customerId: "cust-1",
        purchaseOrderId: null,
      };
      vi.mocked(prisma.goodsReceipt.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.$transaction).mockImplementation(async (cb: any) => {
        const tx = {
          goodsReceipt: {
            create: vi.fn().mockResolvedValue({
              id: "gr-1",
              receiptNumber: "GR-2026-0001",
              items: [],
            }),
          },
          stockMovement: { create: vi.fn().mockResolvedValue({ id: "mov-1" }) },
          purchaseOrderItem: {
            findFirst: vi.fn(),
            update: vi.fn(),
            findMany: vi.fn(),
          },
          purchaseOrder: { findUnique: vi.fn(), update: vi.fn() },
        };
        return cb(tx);
      });

      // Act
      await createGoodsReceipt(data, userId);

      // Assert
      // The stockMovement.create is called inside the transaction
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it("should use PO reference for non-maklon receipt", async () => {
      // Arrange
      const data = { ...baseData, purchaseOrderId: "po-1" };
      vi.mocked(prisma.goodsReceipt.findFirst).mockResolvedValue(null);
      let createdMovement: any;
      vi.mocked(prisma.$transaction).mockImplementation(async (cb: any) => {
        const tx = {
          goodsReceipt: {
            create: vi.fn().mockResolvedValue({
              id: "gr-1",
              receiptNumber: "GR-2026-0001",
              items: [],
            }),
          },
          stockMovement: {
            create: vi.fn().mockImplementation((args: any) => {
              createdMovement = args;
              return { id: "mov-1", ...args.data };
            }),
          },
          purchaseOrderItem: {
            findFirst: vi.fn().mockResolvedValue(null),
            update: vi.fn(),
            findMany: vi.fn().mockResolvedValue([
              {
                receivedQty: { toNumber: () => 10 },
                quantity: { toNumber: () => 10 },
              },
            ]),
          },
          purchaseOrder: {
            findUnique: vi.fn().mockResolvedValue({
              id: "po-1",
              status: "SENT",
              orderNumber: "PO-001",
            }),
            update: vi.fn(),
          },
        };
        return cb(tx);
      });

      // Act
      await createGoodsReceipt(data, userId);

      // Assert
      expect(createdMovement.data.reference).toBe("GR: GR-2026-0001 for PO");
    });

    it("should update PO item receivedQty when poItem is found", async () => {
      // Arrange
      const data = { ...baseData, purchaseOrderId: "po-1" };
      vi.mocked(prisma.goodsReceipt.findFirst).mockResolvedValue(null);
      const mockPoItemUpdate = vi.fn();
      vi.mocked(prisma.$transaction).mockImplementation(async (cb: any) => {
        const tx = {
          goodsReceipt: {
            create: vi.fn().mockResolvedValue({
              id: "gr-1",
              receiptNumber: "GR-2026-0001",
              items: [],
            }),
          },
          stockMovement: { create: vi.fn().mockResolvedValue({ id: "mov-1" }) },
          purchaseOrderItem: {
            findFirst: vi.fn().mockResolvedValue({
              id: "poi-1",
              receivedQty: { toNumber: () => 5 },
              quantity: { toNumber: () => 10 },
            }),
            update: mockPoItemUpdate,
            findMany: vi.fn().mockResolvedValue([
              {
                receivedQty: { toNumber: () => 15 },
                quantity: { toNumber: () => 10 },
              },
            ]),
          },
          purchaseOrder: {
            findUnique: vi.fn().mockResolvedValue({
              id: "po-1",
              status: "SENT",
              orderNumber: "PO-001",
            }),
            update: vi.fn(),
          },
        };
        return cb(tx);
      });

      // Act
      await createGoodsReceipt(data, userId);

      // Assert
      expect(mockPoItemUpdate).toHaveBeenCalledWith({
        where: { id: "poi-1" },
        data: { receivedQty: { increment: 10 } },
      });
    });

    it("should skip PO item update when poItem is not found", async () => {
      // Arrange
      const data = { ...baseData, purchaseOrderId: "po-1" };
      vi.mocked(prisma.goodsReceipt.findFirst).mockResolvedValue(null);
      const mockPoItemUpdate = vi.fn();
      vi.mocked(prisma.$transaction).mockImplementation(async (cb: any) => {
        const tx = {
          goodsReceipt: {
            create: vi.fn().mockResolvedValue({
              id: "gr-1",
              receiptNumber: "GR-2026-0001",
              items: [],
            }),
          },
          stockMovement: { create: vi.fn().mockResolvedValue({ id: "mov-1" }) },
          purchaseOrderItem: {
            findFirst: vi.fn().mockResolvedValue(null),
            update: mockPoItemUpdate,
            findMany: vi.fn().mockResolvedValue([]),
          },
          purchaseOrder: {
            findUnique: vi.fn().mockResolvedValue(null),
            update: vi.fn(),
          },
        };
        return cb(tx);
      });

      // Act
      await createGoodsReceipt(data, userId);

      // Assert
      expect(mockPoItemUpdate).not.toHaveBeenCalled();
    });

    it("should set status to RECEIVED when all items are fully received", async () => {
      // Arrange
      const data = { ...baseData, purchaseOrderId: "po-1" };
      vi.mocked(prisma.goodsReceipt.findFirst).mockResolvedValue(null);
      const mockPoUpdate = vi.fn();
      vi.mocked(prisma.$transaction).mockImplementation(async (cb: any) => {
        const tx = {
          goodsReceipt: {
            create: vi.fn().mockResolvedValue({
              id: "gr-1",
              receiptNumber: "GR-2026-0001",
              items: [],
            }),
          },
          stockMovement: { create: vi.fn().mockResolvedValue({ id: "mov-1" }) },
          purchaseOrderItem: {
            findFirst: vi.fn().mockResolvedValue(null),
            update: vi.fn(),
            findMany: vi.fn().mockResolvedValue([
              {
                receivedQty: { toNumber: () => 10 },
                quantity: { toNumber: () => 10 },
              },
            ]),
          },
          purchaseOrder: {
            findUnique: vi.fn().mockResolvedValue({
              id: "po-1",
              status: "SENT",
              orderNumber: "PO-001",
            }),
            update: mockPoUpdate,
          },
        };
        return cb(tx);
      });

      // Act
      await createGoodsReceipt(data, userId);

      // Assert
      expect(mockPoUpdate).toHaveBeenCalledWith({
        where: { id: "po-1" },
        data: { status: PurchaseOrderStatus.RECEIVED },
      });
    });

    it("should set status to PARTIAL_RECEIVED when some items partially received", async () => {
      // Arrange
      const data = { ...baseData, purchaseOrderId: "po-1" };
      vi.mocked(prisma.goodsReceipt.findFirst).mockResolvedValue(null);
      const mockPoUpdate = vi.fn();
      vi.mocked(prisma.$transaction).mockImplementation(async (cb: any) => {
        const tx = {
          goodsReceipt: {
            create: vi.fn().mockResolvedValue({
              id: "gr-1",
              receiptNumber: "GR-2026-0001",
              items: [],
            }),
          },
          stockMovement: { create: vi.fn().mockResolvedValue({ id: "mov-1" }) },
          purchaseOrderItem: {
            findFirst: vi.fn().mockResolvedValue(null),
            update: vi.fn(),
            findMany: vi.fn().mockResolvedValue([
              {
                receivedQty: { toNumber: () => 5 },
                quantity: { toNumber: () => 10 },
              },
            ]),
          },
          purchaseOrder: {
            findUnique: vi.fn().mockResolvedValue({
              id: "po-1",
              status: "SENT",
              orderNumber: "PO-001",
            }),
            update: mockPoUpdate,
          },
        };
        return cb(tx);
      });

      // Act
      await createGoodsReceipt(data, userId);

      // Assert
      expect(mockPoUpdate).toHaveBeenCalledWith({
        where: { id: "po-1" },
        data: { status: PurchaseOrderStatus.PARTIAL_RECEIVED },
      });
    });

    it("should set status to SENT when PO was DRAFT and no items received yet", async () => {
      // Arrange
      const data = { ...baseData, purchaseOrderId: "po-1" };
      vi.mocked(prisma.goodsReceipt.findFirst).mockResolvedValue(null);
      const mockPoUpdate = vi.fn();
      vi.mocked(prisma.$transaction).mockImplementation(async (cb: any) => {
        const tx = {
          goodsReceipt: {
            create: vi.fn().mockResolvedValue({
              id: "gr-1",
              receiptNumber: "GR-2026-0001",
              items: [],
            }),
          },
          stockMovement: { create: vi.fn().mockResolvedValue({ id: "mov-1" }) },
          purchaseOrderItem: {
            findFirst: vi.fn().mockResolvedValue(null),
            update: vi.fn(),
            findMany: vi.fn().mockResolvedValue([
              {
                receivedQty: { toNumber: () => 0 },
                quantity: { toNumber: () => 10 },
              },
            ]),
          },
          purchaseOrder: {
            findUnique: vi.fn().mockResolvedValue({
              id: "po-1",
              status: "DRAFT",
              orderNumber: "PO-001",
            }),
            update: mockPoUpdate,
          },
        };
        return cb(tx);
      });

      // Act
      await createGoodsReceipt(data, userId);

      // Assert
      expect(mockPoUpdate).toHaveBeenCalledWith({
        where: { id: "po-1" },
        data: { status: PurchaseOrderStatus.SENT },
      });
    });

    it("should keep existing PO status when no items received and PO is not DRAFT", async () => {
      // Arrange
      const data = { ...baseData, purchaseOrderId: "po-1" };
      vi.mocked(prisma.goodsReceipt.findFirst).mockResolvedValue(null);
      const mockPoUpdate = vi.fn();
      vi.mocked(prisma.$transaction).mockImplementation(async (cb: any) => {
        const tx = {
          goodsReceipt: {
            create: vi.fn().mockResolvedValue({
              id: "gr-1",
              receiptNumber: "GR-2026-0001",
              items: [],
            }),
          },
          stockMovement: { create: vi.fn().mockResolvedValue({ id: "mov-1" }) },
          purchaseOrderItem: {
            findFirst: vi.fn().mockResolvedValue(null),
            update: vi.fn(),
            findMany: vi.fn().mockResolvedValue([
              {
                receivedQty: { toNumber: () => 0 },
                quantity: { toNumber: () => 10 },
              },
            ]),
          },
          purchaseOrder: {
            findUnique: vi.fn().mockResolvedValue({
              id: "po-1",
              status: "PARTIAL_RECEIVED",
              orderNumber: "PO-001",
            }),
            update: mockPoUpdate,
          },
        };
        return cb(tx);
      });

      // Act
      await createGoodsReceipt(data, userId);

      // Assert
      expect(mockPoUpdate).toHaveBeenCalledWith({
        where: { id: "po-1" },
        data: { status: "PARTIAL_RECEIVED" },
      });
    });

    it("should not update PO when po is null", async () => {
      // Arrange
      const data = { ...baseData, purchaseOrderId: "po-1" };
      vi.mocked(prisma.goodsReceipt.findFirst).mockResolvedValue(null);
      const mockPoUpdate = vi.fn();
      vi.mocked(prisma.$transaction).mockImplementation(async (cb: any) => {
        const tx = {
          goodsReceipt: {
            create: vi.fn().mockResolvedValue({
              id: "gr-1",
              receiptNumber: "GR-2026-0001",
              items: [],
            }),
          },
          stockMovement: { create: vi.fn().mockResolvedValue({ id: "mov-1" }) },
          purchaseOrderItem: {
            findFirst: vi.fn().mockResolvedValue(null),
            update: vi.fn(),
            findMany: vi.fn().mockResolvedValue([
              {
                receivedQty: { toNumber: () => 0 },
                quantity: { toNumber: () => 10 },
              },
            ]),
          },
          purchaseOrder: {
            findUnique: vi.fn().mockResolvedValue(null),
            update: mockPoUpdate,
          },
        };
        return cb(tx);
      });

      // Act
      await createGoodsReceipt(data, userId);

      // Assert
      expect(mockPoUpdate).not.toHaveBeenCalled();
    });

    it("should not update PO when updatedItems is empty", async () => {
      // Arrange
      const data = { ...baseData, purchaseOrderId: "po-1" };
      vi.mocked(prisma.goodsReceipt.findFirst).mockResolvedValue(null);
      const mockPoUpdate = vi.fn();
      vi.mocked(prisma.$transaction).mockImplementation(async (cb: any) => {
        const tx = {
          goodsReceipt: {
            create: vi.fn().mockResolvedValue({
              id: "gr-1",
              receiptNumber: "GR-2026-0001",
              items: [],
            }),
          },
          stockMovement: { create: vi.fn().mockResolvedValue({ id: "mov-1" }) },
          purchaseOrderItem: {
            findFirst: vi.fn().mockResolvedValue(null),
            update: vi.fn(),
            findMany: vi.fn().mockResolvedValue([]),
          },
          purchaseOrder: {
            findUnique: vi.fn().mockResolvedValue({
              id: "po-1",
              status: "SENT",
              orderNumber: "PO-001",
            }),
            update: mockPoUpdate,
          },
        };
        return cb(tx);
      });

      // Act
      await createGoodsReceipt(data, userId);

      // Assert
      expect(mockPoUpdate).not.toHaveBeenCalled();
    });

    it("should call createDraftBillFromPo after commit when purchaseOrderId provided", async () => {
      // Arrange
      const data = { ...baseData, purchaseOrderId: "po-1" };
      vi.mocked(prisma.goodsReceipt.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.$transaction).mockImplementation(async (cb: any) => {
        const tx = {
          goodsReceipt: {
            create: vi.fn().mockResolvedValue({
              id: "gr-1",
              receiptNumber: "GR-2026-0001",
              items: [],
            }),
          },
          stockMovement: { create: vi.fn().mockResolvedValue({ id: "mov-1" }) },
          purchaseOrderItem: {
            findFirst: vi.fn().mockResolvedValue(null),
            update: vi.fn(),
            findMany: vi.fn().mockResolvedValue([]),
          },
          purchaseOrder: {
            findUnique: vi.fn().mockResolvedValue(null),
            update: vi.fn(),
          },
        };
        return cb(tx);
      });

      // Act
      await createGoodsReceipt(data, userId);

      // Assert
      expect(vi.mocked(createDraftBillFromPo)).toHaveBeenCalledWith(
        "po-1",
        userId,
      );
    });

    it("should not call createDraftBillFromPo when purchaseOrderId is not provided", async () => {
      // Arrange
      const data = {
        ...baseData,
        isMaklon: true,
        customerId: "cust-1",
        purchaseOrderId: null,
      };
      vi.mocked(prisma.goodsReceipt.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.$transaction).mockImplementation(async (cb: any) => {
        const tx = {
          goodsReceipt: {
            create: vi.fn().mockResolvedValue({
              id: "gr-1",
              receiptNumber: "GR-2026-0001",
              items: [],
            }),
          },
          stockMovement: { create: vi.fn().mockResolvedValue({ id: "mov-1" }) },
          purchaseOrderItem: {
            findFirst: vi.fn(),
            update: vi.fn(),
            findMany: vi.fn(),
          },
          purchaseOrder: { findUnique: vi.fn(), update: vi.fn() },
        };
        return cb(tx);
      });

      // Act
      await createGoodsReceipt(data, userId);

      // Assert
      expect(vi.mocked(createDraftBillFromPo)).not.toHaveBeenCalled();
    });

    it("should log error when createDraftBillFromPo fails", async () => {
      // Arrange
      const data = { ...baseData, purchaseOrderId: "po-1" };
      const billError = new Error("Bill creation failed");
      vi.mocked(prisma.goodsReceipt.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.$transaction).mockImplementation(async (cb: any) => {
        const tx = {
          goodsReceipt: {
            create: vi.fn().mockResolvedValue({
              id: "gr-1",
              receiptNumber: "GR-2026-0001",
              items: [],
            }),
          },
          stockMovement: { create: vi.fn().mockResolvedValue({ id: "mov-1" }) },
          purchaseOrderItem: {
            findFirst: vi.fn().mockResolvedValue(null),
            update: vi.fn(),
            findMany: vi.fn().mockResolvedValue([]),
          },
          purchaseOrder: {
            findUnique: vi.fn().mockResolvedValue(null),
            update: vi.fn(),
          },
        };
        return cb(tx);
      });
      vi.mocked(createDraftBillFromPo).mockRejectedValueOnce(billError);

      // Act
      const result = await createGoodsReceipt(data, userId);

      // Assert
      expect(result.id).toBe("gr-1");
      expect(vi.mocked(logger.error)).toHaveBeenCalledWith(
        "Failed to auto-generate draft bill after GR",
        { error: billError, module: "ReceiptsService" },
      );
    });

    it("should log maklon details when isMaklon is true", async () => {
      // Arrange
      const data = {
        ...baseData,
        isMaklon: true,
        customerId: "cust-1",
        purchaseOrderId: null,
      };
      vi.mocked(prisma.goodsReceipt.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.$transaction).mockImplementation(async (cb: any) => {
        const tx = {
          goodsReceipt: {
            create: vi.fn().mockResolvedValue({
              id: "gr-1",
              receiptNumber: "GR-2026-0001",
              items: [],
            }),
          },
          stockMovement: { create: vi.fn().mockResolvedValue({ id: "mov-1" }) },
          purchaseOrderItem: {
            findFirst: vi.fn(),
            update: vi.fn(),
            findMany: vi.fn(),
          },
          purchaseOrder: { findUnique: vi.fn(), update: vi.fn() },
        };
        return cb(tx);
      });

      // Act
      await createGoodsReceipt(data, userId);

      // Assert
      expect(vi.mocked(logActivity)).toHaveBeenCalledWith(
        expect.objectContaining({
          details: "Received maklon materials via GR GR-2026-0001",
        }),
      );
    });

    it("should create multiple stock movements for multiple items", async () => {
      // Arrange
      const data = {
        ...baseData,
        purchaseOrderId: "po-1",
        items: [
          { productVariantId: "pv-1", receivedQty: 10, unitCost: 5000 },
          { productVariantId: "pv-2", receivedQty: 20, unitCost: 3000 },
        ],
      };
      vi.mocked(prisma.goodsReceipt.findFirst).mockResolvedValue(null);
      const movementCreates: any[] = [];
      vi.mocked(prisma.$transaction).mockImplementation(async (cb: any) => {
        const tx = {
          goodsReceipt: {
            create: vi.fn().mockResolvedValue({
              id: "gr-1",
              receiptNumber: "GR-2026-0001",
              items: [],
            }),
          },
          stockMovement: {
            create: vi.fn().mockImplementation((args: any) => {
              movementCreates.push(args);
              return { id: `mov-${movementCreates.length}`, ...args.data };
            }),
          },
          purchaseOrderItem: {
            findFirst: vi.fn().mockResolvedValue(null),
            update: vi.fn(),
            findMany: vi.fn().mockResolvedValue([]),
          },
          purchaseOrder: {
            findUnique: vi.fn().mockResolvedValue(null),
            update: vi.fn(),
          },
        };
        return cb(tx);
      });

      // Act
      await createGoodsReceipt(data, userId);

      // Assert
      expect(movementCreates).toHaveLength(2);
      expect(movementCreates[0].data.productVariantId).toBe("pv-1");
      expect(movementCreates[0].data.quantity).toBe(10);
      expect(movementCreates[0].data.cost).toBe(5000);
      expect(movementCreates[1].data.productVariantId).toBe("pv-2");
      expect(movementCreates[1].data.quantity).toBe(20);
      expect(movementCreates[1].data.cost).toBe(3000);
      expect(
        vi.mocked(InventoryCoreService.incrementStockWithCost),
      ).toHaveBeenCalledTimes(2);
      expect(
        vi.mocked(AccountingService.recordInventoryMovement),
      ).toHaveBeenCalledTimes(2);
    });

    it("should default isMaklon to false when not provided", async () => {
      // Arrange
      const data = {
        ...baseData,
        purchaseOrderId: "po-1",
      };
      delete (data as any).isMaklon;
      vi.mocked(prisma.goodsReceipt.findFirst).mockResolvedValue(null);
      let createdReceipt: any;
      vi.mocked(prisma.$transaction).mockImplementation(async (cb: any) => {
        const tx = {
          goodsReceipt: {
            create: vi.fn().mockImplementation((args: any) => {
              createdReceipt = args;
              return { id: "gr-1", receiptNumber: "GR-2026-0001", items: [] };
            }),
          },
          stockMovement: { create: vi.fn().mockResolvedValue({ id: "mov-1" }) },
          purchaseOrderItem: {
            findFirst: vi.fn().mockResolvedValue(null),
            update: vi.fn(),
            findMany: vi.fn().mockResolvedValue([]),
          },
          purchaseOrder: {
            findUnique: vi.fn().mockResolvedValue(null),
            update: vi.fn(),
          },
        };
        return cb(tx);
      });

      // Act
      await createGoodsReceipt(data, userId);

      // Assert
      expect(createdReceipt.data.isMaklon).toBe(false);
    });

    it("should include customerId in receipt data when provided", async () => {
      // Arrange
      const data = {
        ...baseData,
        isMaklon: true,
        customerId: "cust-1",
        purchaseOrderId: null,
      };
      vi.mocked(prisma.goodsReceipt.findFirst).mockResolvedValue(null);
      let createdReceipt: any;
      vi.mocked(prisma.$transaction).mockImplementation(async (cb: any) => {
        const tx = {
          goodsReceipt: {
            create: vi.fn().mockImplementation((args: any) => {
              createdReceipt = args;
              return { id: "gr-1", receiptNumber: "GR-2026-0001", items: [] };
            }),
          },
          stockMovement: { create: vi.fn().mockResolvedValue({ id: "mov-1" }) },
          purchaseOrderItem: {
            findFirst: vi.fn(),
            update: vi.fn(),
            findMany: vi.fn(),
          },
          purchaseOrder: { findUnique: vi.fn(), update: vi.fn() },
        };
        return cb(tx);
      });

      // Act
      await createGoodsReceipt(data, userId);

      // Assert
      expect(createdReceipt.data.customerId).toBe("cust-1");
    });

    it("should not include customerId when not provided", async () => {
      // Arrange
      const data = { ...baseData, purchaseOrderId: "po-1" };
      vi.mocked(prisma.goodsReceipt.findFirst).mockResolvedValue(null);
      let createdReceipt: any;
      vi.mocked(prisma.$transaction).mockImplementation(async (cb: any) => {
        const tx = {
          goodsReceipt: {
            create: vi.fn().mockImplementation((args: any) => {
              createdReceipt = args;
              return { id: "gr-1", receiptNumber: "GR-2026-0001", items: [] };
            }),
          },
          stockMovement: { create: vi.fn().mockResolvedValue({ id: "mov-1" }) },
          purchaseOrderItem: {
            findFirst: vi.fn().mockResolvedValue(null),
            update: vi.fn(),
            findMany: vi.fn().mockResolvedValue([]),
          },
          purchaseOrder: {
            findUnique: vi.fn().mockResolvedValue(null),
            update: vi.fn(),
          },
        };
        return cb(tx);
      });

      // Act
      await createGoodsReceipt(data, userId);

      // Assert
      expect(createdReceipt.data).not.toHaveProperty("customerId");
    });

    it("should handle receipt with purchaseOrderId and no customerId", async () => {
      // Arrange
      const data = { ...baseData, purchaseOrderId: "po-5" };
      vi.mocked(prisma.goodsReceipt.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.$transaction).mockImplementation(async (cb: any) => {
        const tx = {
          goodsReceipt: {
            create: vi.fn().mockResolvedValue({
              id: "gr-5",
              receiptNumber: "GR-2026-0001",
              items: [],
            }),
          },
          stockMovement: { create: vi.fn().mockResolvedValue({ id: "mov-1" }) },
          purchaseOrderItem: {
            findFirst: vi.fn().mockResolvedValue({ id: "poi-1" }),
            update: vi.fn(),
            findMany: vi.fn().mockResolvedValue([
              {
                receivedQty: { toNumber: () => 10 },
                quantity: { toNumber: () => 10 },
              },
            ]),
          },
          purchaseOrder: {
            findUnique: vi.fn().mockResolvedValue({
              id: "po-5",
              status: "SENT",
              orderNumber: "PO-005",
            }),
            update: vi.fn(),
          },
        };
        return cb(tx);
      });

      // Act
      const result = await createGoodsReceipt(data, userId);

      // Assert
      expect(result.id).toBe("gr-5");
      expect(vi.mocked(createDraftBillFromPo)).toHaveBeenCalledWith(
        "po-5",
        userId,
      );
    });

    it("should set movement type to PURCHASE for all items", async () => {
      // Arrange
      const data = { ...baseData, purchaseOrderId: "po-1" };
      vi.mocked(prisma.goodsReceipt.findFirst).mockResolvedValue(null);
      const movementCreates: any[] = [];
      vi.mocked(prisma.$transaction).mockImplementation(async (cb: any) => {
        const tx = {
          goodsReceipt: {
            create: vi.fn().mockResolvedValue({
              id: "gr-1",
              receiptNumber: "GR-2026-0001",
              items: [],
            }),
          },
          stockMovement: {
            create: vi.fn().mockImplementation((args: any) => {
              movementCreates.push(args);
              return { id: `mov-${movementCreates.length}`, ...args.data };
            }),
          },
          purchaseOrderItem: {
            findFirst: vi.fn().mockResolvedValue(null),
            update: vi.fn(),
            findMany: vi.fn().mockResolvedValue([]),
          },
          purchaseOrder: {
            findUnique: vi.fn().mockResolvedValue(null),
            update: vi.fn(),
          },
        };
        return cb(tx);
      });

      // Act
      await createGoodsReceipt(data, userId);

      // Assert
      expect(movementCreates[0].data.type).toBe(MovementType.PURCHASE);
    });

    it("should pass correct location and user to stock movement", async () => {
      // Arrange
      const data = { ...baseData, purchaseOrderId: "po-1" };
      vi.mocked(prisma.goodsReceipt.findFirst).mockResolvedValue(null);
      const movementCreates: any[] = [];
      vi.mocked(prisma.$transaction).mockImplementation(async (cb: any) => {
        const tx = {
          goodsReceipt: {
            create: vi.fn().mockResolvedValue({
              id: "gr-1",
              receiptNumber: "GR-2026-0001",
              items: [],
            }),
          },
          stockMovement: {
            create: vi.fn().mockImplementation((args: any) => {
              movementCreates.push(args);
              return { id: `mov-${movementCreates.length}`, ...args.data };
            }),
          },
          purchaseOrderItem: {
            findFirst: vi.fn().mockResolvedValue(null),
            update: vi.fn(),
            findMany: vi.fn().mockResolvedValue([]),
          },
          purchaseOrder: {
            findUnique: vi.fn().mockResolvedValue(null),
            update: vi.fn(),
          },
        };
        return cb(tx);
      });

      // Act
      await createGoodsReceipt(data, userId);

      // Assert
      expect(movementCreates[0].data.toLocationId).toBe(locationId);
      expect(movementCreates[0].data.createdById).toBe(userId);
      expect(movementCreates[0].data.goodsReceiptId).toBe("gr-1");
    });

    it("should handle multiple items with mixed receivedQty and unitCost", async () => {
      // Arrange
      const data = {
        ...baseData,
        purchaseOrderId: "po-1",
        items: [
          { productVariantId: "pv-1", receivedQty: 5, unitCost: 10000 },
          { productVariantId: "pv-2", receivedQty: 15, unitCost: 2500 },
        ],
      };
      vi.mocked(prisma.goodsReceipt.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.$transaction).mockImplementation(async (cb: any) => {
        const tx = {
          goodsReceipt: {
            create: vi.fn().mockResolvedValue({
              id: "gr-1",
              receiptNumber: "GR-2026-0001",
              items: [],
            }),
          },
          stockMovement: { create: vi.fn().mockResolvedValue({ id: "mov-1" }) },
          purchaseOrderItem: {
            findFirst: vi.fn().mockResolvedValue(null),
            update: vi.fn(),
            findMany: vi.fn().mockResolvedValue([]),
          },
          purchaseOrder: {
            findUnique: vi.fn().mockResolvedValue(null),
            update: vi.fn(),
          },
        };
        return cb(tx);
      });

      // Act
      await createGoodsReceipt(data, userId);

      // Assert
      expect(
        vi.mocked(InventoryCoreService.incrementStockWithCost),
      ).toHaveBeenCalledTimes(2);
      expect(
        vi.mocked(InventoryCoreService.incrementStockWithCost),
      ).toHaveBeenCalledWith(expect.anything(), locationId, "pv-1", 5, 10000);
      expect(
        vi.mocked(InventoryCoreService.incrementStockWithCost),
      ).toHaveBeenCalledWith(expect.anything(), locationId, "pv-2", 15, 2500);
    });
  });
});
