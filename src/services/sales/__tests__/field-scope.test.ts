import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/core/prisma", () => ({
  prisma: {
    customer: { count: vi.fn() },
    salesOrder: { count: vi.fn() },
  },
}));

vi.mock("@/lib/auth/roles", () => ({
  hasAnyRole: vi.fn(),
}));

import { prisma } from "@/lib/core/prisma";
import { hasAnyRole } from "@/lib/auth/roles";
import {
  getFieldSalesScope,
  scopedCustomerWhere,
  scopedSalesOrderWhere,
  scopedInvoiceWhere,
  assertCanAccessFieldCustomer,
  assertCanAccessFieldOrder,
} from "../field-scope";

describe("field-scope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getFieldSalesScope", () => {
    it("returns isGlobalViewer true for ADMIN", () => {
      vi.mocked(hasAnyRole).mockReturnValue(true);
      const scope = getFieldSalesScope({
        user: { id: "u1", role: "ADMIN", roles: null },
      });
      expect(scope.isGlobalViewer).toBe(true);
      expect(scope.actorUserId).toBe("u1");
    });

    it("returns isGlobalViewer false for SALES", () => {
      vi.mocked(hasAnyRole).mockReturnValue(false);
      const scope = getFieldSalesScope({
        user: { id: "u2", role: "SALES", roles: null },
      });
      expect(scope.isGlobalViewer).toBe(false);
      expect(scope.actorUserId).toBe("u2");
    });
  });

  describe("scopedCustomerWhere", () => {
    it("returns empty object for global viewer", () => {
      const where = scopedCustomerWhere({ actorUserId: "u1", isGlobalViewer: true });
      expect(where).toEqual({});
    });

    it("returns OR predicates for sales user", () => {
      const where = scopedCustomerWhere({ actorUserId: "u1", isGlobalViewer: false });
      expect(where.OR).toBeDefined();
      expect(where.OR!.length).toBe(4);
    });
  });

  describe("scopedSalesOrderWhere", () => {
    it("returns empty for global viewer", () => {
      const where = scopedSalesOrderWhere({ actorUserId: "u1", isGlobalViewer: true });
      expect(where).toEqual({});
    });

    it("returns OR with createdById and assignment for sales", () => {
      const where = scopedSalesOrderWhere({ actorUserId: "u1", isGlobalViewer: false });
      expect(where.OR).toBeDefined();
      expect(where.OR!.length).toBe(2);
    });
  });

  describe("scopedInvoiceWhere", () => {
    it("filters unpaid/partial/overdue for global viewer", () => {
      const where = scopedInvoiceWhere({ actorUserId: "u1", isGlobalViewer: true });
      expect(where.status).toEqual({ in: ["UNPAID", "PARTIAL", "OVERDUE"] });
    });

    it("chains to scopedSalesOrderWhere for sales", () => {
      const where = scopedInvoiceWhere({ actorUserId: "u1", isGlobalViewer: false });
      expect(where.status).toEqual({ in: ["UNPAID", "PARTIAL", "OVERDUE"] });
      expect(where.salesOrder).toBeDefined();
    });
  });

  describe("assertCanAccessFieldCustomer", () => {
    it("does nothing for global viewer", async () => {
      await expect(
        assertCanAccessFieldCustomer({ actorUserId: "u1", isGlobalViewer: true }, "cus-1")
      ).resolves.toBeUndefined();
    });

    it("throws NotFoundError when customer not in scope", async () => {
      vi.mocked(prisma.customer.count).mockResolvedValue(0);
      await expect(
        assertCanAccessFieldCustomer({ actorUserId: "u1", isGlobalViewer: false }, "cus-1")
      ).rejects.toThrow();
    });

    it("does nothing when customer is in scope", async () => {
      vi.mocked(prisma.customer.count).mockResolvedValue(1);
      await expect(
        assertCanAccessFieldCustomer({ actorUserId: "u1", isGlobalViewer: false }, "cus-1")
      ).resolves.toBeUndefined();
    });
  });

  describe("assertCanAccessFieldOrder", () => {
    it("does nothing for global viewer", async () => {
      await expect(
        assertCanAccessFieldOrder({ actorUserId: "u1", isGlobalViewer: true }, "ord-1")
      ).resolves.toBeUndefined();
    });

    it("throws NotFoundError when order not in scope", async () => {
      vi.mocked(prisma.salesOrder.count).mockResolvedValue(0);
      await expect(
        assertCanAccessFieldOrder({ actorUserId: "u1", isGlobalViewer: false }, "ord-1")
      ).rejects.toThrow();
    });

    it("does nothing when order is in scope", async () => {
      vi.mocked(prisma.salesOrder.count).mockResolvedValue(1);
      await expect(
        assertCanAccessFieldOrder({ actorUserId: "u1", isGlobalViewer: false }, "ord-1")
      ).resolves.toBeUndefined();
    });
  });
});
