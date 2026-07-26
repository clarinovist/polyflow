import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/core/prisma", () => ({
  prisma: {
    $transaction: vi.fn(async (fn: (tx: Record<string, unknown>) => Promise<unknown>) => {
      const tx = {
        customerSalesAssignment: {
          findFirst: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([]),
          create: vi.fn().mockImplementation((args: { data: Record<string, unknown> }) =>
            Promise.resolve({ id: "assign-1", ...args.data })
          ),
          update: vi.fn().mockResolvedValue({ id: "assign-1" }),
        },
      };
      return fn(tx);
    }),
    customerSalesAssignment: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/tools/audit", () => ({
  logActivity: vi.fn(),
}));

import {
  assignCustomerToSales,
  unassignCustomerFromSales,
  getCustomerAssignments,
  getAssignedCustomers,
} from "../customer-assignment-service";

describe("customer-assignment-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("assignCustomerToSales", () => {
    it("creates assignment in transaction", async () => {
      const result = await assignCustomerToSales({
        customerId: "cus-1",
        userId: "u1",
        isPrimary: true,
        assignedById: "admin-1",
      });
      expect(result).toBeDefined();
    });

    it("closes existing primary when assigning new primary", async () => {
      const { prisma } = await import("@/lib/core/prisma");
      vi.mocked(prisma.$transaction).mockImplementation(async (fn: (tx: Record<string, unknown>) => Promise<unknown>) => {
        const tx = {
          customerSalesAssignment: {
            findFirst: vi.fn()
              .mockResolvedValueOnce({ id: "old-assign", isPrimary: true, userId: "u-old" })
              .mockResolvedValueOnce(null),
            findMany: vi.fn().mockResolvedValue([]),
            create: vi.fn().mockImplementation((args: { data: Record<string, unknown> }) =>
              Promise.resolve({ id: "new-assign", ...args.data })
            ),
            update: vi.fn().mockResolvedValue({ id: "old-assign" }),
          },
        };
        return fn(tx);
      });

      await assignCustomerToSales({
        customerId: "cus-1",
        userId: "u-new",
        isPrimary: true,
        assignedById: "admin-1",
      });

      const tx = vi.mocked(prisma.$transaction).mock.calls[0][0];
      const txMock = {
        customerSalesAssignment: {
          findFirst: vi.fn()
            .mockResolvedValueOnce({ id: "old-assign", isPrimary: true, userId: "u-old" })
            .mockResolvedValueOnce(null),
          create: vi.fn().mockResolvedValue({ id: "new-assign" }),
          update: vi.fn().mockResolvedValue({ id: "old-assign" }),
        },
      };
      await (tx as (tx: typeof txMock) => Promise<unknown>)(txMock);
      expect(txMock.customerSalesAssignment.update).toHaveBeenCalledWith({
        where: { id: "old-assign" },
        data: { unassignedAt: expect.any(Date) },
      });
    });
  });

  describe("unassignCustomerFromSales", () => {
    it("sets unassignedAt on active assignment", async () => {
      const { prisma } = await import("@/lib/core/prisma");
      vi.mocked(prisma.$transaction).mockImplementation(async (fn: (tx: Record<string, unknown>) => Promise<unknown>) => {
        const tx = {
          customerSalesAssignment: {
            findFirst: vi.fn().mockResolvedValue({ id: "assign-1" }),
            update: vi.fn().mockResolvedValue({ id: "assign-1" }),
          },
        };
        return fn(tx);
      });

      const result = await unassignCustomerFromSales({
        customerId: "cus-1",
        userId: "u1",
      });
      expect(result).toBeDefined();
    });

    it("returns null when no active assignment", async () => {
      const { prisma } = await import("@/lib/core/prisma");
      vi.mocked(prisma.$transaction).mockImplementation(async (fn: (tx: Record<string, unknown>) => Promise<unknown>) => {
        const tx = {
          customerSalesAssignment: {
            findFirst: vi.fn().mockResolvedValue(null),
            update: vi.fn(),
          },
        };
        return fn(tx);
      });

      const result = await unassignCustomerFromSales({
        customerId: "cus-1",
        userId: "u1",
      });
      expect(result).toBeNull();
    });
  });

  describe("getCustomerAssignments", () => {
    it("returns assignments for customer", async () => {
      const { prisma } = await import("@/lib/core/prisma");
      vi.mocked(prisma.customerSalesAssignment.findMany).mockResolvedValue([
        { id: "a1", user: { id: "u1", name: "Sales A" }, assignedBy: { id: "admin", name: "Admin" } },
      ] as never);
      const result = await getCustomerAssignments("cus-1");
      expect(result).toHaveLength(1);
    });
  });

  describe("getAssignedCustomers", () => {
    it("returns assigned customers for user", async () => {
      const { prisma } = await import("@/lib/core/prisma");
      vi.mocked(prisma.customerSalesAssignment.findMany).mockResolvedValue([
        { id: "a1", customer: { id: "cus-1", name: "Toko A" } },
      ] as never);
      const result = await getAssignedCustomers("u1");
      expect(result).toHaveLength(1);
    });
  });
});
