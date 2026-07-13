"use server";

import { withTenant } from "@/lib/core/tenant";
import { prisma } from "@/lib/core/prisma";
import { safeAction, AuthenticationError } from "@/lib/errors/errors";
import { requireAuth } from "@/lib/tools/auth-checks";
import { CostingService } from "@/services/accounting/costing-service";
import {
  aggregateHppReport,
  type EnrichedProductionCost,
  type HppReportData,
} from "@/lib/utils/hpp-report";
import { startOfMonth, endOfMonth } from "date-fns";

export const getHppReportData = withTenant(async function getHppReportData(
  startDate?: Date,
  endDate?: Date,
) {
  return safeAction(async () => {
    const session = await requireAuth();
    if (!session) throw new AuthenticationError();

    const now = new Date();
    const start = startDate ?? startOfMonth(now);
    const end = endDate ?? endOfMonth(now);

    // Get production costs for the period
    const costs = await CostingService.getPeriodCosts(start, end);

    if (costs.length === 0) {
      return {
        summary: {
          totalCogm: 0,
          totalQuantity: 0,
          materialShare: 0,
          laborShare: 0,
          machineShare: 0,
          productCount: 0,
          orderCount: 0,
        },
        products: [],
        orders: [],
      } satisfies HppReportData;
    }

    // Get order IDs to fetch BOM/product info
    const orderIds = costs.map((c) => c.productionOrderId);

    const ordersWithBom = await prisma.productionOrder.findMany({
      where: { id: { in: orderIds } },
      select: {
        id: true,
        bom: {
          select: {
            id: true,
            name: true,
            category: true,
            productVariant: {
              select: {
                name: true,
                skuCode: true,
                standardCost: true,
                product: { select: { name: true } },
              },
            },
          },
        },
      },
    });

    // Build lookup map
    const bomLookup = new Map<string, (typeof ordersWithBom)[0]>();
    for (const o of ordersWithBom) {
      bomLookup.set(o.id, o);
    }

    // Enrich costs with BOM/product data
    const enriched: EnrichedProductionCost[] = [];
    for (const cost of costs) {
      const orderData = bomLookup.get(cost.productionOrderId);
      if (!orderData?.bom) continue;

      const bom = orderData.bom;
      const variant = bom.productVariant;

      enriched.push({
        ...cost,
        bomId: bom.id,
        bomName: bom.name,
        productName: variant?.product?.name ?? bom.name,
        productSku: variant?.skuCode ?? null,
        category: bom.category ?? null,
        standardCost: Number(variant?.standardCost ?? 0),
      });
    }

    return aggregateHppReport(enriched);
  });
});

export const lockPeriod = withTenant(async function lockPeriod(
  year: number,
  month: number,
  notes?: string,
) {
  return safeAction(async () => {
    const session = await requireAuth();
    if (!session) throw new AuthenticationError();

    await prisma.periodLock.upsert({
      where: { year_month: { year, month } },
      create: { year, month, lockedById: session.user.id, notes },
      update: { lockedAt: new Date(), lockedById: session.user.id, notes },
    });
    return { success: true };
  });
});

export const unlockPeriod = withTenant(async function unlockPeriod(
  year: number,
  month: number,
) {
  return safeAction(async () => {
    const session = await requireAuth();
    if (!session) throw new AuthenticationError();

    await prisma.periodLock.deleteMany({ where: { year, month } });
    return { success: true };
  });
});

export const getPeriodLock = withTenant(async function getPeriodLock(
  year: number,
  month: number,
) {
  return safeAction(async () => {
    const session = await requireAuth();
    if (!session) throw new AuthenticationError();

    return prisma.periodLock.findUnique({
      where: { year_month: { year, month } },
      include: { lockedBy: { select: { name: true, email: true } } },
    });
  });
});
