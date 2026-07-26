import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/core/prisma", () => ({
  prisma: {
    $transaction: vi.fn(async (fn: (tx: Record<string, unknown>) => Promise<unknown>) => {
      const tx = {
        salesVisit: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockImplementation((args: { data: Record<string, unknown> }) =>
            Promise.resolve({ id: "visit-1", ...args.data })
          ),
          update: vi.fn().mockResolvedValue({ id: "visit-1" }),
        },
        customer: {
          findUnique: vi.fn().mockResolvedValue({ id: "cus-1", name: "Test Customer" }),
        },
        salesRoutePlanItem: {
          findUnique: vi.fn().mockResolvedValue({ id: "rpi-1", status: "PENDING" }),
          update: vi.fn().mockResolvedValue({ id: "rpi-1" }),
        },
      };
      return fn(tx);
    }),
    salesVisit: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      update: vi.fn(),
    },
    salesRoutePlanItem: {
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/tools/audit", () => ({
  logActivity: vi.fn(),
}));

import { startFieldVisit, syncVisitLogs } from "../field-visit-service";

describe("field-visit-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("startFieldVisit", () => {
    it("creates visit in transaction", async () => {
      const result = await startFieldVisit({
        userId: "u1",
        customerId: "cus-1",
        latitude: -6.2,
        longitude: 106.8,
        distance: 50,
        clientVisitId: "cv-1",
      });
      expect(result).toBeDefined();
    });

    it("returns existing visit if idempotent", async () => {
      const existingVisit = { id: "existing-visit" };
      const { prisma } = await import("@/lib/core/prisma");
      vi.mocked(prisma.$transaction).mockImplementation(async (fn: (tx: Record<string, unknown>) => Promise<unknown>) => {
        const tx = {
          salesVisit: {
            findUnique: vi.fn().mockResolvedValue(existingVisit),
            create: vi.fn(),
            update: vi.fn(),
          },
          customer: { findUnique: vi.fn() },
          salesRoutePlanItem: { findUnique: vi.fn(), update: vi.fn() },
        };
        return fn(tx);
      });

      const result = await startFieldVisit({
        userId: "u1",
        customerId: "cus-1",
        latitude: -6.2,
        longitude: 106.8,
        distance: 50,
        clientVisitId: "cv-1",
      });
      expect(result).toBe(existingVisit);
    });
  });

  describe("syncVisitLogs", () => {
    it("returns idempotent result for duplicate clientVisitId", async () => {
      const { prisma } = await import("@/lib/core/prisma");
      vi.mocked(prisma.salesVisit.findUnique).mockResolvedValue({ id: "existing" } as never);
      const results = await syncVisitLogs("u1", [
        {
          clientVisitId: "cv-1",
          customerId: "cus-1",
          checkInTime: new Date().toISOString(),
          checkOutTime: new Date().toISOString(),
          durationSeconds: 60,
          latitude: -6.2,
          longitude: 106.8,
          distance: 50,
          notes: null,
          photoUrl: null,
        },
      ]);
      expect(results[0].success).toBe(true);
      expect(results[0].visitId).toBe("existing");
    });

    it("creates new visit for fresh clientVisitId", async () => {
      const { prisma } = await import("@/lib/core/prisma");
      vi.mocked(prisma.salesVisit.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.salesVisit.create).mockResolvedValue({ id: "new-visit" } as never);
      const results = await syncVisitLogs("u1", [
        {
          clientVisitId: "cv-new",
          customerId: "cus-1",
          checkInTime: new Date().toISOString(),
          checkOutTime: new Date().toISOString(),
          durationSeconds: 120,
          latitude: -6.2,
          longitude: 106.8,
          distance: 30,
          notes: "Test",
          photoUrl: null,
        },
      ]);
      expect(results[0].success).toBe(true);
      expect(results[0].visitId).toBe("new-visit");
    });
  });
});
