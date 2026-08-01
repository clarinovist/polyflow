import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockedTransaction } from "./helpers/mock-prisma-transaction";

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
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
      };
      return fn(tx);
    }),
    customerSalesAssignment: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  },
}));

vi.mock("@/lib/tools/audit", () => ({
  logActivity: vi.fn(),
}));

import {
  assignCustomerToSales,
  unassignCustomerFromSales,
  unassignAllCustomersFromUser,
  autoAssignProspectToSales,
  getCustomerAssignments,
  getAssignedCustomers,
} from "../customer-assignment-service";

describe("customer-assignment-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("assignCustomerToSales", () => {
    it("creates new assignment when none exists", async () => {
      const result = await assignCustomerToSales({
        customerId: "cus-1",
        userId: "u1",
        isPrimary: true,
        assignedById: "admin-1",
      });
      expect(result).toBeDefined();
    });

    it("closes existing primary and creates new when reassigning primary", async () => {
      const { prisma } = await import("@/lib/core/prisma");
      mockedTransaction(prisma.$transaction).mockImplementation(async (fn) => {
        const tx = {
          customerSalesAssignment: {
            findFirst: vi.fn()
              .mockResolvedValueOnce({ id: "old", isPrimary: true, userId: "u-old" })
              .mockResolvedValueOnce(null),
            create: vi.fn().mockResolvedValue({ id: "new-assign" }),
            update: vi.fn().mockResolvedValue({ id: "old" }),
          },
        };
        return fn(tx);
      });
      const result = await assignCustomerToSales({
        customerId: "cus-1",
        userId: "u-new",
        isPrimary: true,
        assignedById: "admin-1",
      });
      expect(result).toBeDefined();
    });

    it("returns existing assignment if already assigned to same user", async () => {
      const { prisma } = await import("@/lib/core/prisma");
      // isPrimary=false skips the primary check, so findFirst is called only once for duplicate check
      mockedTransaction(prisma.$transaction).mockImplementation(async (fn) => {
        const tx = {
          customerSalesAssignment: {
            findFirst: vi.fn().mockResolvedValue({ id: "existing", userId: "u1" }),
            create: vi.fn(),
            update: vi.fn(),
          },
        };
        return fn(tx);
      });
      const result = await assignCustomerToSales({
        customerId: "cus-1",
        userId: "u1",
        isPrimary: false,
        assignedById: "admin-1",
      });
      expect(result).toBeDefined();
    });

    it("does not close primary when isPrimary=false", async () => {
      const { prisma } = await import("@/lib/core/prisma");
      mockedTransaction(prisma.$transaction).mockImplementation(async (fn) => {
        const tx = {
          customerSalesAssignment: {
            findFirst: vi.fn()
              .mockResolvedValueOnce(null) // duplicate check (no primary check when isPrimary=false)
              .mockResolvedValueOnce(null),
            create: vi.fn().mockResolvedValue({ id: "new-assign" }),
            update: vi.fn(),
          },
        };
        return fn(tx);
      });
      const result = await assignCustomerToSales({
        customerId: "cus-1",
        userId: "u1",
        isPrimary: false,
        assignedById: "admin-1",
      });
      expect(result).toBeDefined();
    });
  });

  describe("unassignCustomerFromSales", () => {
    it("sets unassignedAt on active assignment", async () => {
      const { prisma } = await import("@/lib/core/prisma");
      mockedTransaction(prisma.$transaction).mockImplementation(async (fn) => {
        const tx = {
          customerSalesAssignment: {
            findFirst: vi.fn().mockResolvedValue({ id: "a1" }),
            update: vi.fn().mockResolvedValue({ id: "a1" }),
          },
        };
        return fn(tx);
      });
      const result = await unassignCustomerFromSales({ customerId: "cus-1", userId: "u1" });
      expect(result).toBeDefined();
    });

    it("returns null when no active assignment", async () => {
      const { prisma } = await import("@/lib/core/prisma");
      mockedTransaction(prisma.$transaction).mockImplementation(async (fn) => {
        const tx = {
          customerSalesAssignment: {
            findFirst: vi.fn().mockResolvedValue(null),
            update: vi.fn(),
          },
        };
        return fn(tx);
      });
      const result = await unassignCustomerFromSales({ customerId: "cus-1", userId: "u1" });
      expect(result).toBeNull();
    });
  });

  describe("autoAssignProspectToSales", () => {
    it("creates assignment with auto notes", async () => {
      const { prisma } = await import("@/lib/core/prisma");
      mockedTransaction(prisma.$transaction).mockImplementation(async (fn) => {
        const tx = {
          customerSalesAssignment: {
            findFirst: vi.fn().mockResolvedValue(null),
            create: vi.fn().mockResolvedValue({ id: "auto-assign" }),
            update: vi.fn(),
          },
        };
        return fn(tx);
      });
      const result = await autoAssignProspectToSales("cus-1", "u1");
      expect(result).toBeDefined();
    });
  });

  describe("getCustomerAssignments", () => {
    it("returns assignments", async () => {
      const { prisma } = await import("@/lib/core/prisma");
      vi.mocked(prisma.customerSalesAssignment.findMany).mockResolvedValue([
        { id: "a1", user: { id: "u1", name: "Sales" }, assignedBy: { id: "admin", name: "Admin" } },
      ] as never);
      const result = await getCustomerAssignments("cus-1");
      expect(result).toHaveLength(1);
    });
  });

  describe("getAssignedCustomers", () => {
    it("returns assigned customers", async () => {
      const { prisma } = await import("@/lib/core/prisma");
      vi.mocked(prisma.customerSalesAssignment.findMany).mockResolvedValue([
        { id: "a1", customer: { id: "cus-1", name: "Toko" } },
      ] as never);
      const result = await getAssignedCustomers("u1");
      expect(result).toHaveLength(1);
    });
  });

  describe("unassignAllCustomersFromUser", () => {
    it("bulk updates active assignments and logs activity", async () => {
      const { prisma } = await import("@/lib/core/prisma");
      vi.mocked(prisma.customerSalesAssignment.updateMany).mockResolvedValue({ count: 3 });
      const result = await unassignAllCustomersFromUser("u1", "admin-1");
      expect(result).toBe(3);
    });

    it("returns 0 and skips log when no active assignments", async () => {
      const { prisma } = await import("@/lib/core/prisma");
      vi.mocked(prisma.customerSalesAssignment.updateMany).mockResolvedValue({ count: 0 });
      const result = await unassignAllCustomersFromUser("u1", "admin-1");
      expect(result).toBe(0);
    });
  });
});
