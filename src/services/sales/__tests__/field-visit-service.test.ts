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

    describe("purpose", () => {
      async function runStart(purpose: string | null | undefined) {
        const create = vi.fn().mockResolvedValue({ id: "visit-p" });
        const { prisma } = await import("@/lib/core/prisma");
        mockedTransaction(prisma.$transaction).mockImplementation(async (fn) =>
          fn({
            salesVisit: { findUnique: vi.fn().mockResolvedValue(null), create, update: vi.fn() },
            customer: { findUnique: vi.fn().mockResolvedValue({ id: "cus-1", name: "Toko" }) },
            salesRoutePlanItem: { findUnique: vi.fn(), update: vi.fn() },
          }),
        );
        await startFieldVisit({
          userId: "u1", customerId: "cus-1",
          latitude: -6.2, longitude: 106.8, distance: 50, clientVisitId: "cv-1",
          purpose,
        });
        return create;
      }

      it("stores trimmed purpose on start", async () => {
        const create = await runStart("  Tagih piutang  ");
        expect(create).toHaveBeenCalledWith(
          expect.objectContaining({ data: expect.objectContaining({ purpose: "Tagih piutang" }) }),
        );
      });

      it("stores null when purpose is empty or whitespace", async () => {
        const create = await runStart("   ");
        expect(create).toHaveBeenCalledWith(
          expect.objectContaining({ data: expect.objectContaining({ purpose: null }) }),
        );
      });

      it("stores null when purpose is missing (legacy caller)", async () => {
        const create = await runStart(undefined);
        expect(create).toHaveBeenCalledWith(
          expect.objectContaining({ data: expect.objectContaining({ purpose: null }) }),
        );
      });

      it("rejects purpose longer than 300 characters without touching the database", async () => {
        const { prisma } = await import("@/lib/core/prisma");
        await expect(startFieldVisit({
          userId: "u1", customerId: "cus-1",
          latitude: -6.2, longitude: 106.8, distance: 50, clientVisitId: "cv-1",
          purpose: "x".repeat(301),
        })).rejects.toThrow(/300/);
        expect(prisma.$transaction).not.toHaveBeenCalled();
      });

      it("does not mutate the input object", async () => {
        const input = {
          userId: "u1", customerId: "cus-1",
          latitude: -6.2, longitude: 106.8, distance: 50, clientVisitId: "cv-1",
          purpose: "  Survey  ",
        };
        const snapshot = { ...input };
        await startFieldVisit(input);
        expect(input).toEqual(snapshot);
      });
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
    describe("purpose backfill", () => {
      async function runComplete(stored: string | null | undefined, purpose?: string | null) {
        const update = vi.fn().mockResolvedValue({ id: "v1" });
        const { prisma } = await import("@/lib/core/prisma");
        mockedTransaction(prisma.$transaction).mockImplementation(async (fn) =>
          fn({
            salesVisit: {
              findUnique: vi.fn().mockResolvedValue({
                id: "v1", checkInTime: new Date(Date.now() - 1000),
                routePlanItemId: null, routePlanItem: null, purpose: stored,
              }),
              update,
            },
            salesRoutePlanItem: { update: vi.fn() },
          }),
        );
        await completeFieldVisit({ userId: "u1", clientVisitId: "cv-1", notes: "ok", purpose });
        return update.mock.calls[0][0].data as Record<string, unknown>;
      }

      it("backfills purpose when the stored value is empty", async () => {
        const data = await runComplete(null, "  Cek stok  ");
        expect(data.purpose).toBe("Cek stok");
      });

      it("does not overwrite an existing purpose", async () => {
        const data = await runComplete("Tagih piutang", "Lain");
        expect(data).not.toHaveProperty("purpose");
      });

      it("leaves purpose untouched when none is supplied (legacy data)", async () => {
        const data = await runComplete(null, undefined);
        expect(data).not.toHaveProperty("purpose");
      });

      it("rejects purpose longer than 300 characters", async () => {
        await expect(completeFieldVisit({
          userId: "u1", clientVisitId: "cv-1", notes: "ok", purpose: "x".repeat(301),
        })).rejects.toThrow(/300/);
      });
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

    describe("purpose", () => {
      const baseLog = {
        clientVisitId: "cv-p", customerId: "cus-1",
        checkInTime: "2026-11-24T01:00:00.000Z", checkOutTime: "2026-11-24T01:05:00.000Z",
        durationSeconds: 300, latitude: -6.2, longitude: 106.8, distance: 20,
        notes: "Selesai", photoUrl: null,
      };

      it("stores trimmed purpose when creating a new visit", async () => {
        const { prisma } = await import("@/lib/core/prisma");
        vi.mocked(prisma.salesVisit.findUnique).mockResolvedValue(null);
        vi.mocked(prisma.salesVisit.create).mockResolvedValue({ id: "n1" } as never);
        await syncVisitLogs("u1", [{ ...baseLog, purpose: " Survey harga " }]);
        expect(prisma.salesVisit.create).toHaveBeenCalledWith(
          expect.objectContaining({ data: expect.objectContaining({ purpose: "Survey harga" }) }),
        );
      });

      it("creates a visit with null purpose for legacy queue items", async () => {
        const { prisma } = await import("@/lib/core/prisma");
        vi.mocked(prisma.salesVisit.findUnique).mockResolvedValue(null);
        vi.mocked(prisma.salesVisit.create).mockResolvedValue({ id: "n2" } as never);
        const results = await syncVisitLogs("u1", [baseLog]);
        expect(results[0].success).toBe(true);
        expect(prisma.salesVisit.create).toHaveBeenCalledWith(
          expect.objectContaining({ data: expect.objectContaining({ purpose: null }) }),
        );
      });

      it("backfills an empty purpose on an unfinished existing visit", async () => {
        const { prisma } = await import("@/lib/core/prisma");
        vi.mocked(prisma.salesVisit.findUnique).mockResolvedValue({
          id: "e1", durationSeconds: 0, checkOutTime: new Date(), reviewStatus: "NOT_REQUIRED",
          purpose: null, notes: null, photoUrl: null, routePlanItemId: null,
        } as never);
        await syncVisitLogs("u1", [{ ...baseLog, purpose: "Tagih" }]);
        expect(prisma.salesVisit.update).toHaveBeenCalledWith(
          expect.objectContaining({ data: expect.objectContaining({ purpose: "Tagih" }) }),
        );
      });

      it("backfills an empty purpose on a finished existing visit without touching other fields", async () => {
        const { prisma } = await import("@/lib/core/prisma");
        vi.mocked(prisma.salesVisit.findUnique).mockResolvedValue({
          id: "e2", durationSeconds: 120, checkOutTime: new Date(), reviewStatus: "APPROVED",
          purpose: null,
        } as never);
        await syncVisitLogs("u1", [{ ...baseLog, purpose: "Tagih" }]);
        expect(prisma.salesVisit.update).toHaveBeenCalledWith({
          where: { id: "e2" }, data: { purpose: "Tagih" },
        });
      });

      it("never overwrites an existing purpose", async () => {
        const { prisma } = await import("@/lib/core/prisma");
        vi.mocked(prisma.salesVisit.findUnique).mockResolvedValue({
          id: "e3", durationSeconds: 120, checkOutTime: new Date(), reviewStatus: "NOT_REQUIRED",
          purpose: "Asli",
        } as never);
        await syncVisitLogs("u1", [{ ...baseLog, purpose: "Baru" }]);
        expect(prisma.salesVisit.update).not.toHaveBeenCalled();
      });

      it("does not update a finished existing visit when no purpose is supplied", async () => {
        const { prisma } = await import("@/lib/core/prisma");
        vi.mocked(prisma.salesVisit.findUnique).mockResolvedValue({
          id: "e4", durationSeconds: 120, checkOutTime: new Date(), reviewStatus: "NOT_REQUIRED",
          purpose: null,
        } as never);
        const results = await syncVisitLogs("u1", [baseLog]);
        expect(results[0]).toEqual({ clientVisitId: "cv-p", success: true, visitId: "e4" });
        expect(prisma.salesVisit.update).not.toHaveBeenCalled();
      });

      it("reports a per-item failure for purpose longer than 300 characters", async () => {
        const { prisma } = await import("@/lib/core/prisma");
        vi.mocked(prisma.salesVisit.findUnique).mockResolvedValue(null);
        const results = await syncVisitLogs("u1", [{ ...baseLog, purpose: "x".repeat(301) }]);
        expect(results[0].success).toBe(false);
        expect(results[0].error).toMatch(/300/);
        expect(prisma.salesVisit.create).not.toHaveBeenCalled();
      });
    });
  });
});
