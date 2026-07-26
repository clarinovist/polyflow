import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/core/prisma", () => ({
  prisma: {
    customer: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
    },
    $queryRawUnsafe: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("@/lib/tools/audit", () => ({
  logActivity: vi.fn(),
}));

vi.mock("@/actions/sales/customer", () => ({
  getNextCustomerCode: vi.fn().mockResolvedValue("CUS-001"),
}));

import { prisma } from "@/lib/core/prisma";
import { checkCustomerDuplicate } from "../field-prospect-service";

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

    it("finds duplicate by name", async () => {
      vi.mocked(prisma.customer.findMany).mockResolvedValue([
        { id: "c1", name: "Toko Maju", phone: null, latitude: null, longitude: null },
      ] as never);
      const result = await checkCustomerDuplicate("Toko Maju");
      expect(result.isDuplicate).toBe(true);
      expect(result.matches.length).toBeGreaterThan(0);
    });

    it("finds duplicate by phone", async () => {
      vi.mocked(prisma.customer.findMany).mockResolvedValue([
        { id: "c1", name: "Other", phone: "08123456789", latitude: null, longitude: null },
      ] as never);
      const result = await checkCustomerDuplicate("XYZ", "08123456789");
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
  });
});
