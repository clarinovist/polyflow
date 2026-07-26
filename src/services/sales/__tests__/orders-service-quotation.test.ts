import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  sendQuotation,
  acceptQuotation,
  rejectQuotation,
  expireQuotation,
  reopenQuotation,
  autoExpireQuotations,
} from "../orders-service";
import { prisma } from "@/lib/core/prisma";
import { SalesOrderStatus } from "@prisma/client";
import { logActivity } from "@/lib/tools/audit";

vi.mock("@/lib/core/prisma", () => ({
  prisma: {
    salesOrder: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/tools/audit", () => ({
  logActivity: vi.fn(),
}));

const USER_ID = "user-1";

/** Minimal order row; only the fields the transitions read. */
function order(status: SalesOrderStatus, overrides: Record<string, unknown> = {}) {
  return {
    id: "so-1",
    orderNumber: "SO-2026-0001",
    customerId: "cust-1",
    status,
    ...overrides,
  };
}

function mockOrder(row: unknown) {
  vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue(row as never);
  vi.mocked(prisma.salesOrder.update).mockResolvedValue({ id: "so-1" } as never);
}

describe("orders-service quotation lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("sendQuotation", () => {
    it("moves QUOTATION to QUOTATION_SENT and stamps quotationSentAt", async () => {
      // Arrange
      mockOrder(order(SalesOrderStatus.QUOTATION));

      // Act
      await sendQuotation("so-1", USER_ID);

      // Assert
      const args = vi.mocked(prisma.salesOrder.update).mock.calls[0][0];
      expect(args.where).toEqual({ id: "so-1" });
      expect(args.data.status).toBe(SalesOrderStatus.QUOTATION_SENT);
      expect(args.data.quotationSentAt).toBeInstanceOf(Date);
    });

    it("records an audit trail entry with both statuses", async () => {
      // Arrange
      mockOrder(order(SalesOrderStatus.QUOTATION));

      // Act
      await sendQuotation("so-1", USER_ID);

      // Assert
      expect(logActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: USER_ID,
          action: "QUOTATION_SENT",
          entityType: "SalesOrder",
          entityId: "so-1",
          fromStatus: SalesOrderStatus.QUOTATION,
          toStatus: SalesOrderStatus.QUOTATION_SENT,
        })
      );
    });

    it("throws when the quotation was already sent", async () => {
      // Arrange
      mockOrder(order(SalesOrderStatus.QUOTATION_SENT));

      // Act + Assert
      await expect(sendQuotation("so-1", USER_ID)).rejects.toThrow(
        /QUOTATION status can be sent/i
      );
      expect(prisma.salesOrder.update).not.toHaveBeenCalled();
    });

    it("throws when the order does not exist", async () => {
      // Arrange
      vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue(null as never);

      // Act + Assert
      await expect(sendQuotation("missing", USER_ID)).rejects.toThrow();
    });
  });

  describe("acceptQuotation", () => {
    it.each([SalesOrderStatus.QUOTATION, SalesOrderStatus.QUOTATION_SENT])(
      "moves %s into the order phase as DRAFT",
      async (status) => {
        // Arrange
        mockOrder(order(status));

        // Act
        await acceptQuotation("so-1", USER_ID);

        // Assert
        expect(prisma.salesOrder.update).toHaveBeenCalledWith({
          where: { id: "so-1" },
          data: { status: SalesOrderStatus.DRAFT },
        });
      }
    );

    it("refuses to accept without a customer, since confirm requires one", async () => {
      // Arrange
      mockOrder(order(SalesOrderStatus.QUOTATION, { customerId: null }));

      // Act + Assert
      await expect(acceptQuotation("so-1", USER_ID)).rejects.toThrow(
        /customer/i
      );
      expect(prisma.salesOrder.update).not.toHaveBeenCalled();
    });

    it("throws when the quotation is already rejected", async () => {
      // Arrange
      mockOrder(order(SalesOrderStatus.QUOTATION_REJECTED));

      // Act + Assert
      await expect(acceptQuotation("so-1", USER_ID)).rejects.toThrow(
        /can be accepted/i
      );
    });
  });

  describe("rejectQuotation", () => {
    it("moves QUOTATION_SENT to QUOTATION_REJECTED", async () => {
      // Arrange
      mockOrder(order(SalesOrderStatus.QUOTATION_SENT));

      // Act
      await rejectQuotation("so-1", USER_ID);

      // Assert
      expect(prisma.salesOrder.update).toHaveBeenCalledWith({
        where: { id: "so-1" },
        data: { status: SalesOrderStatus.QUOTATION_REJECTED },
      });
    });

    it("appends the reason to the audit detail when given", async () => {
      // Arrange
      mockOrder(order(SalesOrderStatus.QUOTATION_SENT));

      // Act
      await rejectQuotation("so-1", USER_ID, "harga terlalu tinggi");

      // Assert
      expect(logActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "QUOTATION_REJECTED",
          details: expect.stringContaining("harga terlalu tinggi"),
        })
      );
    });

    it("throws when the order is already operational", async () => {
      // Arrange
      mockOrder(order(SalesOrderStatus.CONFIRMED));

      // Act + Assert
      await expect(rejectQuotation("so-1", USER_ID)).rejects.toThrow(
        /can be rejected/i
      );
    });
  });

  describe("expireQuotation", () => {
    it("moves QUOTATION_SENT to QUOTATION_EXPIRED", async () => {
      // Arrange
      mockOrder(order(SalesOrderStatus.QUOTATION_SENT));

      // Act
      await expireQuotation("so-1", USER_ID);

      // Assert
      expect(prisma.salesOrder.update).toHaveBeenCalledWith({
        where: { id: "so-1" },
        data: { status: SalesOrderStatus.QUOTATION_EXPIRED },
      });
      expect(logActivity).toHaveBeenCalledWith(
        expect.objectContaining({ action: "QUOTATION_EXPIRED" })
      );
    });

    it("throws when the order already left the quotation phase", async () => {
      // Arrange
      mockOrder(order(SalesOrderStatus.DRAFT));

      // Act + Assert
      await expect(expireQuotation("so-1", USER_ID)).rejects.toThrow(
        /can be expired/i
      );
    });
  });

  describe("reopenQuotation", () => {
    it.each([
      SalesOrderStatus.QUOTATION_REJECTED,
      SalesOrderStatus.QUOTATION_EXPIRED,
    ])("returns %s to QUOTATION", async (status) => {
      // Arrange
      mockOrder(order(status));

      // Act
      await reopenQuotation("so-1", USER_ID);

      // Assert
      expect(prisma.salesOrder.update).toHaveBeenCalledWith({
        where: { id: "so-1" },
        data: { status: SalesOrderStatus.QUOTATION },
      });
    });

    it("throws when the quotation is still open", async () => {
      // Arrange
      mockOrder(order(SalesOrderStatus.QUOTATION_SENT));

      // Act + Assert
      await expect(reopenQuotation("so-1", USER_ID)).rejects.toThrow(
        /can be reopened/i
      );
    });
  });

  describe("missing orders", () => {
    it.each([
      ["acceptQuotation", acceptQuotation],
      ["rejectQuotation", rejectQuotation],
      ["expireQuotation", expireQuotation],
      ["reopenQuotation", reopenQuotation],
    ])("%s rejects an id that has no order", async (_name, transition) => {
      // Arrange
      vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue(null as never);

      // Act + Assert
      await expect(transition("missing", USER_ID)).rejects.toThrow();
      expect(prisma.salesOrder.update).not.toHaveBeenCalled();
    });
  });

  describe("autoExpireQuotations", () => {
    it("expires every sent quotation past its validUntil date", async () => {
      // Arrange
      vi.mocked(prisma.salesOrder.findMany).mockResolvedValue([
        { id: "so-1" },
        { id: "so-2" },
      ] as never);
      vi.mocked(prisma.salesOrder.updateMany).mockResolvedValue({
        count: 2,
      } as never);

      // Act
      const count = await autoExpireQuotations();

      // Assert
      expect(count).toBe(2);
      expect(prisma.salesOrder.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ["so-1", "so-2"] } },
        data: { status: SalesOrderStatus.QUOTATION_EXPIRED },
      });
    });

    it("only looks at QUOTATION_SENT orders whose validUntil has passed", async () => {
      // Arrange
      vi.mocked(prisma.salesOrder.findMany).mockResolvedValue([] as never);

      // Act
      await autoExpireQuotations();

      // Assert
      expect(prisma.salesOrder.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            status: SalesOrderStatus.QUOTATION_SENT,
            validUntil: { lt: expect.any(Date) },
          },
        })
      );
    });

    it("skips the update entirely when nothing has expired", async () => {
      // Arrange
      vi.mocked(prisma.salesOrder.findMany).mockResolvedValue([] as never);

      // Act
      const count = await autoExpireQuotations();

      // Assert
      expect(count).toBe(0);
      expect(prisma.salesOrder.updateMany).not.toHaveBeenCalled();
    });
  });
});
