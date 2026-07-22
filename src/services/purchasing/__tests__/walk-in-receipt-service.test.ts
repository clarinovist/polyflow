import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  listReceivablePurchaseOrders,
  getGoodsReceiptsForDay,
  createWalkInReceipt,
  WALK_IN_NOTE_PREFIX,
} from "../walk-in-receipt-service";
import { isWalkInPurchaseOrderNotes } from "@/lib/purchasing/walk-in";
import { prisma } from "@/lib/core/prisma";
import { createOrder, updateOrderStatus } from "../orders-service";
import { createGoodsReceipt } from "../receipts-service";
import { PurchaseOrderStatus } from "@prisma/client";

vi.mock("@/lib/core/prisma", () => ({
  prisma: {
    purchaseOrder: {
      findMany: vi.fn(),
    },
    goodsReceipt: {
      findMany: vi.fn(),
    },
    supplier: {
      findUnique: vi.fn(),
    },
    location: {
      findUnique: vi.fn(),
    },
    purchaseOrderItem: {
      findFirst: vi.fn(),
    },
    productVariant: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("../orders-service", () => ({
  createOrder: vi.fn(),
  updateOrderStatus: vi.fn(),
}));

vi.mock("../receipts-service", () => ({
  createGoodsReceipt: vi.fn(),
}));

vi.mock("@/lib/config/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

describe("walk-in-receipt-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("isWalkInPurchaseOrderNotes", () => {
    it("detects walk-in marker", () => {
      expect(isWalkInPurchaseOrderNotes(`${WALK_IN_NOTE_PREFIX}\nNo.nota: X`)).toBe(
        true,
      );
      expect(isWalkInPurchaseOrderNotes("normal notes")).toBe(false);
      expect(isWalkInPurchaseOrderNotes(null)).toBe(false);
    });
  });

  describe("listReceivablePurchaseOrders", () => {
    it("queries SENT and PARTIAL_RECEIVED only", async () => {
      vi.mocked(prisma.purchaseOrder.findMany).mockResolvedValue([] as never);
      await listReceivablePurchaseOrders();
      expect(prisma.purchaseOrder.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            status: {
              in: [
                PurchaseOrderStatus.SENT,
                PurchaseOrderStatus.PARTIAL_RECEIVED,
              ],
            },
          },
        }),
      );
    });
  });

  describe("getGoodsReceiptsForDay", () => {
    it("filters non-maklon receipts for the day", async () => {
      vi.mocked(prisma.goodsReceipt.findMany).mockResolvedValue([] as never);
      const day = new Date("2026-07-22T12:00:00");
      await getGoodsReceiptsForDay(day);
      expect(prisma.goodsReceipt.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isMaklon: false,
            receivedDate: expect.any(Object),
          }),
        }),
      );
    });
  });

  describe("createWalkInReceipt", () => {
    it("throws when items empty", async () => {
      await expect(
        createWalkInReceipt(
          {
            supplierId: "s1",
            supplierRefNo: "N-1",
            receivedDate: new Date(),
            locationId: "loc-1",
            items: [],
          } as never,
          "user-1",
        ),
      ).rejects.toThrow(/Minimal satu item/);
    });

    it("throws when supplier missing", async () => {
      vi.mocked(prisma.supplier.findUnique).mockResolvedValue(null);
      await expect(
        createWalkInReceipt(
          {
            supplierId: "s-missing",
            supplierRefNo: "N-1",
            receivedDate: new Date(),
            locationId: "loc-1",
            notes: undefined as unknown as string,
            items: [
              { productVariantId: "pv-1", receivedQty: 10, unitCost: 1000 },
            ],
          },
          "user-1",
        ),
      ).rejects.toThrow(/Supplier/);
    });

    it("creates PO SENT then goods receipt", async () => {
      vi.mocked(prisma.supplier.findUnique).mockResolvedValue({
        id: "s1",
        name: "Supplier A",
      } as never);
      vi.mocked(prisma.location.findUnique).mockResolvedValue({
        id: "loc-1",
      } as never);
      vi.mocked(prisma.purchaseOrderItem.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.productVariant.findUnique).mockResolvedValue({
        standardCost: 500,
      } as never);

      const order = {
        id: "po-1",
        orderNumber: "PO-2026-0099",
      };
      vi.mocked(createOrder).mockResolvedValue(order as never);
      vi.mocked(updateOrderStatus).mockResolvedValue(order as never);
      vi.mocked(createGoodsReceipt).mockResolvedValue({
        id: "gr-1",
        receiptNumber: "GR-2026-0099",
      } as never);

      const result = await createWalkInReceipt(
        {
          supplierId: "s1",
          supplierRefNo: "SJ-778",
          receivedDate: new Date("2026-07-22"),
          locationId: "loc-1",
          notes: "Datang langsung",
          items: [
            { productVariantId: "pv-1", receivedQty: 25, unitCost: null },
          ],
        },
        "user-1",
      );

      expect(createOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          supplierId: "s1",
          notes: expect.stringContaining(WALK_IN_NOTE_PREFIX),
          items: [
            expect.objectContaining({
              productVariantId: "pv-1",
              quantity: 25,
              unitPrice: 500,
            }),
          ],
        }),
        "user-1",
      );
      expect(updateOrderStatus).toHaveBeenCalledWith(
        "po-1",
        PurchaseOrderStatus.SENT,
        "user-1",
      );
      expect(createGoodsReceipt).toHaveBeenCalledWith(
        expect.objectContaining({
          purchaseOrderId: "po-1",
          locationId: "loc-1",
          items: [
            expect.objectContaining({
              productVariantId: "pv-1",
              receivedQty: 25,
              unitCost: 500,
            }),
          ],
        }),
        "user-1",
      );
      expect(result.goodsReceipt.id).toBe("gr-1");
      expect(result.purchaseOrder.id).toBe("po-1");
    });
  });
});
