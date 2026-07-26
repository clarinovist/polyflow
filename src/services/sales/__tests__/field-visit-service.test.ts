import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockedTransaction } from "./helpers/mock-prisma-transaction";

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
    salesRoutePlanItem: { update: vi.fn() },
  },
}));

vi.mock("@/lib/tools/audit", () => ({
  logActivity: vi.fn(),
}));

import { startFieldVisit, completeFieldVisit, syncVisitLogs } from "../field-visit-service";

describe("field-visit-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("startFieldVisit", () => {
    it("creates visit in transaction", async () => {
      const result = await startFieldVisit({
        userId: "u1", customerId: "cus-1",
        latitude: -6.2, longitude: 106.8, distance: 50, clientVisitId: "cv-1",
      });
      expect(result).toBeDefined();
    });

    it("returns existing visit if idempotent", async () => {
      const existing = { id: "existing" };
      const { prisma } = await import("@/lib/core/prisma");
      mockedTransaction(prisma.$transaction).mockImplementation(async (fn) => {
        return fn({
          salesVisit: { findUnique: vi.fn().mockResolvedValue(existing), create: vi.fn(), update: vi.fn() },
          customer: { findUnique: vi.fn() },
          salesRoutePlanItem: { findUnique: vi.fn(), update: vi.fn() },
        });
      });
      const result = await startFieldVisit({
        userId: "u1", customerId: "cus-1",
        latitude: -6.2, longitude: 106.8, distance: 50, clientVisitId: "cv-1",
      });
      expect(result).toBe(existing);
    });

    it("validates route plan item when provided", async () => {
      const result = await startFieldVisit({
        userId: "u1", customerId: "cus-1", routePlanItemId: "rpi-1",
        latitude: -6.2, longitude: 106.8, distance: 50, clientVisitId: "cv-1",
      });
      expect(result).toBeDefined();
    });

    it("throws when customer not found", async () => {
      const { prisma } = await import("@/lib/core/prisma");
      mockedTransaction(prisma.$transaction).mockImplementation(async (fn) => {
        return fn({
          salesVisit: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn(), update: vi.fn() },
          customer: { findUnique: vi.fn().mockResolvedValue(null) },
          salesRoutePlanItem: { findUnique: vi.fn(), update: vi.fn() },
        });
      });
      await expect(startFieldVisit({
        userId: "u1", customerId: "nonexistent",
        latitude: -6.2, longitude: 106.8, distance: 50, clientVisitId: "cv-1",
      })).rejects.toThrow();
    });

    it("throws when route plan item not found", async () => {
      const { prisma } = await import("@/lib/core/prisma");
      mockedTransaction(prisma.$transaction).mockImplementation(async (fn) => {
        return fn({
          salesVisit: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn(), update: vi.fn() },
          customer: { findUnique: vi.fn().mockResolvedValue({ id: "cus-1" }) },
          salesRoutePlanItem: { findUnique: vi.fn().mockResolvedValue(null), update: vi.fn() },
        });
      });
      await expect(startFieldVisit({
        userId: "u1", customerId: "cus-1", routePlanItemId: "nonexistent",
        latitude: -6.2, longitude: 106.8, distance: 50, clientVisitId: "cv-1",
      })).rejects.toThrow();
    });

    it("creates with isExtraCall and extraReason", async () => {
      const { prisma } = await import("@/lib/core/prisma");
      mockedTransaction(prisma.$transaction).mockImplementation(async (fn) => {
        const tx = {
          salesVisit: {
            findUnique: vi.fn().mockResolvedValue(null),
            create: vi.fn().mockResolvedValue({ id: "visit-ec" }),
            update: vi.fn(),
          },
          customer: { findUnique: vi.fn().mockResolvedValue({ id: "cus-1", name: "Toko" }) },
          salesRoutePlanItem: { findUnique: vi.fn(), update: vi.fn() },
        };
        return fn(tx);
      });
      const result = await startFieldVisit({
        userId: "u1", customerId: "cus-1",
        latitude: -6.2, longitude: 106.8, distance: 50, clientVisitId: "cv-1",
        isExtraCall: true, extraReason: "TOKO_BARU",
      });
      expect(result).toBeDefined();
    });

    it("creates without isExtraCall", async () => {
      const { prisma } = await import("@/lib/core/prisma");
      mockedTransaction(prisma.$transaction).mockImplementation(async (fn) => {
        const tx = {
          salesVisit: {
            findUnique: vi.fn().mockResolvedValue(null),
            create: vi.fn().mockResolvedValue({ id: "visit-noec" }),
            update: vi.fn(),
          },
          customer: { findUnique: vi.fn().mockResolvedValue({ id: "cus-1", name: "Toko" }) },
          salesRoutePlanItem: { findUnique: vi.fn(), update: vi.fn() },
        };
        return fn(tx);
      });
      const result = await startFieldVisit({
        userId: "u1", customerId: "cus-1",
        latitude: -6.2, longitude: 106.8, distance: 50, clientVisitId: "cv-1",
        isExtraCall: false,
      });
      expect(result).toBeDefined();
    });
  });

  describe("completeFieldVisit", () => {
    it("completes visit and route item", async () => {
      const { prisma } = await import("@/lib/core/prisma");
      mockedTransaction(prisma.$transaction).mockImplementation(async (fn) => {
        const checkInTime = new Date(Date.now() - 60000);
        return fn({
          salesVisit: {
            findUnique: vi.fn().mockResolvedValue({
              id: "v1", checkInTime, routePlanItemId: "rpi-1", routePlanItem: { id: "rpi-1" },
            }),
            update: vi.fn().mockResolvedValue({ id: "v1" }),
          },
          salesRoutePlanItem: { update: vi.fn() },
        });
      });
      const result = await completeFieldVisit({
        userId: "u1", clientVisitId: "cv-1", notes: "Selesai", photoUrl: "photo.jpg",
      });
      expect(result).toBeDefined();
    });

    it("completes visit without route item", async () => {
      const { prisma } = await import("@/lib/core/prisma");
      mockedTransaction(prisma.$transaction).mockImplementation(async (fn) => {
        const checkInTime = new Date(Date.now() - 30000);
        return fn({
          salesVisit: {
            findUnique: vi.fn().mockResolvedValue({
              id: "v1", checkInTime, routePlanItemId: null, routePlanItem: null,
            }),
            update: vi.fn().mockResolvedValue({ id: "v1" }),
          },
          salesRoutePlanItem: { update: vi.fn() },
        });
      });
      const result = await completeFieldVisit({
        userId: "u1", clientVisitId: "cv-1", notes: "Done", photoUrl: undefined,
      });
      expect(result).toBeDefined();
    });

    it("throws when visit not found", async () => {
      const { prisma } = await import("@/lib/core/prisma");
      mockedTransaction(prisma.$transaction).mockImplementation(async (fn) => {
        return fn({
          salesVisit: { findUnique: vi.fn().mockResolvedValue(null), update: vi.fn() },
          salesRoutePlanItem: { update: vi.fn() },
        });
      });
      await expect(completeFieldVisit({
        userId: "u1", clientVisitId: "nonexistent", notes: "test",
      })).rejects.toThrow();
    });
  });

  describe("syncVisitLogs", () => {
    it("returns idempotent result for duplicate clientVisitId", async () => {
      const { prisma } = await import("@/lib/core/prisma");
      vi.mocked(prisma.salesVisit.findUnique).mockResolvedValue({ id: "existing" } as never);
      const results = await syncVisitLogs("u1", [{
        clientVisitId: "cv-1", customerId: "cus-1",
        checkInTime: new Date().toISOString(), checkOutTime: new Date().toISOString(),
        durationSeconds: 60, latitude: -6.2, longitude: 106.8, distance: 50,
        notes: null, photoUrl: null,
      }]);
      expect(results[0].success).toBe(true);
      expect(results[0].visitId).toBe("existing");
    });

    it("creates new visit for fresh clientVisitId", async () => {
      const { prisma } = await import("@/lib/core/prisma");
      vi.mocked(prisma.salesVisit.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.salesVisit.create).mockResolvedValue({ id: "new-visit" } as never);
      const results = await syncVisitLogs("u1", [{
        clientVisitId: "cv-new", customerId: "cus-1",
        checkInTime: new Date().toISOString(), checkOutTime: new Date().toISOString(),
        durationSeconds: 120, latitude: -6.2, longitude: 106.8, distance: 30,
        notes: "Test", photoUrl: null,
      }]);
      expect(results[0].success).toBe(true);
      expect(results[0].visitId).toBe("new-visit");
    });

    it("handles EC metadata in sync", async () => {
      const { prisma } = await import("@/lib/core/prisma");
      vi.mocked(prisma.salesVisit.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.salesVisit.create).mockResolvedValue({ id: "ec-visit" } as never);
      const results = await syncVisitLogs("u1", [{
        clientVisitId: "cv-ec", customerId: "cus-1",
        checkInTime: new Date().toISOString(), checkOutTime: new Date().toISOString(),
        durationSeconds: 90, latitude: -6.2, longitude: 106.8, distance: 10,
        notes: "EC", photoUrl: null,
        isExtraCall: true, extraReason: "TOKO_BARU",
      }]);
      expect(results[0].success).toBe(true);
    });

    it("completes route item when routePlanItemId provided", async () => {
      const { prisma } = await import("@/lib/core/prisma");
      vi.mocked(prisma.salesVisit.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.salesVisit.create).mockResolvedValue({ id: "r-visit" } as never);
      vi.mocked(prisma.salesRoutePlanItem.update).mockResolvedValue({ id: "rpi-1" } as never);
      const results = await syncVisitLogs("u1", [{
        clientVisitId: "cv-r", customerId: "cus-1",
        checkInTime: new Date().toISOString(), checkOutTime: new Date().toISOString(),
        durationSeconds: 60, latitude: -6.2, longitude: 106.8, distance: 50,
        notes: null, photoUrl: null, routePlanItemId: "rpi-1",
      }]);
      expect(results[0].success).toBe(true);
      expect(prisma.salesRoutePlanItem.update).toHaveBeenCalled();
    });

    it("handles error in individual log gracefully", async () => {
      const { prisma } = await import("@/lib/core/prisma");
      vi.mocked(prisma.salesVisit.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.salesVisit.create).mockRejectedValue(new Error("DB error"));
      const results = await syncVisitLogs("u1", [{
        clientVisitId: "cv-err", customerId: "cus-1",
        checkInTime: new Date().toISOString(), checkOutTime: new Date().toISOString(),
        durationSeconds: 60, latitude: -6.2, longitude: 106.8, distance: 50,
        notes: null, photoUrl: null,
      }]);
      expect(results[0].success).toBe(false);
      expect(results[0].error).toBe("DB error");
    });
  });
});
