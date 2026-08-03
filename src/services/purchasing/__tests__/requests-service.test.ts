import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createPurchaseRequest,
  approveRequest,
  rejectRequest,
  convertRequestToOrder,
  consolidateRequestsToOrder,
} from "../requests-service";
import { prisma } from "@/lib/core/prisma";
import { PurchaseRequestStatus, PurchaseOrderStatus } from "@prisma/client";

// Separate mockTx — tests detect if implementation uses global prisma inside tx
const mockTx = {
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
    create: vi.fn(),
  },
};

// Mock prisma — $transaction passes distinct mockTx, not global prisma
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
      create: vi.fn(),
    },
    $transaction: vi.fn((callback) => callback(mockTx)),
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

    it("should use transaction client for both findFirst and create when tx is provided", async () => {
      // Arrange - regression test: tx must be used for create too, not global prisma
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

      const mockTxLocal = {
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
        mockTxLocal as any,
      );

      // Assert - both findFirst AND create must use tx client
      expect(result).toBeDefined();
      expect(mockTxLocal.purchaseRequest.findFirst).toHaveBeenCalled();
      expect(mockTxLocal.purchaseRequest.create).toHaveBeenCalled();

      // Critical: global prisma.create must NOT be called when tx is provided
      expect(prisma.purchaseRequest.create).not.toHaveBeenCalled();
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
              { productVariantId: "pv-3", quantity: 5, notes: "" },
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

  describe("approveRequest", () => {
    it("should approve OPEN request and set reviewedById + reviewedAt", async () => {
      // Arrange
      vi.mocked(mockTx.purchaseRequest.findUnique)
        .mockResolvedValueOnce({
          id: "pr-1",
          status: PurchaseRequestStatus.OPEN,
          createdById: "user-requester",
        } as any)
        .mockResolvedValueOnce({
          id: "pr-1",
          status: PurchaseRequestStatus.APPROVED,
          reviewedById: "user-approver",
          reviewedAt: new Date(),
          rejectionReason: null,
        } as any);
      vi.mocked(mockTx.purchaseRequest.updateMany).mockResolvedValue({ count: 1 } as any);

      // Act
      const { logActivity } = await import("@/lib/tools/audit");
      const result = await approveRequest("pr-1", "user-approver", "PROCUREMENT");

      // Assert — CAS: updateMany where includes status OPEN
      expect(result).toBeDefined();
      expect(mockTx.purchaseRequest.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "pr-1", status: PurchaseRequestStatus.OPEN },
          data: expect.objectContaining({
            status: PurchaseRequestStatus.APPROVED,
            reviewedById: "user-approver",
            reviewedAt: expect.any(Date),
            rejectionReason: null,
          }),
        }),
      );
      expect(logActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "user-approver",
          action: "APPROVE_PR",
          entityType: "PurchaseRequest",
          entityId: "pr-1",
          fromStatus: "OPEN",
          toStatus: "APPROVED",
        }),
      );
    });

    it("should throw when request not found", async () => {
      vi.mocked(mockTx.purchaseRequest.findUnique).mockResolvedValue(null);
      await expect(
        approveRequest("pr-999", "user-approver", "ADMIN"),
      ).rejects.toThrow(/tidak ditemukan/i);
    });

    it("should throw when request is not OPEN", async () => {
      vi.mocked(mockTx.purchaseRequest.findUnique).mockResolvedValue({
        id: "pr-1",
        status: PurchaseRequestStatus.APPROVED,
      } as any);

      await expect(
        approveRequest("pr-1", "user-approver", "ADMIN"),
      ).rejects.toThrow(/OPEN/);
    });

    it("should throw when request is REJECTED", async () => {
      vi.mocked(mockTx.purchaseRequest.findUnique).mockResolvedValue({
        id: "pr-1",
        status: PurchaseRequestStatus.REJECTED,
      } as any);

      await expect(
        approveRequest("pr-1", "user-approver", "ADMIN"),
      ).rejects.toThrow(/OPEN/);
    });

    it("should throw when request is CONVERTED", async () => {
      vi.mocked(mockTx.purchaseRequest.findUnique).mockResolvedValue({
        id: "pr-1",
        status: PurchaseRequestStatus.CONVERTED,
      } as any);

      await expect(
        approveRequest("pr-1", "user-approver", "ADMIN"),
      ).rejects.toThrow(/OPEN/);
    });

    it("should reject self-approval when actor role is PROCUREMENT", async () => {
      vi.mocked(mockTx.purchaseRequest.findUnique).mockResolvedValue({
        id: "pr-1",
        status: PurchaseRequestStatus.OPEN,
        createdById: "user-procurement",
      } as any);

      await expect(
        approveRequest("pr-1", "user-procurement", "PROCUREMENT"),
      ).rejects.toThrow(/tidak boleh/i);
    });

    it("should allow self-approval when actor role is ADMIN", async () => {
      vi.mocked(mockTx.purchaseRequest.findUnique)
        .mockResolvedValueOnce({
          id: "pr-1",
          status: PurchaseRequestStatus.OPEN,
          createdById: "user-admin",
        } as any)
        .mockResolvedValueOnce({
          id: "pr-1",
          status: PurchaseRequestStatus.APPROVED,
        } as any);
      vi.mocked(mockTx.purchaseRequest.updateMany).mockResolvedValue({ count: 1 } as any);

      const result = await approveRequest("pr-1", "user-admin", "ADMIN");
      expect(result).toBeDefined();
      expect(mockTx.purchaseRequest.updateMany).toHaveBeenCalled();
    });

    it("should use transaction for atomic status change + audit log", async () => {
      vi.mocked(mockTx.purchaseRequest.findUnique).mockResolvedValue({
        id: "pr-1",
        status: PurchaseRequestStatus.OPEN,
        createdById: "user-1",
      } as any);
      vi.mocked(mockTx.purchaseRequest.updateMany).mockResolvedValue({ count: 1 } as any);

      await approveRequest("pr-1", "user-approver", "PROCUREMENT");

      // $transaction must be called so status change + audit are atomic
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it("should throw on CAS race — concurrent approve counts 0, no audit written", async () => {
      vi.mocked(mockTx.purchaseRequest.findUnique).mockResolvedValue({
        id: "pr-1",
        status: PurchaseRequestStatus.OPEN,
        createdById: "user-other",
      } as any);
      // CAS returns 0 — another tx already changed status
      vi.mocked(mockTx.purchaseRequest.updateMany).mockResolvedValue({ count: 0 } as any);

      const { logActivity } = await import("@/lib/tools/audit");
      vi.mocked(logActivity).mockClear();

      await expect(
        approveRequest("pr-1", "user-approver", "PROCUREMENT"),
      ).rejects.toThrow();
      // Audit must NOT be written on CAS failure
      expect(logActivity).not.toHaveBeenCalled();
    });
  });

  describe("rejectRequest", () => {
    it("should reject OPEN request with reason and set reviewedById + reviewedAt + rejectionReason", async () => {
      vi.mocked(mockTx.purchaseRequest.findUnique).mockResolvedValue({
        id: "pr-1",
        status: PurchaseRequestStatus.OPEN,
        createdById: "user-requester",
      } as any);
      vi.mocked(mockTx.purchaseRequest.updateMany).mockResolvedValue({ count: 1 } as any);

      const { logActivity } = await import("@/lib/tools/audit");
      const result = await rejectRequest(
        "pr-1",
        "user-approver",
        "PROCUREMENT",
        "Incomplete specifications",
      );

      expect(result).toBeDefined();
      expect(mockTx.purchaseRequest.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "pr-1", status: PurchaseRequestStatus.OPEN },
          data: expect.objectContaining({
            status: PurchaseRequestStatus.REJECTED,
            reviewedById: "user-approver",
            reviewedAt: expect.any(Date),
            rejectionReason: "Incomplete specifications",
          }),
        }),
      );
      expect(logActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "REJECT_PR",
          fromStatus: "OPEN",
          toStatus: "REJECTED",
        }),
      );
    });

    it("should throw when request not found", async () => {
      vi.mocked(mockTx.purchaseRequest.findUnique).mockResolvedValue(null);
      await expect(
        rejectRequest("pr-999", "user-approver", "ADMIN", "reason"),
      ).rejects.toThrow(/tidak ditemukan/i);
    });

    it("should throw when request is not OPEN", async () => {
      vi.mocked(mockTx.purchaseRequest.findUnique).mockResolvedValue({
        id: "pr-1",
        status: PurchaseRequestStatus.APPROVED,
      } as any);

      await expect(
        rejectRequest("pr-1", "user-approver", "ADMIN", "reason"),
      ).rejects.toThrow(/OPEN/);
    });

    it("should throw when rejection reason is empty string", async () => {
      // reason validation happens before tx — no mockTx setup needed
      await expect(
        rejectRequest("pr-1", "user-approver", "ADMIN", ""),
      ).rejects.toThrow(/alasan/i);
    });

    it("should throw when rejection reason is whitespace only", async () => {
      // reason validation happens before tx — no mockTx setup needed
      await expect(
        rejectRequest("pr-1", "user-approver", "ADMIN", "   "),
      ).rejects.toThrow(/alasan/i);
    });

    it("should trim rejection reason before saving", async () => {
      vi.mocked(mockTx.purchaseRequest.findUnique).mockResolvedValue({
        id: "pr-1",
        status: PurchaseRequestStatus.OPEN,
        createdById: "user-1",
      } as any);
      vi.mocked(mockTx.purchaseRequest.updateMany).mockResolvedValue({ count: 1 } as any);

      await rejectRequest(
        "pr-1",
        "user-approver",
        "ADMIN",
        "  Not enough budget  ",
      );

      expect(mockTx.purchaseRequest.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            rejectionReason: "Not enough budget",
          }),
        }),
      );
    });

    it("should allow PROCURMENT to reject request created by another user", async () => {
      vi.mocked(mockTx.purchaseRequest.findUnique).mockResolvedValue({
        id: "pr-1",
        status: PurchaseRequestStatus.OPEN,
        createdById: "user-other",
      } as any);
      vi.mocked(mockTx.purchaseRequest.updateMany).mockResolvedValue({ count: 1 } as any);

      const result = await rejectRequest(
        "pr-1",
        "user-approver",
        "PROCUREMENT",
        "Duplicate request",
      );
      expect(result).toBeDefined();
    });

    it("should allow PROCURMENT to self-reject (no self-rejection ban)", async () => {
      vi.mocked(mockTx.purchaseRequest.findUnique).mockResolvedValue({
        id: "pr-1",
        status: PurchaseRequestStatus.OPEN,
        createdById: "user-procurement",
      } as any);
      vi.mocked(mockTx.purchaseRequest.updateMany).mockResolvedValue({ count: 1 } as any);

      const result = await rejectRequest(
        "pr-1",
        "user-procurement",
        "PROCUREMENT",
        "Changed my mind",
      );
      expect(result).toBeDefined();
    });

    it("should allow self-rejection when actor role is ADMIN", async () => {
      vi.mocked(mockTx.purchaseRequest.findUnique).mockResolvedValue({
        id: "pr-1",
        status: PurchaseRequestStatus.OPEN,
        createdById: "user-admin",
      } as any);
      vi.mocked(mockTx.purchaseRequest.updateMany).mockResolvedValue({ count: 1 } as any);

      const result = await rejectRequest(
        "pr-1",
        "user-admin",
        "ADMIN",
        "Self correction",
      );
      expect(result).toBeDefined();
    });

    it("should use transaction for atomic status change + audit log", async () => {
      vi.mocked(mockTx.purchaseRequest.findUnique).mockResolvedValue({
        id: "pr-1",
        status: PurchaseRequestStatus.OPEN,
        createdById: "user-1",
      } as any);
      vi.mocked(mockTx.purchaseRequest.updateMany).mockResolvedValue({ count: 1 } as any);

      await rejectRequest("pr-1", "user-approver", "ADMIN", "reason");

      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it("should throw on CAS race — concurrent reject counts 0, no audit written", async () => {
      vi.mocked(mockTx.purchaseRequest.findUnique).mockResolvedValue({
        id: "pr-1",
        status: PurchaseRequestStatus.OPEN,
        createdById: "user-other",
      } as any);
      // CAS returns 0 — another tx already changed status
      vi.mocked(mockTx.purchaseRequest.updateMany).mockResolvedValue({ count: 0 } as any);

      const { logActivity } = await import("@/lib/tools/audit");
      vi.mocked(logActivity).mockClear();

      await expect(
        rejectRequest("pr-1", "user-approver", "ADMIN", "reason"),
      ).rejects.toThrow();
      // Audit must NOT be written on CAS failure
      expect(logActivity).not.toHaveBeenCalled();
    });
  });

  describe("convertRequestToOrder", () => {
    it("should convert APPROVED purchase request to order", async () => {
      // Arrange
      const year = new Date().getFullYear();
      const mockRequest = {
        id: "pr-1",
        requestNumber: `PR-${year}-0001`,
        status: "APPROVED",
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

      vi.mocked(mockTx.purchaseRequest.findUnique).mockResolvedValue(
        mockRequest as any,
      );
      vi.mocked(mockTx.purchaseOrder.findFirst).mockResolvedValue(null);
      vi.mocked(mockTx.purchaseOrder.create).mockResolvedValue(
        mockOrder as any,
      );
      vi.mocked(mockTx.purchaseRequest.updateMany).mockResolvedValue({ count: 1 } as any);

      // Act
      const result = await convertRequestToOrder(
        "pr-1",
        "supplier-1",
        "user-1",
      );

      // Assert — CAS: updateMany where includes status APPROVED
      expect(result).toEqual(mockOrder);
      expect(mockTx.purchaseOrder.create).toHaveBeenCalled();
      expect(mockTx.purchaseRequest.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "pr-1", status: PurchaseRequestStatus.APPROVED },
        }),
      );
    });

    it("should throw error when request tidak ditemukan", async () => {
      // Arrange
      vi.mocked(mockTx.purchaseRequest.findUnique).mockResolvedValue(null);

      // Act & Assert
      await expect(
        convertRequestToOrder("pr-999", "supplier-1", "user-1"),
      ).rejects.toThrow(/tidak ditemukan/i);
    });

    it("should throw error when request is OPEN (not yet approved)", async () => {
      // Arrange - OPEN must be rejected; only APPROVED is allowed
      vi.mocked(mockTx.purchaseRequest.findUnique).mockResolvedValue({
        id: "pr-1",
        status: "OPEN",
      } as any);

      // Act & Assert
      await expect(
        convertRequestToOrder("pr-1", "supplier-1", "user-1"),
      ).rejects.toThrow(/APPROVED/i);
    });

    it("should throw error when request is REJECTED", async () => {
      // Arrange
      vi.mocked(mockTx.purchaseRequest.findUnique).mockResolvedValue({
        id: "pr-1",
        status: "REJECTED",
      } as any);

      // Act & Assert
      await expect(
        convertRequestToOrder("pr-1", "supplier-1", "user-1"),
      ).rejects.toThrow(/APPROVED/i);
    });

    it("should throw error when request already converted", async () => {
      // Arrange — CONVERTED !== APPROVED, caught by generic non-APPROVED guard
      vi.mocked(mockTx.purchaseRequest.findUnique).mockResolvedValue({
        id: "pr-1",
        status: "CONVERTED",
      } as any);

      // Act & Assert
      await expect(
        convertRequestToOrder("pr-1", "supplier-1", "user-1"),
      ).rejects.toThrow(/APPROVED/i);
    });

    it("should throw on CAS race — concurrent convert counts 0, PO rolled back", async () => {
      const year = new Date().getFullYear();
      vi.mocked(mockTx.purchaseRequest.findUnique).mockResolvedValue({
        id: "pr-1",
        requestNumber: `PR-${year}-0001`,
        status: "APPROVED",
        items: [
          {
            productVariantId: "pv-1",
            quantity: { toNumber: () => 10 },
            productVariant: { standardCost: { toNumber: () => 100 } },
          },
        ],
      } as any);
      vi.mocked(mockTx.purchaseOrder.findFirst).mockResolvedValue(null);
      vi.mocked(mockTx.purchaseOrder.create).mockResolvedValue({
        id: "po-race",
        orderNumber: `PO-${year}-0001`,
      } as any);
      // CAS returns 0 — another tx already converted this PR
      vi.mocked(mockTx.purchaseRequest.updateMany).mockResolvedValue({ count: 0 } as any);

      await expect(
        convertRequestToOrder("pr-1", "supplier-1", "user-1"),
      ).rejects.toThrow();
    });

    it("should increment PO number when existing orders exist", async () => {
      // Arrange - branch: lastOrder?.orderNumber is truthy (line 64-66)
      const year = new Date().getFullYear();
      const mockRequest = {
        id: "pr-1",
        requestNumber: `PR-${year}-0001`,
        status: "APPROVED",
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

      vi.mocked(mockTx.purchaseRequest.findUnique).mockResolvedValue(
        mockRequest as any,
      );
      vi.mocked(mockTx.purchaseOrder.findFirst).mockResolvedValue(
        mockLastOrder as any,
      );
      vi.mocked(mockTx.purchaseOrder.create).mockResolvedValue({
        id: "po-2",
        orderNumber: `PO-${year}-0008`,
      } as any);
      vi.mocked(mockTx.purchaseRequest.updateMany).mockResolvedValue({ count: 1 } as any);

      // Act
      const result = await convertRequestToOrder(
        "pr-1",
        "supplier-1",
        "user-1",
      );

      // Assert
      expect(result.orderNumber).toBe(`PO-${year}-0008`);
    });

    it("should fallback to 0 when standardCost is null", async () => {
      const year = new Date().getFullYear();
      const mockRequest = {
        id: "pr-1",
        requestNumber: `PR-${year}-0001`,
        status: "APPROVED",
        items: [
          {
            productVariantId: "pv-1",
            quantity: { toNumber: () => 10 },
            productVariant: { standardCost: null },
          },
        ],
      };

      vi.mocked(mockTx.purchaseRequest.findUnique).mockResolvedValue(
        mockRequest as any,
      );
      vi.mocked(mockTx.purchaseOrder.findFirst).mockResolvedValue(null);
      vi.mocked(mockTx.purchaseOrder.create).mockResolvedValue({
        id: "po-3",
        orderNumber: `PO-${year}-0001`,
      } as any);
      vi.mocked(mockTx.purchaseRequest.updateMany).mockResolvedValue({ count: 1 } as any);

      await convertRequestToOrder("pr-1", "supplier-1", "user-1");

      expect(mockTx.purchaseOrder.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            totalAmount: 0,
          }),
        }),
      );
    });

    it("should calculate correct totalAmount with multiple items", async () => {
      const year = new Date().getFullYear();
      const mockRequest = {
        id: "pr-1",
        requestNumber: `PR-${year}-0001`,
        status: "APPROVED",
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

      vi.mocked(mockTx.purchaseRequest.findUnique).mockResolvedValue(
        mockRequest as any,
      );
      vi.mocked(mockTx.purchaseOrder.findFirst).mockResolvedValue(null);
      vi.mocked(mockTx.purchaseOrder.create).mockResolvedValue({
        id: "po-5",
        orderNumber: `PO-${year}-0001`,
      } as any);
      vi.mocked(mockTx.purchaseRequest.updateMany).mockResolvedValue({ count: 1 } as any);

      await convertRequestToOrder("pr-1", "supplier-1", "user-1");

      expect(mockTx.purchaseOrder.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            totalAmount: 2000,
          }),
        }),
      );
    });

    it("should update purchase request status to CONVERTED via CAS updateMany", async () => {
      const year = new Date().getFullYear();
      vi.mocked(mockTx.purchaseRequest.findUnique).mockResolvedValue({
        id: "pr-1",
        requestNumber: `PR-${year}-0001`,
        status: "APPROVED",
        items: [],
      } as any);
      vi.mocked(mockTx.purchaseOrder.findFirst).mockResolvedValue(null);
      vi.mocked(mockTx.purchaseOrder.create).mockResolvedValue({
        id: "po-6",
        orderNumber: `PO-${year}-0001`,
      } as any);
      vi.mocked(mockTx.purchaseRequest.updateMany).mockResolvedValue({ count: 1 } as any);

      await convertRequestToOrder("pr-1", "supplier-1", "user-1");

      expect(mockTx.purchaseRequest.updateMany).toHaveBeenCalledWith({
        where: { id: "pr-1", status: PurchaseRequestStatus.APPROVED },
        data: {
          status: PurchaseRequestStatus.CONVERTED,
          convertedToPoId: "po-6",
        },
      });
    });

    it("should handle PO number with non-parseable suffix", async () => {
      const year = new Date().getFullYear();
      vi.mocked(mockTx.purchaseRequest.findUnique).mockResolvedValue({
        id: "pr-1",
        requestNumber: `PR-${year}-0001`,
        status: "APPROVED",
        items: [],
      } as any);
      vi.mocked(mockTx.purchaseOrder.findFirst).mockResolvedValue({
        orderNumber: `PO-${year}-XYZ`,
      } as any);
      vi.mocked(mockTx.purchaseOrder.create).mockResolvedValue({
        id: "po-7",
        orderNumber: `PO-${year}-0001`,
      } as any);
      vi.mocked(mockTx.purchaseRequest.updateMany).mockResolvedValue({ count: 1 } as any);

      const result = await convertRequestToOrder(
        "pr-1",
        "supplier-1",
        "user-1",
      );

      expect(result.orderNumber).toBe(`PO-${year}-0001`);
    });
  });

  describe("consolidateRequestsToOrder", () => {
    it("should consolidate multiple APPROVED requests into one order", async () => {
      const year = new Date().getFullYear();
      const mockRequests = [
        {
          id: "pr-1",
          requestNumber: `PR-${year}-0001`,
          status: "APPROVED",
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
          status: "APPROVED",
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

      vi.mocked(mockTx.purchaseRequest.findMany).mockResolvedValue(
        mockRequests as any,
      );
      vi.mocked(mockTx.purchaseOrder.findFirst).mockResolvedValue(null);
      vi.mocked(mockTx.purchaseOrder.create).mockResolvedValue(
        mockOrder as any,
      );
      vi.mocked(mockTx.purchaseRequest.updateMany).mockResolvedValue({ count: 2 } as any);

      const result = await consolidateRequestsToOrder(
        ["pr-1", "pr-2"],
        "supplier-1",
        "user-1",
      );

      expect(result).toEqual(mockOrder);
      expect(mockTx.purchaseOrder.create).toHaveBeenCalled();
      // CAS: updateMany where includes status APPROVED
      expect(mockTx.purchaseRequest.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: { in: ["pr-1", "pr-2"] },
            status: PurchaseRequestStatus.APPROVED,
          },
        }),
      );
    });

    it("should throw error when no requests selected", async () => {
      await expect(
        consolidateRequestsToOrder([], "supplier-1", "user-1"),
      ).rejects.toThrow("Tidak ada permintaan yang dipilih");
    });

    it("should throw error when some requests tidak ditemukan", async () => {
      vi.mocked(mockTx.purchaseRequest.findMany).mockResolvedValue([
        { id: "pr-1", requestNumber: "PR-001" },
      ] as any);

      await expect(
        consolidateRequestsToOrder(["pr-1", "pr-999"], "supplier-1", "user-1"),
      ).rejects.toThrow(/tidak ditemukan/i);
    });

    it("should throw error when request already converted", async () => {
      vi.mocked(mockTx.purchaseRequest.findMany).mockResolvedValue([
        { id: "pr-1", requestNumber: "PR-001", status: "CONVERTED" },
      ] as any);

      await expect(
        consolidateRequestsToOrder(["pr-1"], "supplier-1", "user-1"),
      ).rejects.toThrow("is already converted");
    });

    it("should throw error when any request is OPEN (not approved)", async () => {
      vi.mocked(mockTx.purchaseRequest.findMany).mockResolvedValue([
        { id: "pr-1", requestNumber: "PR-001", status: "OPEN" },
      ] as any);

      await expect(
        consolidateRequestsToOrder(["pr-1"], "supplier-1", "user-1"),
      ).rejects.toThrow(/APPROVED/i);
    });

    it("should throw error when any request is REJECTED", async () => {
      vi.mocked(mockTx.purchaseRequest.findMany).mockResolvedValue([
        { id: "pr-1", requestNumber: "PR-001", status: "REJECTED" },
      ] as any);

      await expect(
        consolidateRequestsToOrder(["pr-1"], "supplier-1", "user-1"),
      ).rejects.toThrow(/APPROVED/i);
    });

    it("should throw on CAS race — consolidate count mismatch, PO rolled back", async () => {
      const year = new Date().getFullYear();
      const mockRequests = [
        {
          id: "pr-1",
          requestNumber: `PR-${year}-0001`,
          status: "APPROVED",
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
          status: "APPROVED",
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

      vi.mocked(mockTx.purchaseRequest.findMany).mockResolvedValue(
        mockRequests as any,
      );
      vi.mocked(mockTx.purchaseOrder.findFirst).mockResolvedValue(null);
      vi.mocked(mockTx.purchaseOrder.create).mockResolvedValue({
        id: "po-race",
        orderNumber: `PO-${year}-0001`,
      } as any);
      // CAS returns 1 instead of 2 — one PR was already converted
      vi.mocked(mockTx.purchaseRequest.updateMany).mockResolvedValue({ count: 1 } as any);

      await expect(
        consolidateRequestsToOrder(["pr-1", "pr-2"], "supplier-1", "user-1"),
      ).rejects.toThrow();
    });

    it("should aggregate same productVariantIds from different requests", async () => {
      const year = new Date().getFullYear();
      const mockRequests = [
        {
          id: "pr-1",
          requestNumber: `PR-${year}-0001`,
          status: "APPROVED",
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
          status: "APPROVED",
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

      vi.mocked(mockTx.purchaseRequest.findMany).mockResolvedValue(
        mockRequests as any,
      );
      vi.mocked(mockTx.purchaseOrder.findFirst).mockResolvedValue(null);
      vi.mocked(mockTx.purchaseOrder.create).mockResolvedValue({
        id: "po-agg",
        orderNumber: `PO-${year}-0001`,
      } as any);
      vi.mocked(mockTx.purchaseRequest.updateMany).mockResolvedValue({ count: 2 } as any);

      await consolidateRequestsToOrder(
        ["pr-1", "pr-2"],
        "supplier-1",
        "user-1",
      );

      expect(mockTx.purchaseOrder.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            totalAmount: 1500,
          }),
        }),
      );
    });

    it("should handle items with no notes (falsy notes branch)", async () => {
      const year = new Date().getFullYear();
      const mockRequests = [
        {
          id: "pr-1",
          requestNumber: `PR-${year}-0001`,
          status: "APPROVED",
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
          status: "APPROVED",
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

      vi.mocked(mockTx.purchaseRequest.findMany).mockResolvedValue(
        mockRequests as any,
      );
      vi.mocked(mockTx.purchaseOrder.findFirst).mockResolvedValue(null);
      vi.mocked(mockTx.purchaseOrder.create).mockResolvedValue({
        id: "po-no-notes",
        orderNumber: `PO-${year}-0001`,
      } as any);
      vi.mocked(mockTx.purchaseRequest.updateMany).mockResolvedValue({ count: 2 } as any);

      const result = await consolidateRequestsToOrder(
        ["pr-1", "pr-2"],
        "supplier-1",
        "user-1",
      );

      expect(result.orderNumber).toBe(`PO-${year}-0001`);
      expect(mockTx.purchaseOrder.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            totalAmount: 2000,
          }),
        }),
      );
    });

    it("should handle items with no notes aggregated with same productVariantId", async () => {
      const year = new Date().getFullYear();
      const mockRequests = [
        {
          id: "pr-1",
          requestNumber: `PR-${year}-0001`,
          status: "APPROVED",
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
          status: "APPROVED",
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

      vi.mocked(mockTx.purchaseRequest.findMany).mockResolvedValue(
        mockRequests as any,
      );
      vi.mocked(mockTx.purchaseOrder.findFirst).mockResolvedValue(null);
      vi.mocked(mockTx.purchaseOrder.create).mockResolvedValue({
        id: "po-agg-notes",
        orderNumber: `PO-${year}-0001`,
      } as any);
      vi.mocked(mockTx.purchaseRequest.updateMany).mockResolvedValue({ count: 2 } as any);

      await consolidateRequestsToOrder(
        ["pr-1", "pr-2"],
        "supplier-1",
        "user-1",
      );

      expect(mockTx.purchaseOrder.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            totalAmount: 300,
          }),
        }),
      );
    });

    it("should handle items with notes aggregated with same productVariantId", async () => {
      const year = new Date().getFullYear();
      const mockRequests = [
        {
          id: "pr-1",
          requestNumber: `PR-${year}-0001`,
          status: "APPROVED",
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
          status: "APPROVED",
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

      vi.mocked(mockTx.purchaseRequest.findMany).mockResolvedValue(
        mockRequests as any,
      );
      vi.mocked(mockTx.purchaseOrder.findFirst).mockResolvedValue(null);
      vi.mocked(mockTx.purchaseOrder.create).mockResolvedValue({
        id: "po-agg-both-notes",
        orderNumber: `PO-${year}-0001`,
      } as any);
      vi.mocked(mockTx.purchaseRequest.updateMany).mockResolvedValue({ count: 2 } as any);

      await consolidateRequestsToOrder(
        ["pr-1", "pr-2"],
        "supplier-1",
        "user-1",
      );

      expect(mockTx.purchaseOrder.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            totalAmount: 100,
          }),
        }),
      );
    });

    it("should increment PO number when existing orders exist", async () => {
      const year = new Date().getFullYear();
      const mockRequests = [
        {
          id: "pr-1",
          requestNumber: `PR-${year}-0001`,
          status: "APPROVED",
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

      vi.mocked(mockTx.purchaseRequest.findMany).mockResolvedValue(
        mockRequests as any,
      );
      vi.mocked(mockTx.purchaseOrder.findFirst).mockResolvedValue({
        orderNumber: `PO-${year}-0005`,
      } as any);
      vi.mocked(mockTx.purchaseOrder.create).mockResolvedValue({
        id: "po-inc",
        orderNumber: `PO-${year}-0006`,
      } as any);
      vi.mocked(mockTx.purchaseRequest.updateMany).mockResolvedValue({ count: 1 } as any);

      const result = await consolidateRequestsToOrder(
        ["pr-1"],
        "supplier-1",
        "user-1",
      );

      expect(result.orderNumber).toBe(`PO-${year}-0006`);
    });

    it("should handle PO number with non-parseable suffix", async () => {
      const year = new Date().getFullYear();
      vi.mocked(mockTx.purchaseRequest.findMany).mockResolvedValue([
        {
          id: "pr-1",
          requestNumber: `PR-${year}-0001`,
          status: "APPROVED",
          items: [],
        },
      ] as any);
      vi.mocked(mockTx.purchaseOrder.findFirst).mockResolvedValue({
        orderNumber: `PO-${year}-ABC`,
      } as any);
      vi.mocked(mockTx.purchaseOrder.create).mockResolvedValue({
        id: "po-nan",
        orderNumber: `PO-${year}-0001`,
      } as any);
      vi.mocked(mockTx.purchaseRequest.updateMany).mockResolvedValue({ count: 1 } as any);

      const result = await consolidateRequestsToOrder(
        ["pr-1"],
        "supplier-1",
        "user-1",
      );

      expect(result.orderNumber).toBe(`PO-${year}-0001`);
    });

    it("should handle standardCost being null in consolidation", async () => {
      const year = new Date().getFullYear();
      vi.mocked(mockTx.purchaseRequest.findMany).mockResolvedValue([
        {
          id: "pr-1",
          requestNumber: `PR-${year}-0001`,
          status: "APPROVED",
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
      vi.mocked(mockTx.purchaseOrder.findFirst).mockResolvedValue(null);
      vi.mocked(mockTx.purchaseOrder.create).mockResolvedValue({
        id: "po-null-cost",
        orderNumber: `PO-${year}-0001`,
      } as any);
      vi.mocked(mockTx.purchaseRequest.updateMany).mockResolvedValue({ count: 1 } as any);

      await consolidateRequestsToOrder(["pr-1"], "supplier-1", "user-1");

      expect(mockTx.purchaseOrder.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            totalAmount: 0,
          }),
        }),
      );
    });

    it("should handle standardCost being undefined in consolidation", async () => {
      const year = new Date().getFullYear();
      vi.mocked(mockTx.purchaseRequest.findMany).mockResolvedValue([
        {
          id: "pr-1",
          requestNumber: `PR-${year}-0001`,
          status: "APPROVED",
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
      vi.mocked(mockTx.purchaseOrder.findFirst).mockResolvedValue(null);
      vi.mocked(mockTx.purchaseOrder.create).mockResolvedValue({
        id: "po-undef-cost",
        orderNumber: `PO-${year}-0001`,
      } as any);
      vi.mocked(mockTx.purchaseRequest.updateMany).mockResolvedValue({ count: 1 } as any);

      await consolidateRequestsToOrder(["pr-1"], "supplier-1", "user-1");

      expect(mockTx.purchaseOrder.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            totalAmount: 0,
          }),
        }),
      );
    });

    it("should update all request statuses to CONVERTED via CAS updateMany", async () => {
      const year = new Date().getFullYear();
      vi.mocked(mockTx.purchaseRequest.findMany).mockResolvedValue([
        {
          id: "pr-1",
          requestNumber: `PR-${year}-0001`,
          status: "APPROVED",
          items: [],
        },
        {
          id: "pr-2",
          requestNumber: `PR-${year}-0002`,
          status: "APPROVED",
          items: [],
        },
      ] as any);
      vi.mocked(mockTx.purchaseOrder.findFirst).mockResolvedValue(null);
      vi.mocked(mockTx.purchaseOrder.create).mockResolvedValue({
        id: "po-status",
        orderNumber: `PO-${year}-0001`,
      } as any);
      vi.mocked(mockTx.purchaseRequest.updateMany).mockResolvedValue({ count: 2 } as any);

      await consolidateRequestsToOrder(
        ["pr-1", "pr-2"],
        "supplier-1",
        "user-1",
      );

      expect(mockTx.purchaseRequest.updateMany).toHaveBeenCalledWith({
        where: {
          id: { in: ["pr-1", "pr-2"] },
          status: PurchaseRequestStatus.APPROVED,
        },
        data: {
          status: PurchaseRequestStatus.CONVERTED,
          convertedToPoId: "po-status",
        },
      });
    });

    it("should handle three requests with mixed productVariantIds and notes", async () => {
      const year = new Date().getFullYear();
      const mockRequests = [
        {
          id: "pr-1",
          requestNumber: `PR-${year}-0001`,
          status: "APPROVED",
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
          status: "APPROVED",
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
          status: "APPROVED",
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

      vi.mocked(mockTx.purchaseRequest.findMany).mockResolvedValue(
        mockRequests as any,
      );
      vi.mocked(mockTx.purchaseOrder.findFirst).mockResolvedValue(null);
      vi.mocked(mockTx.purchaseOrder.create).mockResolvedValue({
        id: "po-complex",
        orderNumber: `PO-${year}-0001`,
      } as any);
      vi.mocked(mockTx.purchaseRequest.updateMany).mockResolvedValue({ count: 3 } as any);

      const result = await consolidateRequestsToOrder(
        ["pr-1", "pr-2", "pr-3"],
        "supplier-1",
        "user-1",
      );

      expect(result.orderNumber).toBe(`PO-${year}-0001`);
      expect(mockTx.purchaseOrder.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            totalAmount: 2600,
          }),
        }),
      );
    });
  });
});
