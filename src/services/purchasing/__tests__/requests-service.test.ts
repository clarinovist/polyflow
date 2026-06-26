import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createPurchaseRequest,
  convertRequestToOrder,
  consolidateRequestsToOrder,
} from "../requests-service";
import { prisma } from "@/lib/core/prisma";
import { PurchaseRequestStatus, PurchaseOrderStatus } from "@prisma/client";

// Mock prisma
vi.mock("@/lib/core/prisma", () => ({
  prisma: {
    purchaseRequest: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    purchaseOrder: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    $transaction: vi.fn((callback) => callback(prisma)),
  },
}));

// Mock audit
vi.mock("@/lib/tools/audit", () => ({
  logActivity: vi.fn(),
}));

describe("requests-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createPurchaseRequest", () => {
    it("should create purchase request with generated request number", async () => {
      // Arrange
      const year = new Date().getFullYear();
      const requestData = {
        salesOrderId: "so-1",
        priority: "NORMAL" as const,
        notes: "Test request",
        items: [
          {
            productVariantId: "pv-1",
            quantity: 10,
            notes: "Need this material",
          },
        ],
      };

      const mockCreatedRequest = {
        id: "pr-1",
        requestNumber: `PR-${year}-0001`,
        status: PurchaseRequestStatus.OPEN,
        items: [{ id: "item-1" }],
      };

      vi.mocked(prisma.purchaseRequest.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.purchaseRequest.create).mockResolvedValue(
        mockCreatedRequest as any,
      );

      // Act
      const result = await createPurchaseRequest(requestData, "user-1");

      // Assert
      expect(result).toEqual(mockCreatedRequest);
      expect(prisma.purchaseRequest.create).toHaveBeenCalledWith({
        data: {
          requestNumber: `PR-${year}-0001`,
          salesOrderId: "so-1",
          priority: "NORMAL",
          notes: "Test request",
          status: PurchaseRequestStatus.OPEN,
          createdById: "user-1",
          items: {
            create: [
              {
                productVariantId: "pv-1",
                quantity: 10,
                notes: "Need this material",
              },
            ],
          },
        },
        include: { items: true },
      });
    });

    it("should increment request number based on existing requests", async () => {
      // Arrange
      const year = new Date().getFullYear();
      const requestData = {
        salesOrderId: "so-1",
        priority: "URGENT" as const,
        notes: "",
        items: [
          {
            productVariantId: "pv-1",
            quantity: 5,
            notes: "",
          },
        ],
      };

      const mockLastRequest = {
        requestNumber: `PR-${year}-0003`,
      };

      const mockCreatedRequest = {
        id: "pr-2",
        requestNumber: `PR-${year}-0004`,
        status: PurchaseRequestStatus.OPEN,
      };

      vi.mocked(prisma.purchaseRequest.findFirst).mockResolvedValue(
        mockLastRequest as any,
      );
      vi.mocked(prisma.purchaseRequest.create).mockResolvedValue(
        mockCreatedRequest as any,
      );

      // Act
      const result = await createPurchaseRequest(requestData, "user-1");

      // Assert
      expect(result.requestNumber).toBe(`PR-${year}-0004`);
    });

    it("should use transaction when provided", async () => {
      // Arrange
      const year = new Date().getFullYear();
      const requestData = {
        salesOrderId: "so-1",
        priority: "NORMAL" as const,
        notes: "",
        items: [
          {
            productVariantId: "pv-1",
            quantity: 10,
            notes: "",
          },
        ],
      };

      const mockTx = {
        purchaseRequest: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({
            id: "pr-1",
            requestNumber: `PR-${year}-0001`,
          }),
        },
      };

      // Act
      const result = await createPurchaseRequest(
        requestData,
        "user-1",
        mockTx as any,
      );

      // Assert
      expect(result).toBeDefined();
      expect(mockTx.purchaseRequest.findFirst).toHaveBeenCalled();
    });

    it("should default to 0001 when last request number has non-parseable suffix", async () => {
      // Arrange - branch: isNaN(numPart) is true (line 21 false branch)
      const year = new Date().getFullYear();
      const requestData = {
        salesOrderId: "so-1",
        priority: "NORMAL" as const,
        notes: "",
        items: [{ productVariantId: "pv-1", quantity: 3, notes: "" }],
      };

      const mockLastRequest = {
        requestNumber: `PR-${year}-ABC`,
      };

      vi.mocked(prisma.purchaseRequest.findFirst).mockResolvedValue(
        mockLastRequest as any,
      );
      vi.mocked(prisma.purchaseRequest.create).mockResolvedValue({
        id: "pr-new",
        requestNumber: `PR-${year}-0001`,
        items: [],
      } as any);

      // Act
      const result = await createPurchaseRequest(requestData, "user-1");

      // Assert - parseInt('ABC') is NaN, so nextNumber stays 1
      expect(result.requestNumber).toBe(`PR-${year}-0001`);
      expect(prisma.purchaseRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            requestNumber: `PR-${year}-0001`,
          }),
        }),
      );
    });

    it("should create with multiple items", async () => {
      // Arrange
      const year = new Date().getFullYear();
      const requestData = {
        salesOrderId: "so-2",
        priority: "NORMAL" as const,
        notes: "Bulk order",
        items: [
          { productVariantId: "pv-1", quantity: 10, notes: "First" },
          { productVariantId: "pv-2", quantity: 20, notes: "Second" },
          { productVariantId: "pv-3", quantity: 5, notes: "" },
        ],
      };

      vi.mocked(prisma.purchaseRequest.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.purchaseRequest.create).mockResolvedValue({
        id: "pr-multi",
        requestNumber: `PR-${year}-0001`,
        items: [],
      } as any);

      // Act
      await createPurchaseRequest(requestData, "user-1");

      // Assert
      expect(prisma.purchaseRequest.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          items: {
            create: [
              { productVariantId: "pv-1", quantity: 10, notes: "First" },
              { productVariantId: "pv-2", quantity: 20, notes: "Second" },
              { productVariantId: "pv-3", quantity: 5, notes: undefined },
            ],
          },
        }),
        include: { items: true },
      });
    });

    it("should handle large request numbers with padding", async () => {
      // Arrange
      const year = new Date().getFullYear();
      vi.mocked(prisma.purchaseRequest.findFirst).mockResolvedValue({
        requestNumber: `PR-${year}-0099`,
      } as any);
      vi.mocked(prisma.purchaseRequest.create).mockResolvedValue({
        id: "pr-big",
        requestNumber: `PR-${year}-0100`,
        items: [],
      } as any);

      // Act
      const result = await createPurchaseRequest(
        {
          salesOrderId: "so-1",
          priority: "NORMAL" as const,
          notes: "",
          items: [{ productVariantId: "pv-1", quantity: 1, notes: "" }],
        },
        "user-1",
      );

      // Assert
      expect(result.requestNumber).toBe(`PR-${year}-0100`);
    });
  });

  describe("convertRequestToOrder", () => {
    it("should convert purchase request to order", async () => {
      // Arrange
      const year = new Date().getFullYear();
      const mockRequest = {
        id: "pr-1",
        requestNumber: `PR-${year}-0001`,
        status: "OPEN",
        items: [
          {
            productVariantId: "pv-1",
            quantity: { toNumber: () => 10 },
            productVariant: { standardCost: { toNumber: () => 100 } },
          },
        ],
      };

      const mockOrder = {
        id: "po-1",
        orderNumber: `PO-${year}-0001`,
        status: PurchaseOrderStatus.DRAFT,
      };

      vi.mocked(prisma.purchaseRequest.findUnique).mockResolvedValue(
        mockRequest as any,
      );
      vi.mocked(prisma.purchaseOrder.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.purchaseOrder.create).mockResolvedValue(
        mockOrder as any,
      );
      vi.mocked(prisma.purchaseRequest.update).mockResolvedValue({} as any);

      // Act
      const result = await convertRequestToOrder(
        "pr-1",
        "supplier-1",
        "user-1",
      );

      // Assert
      expect(result).toEqual(mockOrder);
      expect(prisma.purchaseOrder.create).toHaveBeenCalled();
    });

    it("should throw error when request not found", async () => {
      // Arrange
      vi.mocked(prisma.purchaseRequest.findUnique).mockResolvedValue(null);

      // Act & Assert
      await expect(
        convertRequestToOrder("pr-999", "supplier-1", "user-1"),
      ).rejects.toThrow("Purchase Request not found");
    });

    it("should throw error when request already converted", async () => {
      // Arrange
      vi.mocked(prisma.purchaseRequest.findUnique).mockResolvedValue({
        id: "pr-1",
        status: "CONVERTED",
      } as any);

      // Act & Assert
      await expect(
        convertRequestToOrder("pr-1", "supplier-1", "user-1"),
      ).rejects.toThrow("Request already converted");
    });

    it("should increment PO number when existing orders exist", async () => {
      // Arrange - branch: lastOrder?.orderNumber is truthy (line 64-66)
      const year = new Date().getFullYear();
      const mockRequest = {
        id: "pr-1",
        requestNumber: `PR-${year}-0001`,
        status: "OPEN",
        items: [
          {
            productVariantId: "pv-1",
            quantity: { toNumber: () => 5 },
            productVariant: { standardCost: { toNumber: () => 200 } },
          },
        ],
      };

      const mockLastOrder = {
        orderNumber: `PO-${year}-0007`,
      };

      vi.mocked(prisma.purchaseRequest.findUnique).mockResolvedValue(
        mockRequest as any,
      );
      vi.mocked(prisma.purchaseOrder.findFirst).mockResolvedValue(
        mockLastOrder as any,
      );
      vi.mocked(prisma.purchaseOrder.create).mockResolvedValue({
        id: "po-2",
        orderNumber: `PO-${year}-0008`,
      } as any);
      vi.mocked(prisma.purchaseRequest.update).mockResolvedValue({} as any);

      // Act
      const result = await convertRequestToOrder(
        "pr-1",
        "supplier-1",
        "user-1",
      );

      // Assert
      expect(result.orderNumber).toBe(`PO-${year}-0008`);
      expect(prisma.purchaseOrder.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            orderNumber: `PO-${year}-0008`,
          }),
        }),
      );
    });

    it("should fallback to 0 when standardCost is null", async () => {
      // Arrange - branch: standardCost is null/falsy (line 71: || 0 fallback)
      const year = new Date().getFullYear();
      const mockRequest = {
        id: "pr-1",
        requestNumber: `PR-${year}-0001`,
        status: "OPEN",
        items: [
          {
            productVariantId: "pv-1",
            quantity: { toNumber: () => 10 },
            productVariant: { standardCost: null },
          },
        ],
      };

      vi.mocked(prisma.purchaseRequest.findUnique).mockResolvedValue(
        mockRequest as any,
      );
      vi.mocked(prisma.purchaseOrder.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.purchaseOrder.create).mockResolvedValue({
        id: "po-3",
        orderNumber: `PO-${year}-0001`,
      } as any);
      vi.mocked(prisma.purchaseRequest.update).mockResolvedValue({} as any);

      // Act
      await convertRequestToOrder("pr-1", "supplier-1", "user-1");

      // Assert - totalAmount should be 0 (10 * 0)
      expect(prisma.purchaseOrder.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            totalAmount: 0,
          }),
        }),
      );
    });

    it("should fallback to 0 when standardCost is undefined", async () => {
      // Arrange - branch: standardCost undefined, toNumber() not callable
      const year = new Date().getFullYear();
      const mockRequest = {
        id: "pr-1",
        requestNumber: `PR-${year}-0001`,
        status: "OPEN",
        items: [
          {
            productVariantId: "pv-1",
            quantity: { toNumber: () => 4 },
            productVariant: {},
          },
        ],
      };

      vi.mocked(prisma.purchaseRequest.findUnique).mockResolvedValue(
        mockRequest as any,
      );
      vi.mocked(prisma.purchaseOrder.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.purchaseOrder.create).mockResolvedValue({
        id: "po-4",
        orderNumber: `PO-${year}-0001`,
      } as any);
      vi.mocked(prisma.purchaseRequest.update).mockResolvedValue({} as any);

      // Act
      await convertRequestToOrder("pr-1", "supplier-1", "user-1");

      // Assert
      expect(prisma.purchaseOrder.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            totalAmount: 0,
          }),
        }),
      );
    });

    it("should calculate correct totalAmount with multiple items", async () => {
      // Arrange
      const year = new Date().getFullYear();
      const mockRequest = {
        id: "pr-1",
        requestNumber: `PR-${year}-0001`,
        status: "OPEN",
        items: [
          {
            productVariantId: "pv-1",
            quantity: { toNumber: () => 10 },
            productVariant: { standardCost: { toNumber: () => 100 } },
          },
          {
            productVariantId: "pv-2",
            quantity: { toNumber: () => 5 },
            productVariant: { standardCost: { toNumber: () => 200 } },
          },
        ],
      };

      vi.mocked(prisma.purchaseRequest.findUnique).mockResolvedValue(
        mockRequest as any,
      );
      vi.mocked(prisma.purchaseOrder.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.purchaseOrder.create).mockResolvedValue({
        id: "po-5",
        orderNumber: `PO-${year}-0001`,
      } as any);
      vi.mocked(prisma.purchaseRequest.update).mockResolvedValue({} as any);

      // Act
      await convertRequestToOrder("pr-1", "supplier-1", "user-1");

      // Assert - totalAmount = (10 * 100) + (5 * 200) = 2000
      expect(prisma.purchaseOrder.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            totalAmount: 2000,
          }),
        }),
      );
    });

    it("should update purchase request status to CONVERTED", async () => {
      // Arrange
      const year = new Date().getFullYear();
      vi.mocked(prisma.purchaseRequest.findUnique).mockResolvedValue({
        id: "pr-1",
        requestNumber: `PR-${year}-0001`,
        status: "OPEN",
        items: [],
      } as any);
      vi.mocked(prisma.purchaseOrder.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.purchaseOrder.create).mockResolvedValue({
        id: "po-6",
        orderNumber: `PO-${year}-0001`,
      } as any);
      vi.mocked(prisma.purchaseRequest.update).mockResolvedValue({} as any);

      // Act
      await convertRequestToOrder("pr-1", "supplier-1", "user-1");

      // Assert
      expect(prisma.purchaseRequest.update).toHaveBeenCalledWith({
        where: { id: "pr-1" },
        data: {
          status: PurchaseRequestStatus.CONVERTED,
          convertedToPoId: "po-6",
        },
      });
    });

    it("should handle PO number with non-parseable suffix", async () => {
      // Arrange - branch: lastOrder.orderNumber has non-numeric suffix after prefix (line 66 isNaN true)
      const year = new Date().getFullYear();
      vi.mocked(prisma.purchaseRequest.findUnique).mockResolvedValue({
        id: "pr-1",
        requestNumber: `PR-${year}-0001`,
        status: "OPEN",
        items: [],
      } as any);
      vi.mocked(prisma.purchaseOrder.findFirst).mockResolvedValue({
        orderNumber: `PO-${year}-XYZ`,
      } as any);
      vi.mocked(prisma.purchaseOrder.create).mockResolvedValue({
        id: "po-7",
        orderNumber: `PO-${year}-0001`,
      } as any);
      vi.mocked(prisma.purchaseRequest.update).mockResolvedValue({} as any);

      // Act
      const result = await convertRequestToOrder(
        "pr-1",
        "supplier-1",
        "user-1",
      );

      // Assert - parseInt('XYZ') is NaN, so nextNumber stays 1
      expect(result.orderNumber).toBe(`PO-${year}-0001`);
    });
  });

  describe("consolidateRequestsToOrder", () => {
    it("should consolidate multiple requests into one order", async () => {
      // Arrange
      const year = new Date().getFullYear();
      const mockRequests = [
        {
          id: "pr-1",
          requestNumber: `PR-${year}-0001`,
          status: "OPEN",
          items: [
            {
              productVariantId: "pv-1",
              quantity: { toNumber: () => 10 },
              notes: "Item 1",
              productVariant: { standardCost: { toNumber: () => 100 } },
            },
          ],
        },
        {
          id: "pr-2",
          requestNumber: `PR-${year}-0002`,
          status: "OPEN",
          items: [
            {
              productVariantId: "pv-1",
              quantity: { toNumber: () => 5 },
              notes: "Item 2",
              productVariant: { standardCost: { toNumber: () => 100 } },
            },
          ],
        },
      ];

      const mockOrder = {
        id: "po-1",
        orderNumber: `PO-${year}-0001`,
        status: PurchaseOrderStatus.DRAFT,
        totalAmount: 1500,
      };

      vi.mocked(prisma.purchaseRequest.findMany).mockResolvedValue(
        mockRequests as any,
      );
      vi.mocked(prisma.purchaseOrder.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.purchaseOrder.create).mockResolvedValue(
        mockOrder as any,
      );
      vi.mocked(prisma.purchaseRequest.updateMany).mockResolvedValue({} as any);

      // Act
      const result = await consolidateRequestsToOrder(
        ["pr-1", "pr-2"],
        "supplier-1",
        "user-1",
      );

      // Assert
      expect(result).toEqual(mockOrder);
      expect(prisma.purchaseOrder.create).toHaveBeenCalled();
    });

    it("should throw error when no requests selected", async () => {
      // Act & Assert
      await expect(
        consolidateRequestsToOrder([], "supplier-1", "user-1"),
      ).rejects.toThrow("No requests selected for consolidation");
    });

    it("should throw error when some requests not found", async () => {
      // Arrange
      vi.mocked(prisma.purchaseRequest.findMany).mockResolvedValue([
        { id: "pr-1", requestNumber: "PR-001" },
      ] as any);

      // Act & Assert
      await expect(
        consolidateRequestsToOrder(["pr-1", "pr-999"], "supplier-1", "user-1"),
      ).rejects.toThrow("Some requests could not be found");
    });

    it("should throw error when request already converted", async () => {
      // Arrange
      vi.mocked(prisma.purchaseRequest.findMany).mockResolvedValue([
        { id: "pr-1", requestNumber: "PR-001", status: "CONVERTED" },
      ] as any);

      // Act & Assert
      await expect(
        consolidateRequestsToOrder(["pr-1"], "supplier-1", "user-1"),
      ).rejects.toThrow("is already converted");
    });

    it("should aggregate same productVariantIds from different requests", async () => {
      // Arrange - both PRs have same pv-1, should aggregate quantities
      const year = new Date().getFullYear();
      const mockRequests = [
        {
          id: "pr-1",
          requestNumber: `PR-${year}-0001`,
          status: "OPEN",
          items: [
            {
              productVariantId: "pv-1",
              quantity: { toNumber: () => 10 },
              notes: "First batch",
              productVariant: { standardCost: { toNumber: () => 50 } },
            },
          ],
        },
        {
          id: "pr-2",
          requestNumber: `PR-${year}-0002`,
          status: "OPEN",
          items: [
            {
              productVariantId: "pv-1",
              quantity: { toNumber: () => 20 },
              notes: "Second batch",
              productVariant: { standardCost: { toNumber: () => 50 } },
            },
          ],
        },
      ];

      vi.mocked(prisma.purchaseRequest.findMany).mockResolvedValue(
        mockRequests as any,
      );
      vi.mocked(prisma.purchaseOrder.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.purchaseOrder.create).mockResolvedValue({
        id: "po-agg",
        orderNumber: `PO-${year}-0001`,
      } as any);
      vi.mocked(prisma.purchaseRequest.updateMany).mockResolvedValue({} as any);

      // Act
      await consolidateRequestsToOrder(
        ["pr-1", "pr-2"],
        "supplier-1",
        "user-1",
      );

      // Assert - aggregated quantity = 10 + 20 = 30, totalAmount = 30 * 50 = 1500
      expect(prisma.purchaseOrder.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            totalAmount: 1500,
          }),
        }),
      );
    });

    it("should handle items with no notes (falsy notes branch)", async () => {
      // Arrange - branch: item.notes is falsy (line 151/159 else branch)
      const year = new Date().getFullYear();
      const mockRequests = [
        {
          id: "pr-1",
          requestNumber: `PR-${year}-0001`,
          status: "OPEN",
          items: [
            {
              productVariantId: "pv-1",
              quantity: { toNumber: () => 10 },
              notes: null,
              productVariant: { standardCost: { toNumber: () => 100 } },
            },
          ],
        },
        {
          id: "pr-2",
          requestNumber: `PR-${year}-0002`,
          status: "OPEN",
          items: [
            {
              productVariantId: "pv-2",
              quantity: { toNumber: () => 5 },
              notes: undefined,
              productVariant: { standardCost: { toNumber: () => 200 } },
            },
          ],
        },
      ];

      vi.mocked(prisma.purchaseRequest.findMany).mockResolvedValue(
        mockRequests as any,
      );
      vi.mocked(prisma.purchaseOrder.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.purchaseOrder.create).mockResolvedValue({
        id: "po-no-notes",
        orderNumber: `PO-${year}-0001`,
      } as any);
      vi.mocked(prisma.purchaseRequest.updateMany).mockResolvedValue({} as any);

      // Act
      const result = await consolidateRequestsToOrder(
        ["pr-1", "pr-2"],
        "supplier-1",
        "user-1",
      );

      // Assert - different productVariantIds, no aggregation
      expect(result.orderNumber).toBe(`PO-${year}-0001`);
      expect(prisma.purchaseOrder.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            totalAmount: 2000, // (10 * 100) + (5 * 200)
          }),
        }),
      );
    });

    it("should handle items with no notes aggregated with same productVariantId", async () => {
      // Arrange - same pv, first has no notes, second has notes -> aggregation path with notes
      const year = new Date().getFullYear();
      const mockRequests = [
        {
          id: "pr-1",
          requestNumber: `PR-${year}-0001`,
          status: "OPEN",
          items: [
            {
              productVariantId: "pv-1",
              quantity: { toNumber: () => 8 },
              notes: null,
              productVariant: { standardCost: { toNumber: () => 25 } },
            },
          ],
        },
        {
          id: "pr-2",
          requestNumber: `PR-${year}-0002`,
          status: "OPEN",
          items: [
            {
              productVariantId: "pv-1",
              quantity: { toNumber: () => 4 },
              notes: "Restock needed",
              productVariant: { standardCost: { toNumber: () => 25 } },
            },
          ],
        },
      ];

      vi.mocked(prisma.purchaseRequest.findMany).mockResolvedValue(
        mockRequests as any,
      );
      vi.mocked(prisma.purchaseOrder.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.purchaseOrder.create).mockResolvedValue({
        id: "po-agg-notes",
        orderNumber: `PO-${year}-0001`,
      } as any);
      vi.mocked(prisma.purchaseRequest.updateMany).mockResolvedValue({} as any);

      // Act
      await consolidateRequestsToOrder(
        ["pr-1", "pr-2"],
        "supplier-1",
        "user-1",
      );

      // Assert - aggregated: qty = 12, totalAmount = 12 * 25 = 300
      expect(prisma.purchaseOrder.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            totalAmount: 300,
          }),
        }),
      );
    });

    it("should handle items with notes aggregated with same productVariantId", async () => {
      // Arrange - same pv, both have notes -> line 153 branch (existing + notes truthy)
      const year = new Date().getFullYear();
      const mockRequests = [
        {
          id: "pr-1",
          requestNumber: `PR-${year}-0001`,
          status: "OPEN",
          items: [
            {
              productVariantId: "pv-1",
              quantity: { toNumber: () => 3 },
              notes: "Urgent",
              productVariant: { standardCost: { toNumber: () => 10 } },
            },
          ],
        },
        {
          id: "pr-2",
          requestNumber: `PR-${year}-0002`,
          status: "OPEN",
          items: [
            {
              productVariantId: "pv-1",
              quantity: { toNumber: () => 7 },
              notes: "Standard",
              productVariant: { standardCost: { toNumber: () => 10 } },
            },
          ],
        },
      ];

      vi.mocked(prisma.purchaseRequest.findMany).mockResolvedValue(
        mockRequests as any,
      );
      vi.mocked(prisma.purchaseOrder.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.purchaseOrder.create).mockResolvedValue({
        id: "po-agg-both-notes",
        orderNumber: `PO-${year}-0001`,
      } as any);
      vi.mocked(prisma.purchaseRequest.updateMany).mockResolvedValue({} as any);

      // Act
      await consolidateRequestsToOrder(
        ["pr-1", "pr-2"],
        "supplier-1",
        "user-1",
      );

      // Assert
      expect(prisma.purchaseOrder.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            totalAmount: 100, // (3+7) * 10
          }),
        }),
      );
    });

    it("should increment PO number when existing orders exist", async () => {
      // Arrange - branch: lastOrder?.orderNumber is truthy (lines 174-175)
      const year = new Date().getFullYear();
      const mockRequests = [
        {
          id: "pr-1",
          requestNumber: `PR-${year}-0001`,
          status: "OPEN",
          items: [
            {
              productVariantId: "pv-1",
              quantity: { toNumber: () => 2 },
              notes: "Need",
              productVariant: { standardCost: { toNumber: () => 50 } },
            },
          ],
        },
      ];

      vi.mocked(prisma.purchaseRequest.findMany).mockResolvedValue(
        mockRequests as any,
      );
      vi.mocked(prisma.purchaseOrder.findFirst).mockResolvedValue({
        orderNumber: `PO-${year}-0005`,
      } as any);
      vi.mocked(prisma.purchaseOrder.create).mockResolvedValue({
        id: "po-inc",
        orderNumber: `PO-${year}-0006`,
      } as any);
      vi.mocked(prisma.purchaseRequest.updateMany).mockResolvedValue({} as any);

      // Act
      const result = await consolidateRequestsToOrder(
        ["pr-1"],
        "supplier-1",
        "user-1",
      );

      // Assert
      expect(result.orderNumber).toBe(`PO-${year}-0006`);
      expect(prisma.purchaseOrder.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            orderNumber: `PO-${year}-0006`,
          }),
        }),
      );
    });

    it("should handle PO number with non-parseable suffix", async () => {
      // Arrange - branch: lastOrder.orderNumber has non-numeric suffix (line 175 isNaN true)
      const year = new Date().getFullYear();
      vi.mocked(prisma.purchaseRequest.findMany).mockResolvedValue([
        {
          id: "pr-1",
          requestNumber: `PR-${year}-0001`,
          status: "OPEN",
          items: [],
        },
      ] as any);
      vi.mocked(prisma.purchaseOrder.findFirst).mockResolvedValue({
        orderNumber: `PO-${year}-ABC`,
      } as any);
      vi.mocked(prisma.purchaseOrder.create).mockResolvedValue({
        id: "po-nan",
        orderNumber: `PO-${year}-0001`,
      } as any);
      vi.mocked(prisma.purchaseRequest.updateMany).mockResolvedValue({} as any);

      // Act
      const result = await consolidateRequestsToOrder(
        ["pr-1"],
        "supplier-1",
        "user-1",
      );

      // Assert - parseInt('ABC') is NaN, nextNumber stays 1
      expect(result.orderNumber).toBe(`PO-${year}-0001`);
    });

    it("should handle standardCost being null in consolidation", async () => {
      // Arrange - branch: standardCost is null (line 149: || 0 fallback)
      const year = new Date().getFullYear();
      vi.mocked(prisma.purchaseRequest.findMany).mockResolvedValue([
        {
          id: "pr-1",
          requestNumber: `PR-${year}-0001`,
          status: "OPEN",
          items: [
            {
              productVariantId: "pv-1",
              quantity: { toNumber: () => 10 },
              notes: "Need",
              productVariant: { standardCost: null },
            },
          ],
        },
      ] as any);
      vi.mocked(prisma.purchaseOrder.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.purchaseOrder.create).mockResolvedValue({
        id: "po-null-cost",
        orderNumber: `PO-${year}-0001`,
      } as any);
      vi.mocked(prisma.purchaseRequest.updateMany).mockResolvedValue({} as any);

      // Act
      await consolidateRequestsToOrder(["pr-1"], "supplier-1", "user-1");

      // Assert - unitPrice = 0 (null || 0), totalAmount = 10 * 0 = 0
      expect(prisma.purchaseOrder.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            totalAmount: 0,
          }),
        }),
      );
    });

    it("should handle standardCost being undefined in consolidation", async () => {
      // Arrange - branch: standardCost undefined, toNumber() not callable
      const year = new Date().getFullYear();
      vi.mocked(prisma.purchaseRequest.findMany).mockResolvedValue([
        {
          id: "pr-1",
          requestNumber: `PR-${year}-0001`,
          status: "OPEN",
          items: [
            {
              productVariantId: "pv-1",
              quantity: { toNumber: () => 6 },
              notes: null,
              productVariant: {},
            },
          ],
        },
      ] as any);
      vi.mocked(prisma.purchaseOrder.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.purchaseOrder.create).mockResolvedValue({
        id: "po-undef-cost",
        orderNumber: `PO-${year}-0001`,
      } as any);
      vi.mocked(prisma.purchaseRequest.updateMany).mockResolvedValue({} as any);

      // Act
      await consolidateRequestsToOrder(["pr-1"], "supplier-1", "user-1");

      // Assert
      expect(prisma.purchaseOrder.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            totalAmount: 0,
          }),
        }),
      );
    });

    it("should update all request statuses to CONVERTED", async () => {
      // Arrange
      const year = new Date().getFullYear();
      vi.mocked(prisma.purchaseRequest.findMany).mockResolvedValue([
        {
          id: "pr-1",
          requestNumber: `PR-${year}-0001`,
          status: "OPEN",
          items: [],
        },
        {
          id: "pr-2",
          requestNumber: `PR-${year}-0002`,
          status: "OPEN",
          items: [],
        },
      ] as any);
      vi.mocked(prisma.purchaseOrder.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.purchaseOrder.create).mockResolvedValue({
        id: "po-status",
        orderNumber: `PO-${year}-0001`,
      } as any);
      vi.mocked(prisma.purchaseRequest.updateMany).mockResolvedValue({} as any);

      // Act
      await consolidateRequestsToOrder(
        ["pr-1", "pr-2"],
        "supplier-1",
        "user-1",
      );

      // Assert
      expect(prisma.purchaseRequest.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ["pr-1", "pr-2"] } },
        data: {
          status: PurchaseRequestStatus.CONVERTED,
          convertedToPoId: "po-status",
        },
      });
    });

    it("should connect all request IDs to the created purchase order", async () => {
      // Arrange
      const year = new Date().getFullYear();
      vi.mocked(prisma.purchaseRequest.findMany).mockResolvedValue([
        {
          id: "pr-1",
          requestNumber: `PR-${year}-0001`,
          status: "OPEN",
          items: [],
        },
      ] as any);
      vi.mocked(prisma.purchaseOrder.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.purchaseOrder.create).mockResolvedValue({
        id: "po-connect",
        orderNumber: `PO-${year}-0001`,
      } as any);
      vi.mocked(prisma.purchaseRequest.updateMany).mockResolvedValue({} as any);

      // Act
      await consolidateRequestsToOrder(["pr-1"], "supplier-1", "user-1");

      // Assert
      expect(prisma.purchaseOrder.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            purchaseRequests: {
              connect: [{ id: "pr-1" }],
            },
          }),
        }),
      );
    });

    it("should handle three requests with mixed productVariantIds and notes", async () => {
      // Arrange - complex scenario: 3 PRs, overlapping PVs, some with notes, some without
      const year = new Date().getFullYear();
      const mockRequests = [
        {
          id: "pr-1",
          requestNumber: `PR-${year}-0001`,
          status: "OPEN",
          items: [
            {
              productVariantId: "pv-1",
              quantity: { toNumber: () => 10 },
              notes: "Fast delivery",
              productVariant: { standardCost: { toNumber: () => 100 } },
            },
            {
              productVariantId: "pv-2",
              quantity: { toNumber: () => 5 },
              notes: null,
              productVariant: { standardCost: { toNumber: () => 200 } },
            },
          ],
        },
        {
          id: "pr-2",
          requestNumber: `PR-${year}-0002`,
          status: "OPEN",
          items: [
            {
              productVariantId: "pv-1",
              quantity: { toNumber: () => 3 },
              notes: "Standard",
              productVariant: { standardCost: { toNumber: () => 100 } },
            },
            {
              productVariantId: "pv-3",
              quantity: { toNumber: () => 2 },
              notes: "Urgent",
              productVariant: { standardCost: { toNumber: () => 50 } },
            },
          ],
        },
        {
          id: "pr-3",
          requestNumber: `PR-${year}-0003`,
          status: "OPEN",
          items: [
            {
              productVariantId: "pv-2",
              quantity: { toNumber: () => 1 },
              notes: null,
              productVariant: { standardCost: { toNumber: () => 200 } },
            },
          ],
        },
      ];

      vi.mocked(prisma.purchaseRequest.findMany).mockResolvedValue(
        mockRequests as any,
      );
      vi.mocked(prisma.purchaseOrder.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.purchaseOrder.create).mockResolvedValue({
        id: "po-complex",
        orderNumber: `PO-${year}-0001`,
      } as any);
      vi.mocked(prisma.purchaseRequest.updateMany).mockResolvedValue({} as any);

      // Act
      const result = await consolidateRequestsToOrder(
        ["pr-1", "pr-2", "pr-3"],
        "supplier-1",
        "user-1",
      );

      // Assert
      // pv-1: (10+3) * 100 = 1300
      // pv-2: (5+1) * 200 = 1200
      // pv-3: 2 * 50 = 100
      // total = 2600
      expect(result.orderNumber).toBe(`PO-${year}-0001`);
      expect(prisma.purchaseOrder.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            totalAmount: 2600,
          }),
        }),
      );
    });
  });
});
