import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getSalesOrderResidualDemand,
  adjustReservationsForVoidOutput,
  cancelSpecificReservation,
} from "../reservation-service";
import { ReservationStatus, ReservationType } from "@prisma/client";

// Stub a Decimal helper
const dec = (n: number) => ({ toNumber: () => n, valueOf: () => n });

describe("reservation-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getSalesOrderResidualDemand", () => {
    it("returns 0 if sales order item does not exist", async () => {
      const mockTx = {
        salesOrderItem: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      };

      const res = await getSalesOrderResidualDemand("so-1", "pv-1", mockTx as any);
      expect(res).toBe(0);
      expect(mockTx.salesOrderItem.findFirst).toHaveBeenCalledWith({
        where: { salesOrderId: "so-1", productVariantId: "pv-1" },
        select: { quantity: true, deliveredQty: true },
      });
    });

    it("calculates residual demand based on order qty, delivered qty, and active reservations", async () => {
      const mockTx = {
        salesOrderItem: {
          findFirst: vi.fn().mockResolvedValue({
            quantity: dec(100),
            deliveredQty: dec(20),
          }),
        },
        stockReservation: {
          aggregate: vi.fn().mockResolvedValue({
            _sum: { quantity: dec(30) },
          }),
        },
      };

      // residual = 100 - 20 - 30 = 50
      const res = await getSalesOrderResidualDemand("so-1", "pv-1", mockTx as any);
      expect(res).toBe(50);
      expect(mockTx.stockReservation.aggregate).toHaveBeenCalledWith({
        where: {
          reservedFor: ReservationType.SALES_ORDER,
          referenceId: "so-1",
          productVariantId: "pv-1",
          status: { in: [ReservationStatus.ACTIVE, ReservationStatus.WAITING] },
        },
        _sum: { quantity: true },
      });
    });
  });

  describe("adjustReservationsForVoidOutput", () => {
    it("cancels/reduces reservations LIFO style", async () => {
      const mockTx = {
        stockReservation: {
          findMany: vi.fn().mockResolvedValue([
            { id: "res-2", quantity: dec(50) },
            { id: "res-1", quantity: dec(30) },
          ]),
          update: vi.fn(),
        },
      };

      // Void 60. res-2 is 50 -> fully cancelled. res-1 is 30 -> reduced to 20.
      await adjustReservationsForVoidOutput("so-1", "pv-1", "loc-1", 60, mockTx as any);

      expect(mockTx.stockReservation.findMany).toHaveBeenCalledWith({
        where: {
          reservedFor: ReservationType.SALES_ORDER,
          referenceId: "so-1",
          productVariantId: "pv-1",
          locationId: "loc-1",
          status: { in: [ReservationStatus.ACTIVE, ReservationStatus.WAITING] },
        },
        orderBy: { createdAt: "desc" },
      });

      expect(mockTx.stockReservation.update).toHaveBeenCalledWith({
        where: { id: "res-2" },
        data: { status: ReservationStatus.CANCELLED },
      });

      expect(mockTx.stockReservation.update).toHaveBeenCalledWith({
        where: { id: "res-1" },
        data: {
          quantity: expect.objectContaining({ toNumber: expect.any(Function) }),
        },
      });
    });
  });

  describe("cancelSpecificReservation", () => {
    it("cancels reservation if status is ACTIVE or WAITING", async () => {
      const mockTx = {
        stockReservation: {
          findUnique: vi.fn().mockResolvedValue({ id: "res-1", status: ReservationStatus.ACTIVE }),
          update: vi.fn(),
        },
      };

      await cancelSpecificReservation("res-1", mockTx as any);
      expect(mockTx.stockReservation.update).toHaveBeenCalledWith({
        where: { id: "res-1" },
        data: { status: ReservationStatus.CANCELLED },
      });
    });

    it("does nothing if reservation is already cancelled or fulfilled", async () => {
      const mockTx = {
        stockReservation: {
          findUnique: vi.fn().mockResolvedValue({ id: "res-1", status: ReservationStatus.FULFILLED }),
          update: vi.fn(),
        },
      };

      await cancelSpecificReservation("res-1", mockTx as any);
      expect(mockTx.stockReservation.update).not.toHaveBeenCalled();
    });
  });
});
