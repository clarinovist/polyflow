'use server';

import { withTenant } from "@/lib/core/tenant";
import { prisma } from '@/lib/core/prisma';
import { safeAction } from '@/lib/errors/errors';
import { Prisma, OwnershipType, RateType } from '@prisma/client';

interface ShippingReportFilters {
  startDate?: Date;
  endDate?: Date;
  vehicleId?: string;
  ownershipType?: string;
  rateType?: string;
  routeName?: string;
}

interface ShippingReportSummary {
  totalDeliveries: number;
  totalCost: number;
  totalCharge: number;
  totalMargin: number;
  avgCostPerDelivery: number;
  avgChargePerDelivery: number;
  byVehicle: VehicleSummary[];
  byMonth: MonthlySummary[];
  byOwnership: OwnershipSummary[];
  byRoute: RouteSummary[];
}

interface RouteSummary {
  route: string;
  totalDeliveries: number;
  totalCost: number;
  totalCharge: number;
  totalMargin: number;
}

interface VehicleSummary {
  vehicleId: string;
  plateNumber: string;
  vehicleName: string;
  ownershipType: string;
  driverName: string | null;
  totalDeliveries: number;
  totalCost: number;
  totalCharge: number;
  totalMargin: number;
  avgCostPerDelivery: number;
}

interface MonthlySummary {
  month: string;
  totalDeliveries: number;
  totalCost: number;
  totalCharge: number;
  totalMargin: number;
}

interface OwnershipSummary {
  ownershipType: string;
  label: string;
  totalDeliveries: number;
  totalCost: number;
  totalCharge: number;
  totalMargin: number;
}

/**
 * Get shipping cost report data.
 */
