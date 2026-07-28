import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  deleteDeliverySchedule,
  cancelTrip,
  reopenTrip,
  reorderStops,
  createScheduleTrip,
  updateScheduleTrip,
  updateTripStatus,
  getDeliverySchedules,
  getDeliverySchedule,
  createDeliverySchedule,
  updateDeliverySchedule,
  scheduleSOWithTrip,
  listSchedulableSalesOrders,
  assignSalesOrderToTrip,
  removeOrderFromSchedule,
  removeVehicleFromSchedule,
  rescheduleTrip,
  quickAddStop,
  getDeliveryScheduleBoard,
} from "../delivery-schedules";
import { prisma } from "@/lib/core/prisma";

vi.mock("@/lib/core/prisma", () => ({
  prisma: {
    deliverySchedule: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      aggregate: vi.fn(),
    },
    deliveryScheduleVehicle: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      aggregate: vi.fn(),
    },
    deliveryScheduleOrder: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      aggregate: vi.fn(),
    },
    deliveryScheduleOrderItem: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
      createMany: vi.fn(),
      aggregate: vi.fn(),
    },
    salesOrder: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    vehicle: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    deliveryOrder: {
      findMany: vi.fn(),
    },
    vehicleTariff: {
      findMany: vi.fn(),
    },
    $transaction: vi.fn((fns: unknown[]) => {
      if (Array.isArray(fns)) return Promise.all(fns);
      return fns;
    }),
  },
}));

vi.mock("@/lib/core/tenant", () => ({
  withTenant: vi.fn((fn: (...args: unknown[]) => unknown) => fn),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/tools/auth-checks", () => ({
  requireAuth: vi.fn().mockResolvedValue({ user: { id: "user-1" } }),
}));

vi.mock("@/lib/schemas/sales", () => ({
  createScheduleTripSchema: { safeParse: (d: unknown) => ({ success: true, data: d }) },
  assignSalesOrderToTripSchema: { safeParse: (d: unknown) => ({ success: true, data: d }) },
}));

