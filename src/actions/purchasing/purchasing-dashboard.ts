"use server";

import { withTenant } from "@/lib/core/tenant";
import { prisma } from "@/lib/core/prisma";
import { requireAuth } from "@/lib/tools/auth-checks";
import { PurchaseOrderStatus, PurchaseRequestStatus } from "@prisma/client";
import { safeAction } from "@/lib/errors/errors";
import { serializeData } from "@/lib/utils/utils";

export const getPurchasingDashboardStats = withTenant(
  async function getPurchasingDashboardStats() {
    return safeAction(async () => {
      await requireAuth();

      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      // 1. Open POs (sent or partially received)
      const openPos = await prisma.purchaseOrder.count({
        where: {
          status: {
            in: [
              PurchaseOrderStatus.SENT,
              PurchaseOrderStatus.PARTIAL_RECEIVED,
            ],
          },
        },
      });

      // 2. Pending Purchase Requests (open or approved, not yet converted to PO)
      const pendingPrs = await prisma.purchaseRequest.count({
        where: {
          status: {
            in: [PurchaseRequestStatus.OPEN, PurchaseRequestStatus.APPROVED],
          },
        },
      });

      // 3. Total spend this month
      const monthlySpend = await prisma.purchaseOrder.aggregate({
        where: {
          createdAt: { gte: startOfMonth },
          status: {
            notIn: [PurchaseOrderStatus.CANCELLED, PurchaseOrderStatus.DRAFT],
          },
        },
        _sum: { totalAmount: true },
      });

      // 4. Top 5 suppliers by order count this month
      const topSuppliers = await prisma.purchaseOrder.groupBy({
        by: ["supplierId"],
        where: {
          createdAt: { gte: startOfMonth },
          status: {
            notIn: [PurchaseOrderStatus.CANCELLED, PurchaseOrderStatus.DRAFT],
          },
        },
        _count: { id: true },
        _sum: { totalAmount: true },
        orderBy: { _count: { id: "desc" } },
        take: 5,
      });

      // Resolve supplier names
      const supplierIds = topSuppliers.map((s) => s.supplierId);
      const suppliers = await prisma.supplier.findMany({
        where: { id: { in: supplierIds } },
        select: { id: true, name: true },
      });
      const supplierMap = new Map(suppliers.map((s) => [s.id, s.name]));

      const topSuppliersResolved = topSuppliers.map((s) => ({
        supplierId: s.supplierId,
        supplierName: supplierMap.get(s.supplierId) || "Unknown",
        orderCount: s._count.id,
        totalSpend: s._sum.totalAmount?.toNumber() || 0,
      }));

      // 5. Recent POs (last 5)
      const recentOrders = await prisma.purchaseOrder.findMany({
        orderBy: { createdAt: "desc" },
        take: 5,
        include: {
          supplier: { select: { name: true } },
        },
      });

      return {
        openPos,
        pendingPrs,
        monthlySpend: monthlySpend._sum.totalAmount?.toNumber() || 0,
        topSuppliers: topSuppliersResolved,
        recentOrders: serializeData(recentOrders),
      };
    });
  },
);