export const getShippingCostReport = withTenant(
  async function getShippingCostReport(filters: ShippingReportFilters) {
    return safeAction(async () => {
      const where: Prisma.DeliveryOrderWhereInput = {
        vehicleId: { not: null },
      };

      if (filters.startDate || filters.endDate) {
        where.deliveryDate = {};
        if (filters.startDate) where.deliveryDate.gte = filters.startDate;
        if (filters.endDate) where.deliveryDate.lte = filters.endDate;
      }

      if (filters.vehicleId) {
        where.vehicleId = filters.vehicleId;
      }

      if (filters.ownershipType || filters.rateType) {
        where.vehicle = {};
        if (filters.ownershipType) {
          where.vehicle.ownershipType = filters.ownershipType as OwnershipType;
        }
        if (filters.rateType) {
          where.appliedRateType = filters.rateType as RateType;
        }
      }

      if (filters.routeName) {
        where.appliedRouteName = { contains: filters.routeName, mode: 'insensitive' };
      }

      const deliveries = await prisma.deliveryOrder.findMany({
        where,
        include: {
          vehicle: {
            select: {
              id: true,
              plateNumber: true,
              name: true,
              ownershipType: true,
              driverName: true,
            },
          },
          salesOrder: {
            select: {
              orderNumber: true,
              customer: { select: { name: true } },
            },
          },
        },
        orderBy: { deliveryDate: 'desc' },
      });

      // Calculate summaries
      const byVehicleMap = new Map<string, VehicleSummary>();
      const byMonthMap = new Map<string, MonthlySummary>();
      const byOwnershipMap = new Map<string, OwnershipSummary>();
      const byRouteMap = new Map<string, RouteSummary>();

      let totalCost = 0;
      let totalCharge = 0;

      for (const d of deliveries) {
        const cost = d.totalCost ? Number(d.totalCost) : 0;
        const charge = d.totalCharge ? Number(d.totalCharge) : 0;
        totalCost += cost;
        totalCharge += charge;

        // By vehicle
        if (d.vehicle) {
          const vid = d.vehicle.id;
          if (!byVehicleMap.has(vid)) {
            byVehicleMap.set(vid, {
              vehicleId: vid,
              plateNumber: d.vehicle.plateNumber,
              vehicleName: d.vehicle.name,
              ownershipType: d.vehicle.ownershipType,
              driverName: d.vehicle.driverName,
              totalDeliveries: 0,
              totalCost: 0,
              totalCharge: 0,
              totalMargin: 0,
              avgCostPerDelivery: 0,
            });
          }
          const vs = byVehicleMap.get(vid)!;
          vs.totalDeliveries++;
          vs.totalCost += cost;
          vs.totalCharge += charge;
          vs.totalMargin += charge - cost;
        }

        // By month
        const monthKey = d.deliveryDate.toISOString().substring(0, 7); // YYYY-MM
        if (!byMonthMap.has(monthKey)) {
          byMonthMap.set(monthKey, {
            month: monthKey,
            totalDeliveries: 0,
            totalCost: 0,
            totalCharge: 0,
            totalMargin: 0,
          });
        }
        const ms = byMonthMap.get(monthKey)!;
        ms.totalDeliveries++;
        ms.totalCost += cost;
        ms.totalCharge += charge;
        ms.totalMargin += charge - cost;

        // By ownership
        const ownType = d.vehicle?.ownershipType || 'UNKNOWN';
        const ownLabel = ownType === 'FACTORY' ? 'Pabrik' : ownType === 'PRIVATE' ? 'Perorangan' : 'Lainnya';
        if (!byOwnershipMap.has(ownType)) {
          byOwnershipMap.set(ownType, {
            ownershipType: ownType,
            label: ownLabel,
            totalDeliveries: 0,
            totalCost: 0,
            totalCharge: 0,
            totalMargin: 0,
          });
        }
        const os = byOwnershipMap.get(ownType)!;
        os.totalDeliveries++;
        os.totalCost += cost;
        os.totalCharge += charge;
        os.totalMargin += charge - cost;

        // By route
        const routeKey = d.appliedRouteName?.trim() || 'Semua Rute';
        if (!byRouteMap.has(routeKey)) {
          byRouteMap.set(routeKey, {
            route: routeKey,
            totalDeliveries: 0,
            totalCost: 0,
            totalCharge: 0,
            totalMargin: 0,
          });
        }
        const rs = byRouteMap.get(routeKey)!;
        rs.totalDeliveries++;
        rs.totalCost += cost;
        rs.totalCharge += charge;
        rs.totalMargin += charge - cost;
      }

      // Calculate averages
      const byVehicle = Array.from(byVehicleMap.values()).map((v) => ({
        ...v,
        avgCostPerDelivery: v.totalDeliveries > 0 ? v.totalCost / v.totalDeliveries : 0,
      }));

      const byMonth = Array.from(byMonthMap.values()).sort((a, b) => a.month.localeCompare(b.month));
      const byOwnership = Array.from(byOwnershipMap.values());
      const byRoute = Array.from(byRouteMap.values()).sort((a, b) => b.totalCharge - a.totalCharge);

      const summary: ShippingReportSummary = {
        totalDeliveries: deliveries.length,
        totalCost,
        totalCharge,
        totalMargin: totalCharge - totalCost,
        avgCostPerDelivery: deliveries.length > 0 ? totalCost / deliveries.length : 0,
        avgChargePerDelivery: deliveries.length > 0 ? totalCharge / deliveries.length : 0,
        byVehicle,
        byMonth,
        byOwnership,
        byRoute,
      };

      return {
        summary,
        deliveries: deliveries.map((d) => ({
          id: d.id,
          orderNumber: d.orderNumber,
          deliveryDate: d.deliveryDate.toISOString(),
          totalCost: d.totalCost ? Number(d.totalCost) : 0,
          totalCharge: d.totalCharge ? Number(d.totalCharge) : 0,
          appliedRateType: d.appliedRateType,
          appliedRouteName: d.appliedRouteName || null,
          estimatedWeightKg: d.estimatedWeightKg ? Number(d.estimatedWeightKg) : null,
          destinationAddress: d.destinationAddress,
          status: d.status,
          vehicle: d.vehicle,
          salesOrder: d.salesOrder,
        })),
      };
    });
  }
);