import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/core/prisma", () => ({
  prisma: {
    customer: { findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    invoice: { findMany: vi.fn(), groupBy: vi.fn(), findFirst: vi.fn() },
    salesOrder: { findMany: vi.fn(), groupBy: vi.fn() },
    $queryRaw: vi.fn(),
  },
}));

vi.mock("@/lib/utils/utils", () => ({
  formatRupiah: (n: number) => `Rp ${n.toLocaleString("id-ID")}`,
}));

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/core/prisma";
import {
  getCustomerCreditExposure,
  checkCreditLimit,
  getCustomersWithCreditSummary,
} from "../credit-service";
import { BusinessRuleError } from "@/lib/errors/errors";

function mockDecimal(n: number | string) {
  return new Prisma.Decimal(n);
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

    it("normalizes a numeric credit limit at the decimal boundary", async () => {
      vi.mocked(prisma.customer.findUnique).mockResolvedValue({
        creditLimit: 10000000,
      } as never);
      vi.mocked(prisma.invoice.findMany).mockResolvedValue([]);
      vi.mocked(prisma.salesOrder.findMany).mockResolvedValue([
        { totalAmount: mockDecimal(2500000) },
      ] as never);

      const result = await getCustomerCreditExposure("cus-1");

      expect(result).toEqual({
        creditLimit: 10000000,
        unpaidInvoiceBalance: 0,
        openOrderWithoutInvoice: 2500000,
        currentExposure: 2500000,
        headroom: 7500000,
      });
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

    it("keeps decimal arithmetic exact until the API number boundary", async () => {
      vi.mocked(prisma.customer.findUnique).mockResolvedValue({
        creditLimit: mockDecimal("1"),
      } as never);
      vi.mocked(prisma.invoice.findMany).mockResolvedValue([
        { totalAmount: mockDecimal("0.3"), paidAmount: mockDecimal("0.2") },
      ] as never);
      vi.mocked(prisma.salesOrder.findMany).mockResolvedValue([
        { totalAmount: mockDecimal("0.2") },
      ] as never);

      const result = await getCustomerCreditExposure("cus-1");

      expect(result).toMatchObject({
        unpaidInvoiceBalance: 0.1,
        openOrderWithoutInvoice: 0.2,
        currentExposure: 0.3,
        headroom: 0.7,
      });
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
    const customer = {
      id: "c-page",
      code: "C050",
      name: "Ade Hidayat",
      phone: "0812",
      city: "Pekalongan",
      paymentTermDays: 30,
      creditLimit: mockDecimal(5000000),
      isActive: true,
    };

    it("defaults to the first 50 customers and skips exposure queries for an empty page", async () => {
      vi.mocked(prisma.customer.count).mockResolvedValue(0);
      vi.mocked(prisma.customer.findMany).mockResolvedValue([]);

      const result = await getCustomersWithCreditSummary();

      expect(result).toEqual({
        customers: [],
        total: 0,
        page: 1,
        pageSize: 50,
        totalPages: 0,
        search: "",
        filter: "all",
      });
      expect(prisma.customer.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          select: { id: true },
          skip: 0,
          take: 50,
          orderBy: [{ isActive: "desc" }, { name: "asc" }, { id: "asc" }],
        }),
      );
      expect(prisma.invoice.findMany).not.toHaveBeenCalled();
      expect(prisma.salesOrder.groupBy).not.toHaveBeenCalled();
    });

    it("filters before paging, caps page size, and calculates exposure only for current-page IDs", async () => {
      vi.mocked(prisma.customer.count).mockResolvedValue(175);
      vi.mocked(prisma.customer.findMany)
        .mockResolvedValueOnce([{ id: "c-page" }] as never)
        .mockResolvedValueOnce([customer] as never);
      vi.mocked(prisma.invoice.findMany).mockResolvedValue([
        {
          totalAmount: mockDecimal(6000000),
          paidAmount: mockDecimal(1000000),
          salesOrder: { customerId: "c-page" },
        },
      ] as never);
      vi.mocked(prisma.salesOrder.groupBy).mockResolvedValue([
        { customerId: "c-page", _sum: { totalAmount: mockDecimal(1000000) } },
      ] as never);

      const result = await getCustomersWithCreditSummary({
        search: "  ade  ",
        filter: "active",
        page: 2,
        pageSize: 500,
      });

      const expectedWhere = {
        isActive: true,
        OR: [
          { name: { contains: "ade", mode: "insensitive" } },
          { code: { contains: "ade", mode: "insensitive" } },
          { phone: { contains: "ade", mode: "insensitive" } },
        ],
      };
      expect(prisma.customer.count).toHaveBeenCalledWith({ where: expectedWhere });
      expect(prisma.customer.findMany).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          where: expectedWhere,
          select: { id: true },
          skip: 100,
          take: 100,
        }),
      );
      expect(prisma.customer.findMany).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ where: { id: { in: ["c-page"] } } }),
      );
      expect(prisma.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            salesOrder: { customerId: { in: ["c-page"] } },
          }),
        }),
      );
      expect(prisma.salesOrder.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ customerId: { in: ["c-page"] } }),
        }),
      );
      expect(prisma.invoice.findFirst).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        total: 175,
        page: 2,
        pageSize: 100,
        totalPages: 2,
        search: "ade",
        filter: "active",
        customers: [
          expect.objectContaining({
            id: "c-page",
            headroom: -1000000,
            exposureStatus: "over",
          }),
        ],
      });
    });

    it("keeps page-summary decimal arithmetic exact", async () => {
      vi.mocked(prisma.customer.count).mockResolvedValue(1);
      vi.mocked(prisma.customer.findMany)
        .mockResolvedValueOnce([{ id: "c-page" }] as never)
        .mockResolvedValueOnce([
          { ...customer, creditLimit: mockDecimal("1") },
        ] as never);
      vi.mocked(prisma.invoice.findMany).mockResolvedValue([
        {
          totalAmount: mockDecimal("0.3"),
          paidAmount: mockDecimal("0.2"),
          salesOrder: { customerId: "c-page" },
        },
      ] as never);
      vi.mocked(prisma.salesOrder.groupBy).mockResolvedValue([
        { customerId: "c-page", _sum: { totalAmount: mockDecimal("0.2") } },
      ] as never);

      const result = await getCustomersWithCreditSummary();

      expect(result.customers[0]).toMatchObject({
        creditLimit: 1,
        headroom: 0.7,
        exposureStatus: "safe",
      });
    });

    it("applies credit-limit filtering before pagination", async () => {
      vi.mocked(prisma.customer.count).mockResolvedValue(0);
      vi.mocked(prisma.customer.findMany).mockResolvedValue([]);

      await getCustomersWithCreditSummary({ filter: "has_limit" });

      expect(prisma.customer.count).toHaveBeenCalledWith({
        where: { creditLimit: { gt: 0 } },
      });
    });

    it("uses a parameterized pre-pagination query for over-limit customers", async () => {
      vi.mocked(prisma.$queryRaw).mockResolvedValue([
        { id: "c-page", total: 1 },
      ] as never);
      vi.mocked(prisma.customer.findMany).mockResolvedValue([customer] as never);
      vi.mocked(prisma.invoice.findMany).mockResolvedValue([]);
      vi.mocked(prisma.salesOrder.groupBy).mockResolvedValue([]);

      const result = await getCustomersWithCreditSummary({
        search: "Ade",
        filter: "over_limit",
      });

      expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
      const sql = vi.mocked(prisma.$queryRaw).mock.calls[0][0] as {
        strings: readonly string[];
        values: readonly unknown[];
      };
      const renderedSql = sql.strings.join('?');
      expect(renderedSql).toContain('COALESCE(ie.amount, 0) + COALESCE(oe.amount, 0) > c."creditLimit"');
      expect(renderedSql).toContain('ORDER BY "isActive" DESC, name ASC, id ASC');
      expect(renderedSql).toContain("ESCAPE E'\\\\'");
      expect(sql.values).toContain('%Ade%');
      expect(prisma.customer.count).not.toHaveBeenCalled();
      expect(prisma.customer.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: { in: ["c-page"] } } }),
      );
      expect(result.filter).toBe("over_limit");
      expect(result.total).toBe(1);
    });

    it("escapes SQL wildcard characters so over-limit search matches literally", async () => {
      vi.mocked(prisma.$queryRaw).mockResolvedValue([
        { id: null, total: 0 },
      ] as never);

      await getCustomersWithCreditSummary({
        search: "A%_B",
        filter: "over_limit",
      });

      const sql = vi.mocked(prisma.$queryRaw).mock.calls[0][0] as {
        values: readonly unknown[];
      };
      expect(sql.values).toContain(String.raw`%A\%\_B%`);
    });

    it("re-runs the over-limit SQL at the clamped final page", async () => {
      vi.mocked(prisma.$queryRaw)
        .mockResolvedValueOnce([{ id: null, total: 51 }] as never)
        .mockResolvedValueOnce([{ id: "c-page", total: 51 }] as never);
      vi.mocked(prisma.customer.findMany).mockResolvedValue([customer] as never);
      vi.mocked(prisma.invoice.findMany).mockResolvedValue([]);
      vi.mocked(prisma.salesOrder.groupBy).mockResolvedValue([]);

      const result = await getCustomersWithCreditSummary({
        filter: "over_limit",
        page: 99,
        pageSize: 50,
      });

      expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
      const finalSql = vi.mocked(prisma.$queryRaw).mock.calls[1][0] as {
        values: readonly unknown[];
      };
      expect(finalSql.values).toEqual(expect.arrayContaining([50, 50]));
      expect(result).toMatchObject({ page: 2, totalPages: 2 });
      expect(result.customers[0].id).toBe("c-page");
    });
  });
});
