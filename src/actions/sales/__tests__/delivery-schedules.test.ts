import { describe, it, expect, vi, beforeEach } from "vitest";
import { deleteDeliverySchedule } from "../delivery-schedules";
import { prisma } from "@/lib/core/prisma";

vi.mock("@/lib/core/prisma", () => ({
  prisma: {
    deliverySchedule: {
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

vi.mock("@/lib/core/tenant", () => ({
  withTenant: vi.fn((fn: (...args: unknown[]) => unknown) => fn),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/tools/auth-checks", () => ({
  requireAuth: vi.fn().mockResolvedValue(undefined),
}));

describe("delivery schedules actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("deleteDeliverySchedule", () => {
    it("successfully deletes the schedule when there are no generated Surat Jalans", async () => {
      const mockSchedule = {
        id: "schedule-1",
        scheduleNumber: "JADWAL-2026-W28",
        trips: [
          {
            id: "trip-1",
            orders: [
              { id: "order-1", deliveryOrderId: null },
            ],
          },
        ],
      };

      vi.mocked(prisma.deliverySchedule.findUnique).mockResolvedValue(mockSchedule as never);
      vi.mocked(prisma.deliverySchedule.delete).mockResolvedValue({ id: "schedule-1" } as never);

      const result = await deleteDeliverySchedule("schedule-1");

      expect(result).toEqual({ success: true, data: { success: true } });
      expect(prisma.deliverySchedule.delete).toHaveBeenCalledWith({
        where: { id: "schedule-1" },
      });
    });

    it("fails to delete when there is a generated Surat Jalan", async () => {
      const mockSchedule = {
        id: "schedule-1",
        scheduleNumber: "JADWAL-2026-W28",
        trips: [
          {
            id: "trip-1",
            orders: [
              { id: "order-1", deliveryOrderId: "do-123" },
            ],
          },
        ],
      };

      vi.mocked(prisma.deliverySchedule.findUnique).mockResolvedValue(mockSchedule as never);

      const result = await deleteDeliverySchedule("schedule-1");

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Tidak dapat menghapus jadwal karena sudah ada Surat Jalan");
      }
      expect(prisma.deliverySchedule.delete).not.toHaveBeenCalled();
    });

    it("returns not found error if the schedule does not exist", async () => {
      vi.mocked(prisma.deliverySchedule.findUnique).mockResolvedValue(null);

      const result = await deleteDeliverySchedule("nonexistent");

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Jadwal Kirim");
      }
      expect(prisma.deliverySchedule.delete).not.toHaveBeenCalled();
    });
  });
});
