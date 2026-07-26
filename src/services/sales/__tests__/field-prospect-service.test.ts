import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/core/prisma", () => ({
  prisma: {
    customer: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
    },
    $queryRawUnsafe: vi.fn().mockResolvedValue([]),
    $transaction: vi.fn(async (fn: (tx: Record<string, unknown>) => Promise<unknown>) => {
      const tx = {
        customer: {
          create: vi.fn().mockResolvedValue({ id: "cus-new", name: "Toko", code: "CUS-001" }),
          findUnique: vi.fn().mockResolvedValue(null),
          update: vi.fn().mockResolvedValue({ id: "cus-1" }),
        },
        customerSalesAssignment: {
          create: vi.fn().mockResolvedValue({ id: "a1" }),
        },
      };
      return fn(tx);
    }),
  },
}));

vi.mock("@/lib/tools/audit", () => ({
  logActivity: vi.fn(),
}));

vi.mock("@/actions/sales/customer", () => ({
  getNextCustomerCode: vi.fn().mockResolvedValue("CUS-001"),
}));

import { prisma } from "@/lib/core/prisma";
import {
  checkCustomerDuplicate,
  createProspectWithAssignment,
  verifyProspect,
} from "../field-prospect-service";

describe("field-prospect-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("checkCustomerDuplicate", () => {
    it("returns no duplicate when name too short and no phone", async () => {
      const result = await checkCustomerDuplicate("AB", undefined);
      expect(result.isDuplicate).toBe(false);
      expect(result.matches).toHaveLength(0);
    });

    it("finds duplicate by name only", async () => {
      vi.mocked(prisma.customer.findMany).mockResolvedValue([
        { id: "c1", name: "Toko Maju", phone: null, latitude: null, longitude: null },
      ] as never);
      const result = await checkCustomerDuplicate("Toko Maju");
      expect(result.isDuplicate).toBe(true);
    });

    it("finds duplicate by phone only", async () => {
      vi.mocked(prisma.customer.findMany).mockResolvedValue([
        { id: "c1", name: "Other", phone: "08123456789", latitude: null, longitude: null },
      ] as never);
      const result = await checkCustomerDuplicate("AB", "08123456789");
      expect(result.isDuplicate).toBe(true);
    });

    it("finds duplicate by both name and phone", async () => {
      vi.mocked(prisma.customer.findMany).mockResolvedValue([
        { id: "c1", name: "Toko Maju", phone: "08123456789", latitude: null, longitude: null },
      ] as never);
      const result = await checkCustomerDuplicate("Toko Maju", "08123456789");
      expect(result.isDuplicate).toBe(true);
    });

    it("includes nearby GPS matches", async () => {
      vi.mocked(prisma.customer.findMany).mockResolvedValue([]);
      vi.mocked(prisma.$queryRawUnsafe).mockResolvedValue([
        { id: "c2", name: "Nearby Store", phone: null, distance: 25 },
      ]);
      const result = await checkCustomerDuplicate("New Store", undefined, -6.2, 106.8);
      expect(result.isDuplicate).toBe(true);
      expect(result.matches[0].distance).toBe(25);
    });

    it("deduplicates GPS matches already in name/phone results", async () => {
      vi.mocked(prisma.customer.findMany).mockResolvedValue([
        { id: "c1", name: "Toko A", phone: null, latitude: null, longitude: null },
      ] as never);
      vi.mocked(prisma.$queryRawUnsafe).mockResolvedValue([
        { id: "c1", name: "Toko A", phone: null, distance: 10 },
      ]);
      const result = await checkCustomerDuplicate("Toko A", undefined, -6.2, 106.8);
      expect(result.matches).toHaveLength(1);
    });

    it("returns empty when no conditions match", async () => {
      const result = await checkCustomerDuplicate("", undefined);
      expect(result.isDuplicate).toBe(false);
    });
  });

  describe("createProspectWithAssignment", () => {
    it("creates customer and assignment in transaction", async () => {
      const result = await createProspectWithAssignment({
        name: "Toko Baru",
        salesUserId: "u1",
      });
      expect(result).toBeDefined();
    });

    it("creates with all optional fields", async () => {
      const result = await createProspectWithAssignment({
        name: "Toko Lengkap",
        phone: "08123456789",
        billingAddress: "Jl. Test",
        latitude: -6.2,
        longitude: 106.8,
        city: "Jakarta",
        photoUrl: "photo.jpg",
        salesUserId: "u1",
      });
      expect(result).toBeDefined();
    });
  });

  describe("verifyProspect", () => {
    it("verifies a prospect customer", async () => {
      const { prisma } = await import("@/lib/core/prisma");
      vi.mocked(prisma.$transaction).mockImplementation(async (fn: (tx: Record<string, unknown>) => Promise<unknown>) => {
        const tx = {
          customer: {
            findUnique: vi.fn().mockResolvedValue({ id: "cus-1", lifecycleStatus: "PROSPECT", name: "Toko" }),
            update: vi.fn().mockResolvedValue({ id: "cus-1" }),
          },
        };
        return fn(tx);
      });
      const result = await verifyProspect("cus-1", "admin-1");
      expect(result).toBeDefined();
    });

    it("throws when customer is not a prospect", async () => {
      const { prisma } = await import("@/lib/core/prisma");
      vi.mocked(prisma.$transaction).mockImplementation(async (fn: (tx: Record<string, unknown>) => Promise<unknown>) => {
        const tx = {
          customer: {
            findUnique: vi.fn().mockResolvedValue({ id: "cus-1", lifecycleStatus: "ACTIVE", name: "Toko" }),
            update: vi.fn(),
          },
        };
        return fn(tx);
      });
      await expect(verifyProspect("cus-1", "admin-1")).rejects.toThrow();
    });

    it("throws when customer not found", async () => {
      const { prisma } = await import("@/lib/core/prisma");
      vi.mocked(prisma.$transaction).mockImplementation(async (fn: (tx: Record<string, unknown>) => Promise<unknown>) => {
        const tx = {
          customer: {
            findUnique: vi.fn().mockResolvedValue(null),
            update: vi.fn(),
          },
        };
        return fn(tx);
      });
      await expect(verifyProspect("nonexistent", "admin-1")).rejects.toThrow();
    });
  });
});