describe("delivery schedules actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ============================================
  // deleteDeliverySchedule
  // ============================================
  describe("deleteDeliverySchedule", () => {
    it("successfully deletes the schedule when there are no generated Surat Jalans", async () => {
      const mockSchedule = {
        id: "schedule-1",
        scheduleNumber: "JADWAL-2026-W28",
        trips: [{ id: "trip-1", orders: [{ id: "order-1", deliveryOrderId: null }] }],
      };
      vi.mocked(prisma.deliverySchedule.findUnique).mockResolvedValue(mockSchedule as never);
      vi.mocked(prisma.deliverySchedule.delete).mockResolvedValue({ id: "schedule-1" } as never);
      const result = await deleteDeliverySchedule("schedule-1");
      expect(result).toEqual({ success: true, data: { success: true } });
    });

    it("fails to delete when there is a generated Surat Jalan", async () => {
      const mockSchedule = {
        id: "schedule-1",
        trips: [{ id: "trip-1", orders: [{ id: "order-1", deliveryOrderId: "do-123" }] }],
      };
      vi.mocked(prisma.deliverySchedule.findUnique).mockResolvedValue(mockSchedule as never);
      const result = await deleteDeliverySchedule("schedule-1");
      expect(result.success).toBe(false);
    });

    it("returns not found error if the schedule does not exist", async () => {
      vi.mocked(prisma.deliverySchedule.findUnique).mockResolvedValue(null);
      const result = await deleteDeliverySchedule("nonexistent");
      expect(result.success).toBe(false);
    });
  });

  // ============================================
  // cancelTrip
  // ============================================
  describe("cancelTrip", () => {
    it("cancels a PLANNED trip with reason", async () => {
      const mockTrip = { id: "trip-1", status: "PLANNED", scheduleId: "s-1" };
      vi.mocked(prisma.deliveryScheduleVehicle.findUnique).mockResolvedValue(mockTrip as never);
      vi.mocked(prisma.deliveryScheduleVehicle.update).mockResolvedValue({} as never);
      const result = await cancelTrip("trip-1", "Cuaca buruk");
      expect(result.success).toBe(true);
    });

    it("cancels a CONFIRMED trip with reason", async () => {
      const mockTrip = { id: "trip-1", status: "CONFIRMED", scheduleId: "s-1" };
      vi.mocked(prisma.deliveryScheduleVehicle.findUnique).mockResolvedValue(mockTrip as never);
      vi.mocked(prisma.deliveryScheduleVehicle.update).mockResolvedValue({} as never);
      const result = await cancelTrip("trip-1", "Perubahan jadwal");
      expect(result.success).toBe(true);
    });

    it("rejects cancel without reason", async () => {
      const mockTrip = { id: "trip-1", status: "PLANNED", scheduleId: "s-1" };
      vi.mocked(prisma.deliveryScheduleVehicle.findUnique).mockResolvedValue(mockTrip as never);
      const result = await cancelTrip("trip-1", "");
      expect(result.success).toBe(false);
    });

    it("rejects cancel for DEPARTED trip", async () => {
      const mockTrip = { id: "trip-1", status: "DEPARTED", scheduleId: "s-1" };
      vi.mocked(prisma.deliveryScheduleVehicle.findUnique).mockResolvedValue(mockTrip as never);
      const result = await cancelTrip("trip-1", "Alasan");
      expect(result.success).toBe(false);
    });

    it("rejects cancel for COMPLETED trip", async () => {
      const mockTrip = { id: "trip-1", status: "COMPLETED", scheduleId: "s-1" };
      vi.mocked(prisma.deliveryScheduleVehicle.findUnique).mockResolvedValue(mockTrip as never);
      const result = await cancelTrip("trip-1", "Alasan");
      expect(result.success).toBe(false);
    });

    it("rejects cancel for CANCELLED trip", async () => {
      const mockTrip = { id: "trip-1", status: "CANCELLED", scheduleId: "s-1" };
      vi.mocked(prisma.deliveryScheduleVehicle.findUnique).mockResolvedValue(mockTrip as never);
      const result = await cancelTrip("trip-1", "Alasan");
      expect(result.success).toBe(false);
    });

    it("returns not found for nonexistent trip", async () => {
      vi.mocked(prisma.deliveryScheduleVehicle.findUnique).mockResolvedValue(null);
      const result = await cancelTrip("nonexistent", "Alasan");
      expect(result.success).toBe(false);
    });
  });

  // ============================================
  // reopenTrip
  // ============================================
  describe("reopenTrip", () => {
    it("reopens a CONFIRMED trip", async () => {
      const mockTrip = { id: "trip-1", status: "CONFIRMED", scheduleId: "s-1" };
      vi.mocked(prisma.deliveryScheduleVehicle.findUnique).mockResolvedValue(mockTrip as never);
      vi.mocked(prisma.deliveryScheduleVehicle.update).mockResolvedValue({} as never);
      const result = await reopenTrip("trip-1", "Perlu ubah");
      expect(result.success).toBe(true);
    });

    it("rejects reopen for PLANNED trip", async () => {
      const mockTrip = { id: "trip-1", status: "PLANNED", scheduleId: "s-1" };
      vi.mocked(prisma.deliveryScheduleVehicle.findUnique).mockResolvedValue(mockTrip as never);
      const result = await reopenTrip("trip-1", "Alasan");
      expect(result.success).toBe(false);
    });

    it("rejects reopen for DEPARTED trip", async () => {
      const mockTrip = { id: "trip-1", status: "DEPARTED", scheduleId: "s-1" };
      vi.mocked(prisma.deliveryScheduleVehicle.findUnique).mockResolvedValue(mockTrip as never);
      const result = await reopenTrip("trip-1", "Alasan");
      expect(result.success).toBe(false);
    });

    it("rejects reopen for COMPLETED trip", async () => {
      const mockTrip = { id: "trip-1", status: "COMPLETED", scheduleId: "s-1" };
      vi.mocked(prisma.deliveryScheduleVehicle.findUnique).mockResolvedValue(mockTrip as never);
      const result = await reopenTrip("trip-1", "Alasan");
      expect(result.success).toBe(false);
    });

    it("rejects reopen for CANCELLED trip", async () => {
      const mockTrip = { id: "trip-1", status: "CANCELLED", scheduleId: "s-1" };
      vi.mocked(prisma.deliveryScheduleVehicle.findUnique).mockResolvedValue(mockTrip as never);
      const result = await reopenTrip("trip-1", "Alasan");
      expect(result.success).toBe(false);
    });

    it("returns not found for nonexistent trip", async () => {
      vi.mocked(prisma.deliveryScheduleVehicle.findUnique).mockResolvedValue(null);
      const result = await reopenTrip("nonexistent", "Alasan");
      expect(result.success).toBe(false);
    });
  });

  // ============================================
  // reorderStops
  // ============================================
  describe("reorderStops", () => {
    it("reorders stops successfully", async () => {
      const mockTrip = {
        id: "trip-1",
        orders: [
          { id: "stop-1", scheduleVehicleId: "trip-1" },
          { id: "stop-2", scheduleVehicleId: "trip-1" },
        ],
      };
      vi.mocked(prisma.deliveryScheduleVehicle.findUnique).mockResolvedValue(mockTrip as never);
      vi.mocked(prisma.deliveryScheduleOrder.update).mockResolvedValue({} as never);
      vi.mocked(prisma.$transaction).mockResolvedValue([{}, {}] as never);
      const result = await reorderStops("trip-1", ["stop-2", "stop-1"]);
      expect(result.success).toBe(true);
    });

    it("rejects if stop IDs don't belong to trip", async () => {
      const mockTrip = {
        id: "trip-1",
        orders: [{ id: "stop-1", scheduleVehicleId: "trip-1" }],
      };
      vi.mocked(prisma.deliveryScheduleVehicle.findUnique).mockResolvedValue(mockTrip as never);
      const result = await reorderStops("trip-1", ["stop-1", "stop-99"]);
      expect(result.success).toBe(false);
    });

    it("returns not found for nonexistent trip", async () => {
      vi.mocked(prisma.deliveryScheduleVehicle.findUnique).mockResolvedValue(null);
      const result = await reorderStops("nonexistent", ["stop-1"]);
      expect(result.success).toBe(false);
    });
  });

  // ============================================
  // createScheduleTrip
  // ============================================
  describe("createScheduleTrip", () => {
    const mockSchedule = { id: "s-1", weekStart: new Date("2026-07-27"), weekEnd: new Date("2026-08-02"), status: "DRAFT" };
    const mockVehicle = { id: "v-1", plateNumber: "B 1234 CD", name: "Truk A", status: "ACTIVE" };

    it("creates INTERNAL_FLEET trip successfully", async () => {
      vi.mocked(prisma.deliverySchedule.findUnique).mockResolvedValue(mockSchedule as never);
      vi.mocked(prisma.vehicle.findUnique).mockResolvedValue(mockVehicle as never);
      vi.mocked(prisma.deliveryScheduleVehicle.findMany).mockResolvedValue([]);
      vi.mocked(prisma.deliveryScheduleVehicle.aggregate).mockResolvedValue({ _max: { sequence: null } } as never);
      vi.mocked(prisma.deliveryScheduleVehicle.create).mockResolvedValue({ id: "trip-1" } as never);
      const result = await createScheduleTrip("s-1", {
        vehicleId: "v-1",
        transportMode: "INTERNAL_FLEET",
        departureDate: new Date("2026-07-28"),
      });
      expect(result.success).toBe(true);
    });

    it("rejects INTERNAL_FLEET without vehicleId", async () => {
      vi.mocked(prisma.deliverySchedule.findUnique).mockResolvedValue(mockSchedule as never);
      const result = await createScheduleTrip("s-1", {
        transportMode: "INTERNAL_FLEET",
        departureDate: new Date("2026-07-28"),
      });
      expect(result.success).toBe(false);
    });

    it("creates EXTERNAL_FLEET trip without vehicle", async () => {
      vi.mocked(prisma.deliverySchedule.findUnique).mockResolvedValue(mockSchedule as never);
      vi.mocked(prisma.deliveryScheduleVehicle.aggregate).mockResolvedValue({ _max: { sequence: null } } as never);
      vi.mocked(prisma.deliveryScheduleVehicle.create).mockResolvedValue({ id: "trip-1" } as never);
      const result = await createScheduleTrip("s-1", {
        transportMode: "EXTERNAL_FLEET",
        departureDate: new Date("2026-07-28"),
        externalProvider: "PT Maju Jaya",
        externalPlate: "B 9999 ZZ",
      });
      expect(result.success).toBe(true);
    });

    it("creates CUSTOMER_PICKUP trip", async () => {
      vi.mocked(prisma.deliverySchedule.findUnique).mockResolvedValue(mockSchedule as never);
      vi.mocked(prisma.deliveryScheduleVehicle.aggregate).mockResolvedValue({ _max: { sequence: null } } as never);
      vi.mocked(prisma.deliveryScheduleVehicle.create).mockResolvedValue({ id: "trip-1" } as never);
      const result = await createScheduleTrip("s-1", {
        transportMode: "CUSTOMER_PICKUP",
        departureDate: new Date("2026-07-28"),
      });
      expect(result.success).toBe(true);
    });

    it("creates TBD trip", async () => {
      vi.mocked(prisma.deliverySchedule.findUnique).mockResolvedValue(mockSchedule as never);
      vi.mocked(prisma.deliveryScheduleVehicle.aggregate).mockResolvedValue({ _max: { sequence: null } } as never);
      vi.mocked(prisma.deliveryScheduleVehicle.create).mockResolvedValue({ id: "trip-1" } as never);
      const result = await createScheduleTrip("s-1", {
        transportMode: "TBD",
        departureDate: new Date("2026-07-28"),
      });
      expect(result.success).toBe(true);
    });

    it("rejects inactive vehicle", async () => {
      vi.mocked(prisma.deliverySchedule.findUnique).mockResolvedValue(mockSchedule as never);
      vi.mocked(prisma.vehicle.findUnique).mockResolvedValue({ ...mockVehicle, status: "INACTIVE" } as never);
      const result = await createScheduleTrip("s-1", {
        vehicleId: "v-1",
        transportMode: "INTERNAL_FLEET",
        departureDate: new Date("2026-07-28"),
      });
      expect(result.success).toBe(false);
    });

    it("rejects departure date outside week", async () => {
      vi.mocked(prisma.deliverySchedule.findUnique).mockResolvedValue(mockSchedule as never);
      vi.mocked(prisma.vehicle.findUnique).mockResolvedValue(mockVehicle as never);
      const result = await createScheduleTrip("s-1", {
        vehicleId: "v-1",
        transportMode: "INTERNAL_FLEET",
        departureDate: new Date("2026-08-10"),
      });
      expect(result.success).toBe(false);
    });

    it("returns not found for nonexistent schedule", async () => {
      vi.mocked(prisma.deliverySchedule.findUnique).mockResolvedValue(null);
      const result = await createScheduleTrip("nonexistent", {
        vehicleId: "v-1",
        departureDate: new Date("2026-07-28"),
      });
      expect(result.success).toBe(false);
    });

    it("warns about same-day trips but still creates", async () => {
      vi.mocked(prisma.deliverySchedule.findUnique).mockResolvedValue(mockSchedule as never);
      vi.mocked(prisma.vehicle.findUnique).mockResolvedValue(mockVehicle as never);
      vi.mocked(prisma.deliveryScheduleVehicle.findMany).mockResolvedValue([
        { vehicleId: "v-1", departureDate: new Date("2026-07-28"), status: "PLANNED" },
      ] as never);
      vi.mocked(prisma.deliveryScheduleVehicle.aggregate).mockResolvedValue({ _max: { sequence: 0 } } as never);
      vi.mocked(prisma.deliveryScheduleVehicle.create).mockResolvedValue({ id: "trip-2" } as never);
      const result = await createScheduleTrip("s-1", {
        vehicleId: "v-1",
        transportMode: "INTERNAL_FLEET",
        departureDate: new Date("2026-07-28"),
      });
      expect(result.success).toBe(true);
    });

    it("accepts optional fields: runNumber, routeName, notes", async () => {
      vi.mocked(prisma.deliverySchedule.findUnique).mockResolvedValue(mockSchedule as never);
      vi.mocked(prisma.vehicle.findUnique).mockResolvedValue(mockVehicle as never);
      vi.mocked(prisma.deliveryScheduleVehicle.findMany).mockResolvedValue([]);
      vi.mocked(prisma.deliveryScheduleVehicle.aggregate).mockResolvedValue({ _max: { sequence: null } } as never);
      vi.mocked(prisma.deliveryScheduleVehicle.create).mockResolvedValue({ id: "trip-1" } as never);
      const result = await createScheduleTrip("s-1", {
        vehicleId: "v-1",
        transportMode: "INTERNAL_FLEET",
        departureDate: new Date("2026-07-28"),
        runNumber: "2",
        routeName: "Jakarta-Bandung",
        notes: "Prioritas tinggi",
      });
      expect(result.success).toBe(true);
    });
  });

  // ============================================
  // updateScheduleTrip
  // ============================================
  describe("updateScheduleTrip", () => {
    it("updates a PLANNED trip", async () => {
      const mockTrip = { id: "trip-1", status: "PLANNED", scheduleId: "s-1", transportMode: "INTERNAL_FLEET", vehicleId: "v-1", schedule: { weekStart: new Date("2026-07-27"), weekEnd: new Date("2026-08-02") } };
      vi.mocked(prisma.deliveryScheduleVehicle.findUnique).mockResolvedValue(mockTrip as never);
      vi.mocked(prisma.deliveryScheduleVehicle.update).mockResolvedValue({} as never);
      const result = await updateScheduleTrip("trip-1", { notes: "Updated" });
      expect(result.success).toBe(true);
    });

    it("rejects update for CONFIRMED trip", async () => {
      const mockTrip = { id: "trip-1", status: "CONFIRMED", scheduleId: "s-1", transportMode: "INTERNAL_FLEET", vehicleId: "v-1", schedule: { weekStart: new Date("2026-07-27"), weekEnd: new Date("2026-08-02") } };
      vi.mocked(prisma.deliveryScheduleVehicle.findUnique).mockResolvedValue(mockTrip as never);
      const result = await updateScheduleTrip("trip-1", { notes: "Updated" });
      expect(result.success).toBe(false);
    });

    it("rejects update for DEPARTED trip", async () => {
      const mockTrip = { id: "trip-1", status: "DEPARTED", scheduleId: "s-1", transportMode: "INTERNAL_FLEET", vehicleId: "v-1", schedule: { weekStart: new Date("2026-07-27"), weekEnd: new Date("2026-08-02") } };
      vi.mocked(prisma.deliveryScheduleVehicle.findUnique).mockResolvedValue(mockTrip as never);
      const result = await updateScheduleTrip("trip-1", { notes: "Updated" });
      expect(result.success).toBe(false);
    });

    it("validates transport mode change", async () => {
      const mockTrip = { id: "trip-1", status: "PLANNED", scheduleId: "s-1", transportMode: "EXTERNAL_FLEET", vehicleId: null, schedule: { weekStart: new Date("2026-07-27"), weekEnd: new Date("2026-08-02") } };
      vi.mocked(prisma.deliveryScheduleVehicle.findUnique).mockResolvedValue(mockTrip as never);
      const result = await updateScheduleTrip("trip-1", { transportMode: "INTERNAL_FLEET" });
      expect(result.success).toBe(false);
    });

    it("validates departure date within week", async () => {
      const mockTrip = { id: "trip-1", status: "PLANNED", scheduleId: "s-1", transportMode: "INTERNAL_FLEET", vehicleId: "v-1", schedule: { weekStart: new Date("2026-07-27"), weekEnd: new Date("2026-08-02") } };
      vi.mocked(prisma.deliveryScheduleVehicle.findUnique).mockResolvedValue(mockTrip as never);
      const result = await updateScheduleTrip("trip-1", { departureDate: new Date("2026-08-10") });
      expect(result.success).toBe(false);
    });

    it("returns not found for nonexistent trip", async () => {
      vi.mocked(prisma.deliveryScheduleVehicle.findUnique).mockResolvedValue(null);
      const result = await updateScheduleTrip("nonexistent", { notes: "Updated" });
      expect(result.success).toBe(false);
    });
  });

  // ============================================
  // updateTripStatus
  // ============================================
  describe("updateTripStatus", () => {
    it("confirms a PLANNED trip", async () => {
      const mockTrip = {
        id: "trip-1", status: "PLANNED", departureDate: new Date("2026-07-28"),
        schedule: { weekStart: new Date("2026-07-27"), weekEnd: new Date("2026-08-02") },
        orders: [],
      };
      vi.mocked(prisma.deliveryScheduleVehicle.findUnique).mockResolvedValue(mockTrip as never);
      vi.mocked(prisma.deliveryScheduleVehicle.update).mockResolvedValue({} as never);
      const result = await updateTripStatus("trip-1", "CONFIRMED");
      expect(result.success).toBe(true);
    });

    it("rejects invalid transition PLANNED → DEPARTED", async () => {
      const mockTrip = {
        id: "trip-1", status: "PLANNED", departureDate: new Date("2026-07-28"),
        schedule: { weekStart: new Date("2026-07-27"), weekEnd: new Date("2026-08-02") },
        orders: [],
      };
      vi.mocked(prisma.deliveryScheduleVehicle.findUnique).mockResolvedValue(mockTrip as never);
      const result = await updateTripStatus("trip-1", "DEPARTED");
      expect(result.success).toBe(false);
    });

    it("rejects CONFIRMED without departureDate", async () => {
      const mockTrip = {
        id: "trip-1", status: "PLANNED", departureDate: null,
        schedule: { weekStart: new Date("2026-07-27"), weekEnd: new Date("2026-08-02") },
        orders: [],
      };
      vi.mocked(prisma.deliveryScheduleVehicle.findUnique).mockResolvedValue(mockTrip as never);
      const result = await updateTripStatus("trip-1", "CONFIRMED");
      expect(result.success).toBe(false);
    });

    it("returns not found for nonexistent trip", async () => {
      vi.mocked(prisma.deliveryScheduleVehicle.findUnique).mockResolvedValue(null);
      const result = await updateTripStatus("nonexistent", "CONFIRMED");
      expect(result.success).toBe(false);
    });
  });

  // ============================================
  // createDeliverySchedule
  // ============================================
  describe("createDeliverySchedule", () => {
    it("creates a new schedule", async () => {
      vi.mocked(prisma.deliverySchedule.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.deliverySchedule.create).mockResolvedValue({ id: "s-1" } as never);
      const result = await createDeliverySchedule({ weekStart: new Date("2026-07-27") });
      expect(result.success).toBe(true);
    });

    it("rejects duplicate week", async () => {
      vi.mocked(prisma.deliverySchedule.findFirst).mockResolvedValue({ id: "existing", scheduleNumber: "JADWAL-2026-W31" } as never);
      const result = await createDeliverySchedule({ weekStart: new Date("2026-07-27") });
      expect(result.success).toBe(false);
    });
  });

  // ============================================
  // updateDeliverySchedule
  // ============================================
  describe("updateDeliverySchedule", () => {
    it("updates notes", async () => {
      const mockSchedule = { id: "s-1", status: "DRAFT", trips: [] };
      vi.mocked(prisma.deliverySchedule.findUnique).mockResolvedValue(mockSchedule as never);
      vi.mocked(prisma.deliverySchedule.update).mockResolvedValue({} as never);
      const result = await updateDeliverySchedule("s-1", { notes: "New notes" });
      expect(result.success).toBe(true);
    });

    it("activates DRAFT schedule", async () => {
      const mockSchedule = { id: "s-1", status: "DRAFT", trips: [{ id: "t-1" }] };
      vi.mocked(prisma.deliverySchedule.findUnique).mockResolvedValue(mockSchedule as never);
      vi.mocked(prisma.deliverySchedule.update).mockResolvedValue({} as never);
      const result = await updateDeliverySchedule("s-1", { status: "ACTIVE" });
      expect(result.success).toBe(true);
    });

    it("rejects invalid status transition", async () => {
      const mockSchedule = { id: "s-1", status: "CLOSED", trips: [] };
      vi.mocked(prisma.deliverySchedule.findUnique).mockResolvedValue(mockSchedule as never);
      const result = await updateDeliverySchedule("s-1", { status: "DRAFT" });
      expect(result.success).toBe(false);
    });

    it("closes schedule with all trips terminal", async () => {
      const mockSchedule = { id: "s-1", status: "ACTIVE", trips: [{ status: "COMPLETED" }, { status: "CANCELLED" }] };
      vi.mocked(prisma.deliverySchedule.findUnique).mockResolvedValue(mockSchedule as never);
      vi.mocked(prisma.deliverySchedule.update).mockResolvedValue({} as never);
      const result = await updateDeliverySchedule("s-1", { status: "CLOSED" });
      expect(result.success).toBe(true);
    });

    it("rejects close with non-terminal trips", async () => {
      const mockSchedule = { id: "s-1", status: "ACTIVE", trips: [{ status: "PLANNED" }] };
      vi.mocked(prisma.deliverySchedule.findUnique).mockResolvedValue(mockSchedule as never);
      const result = await updateDeliverySchedule("s-1", { status: "CLOSED" });
      expect(result.success).toBe(false);
    });

    it("returns not found for nonexistent schedule", async () => {
      vi.mocked(prisma.deliverySchedule.findUnique).mockResolvedValue(null);
      const result = await updateDeliverySchedule("nonexistent", { notes: "x" });
      expect(result.success).toBe(false);
    });
  });

  // ============================================
  // getDeliverySchedules
  // ============================================
  describe("getDeliverySchedules", () => {
    it("returns schedules", async () => {
      vi.mocked(prisma.deliverySchedule.findMany).mockResolvedValue([]);
      const result = await getDeliverySchedules();
      expect(result.success).toBe(true);
    });
  });

  // ============================================
  // getDeliverySchedule
  // ============================================
  describe("getDeliverySchedule", () => {
    it("returns a schedule with full details", async () => {
      vi.mocked(prisma.deliverySchedule.findUnique).mockResolvedValue({ id: "s-1", trips: [] } as never);
      const result = await getDeliverySchedule("s-1");
      expect(result.success).toBe(true);
    });

    it("returns not found for nonexistent schedule", async () => {
      vi.mocked(prisma.deliverySchedule.findUnique).mockResolvedValue(null);
      const result = await getDeliverySchedule("nonexistent");
      expect(result.success).toBe(false);
    });
  });

  // ============================================
  // scheduleSOWithTrip
  // ============================================
  describe("scheduleSOWithTrip", () => {
    const mockSchedule = { id: "s-1", weekStart: new Date("2026-07-27"), weekEnd: new Date("2026-08-02") };
    const mockSO = { id: "so-1", orderNumber: "SO-001", status: "CONFIRMED" };
    const mockVehicle = { id: "v-1", plateNumber: "B 1234", status: "ACTIVE" };

    it("creates trip and assigns SO", async () => {
      vi.mocked(prisma.deliverySchedule.findUnique).mockResolvedValue(mockSchedule as never);
      vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue(mockSO as never);
      vi.mocked(prisma.vehicle.findUnique).mockResolvedValue(mockVehicle as never);
      vi.mocked(prisma.deliveryScheduleVehicle.aggregate).mockResolvedValue({ _max: { sequence: null } } as never);
      vi.mocked(prisma.deliveryScheduleVehicle.create).mockResolvedValue({ id: "trip-1" } as never);
      vi.mocked(prisma.deliveryScheduleOrder.aggregate).mockResolvedValue({ _max: { sequence: null } } as never);
      vi.mocked(prisma.deliveryScheduleOrder.create).mockResolvedValue({ id: "stop-1" } as never);
      const result = await scheduleSOWithTrip("s-1", {
        salesOrderId: "so-1",
        vehicleId: "v-1",
        departureDate: new Date("2026-07-28"),
      });
      expect(result.success).toBe(true);
    });

    it("reuses existing trip", async () => {
      vi.mocked(prisma.deliverySchedule.findUnique).mockResolvedValue(mockSchedule as never);
      vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue(mockSO as never);
      vi.mocked(prisma.deliveryScheduleVehicle.findUnique).mockResolvedValue({ id: "existing-trip", scheduleId: "s-1", status: "PLANNED" } as never);
      vi.mocked(prisma.deliveryScheduleOrder.aggregate).mockResolvedValue({ _max: { sequence: 0 } } as never);
      vi.mocked(prisma.deliveryScheduleOrder.create).mockResolvedValue({ id: "stop-1" } as never);
      const result = await scheduleSOWithTrip("s-1", {
        salesOrderId: "so-1",
        vehicleId: "v-1",
        departureDate: new Date("2026-07-28"),
        existingTripId: "existing-trip",
      });
      expect(result.success).toBe(true);
    });

    it("rejects unschedulable SO", async () => {
      vi.mocked(prisma.deliverySchedule.findUnique).mockResolvedValue(mockSchedule as never);
      vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue({ ...mockSO, status: "DRAFT" } as never);
      const result = await scheduleSOWithTrip("s-1", {
        salesOrderId: "so-1",
        vehicleId: "v-1",
        departureDate: new Date("2026-07-28"),
      });
      expect(result.success).toBe(false);
    });

    it("rejects nonexistent trip in different schedule", async () => {
      vi.mocked(prisma.deliverySchedule.findUnique).mockResolvedValue(mockSchedule as never);
      vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue(mockSO as never);
      vi.mocked(prisma.deliveryScheduleVehicle.findUnique).mockResolvedValue({ id: "other-trip", scheduleId: "other", status: "PLANNED" } as never);
      const result = await scheduleSOWithTrip("s-1", {
        salesOrderId: "so-1",
        vehicleId: "v-1",
        departureDate: new Date("2026-07-28"),
        existingTripId: "other-trip",
      });
      expect(result.success).toBe(false);
    });

    it("rejects trip that cannot accept stops", async () => {
      vi.mocked(prisma.deliverySchedule.findUnique).mockResolvedValue(mockSchedule as never);
      vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue(mockSO as never);
      vi.mocked(prisma.deliveryScheduleVehicle.findUnique).mockResolvedValue({ id: "trip-1", scheduleId: "s-1", status: "DEPARTED" } as never);
      const result = await scheduleSOWithTrip("s-1", {
        salesOrderId: "so-1",
        vehicleId: "v-1",
        departureDate: new Date("2026-07-28"),
        existingTripId: "trip-1",
      });
      expect(result.success).toBe(false);
    });

    it("rejects nonexistent schedule", async () => {
      vi.mocked(prisma.deliverySchedule.findUnique).mockResolvedValue(null);
      const result = await scheduleSOWithTrip("nonexistent", {
        salesOrderId: "so-1",
        vehicleId: "v-1",
        departureDate: new Date("2026-07-28"),
      });
      expect(result.success).toBe(false);
    });

    it("rejects nonexistent SO", async () => {
      vi.mocked(prisma.deliverySchedule.findUnique).mockResolvedValue(mockSchedule as never);
      vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue(null);
      const result = await scheduleSOWithTrip("s-1", {
        salesOrderId: "nonexistent",
        vehicleId: "v-1",
        departureDate: new Date("2026-07-28"),
      });
      expect(result.success).toBe(false);
    });

    it("rejects inactive vehicle for new trip", async () => {
      vi.mocked(prisma.deliverySchedule.findUnique).mockResolvedValue(mockSchedule as never);
      vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue(mockSO as never);
      vi.mocked(prisma.vehicle.findUnique).mockResolvedValue({ ...mockVehicle, status: "INACTIVE" } as never);
      const result = await scheduleSOWithTrip("s-1", {
        salesOrderId: "so-1",
        vehicleId: "v-1",
        departureDate: new Date("2026-07-28"),
      });
      expect(result.success).toBe(false);
    });

    it("rejects nonexistent vehicle for new trip", async () => {
      vi.mocked(prisma.deliverySchedule.findUnique).mockResolvedValue(mockSchedule as never);
      vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue(mockSO as never);
      vi.mocked(prisma.vehicle.findUnique).mockResolvedValue(null);
      const result = await scheduleSOWithTrip("s-1", {
        salesOrderId: "so-1",
        vehicleId: "nonexistent",
        departureDate: new Date("2026-07-28"),
      });
      expect(result.success).toBe(false);
    });

    it("rejects departure outside week for new trip", async () => {
      vi.mocked(prisma.deliverySchedule.findUnique).mockResolvedValue(mockSchedule as never);
      vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue(mockSO as never);
      vi.mocked(prisma.vehicle.findUnique).mockResolvedValue(mockVehicle as never);
      const result = await scheduleSOWithTrip("s-1", {
        salesOrderId: "so-1",
        vehicleId: "v-1",
        departureDate: new Date("2026-08-10"),
      });
      expect(result.success).toBe(false);
    });
  });

  // ============================================
  // removeVehicleFromSchedule
  // ============================================
  describe("removeVehicleFromSchedule", () => {
    it("removes a PLANNED trip", async () => {
      vi.mocked(prisma.deliveryScheduleVehicle.findUnique).mockResolvedValue({ id: "t-1", status: "PLANNED", orders: [], scheduleId: "s-1" } as never);
      vi.mocked(prisma.deliveryScheduleOrder.deleteMany).mockResolvedValue({ count: 0 } as never);
      vi.mocked(prisma.deliveryScheduleVehicle.delete).mockResolvedValue({} as never);
      const result = await removeVehicleFromSchedule("t-1");
      expect(result.success).toBe(true);
    });

    it("rejects removing CONFIRMED trip with active stops", async () => {
      vi.mocked(prisma.deliveryScheduleVehicle.findUnique).mockResolvedValue({
        id: "t-1", status: "CONFIRMED", scheduleId: "s-1",
        orders: [{ status: "LINKED" }],
      } as never);
      const result = await removeVehicleFromSchedule("t-1");
      expect(result.success).toBe(false);
    });

    it("returns not found for nonexistent trip", async () => {
      vi.mocked(prisma.deliveryScheduleVehicle.findUnique).mockResolvedValue(null);
      const result = await removeVehicleFromSchedule("nonexistent");
      expect(result.success).toBe(false);
    });
  });

  // ============================================
  // removeOrderFromSchedule
  // ============================================
  describe("removeOrderFromSchedule", () => {
    it("deletes a PLANNED stop", async () => {
      vi.mocked(prisma.deliveryScheduleOrder.findUnique).mockResolvedValue({
        id: "stop-1", status: "PLANNED", scheduleVehicle: { scheduleId: "s-1" },
      } as never);
      vi.mocked(prisma.deliveryScheduleOrder.delete).mockResolvedValue({} as never);
      const result = await removeOrderFromSchedule("stop-1");
      expect(result.success).toBe(true);
    });

    it("cancels a LINKED stop", async () => {
      vi.mocked(prisma.deliveryScheduleOrder.findUnique).mockResolvedValue({
        id: "stop-1", status: "LINKED", scheduleVehicle: { scheduleId: "s-1" },
      } as never);
      vi.mocked(prisma.deliveryScheduleOrder.update).mockResolvedValue({} as never);
      const result = await removeOrderFromSchedule("stop-1");
      expect(result.success).toBe(true);
    });

    it("returns not found for nonexistent stop", async () => {
      vi.mocked(prisma.deliveryScheduleOrder.findUnique).mockResolvedValue(null);
      const result = await removeOrderFromSchedule("nonexistent");
      expect(result.success).toBe(false);
    });
  });

  // ============================================
  // rescheduleTrip
  // ============================================
  describe("rescheduleTrip", () => {
    it("reschedules a PLANNED trip", async () => {
      const mockTrip = { id: "t-1", status: "PLANNED", transportMode: "INTERNAL_FLEET", vehicleId: "v-1", schedule: { weekStart: new Date("2026-07-27"), weekEnd: new Date("2026-08-02") } };
      vi.mocked(prisma.deliveryScheduleVehicle.findUnique).mockResolvedValue(mockTrip as never);
      vi.mocked(prisma.deliveryScheduleVehicle.update).mockResolvedValue({} as never);
      const result = await rescheduleTrip("t-1", { departureDate: new Date("2026-07-29"), reason: "Jadwal berubah" });
      expect(result.success).toBe(true);
    });

    it("reschedules CONFIRMED trip with reopen", async () => {
      const mockTrip = { id: "t-1", status: "CONFIRMED", transportMode: "INTERNAL_FLEET", vehicleId: "v-1", schedule: { weekStart: new Date("2026-07-27"), weekEnd: new Date("2026-08-02") } };
      vi.mocked(prisma.deliveryScheduleVehicle.findUnique).mockResolvedValue(mockTrip as never);
      vi.mocked(prisma.deliveryScheduleVehicle.update).mockResolvedValue({} as never);
      const result = await rescheduleTrip("t-1", { departureDate: new Date("2026-07-29"), reason: "Customer minta ubah" });
      expect(result.success).toBe(true);
    });

    it("rejects reschedule of CONFIRMED without reason", async () => {
      const mockTrip = { id: "t-1", status: "CONFIRMED", transportMode: "INTERNAL_FLEET", vehicleId: "v-1", schedule: { weekStart: new Date("2026-07-27"), weekEnd: new Date("2026-08-02") } };
      vi.mocked(prisma.deliveryScheduleVehicle.findUnique).mockResolvedValue(mockTrip as never);
      const result = await rescheduleTrip("t-1", { departureDate: new Date("2026-07-29") });
      expect(result.success).toBe(false);
    });

    it("rejects reschedule of DEPARTED trip", async () => {
      const mockTrip = { id: "t-1", status: "DEPARTED", transportMode: "INTERNAL_FLEET", vehicleId: "v-1", schedule: { weekStart: new Date("2026-07-27"), weekEnd: new Date("2026-08-02") } };
      vi.mocked(prisma.deliveryScheduleVehicle.findUnique).mockResolvedValue(mockTrip as never);
      const result = await rescheduleTrip("t-1", { departureDate: new Date("2026-07-29"), reason: "x" });
      expect(result.success).toBe(false);
    });

    it("rejects reschedule of COMPLETED trip", async () => {
      const mockTrip = { id: "t-1", status: "COMPLETED", transportMode: "INTERNAL_FLEET", vehicleId: "v-1", schedule: { weekStart: new Date("2026-07-27"), weekEnd: new Date("2026-08-02") } };
      vi.mocked(prisma.deliveryScheduleVehicle.findUnique).mockResolvedValue(mockTrip as never);
      const result = await rescheduleTrip("t-1", { departureDate: new Date("2026-07-29"), reason: "x" });
      expect(result.success).toBe(false);
    });

    it("rejects reschedule of CANCELLED trip", async () => {
      const mockTrip = { id: "t-1", status: "CANCELLED", transportMode: "INTERNAL_FLEET", vehicleId: "v-1", schedule: { weekStart: new Date("2026-07-27"), weekEnd: new Date("2026-08-02") } };
      vi.mocked(prisma.deliveryScheduleVehicle.findUnique).mockResolvedValue(mockTrip as never);
      const result = await rescheduleTrip("t-1", { departureDate: new Date("2026-07-29"), reason: "x" });
      expect(result.success).toBe(false);
    });

    it("validates transport mode change", async () => {
      const mockTrip = { id: "t-1", status: "PLANNED", transportMode: "EXTERNAL_FLEET", vehicleId: null, schedule: { weekStart: new Date("2026-07-27"), weekEnd: new Date("2026-08-02") } };
      vi.mocked(prisma.deliveryScheduleVehicle.findUnique).mockResolvedValue(mockTrip as never);
      const result = await rescheduleTrip("t-1", { transportMode: "INTERNAL_FLEET", reason: "x" });
      expect(result.success).toBe(false);
    });

    it("validates departure date within week", async () => {
      const mockTrip = { id: "t-1", status: "PLANNED", transportMode: "INTERNAL_FLEET", vehicleId: "v-1", schedule: { weekStart: new Date("2026-07-27"), weekEnd: new Date("2026-08-02") } };
      vi.mocked(prisma.deliveryScheduleVehicle.findUnique).mockResolvedValue(mockTrip as never);
      const result = await rescheduleTrip("t-1", { departureDate: new Date("2026-08-10"), reason: "x" });
      expect(result.success).toBe(false);
    });

    it("returns not found for nonexistent trip", async () => {
      vi.mocked(prisma.deliveryScheduleVehicle.findUnique).mockResolvedValue(null);
      const result = await rescheduleTrip("nonexistent", { reason: "x" });
      expect(result.success).toBe(false);
    });
  });

  // ============================================
  // getDeliveryScheduleBoard
  // ============================================
  describe("getDeliveryScheduleBoard", () => {
    it("returns board data", async () => {
      vi.mocked(prisma.deliverySchedule.findUnique).mockResolvedValue({ id: "s-1", trips: [] } as never);
      const result = await getDeliveryScheduleBoard("s-1");
      expect(result.success).toBe(true);
    });

    it("returns not found for nonexistent schedule", async () => {
      vi.mocked(prisma.deliverySchedule.findUnique).mockResolvedValue(null);
      const result = await getDeliveryScheduleBoard("nonexistent");
      expect(result.success).toBe(false);
    });
  });

  // ============================================
  // assignSalesOrderToTrip
  // ============================================
  describe("assignSalesOrderToTrip", () => {
    it("assigns SO to PLANNED trip", async () => {
      const mockTrip = { id: "t-1", status: "PLANNED", scheduleId: "s-1" };
      const mockSO = { id: "so-1", orderNumber: "SO-001", status: "CONFIRMED", customer: { id: "c-1", name: "Test" } };
      vi.mocked(prisma.deliveryScheduleVehicle.findUnique).mockResolvedValue(mockTrip as never);
      vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue(mockSO as never);
      vi.mocked(prisma.deliveryScheduleOrder.aggregate).mockResolvedValue({ _max: { sequence: null } } as never);
      vi.mocked(prisma.deliveryScheduleOrder.create).mockResolvedValue({ id: "stop-1" } as never);
      const result = await assignSalesOrderToTrip("t-1", { salesOrderId: "so-1" });
      expect(result.success).toBe(true);
    });

    it("assigns SO to CONFIRMED trip", async () => {
      const mockTrip = { id: "t-1", status: "CONFIRMED", scheduleId: "s-1" };
      const mockSO = { id: "so-1", orderNumber: "SO-001", status: "CONFIRMED", customer: { id: "c-1", name: "Test" } };
      vi.mocked(prisma.deliveryScheduleVehicle.findUnique).mockResolvedValue(mockTrip as never);
      vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue(mockSO as never);
      vi.mocked(prisma.deliveryScheduleOrder.aggregate).mockResolvedValue({ _max: { sequence: null } } as never);
      vi.mocked(prisma.deliveryScheduleOrder.create).mockResolvedValue({ id: "stop-1" } as never);
      const result = await assignSalesOrderToTrip("t-1", { salesOrderId: "so-1" });
      expect(result.success).toBe(true);
    });

    it("rejects for DEPARTED trip", async () => {
      vi.mocked(prisma.deliveryScheduleVehicle.findUnique).mockResolvedValue({ id: "t-1", status: "DEPARTED", scheduleId: "s-1" } as never);
      const result = await assignSalesOrderToTrip("t-1", { salesOrderId: "so-1" });
      expect(result.success).toBe(false);
    });

    it("rejects unschedulable SO", async () => {
      vi.mocked(prisma.deliveryScheduleVehicle.findUnique).mockResolvedValue({ id: "t-1", status: "PLANNED", scheduleId: "s-1" } as never);
      vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue({ id: "so-1", status: "DRAFT", customer: null } as never);
      const result = await assignSalesOrderToTrip("t-1", { salesOrderId: "so-1" });
      expect(result.success).toBe(false);
    });

    it("returns not found for nonexistent trip", async () => {
      vi.mocked(prisma.deliveryScheduleVehicle.findUnique).mockResolvedValue(null);
      const result = await assignSalesOrderToTrip("nonexistent", { salesOrderId: "so-1" });
      expect(result.success).toBe(false);
    });

    it("returns not found for nonexistent SO", async () => {
      vi.mocked(prisma.deliveryScheduleVehicle.findUnique).mockResolvedValue({ id: "t-1", status: "PLANNED", scheduleId: "s-1" } as never);
      vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue(null);
      const result = await assignSalesOrderToTrip("t-1", { salesOrderId: "nonexistent" });
      expect(result.success).toBe(false);
    });
  });

  // ============================================
  // listSchedulableSalesOrders
  // ============================================
  describe("listSchedulableSalesOrders", () => {
    it("returns SO list", async () => {
      vi.mocked(prisma.salesOrder.findMany).mockResolvedValue([]);
      const result = await listSchedulableSalesOrders();
      expect(result.success).toBe(true);
    });

    it("filters by search", async () => {
      vi.mocked(prisma.salesOrder.findMany).mockResolvedValue([]);
      const result = await listSchedulableSalesOrders({ search: "ABC" });
      expect(result.success).toBe(true);
    });

    it("filters by customerId", async () => {
      vi.mocked(prisma.salesOrder.findMany).mockResolvedValue([]);
      const result = await listSchedulableSalesOrders({ customerId: "c-1" });
      expect(result.success).toBe(true);
    });
  });

  // ============================================
  // quickAddStop
  // ============================================
  describe("quickAddStop", () => {
    const mockSchedule = { id: "s-1", weekStart: new Date("2026-07-27"), weekEnd: new Date("2026-08-02") };

    it("adds delivery stop to existing trip", async () => {
      vi.mocked(prisma.deliverySchedule.findUnique).mockResolvedValue(mockSchedule as never);
      vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue({ id: "so-1", status: "CONFIRMED" } as never);
      vi.mocked(prisma.deliveryScheduleVehicle.findUnique).mockResolvedValue({ id: "t-1", scheduleId: "s-1", status: "PLANNED" } as never);
      vi.mocked(prisma.deliveryScheduleOrder.aggregate).mockResolvedValue({ _max: { sequence: null } } as never);
      vi.mocked(prisma.deliveryScheduleOrder.create).mockResolvedValue({ id: "stop-1" } as never);
      const result = await quickAddStop("s-1", {
        existingTripId: "t-1",
        activityType: "DELIVERY",
        salesOrderId: "so-1",
        departureDate: new Date("2026-07-28"),
      });
      expect(result.success).toBe(true);
    });

    it("creates new EXTERNAL_FLEET trip with stop", async () => {
      vi.mocked(prisma.deliverySchedule.findUnique).mockResolvedValue(mockSchedule as never);
      vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue({ id: "so-1", status: "CONFIRMED" } as never);
      vi.mocked(prisma.deliveryScheduleVehicle.aggregate).mockResolvedValue({ _max: { sequence: null } } as never);
      vi.mocked(prisma.deliveryScheduleVehicle.create).mockResolvedValue({ id: "t-1" } as never);
      vi.mocked(prisma.deliveryScheduleOrder.aggregate).mockResolvedValue({ _max: { sequence: null } } as never);
      vi.mocked(prisma.deliveryScheduleOrder.create).mockResolvedValue({ id: "stop-1" } as never);
      const result = await quickAddStop("s-1", {
        transportMode: "EXTERNAL_FLEET",
        departureDate: new Date("2026-07-28"),
        activityType: "DELIVERY",
        salesOrderId: "so-1",
        externalProvider: "PT Logistik",
        externalPlate: "B 9999 ZZ",
      });
      expect(result.success).toBe(true);
    });

    it("adds BACKHAUL activity without SO", async () => {
      vi.mocked(prisma.deliverySchedule.findUnique).mockResolvedValue(mockSchedule as never);
      vi.mocked(prisma.deliveryScheduleVehicle.findUnique).mockResolvedValue({ id: "t-1", scheduleId: "s-1", status: "PLANNED" } as never);
      vi.mocked(prisma.deliveryScheduleOrder.aggregate).mockResolvedValue({ _max: { sequence: null } } as never);
      vi.mocked(prisma.deliveryScheduleOrder.create).mockResolvedValue({ id: "stop-1" } as never);
      const result = await quickAddStop("s-1", {
        existingTripId: "t-1",
        activityType: "BACKHAUL",
        activityLabel: "Backhaul dari Gudang X",
        departureDate: new Date("2026-07-28"),
      });
      expect(result.success).toBe(true);
    });

    it("adds OTHER activity without SO", async () => {
      vi.mocked(prisma.deliverySchedule.findUnique).mockResolvedValue(mockSchedule as never);
      vi.mocked(prisma.deliveryScheduleVehicle.findUnique).mockResolvedValue({ id: "t-1", scheduleId: "s-1", status: "PLANNED" } as never);
      vi.mocked(prisma.deliveryScheduleOrder.aggregate).mockResolvedValue({ _max: { sequence: null } } as never);
      vi.mocked(prisma.deliveryScheduleOrder.create).mockResolvedValue({ id: "stop-1" } as never);
      const result = await quickAddStop("s-1", {
        existingTripId: "t-1",
        activityType: "OTHER",
        activityLabel: "Lain-lain",
        departureDate: new Date("2026-07-28"),
      });
      expect(result.success).toBe(true);
    });

    it("adds PICKUP_LOAD with label", async () => {
      vi.mocked(prisma.deliverySchedule.findUnique).mockResolvedValue(mockSchedule as never);
      vi.mocked(prisma.deliveryScheduleVehicle.findUnique).mockResolvedValue({ id: "t-1", scheduleId: "s-1", status: "PLANNED" } as never);
      vi.mocked(prisma.deliveryScheduleOrder.aggregate).mockResolvedValue({ _max: { sequence: null } } as never);
      vi.mocked(prisma.deliveryScheduleOrder.create).mockResolvedValue({ id: "stop-1" } as never);
      const result = await quickAddStop("s-1", {
        existingTripId: "t-1",
        activityType: "PICKUP_LOAD",
        activityLabel: "Muat Customer ABC",
        departureDate: new Date("2026-07-28"),
      });
      expect(result.success).toBe(true);
    });

    it("rejects DELIVERY without SO", async () => {
      vi.mocked(prisma.deliverySchedule.findUnique).mockResolvedValue(mockSchedule as never);
      const result = await quickAddStop("s-1", {
        existingTripId: "t-1",
        activityType: "DELIVERY",
        departureDate: new Date("2026-07-28"),
      });
      expect(result.success).toBe(false);
    });

    it("rejects BACKHAUL without label", async () => {
      vi.mocked(prisma.deliverySchedule.findUnique).mockResolvedValue(mockSchedule as never);
      const result = await quickAddStop("s-1", {
        existingTripId: "t-1",
        activityType: "BACKHAUL",
        departureDate: new Date("2026-07-28"),
      });
      expect(result.success).toBe(false);
    });

    it("rejects trip from different schedule", async () => {
      vi.mocked(prisma.deliverySchedule.findUnique).mockResolvedValue(mockSchedule as never);
      vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue({ id: "so-1", status: "CONFIRMED" } as never);
      vi.mocked(prisma.deliveryScheduleVehicle.findUnique).mockResolvedValue({ id: "t-1", scheduleId: "other", status: "PLANNED" } as never);
      const result = await quickAddStop("s-1", {
        existingTripId: "t-1",
        activityType: "DELIVERY",
        salesOrderId: "so-1",
        departureDate: new Date("2026-07-28"),
      });
      expect(result.success).toBe(false);
    });

    it("rejects trip that cannot accept stops", async () => {
      vi.mocked(prisma.deliverySchedule.findUnique).mockResolvedValue(mockSchedule as never);
      vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue({ id: "so-1", status: "CONFIRMED" } as never);
      vi.mocked(prisma.deliveryScheduleVehicle.findUnique).mockResolvedValue({ id: "t-1", scheduleId: "s-1", status: "DEPARTED" } as never);
      const result = await quickAddStop("s-1", {
        existingTripId: "t-1",
        activityType: "DELIVERY",
        salesOrderId: "so-1",
        departureDate: new Date("2026-07-28"),
      });
      expect(result.success).toBe(false);
    });

    it("rejects nonexistent schedule", async () => {
      vi.mocked(prisma.deliverySchedule.findUnique).mockResolvedValue(null);
      const result = await quickAddStop("nonexistent", {
        activityType: "DELIVERY",
        salesOrderId: "so-1",
        departureDate: new Date("2026-07-28"),
      });
      expect(result.success).toBe(false);
    });

    it("rejects unschedulable SO", async () => {
      vi.mocked(prisma.deliverySchedule.findUnique).mockResolvedValue(mockSchedule as never);
      vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue({ id: "so-1", status: "DRAFT" } as never);
      const result = await quickAddStop("s-1", {
        activityType: "DELIVERY",
        salesOrderId: "so-1",
        departureDate: new Date("2026-07-28"),
      });
      expect(result.success).toBe(false);
    });

    it("rejects nonexistent SO", async () => {
      vi.mocked(prisma.deliverySchedule.findUnique).mockResolvedValue(mockSchedule as never);
      vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue(null);
      const result = await quickAddStop("s-1", {
        activityType: "DELIVERY",
        salesOrderId: "nonexistent",
        departureDate: new Date("2026-07-28"),
      });
      expect(result.success).toBe(false);
    });

    it("rejects INTERNAL_FLEET without vehicle", async () => {
      vi.mocked(prisma.deliverySchedule.findUnique).mockResolvedValue(mockSchedule as never);
      vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue({ id: "so-1", status: "CONFIRMED" } as never);
      const result = await quickAddStop("s-1", {
        transportMode: "INTERNAL_FLEET",
        activityType: "DELIVERY",
        salesOrderId: "so-1",
        departureDate: new Date("2026-07-28"),
      });
      expect(result.success).toBe(false);
    });

    it("rejects departure outside week for new trip", async () => {
      vi.mocked(prisma.deliverySchedule.findUnique).mockResolvedValue(mockSchedule as never);
      vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue({ id: "so-1", status: "CONFIRMED" } as never);
      vi.mocked(prisma.vehicle.findUnique).mockResolvedValue({ id: "v-1", status: "ACTIVE" } as never);
      const result = await quickAddStop("s-1", {
        transportMode: "INTERNAL_FLEET",
        vehicleId: "v-1",
        activityType: "DELIVERY",
        salesOrderId: "so-1",
        departureDate: new Date("2026-08-10"),
      });
      expect(result.success).toBe(false);
    });

    it("rejects inactive vehicle for new trip", async () => {
      vi.mocked(prisma.deliverySchedule.findUnique).mockResolvedValue(mockSchedule as never);
      vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue({ id: "so-1", status: "CONFIRMED" } as never);
      vi.mocked(prisma.vehicle.findUnique).mockResolvedValue({ id: "v-1", status: "INACTIVE" } as never);
      const result = await quickAddStop("s-1", {
        transportMode: "INTERNAL_FLEET",
        vehicleId: "v-1",
        activityType: "DELIVERY",
        salesOrderId: "so-1",
        departureDate: new Date("2026-07-28"),
      });
      expect(result.success).toBe(false);
    });

    it("creates CUSTOMER_PICKUP trip with stop", async () => {
      vi.mocked(prisma.deliverySchedule.findUnique).mockResolvedValue(mockSchedule as never);
      vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue({ id: "so-1", status: "CONFIRMED" } as never);
      vi.mocked(prisma.deliveryScheduleVehicle.aggregate).mockResolvedValue({ _max: { sequence: null } } as never);
      vi.mocked(prisma.deliveryScheduleVehicle.create).mockResolvedValue({ id: "t-1" } as never);
      vi.mocked(prisma.deliveryScheduleOrder.aggregate).mockResolvedValue({ _max: { sequence: null } } as never);
      vi.mocked(prisma.deliveryScheduleOrder.create).mockResolvedValue({ id: "stop-1" } as never);
      const result = await quickAddStop("s-1", {
        transportMode: "CUSTOMER_PICKUP",
        activityType: "DELIVERY",
        salesOrderId: "so-1",
        departureDate: new Date("2026-07-28"),
      });
      expect(result.success).toBe(true);
    });

    it("creates TBD trip with stop", async () => {
      vi.mocked(prisma.deliverySchedule.findUnique).mockResolvedValue(mockSchedule as never);
      vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue({ id: "so-1", status: "CONFIRMED" } as never);
      vi.mocked(prisma.deliveryScheduleVehicle.aggregate).mockResolvedValue({ _max: { sequence: null } } as never);
      vi.mocked(prisma.deliveryScheduleVehicle.create).mockResolvedValue({ id: "t-1" } as never);
      vi.mocked(prisma.deliveryScheduleOrder.aggregate).mockResolvedValue({ _max: { sequence: null } } as never);
      vi.mocked(prisma.deliveryScheduleOrder.create).mockResolvedValue({ id: "stop-1" } as never);
      const result = await quickAddStop("s-1", {
        transportMode: "TBD",
        activityType: "DELIVERY",
        salesOrderId: "so-1",
        departureDate: new Date("2026-07-28"),
      });
      expect(result.success).toBe(true);
    });
  });
});
