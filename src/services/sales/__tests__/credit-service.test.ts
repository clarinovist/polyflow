import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/core/prisma", () => ({
  prisma: {
    customer: { findUnique: vi.fn(), findMany: vi.fn() },
    invoice: { findMany: vi.fn(), groupBy: vi.fn(), findFirst: vi.fn() },
    salesOrder: { findMany: vi.fn(), groupBy: vi.fn() },
  },
}));

vi.mock("@/lib/utils/utils", () => ({
  formatRupiah: (n: number) => `Rp ${n.toLocaleString("id-ID")}`,
}));

import { prisma } from "@/lib/core/prisma";
import {
  getCustomerCreditExposure,
  checkCreditLimit,
  getCustomersWithCreditSummary,
} from "../credit-service";
import { BusinessRuleError } from "@/lib/errors/errors";

function mockDecimal(n: number) {
  return { toNumber: () => n, toString: () => String(n), valueOf: () => n } as never;
}

describe("credit-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getCustomerCreditExposure", () => {
    it("returns null when customer not found", async () => {
      vi.mocked(prisma.customer.findUnique).mockResolvedValue(null);
      const result = await getCustomerCreditExposure("cus-1");
      expect(result).toBeNull();
    });

    it("returns null when creditLimit is null", async () => {
      vi.mocked(prisma.customer.findUnique).mockResolvedValue({
        creditLimit: null,
      } as never);
      const result = await getCustomerCreditExposure("cus-1");
      expect(result).toBeNull();
    });

    it("returns null when creditLimit is 0", async () => {
      vi.mocked(prisma.customer.findUnique).mockResolvedValue({
        creditLimit: mockDecimal(0),
      } as never);
      const result = await getCustomerCreditExposure("cus-1");
      expect(result).toBeNull();
    });

    it("calculates exposure with unpaid invoices only", async () => {
      vi.mocked(prisma.customer.findUnique).mockResolvedValue({
        creditLimit: mockDecimal(10000000),
      } as never);
      vi.mocked(prisma.invoice.findMany).mockResolvedValue([
        { totalAmount: mockDecimal(5000000), paidAmount: mockDecimal(1000000) },
        { totalAmount: mockDecimal(3000000), paidAmount: mockDecimal(0) },
      ] as never);
      vi.mocked(prisma.salesOrder.findMany).mockResolvedValue([]);

      const result = await getCustomerCreditExposure("cus-1");
      expect(result).toEqual({
        creditLimit: 10000000,
        unpaidInvoiceBalance: 7000000,
        openOrderWithoutInvoice: 0,
        currentExposure: 7000000,
        headroom: 3000000,
      });
    });

    it("calculates exposure with active SO without invoice", async () => {
      vi.mocked(prisma.customer.findUnique).mockResolvedValue({
        creditLimit: mockDecimal(10000000),
      } as never);
      vi.mocked(prisma.invoice.findMany).mockResolvedValue([]);
      vi.mocked(prisma.salesOrder.findMany).mockResolvedValue([
        { totalAmount: mockDecimal(4000000) },
        { totalAmount: mockDecimal(2000000) },
      ] as never);

      const result = await getCustomerCreditExposure("cus-1");
      expect(result).toEqual({
        creditLimit: 10000000,
        unpaidInvoiceBalance: 0,
        openOrderWithoutInvoice: 6000000,
        currentExposure: 6000000,
        headroom: 4000000,
      });
    });

    it("calculates exposure with both unpaid invoices and active SO", async () => {
      vi.mocked(prisma.customer.findUnique).mockResolvedValue({
        creditLimit: mockDecimal(10000000),
      } as never);
      vi.mocked(prisma.invoice.findMany).mockResolvedValue([
        { totalAmount: mockDecimal(3000000), paidAmount: mockDecimal(0) },
      ] as never);
      vi.mocked(prisma.salesOrder.findMany).mockResolvedValue([
        { totalAmount: mockDecimal(5000000) },
      ] as never);

      const result = await getCustomerCreditExposure("cus-1");
      expect(result).toEqual({
        creditLimit: 10000000,
        unpaidInvoiceBalance: 3000000,
        openOrderWithoutInvoice: 5000000,
        currentExposure: 8000000,
        headroom: 2000000,
      });
    });

    it("returns negative headroom when over limit", async () => {
      vi.mocked(prisma.customer.findUnique).mockResolvedValue({
        creditLimit: mockDecimal(5000000),
      } as never);
      vi.mocked(prisma.invoice.findMany).mockResolvedValue([
        { totalAmount: mockDecimal(6000000), paidAmount: mockDecimal(0) },
      ] as never);
      vi.mocked(prisma.salesOrder.findMany).mockResolvedValue([]);

      const result = await getCustomerCreditExposure("cus-1");
      expect(result?.headroom).toBe(-1000000);
      expect(result?.currentExposure).toBe(6000000);
    });
  });

  describe("checkCreditLimit", () => {
    it("skips check when customer has no limit", async () => {
      vi.mocked(prisma.customer.findUnique).mockResolvedValue({
        creditLimit: null,
      } as never);
      vi.mocked(prisma.invoice.findMany).mockResolvedValue([]);
      vi.mocked(prisma.salesOrder.findMany).mockResolvedValue([]);

      await expect(
        checkCreditLimit("cus-1", 5000000),
      ).resolves.toBeUndefined();
    });

    it("passes when within limit", async () => {
      vi.mocked(prisma.customer.findUnique).mockResolvedValue({
        creditLimit: mockDecimal(10000000),
      } as never);
      vi.mocked(prisma.invoice.findMany).mockResolvedValue([
        { totalAmount: mockDecimal(3000000), paidAmount: mockDecimal(0) },
      ] as never);
      vi.mocked(prisma.salesOrder.findMany).mockResolvedValue([]);

      await expect(
        checkCreditLimit("cus-1", 5000000),
      ).resolves.toBeUndefined();
    });

    it("throws when limit exceeded", async () => {
      vi.mocked(prisma.customer.findUnique).mockResolvedValue({
        creditLimit: mockDecimal(10000000),
      } as never);
      vi.mocked(prisma.invoice.findMany).mockResolvedValue([
        { totalAmount: mockDecimal(8000000), paidAmount: mockDecimal(0) },
      ] as never);
      vi.mocked(prisma.salesOrder.findMany).mockResolvedValue([]);

      await expect(
        checkCreditLimit("cus-1", 3000000),
      ).rejects.toThrow(BusinessRuleError);
    });

    it("throws with Indonesian message", async () => {
      vi.mocked(prisma.customer.findUnique).mockResolvedValue({
        creditLimit: mockDecimal(10000000),
      } as never);
      vi.mocked(prisma.invoice.findMany).mockResolvedValue([
        { totalAmount: mockDecimal(9000000), paidAmount: mockDecimal(0) },
      ] as never);
      vi.mocked(prisma.salesOrder.findMany).mockResolvedValue([]);

      try {
        await checkCreditLimit("cus-1", 2000000);
        expect.fail("Should have thrown");
      } catch (e) {
        expect((e as BusinessRuleError).message).toContain("Batas kredit terlampaui");
        expect((e as BusinessRuleError).code).toBe("CREDIT_LIMIT_EXCEEDED");
      }
    });

    it("passes when exactly at limit (edge case)", async () => {
      vi.mocked(prisma.customer.findUnique).mockResolvedValue({
        creditLimit: mockDecimal(10000000),
      } as never);
      vi.mocked(prisma.invoice.findMany).mockResolvedValue([
        { totalAmount: mockDecimal(7000000), paidAmount: mockDecimal(0) },
      ] as never);
      vi.mocked(prisma.salesOrder.findMany).mockResolvedValue([]);

      await expect(
        checkCreditLimit("cus-1", 3000000),
      ).resolves.toBeUndefined();
    });
  });

  describe("getCustomersWithCreditSummary", () => {
    it("returns empty when no customers", async () => {
      vi.mocked(prisma.customer.findMany).mockResolvedValue([]);
      const result = await getCustomersWithCreditSummary();
      expect(result).toEqual([]);
    });

    it("returns customers with no limit as exposureStatus none", async () => {
      vi.mocked(prisma.customer.findMany).mockResolvedValue([
        { id: "c1", code: "C001", name: "Test", phone: null, city: null, paymentTermDays: null, creditLimit: null, isActive: true },
      ] as never);
      vi.mocked(prisma.invoice.groupBy).mockResolvedValue([]);
      vi.mocked(prisma.salesOrder.groupBy).mockResolvedValue([]);

      const result = await getCustomersWithCreditSummary();
      expect(result[0].exposureStatus).toBe("none");
      expect(result[0].headroom).toBeNull();
    });

    it("returns safe status when well under limit", async () => {
      vi.mocked(prisma.customer.findMany).mockResolvedValue([
        { id: "c1", code: "C001", name: "Test", phone: null, city: null, paymentTermDays: null, creditLimit: mockDecimal(10000000), isActive: true },
      ] as never);
      vi.mocked(prisma.invoice.groupBy).mockResolvedValue([]);
      vi.mocked(prisma.salesOrder.groupBy).mockResolvedValue([]);

      const result = await getCustomersWithCreditSummary();
      expect(result[0].exposureStatus).toBe("safe");
      expect(result[0].headroom).toBe(10000000);
    });

    it("returns over status when exceeded", async () => {
      vi.mocked(prisma.customer.findMany).mockResolvedValue([
        { id: "c1", code: "C001", name: "Test", phone: null, city: null, paymentTermDays: null, creditLimit: mockDecimal(5000000), isActive: true },
      ] as never);
      // Mock invoice lookup chain
      vi.mocked(prisma.invoice.groupBy).mockResolvedValue([
        { salesOrderId: "so-1", _sum: { totalAmount: mockDecimal(6000000), paidAmount: mockDecimal(0) } },
      ] as never);
      vi.mocked(prisma.invoice.findFirst).mockResolvedValue({
        salesOrder: { customerId: "c1" },
      } as never);
      vi.mocked(prisma.salesOrder.groupBy).mockResolvedValue([]);

      const result = await getCustomersWithCreditSummary();
      expect(result[0].exposureStatus).toBe("over");
      expect(result[0].headroom).toBe(-1000000);
    });
  });
});
