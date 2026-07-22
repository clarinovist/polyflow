"use server";

import { withTenant } from "@/lib/core/tenant";
import { prisma } from "@/lib/core/prisma";
import { requireAuth } from "@/lib/tools/auth-checks";
import { PurchaseOrderStatus, PurchaseRequestStatus } from "@prisma/client";
import { safeAction } from "@/lib/errors/errors";
import { serializeData } from "@/lib/utils/utils";
import { getSuggestedPurchases } from "@/services/inventory/analytics-service";
import type { SuggestedReorderItem } from "./purchasing-types";
import { PR_AGING_THRESHOLD_DAYS } from "./purchasing-types";

export const getPurchasingShiftBoard = withTenant(
  async function getPurchasingShiftBoard() {
    return safeAction(async () => {
      await requireAuth();

      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      const [
        pendingPrs,
        draftPos,
        awaitingReceiptPos,
        partialPos,
        overdueApCount,
        overdueApAgg,
        monthlySpendAgg,
        agingPrs,
        draftPosList,
        awaitingReceiptList,
        partialPosList,
        overdueApList,
        topSuppliers,
        suggestedReorderRaw,
      ] = await Promise.all([
        // Counts
        prisma.purchaseRequest.count({
          where: { status: { in: [PurchaseRequestStatus.OPEN, PurchaseRequestStatus.APPROVED] } },
        }),
        prisma.purchaseOrder.count({
          where: { status: PurchaseOrderStatus.DRAFT },
        }),
        prisma.purchaseOrder.count({
          where: { status: PurchaseOrderStatus.SENT },
        }),
        prisma.purchaseOrder.count({
          where: { status: PurchaseOrderStatus.PARTIAL_RECEIVED },
        }),
        prisma.purchaseInvoice.count({
          where: {
            status: { notIn: ["PAID", "CANCELLED"] },
            dueDate: { lt: now },
          },
        }),
        prisma.purchaseInvoice.aggregate({
          where: {
            status: { notIn: ["PAID", "CANCELLED"] },
            dueDate: { lt: now },
          },
          _sum: { totalAmount: true, paidAmount: true },
        }),
        prisma.purchaseOrder.aggregate({
          where: {
            createdAt: { gte: startOfMonth },
            status: { notIn: [PurchaseOrderStatus.CANCELLED, PurchaseOrderStatus.DRAFT] },
          },
          _sum: { totalAmount: true },
        }),

        // Attention: aging PRs (OPEN|APPROVED older than threshold)
        prisma.purchaseRequest.findMany({
          where: {
            status: { in: [PurchaseRequestStatus.OPEN, PurchaseRequestStatus.APPROVED] },
            createdAt: {
              lte: new Date(now.getTime() - PR_AGING_THRESHOLD_DAYS * 86400000),
            },
          },
          orderBy: { createdAt: "asc" },
          take: 5,
          select: { id: true, requestNumber: true, createdAt: true, status: true },
        }),
        prisma.purchaseOrder.findMany({
          where: { status: PurchaseOrderStatus.DRAFT },
          orderBy: { createdAt: "asc" },
          take: 5,
          select: {
            id: true, orderNumber: true, createdAt: true,
            supplier: { select: { name: true } },
          },
        }),
        prisma.purchaseOrder.findMany({
          where: { status: PurchaseOrderStatus.SENT },
          orderBy: { expectedDate: "asc" },
          take: 5,
          select: {
            id: true, orderNumber: true,
            supplier: { select: { name: true } },
          },
        }),
        prisma.purchaseOrder.findMany({
          where: { status: PurchaseOrderStatus.PARTIAL_RECEIVED },
          orderBy: { expectedDate: "asc" },
          take: 5,
          select: {
            id: true, orderNumber: true,
            supplier: { select: { name: true } },
          },
        }),
        prisma.purchaseInvoice.findMany({
          where: {
            status: { notIn: ["PAID", "CANCELLED"] },
            dueDate: { lt: now },
          },
          orderBy: { dueDate: "asc" },
          take: 5,
          select: {
            id: true, invoiceNumber: true, totalAmount: true, paidAmount: true, dueDate: true,
            purchaseOrder: { select: { supplier: { select: { name: true } } } },
          },
        }),

        // Performance strip
        prisma.purchaseOrder.groupBy({
          by: ["supplierId"],
          where: {
            createdAt: { gte: startOfMonth },
            status: { notIn: [PurchaseOrderStatus.CANCELLED, PurchaseOrderStatus.DRAFT] },
          },
          _count: { id: true },
          _sum: { totalAmount: true },
          orderBy: { _count: { id: "desc" } },
          take: 1,
        }),

        // Suggested reorder from warehouse inventory (service, not action)
        getSuggestedPurchases(),
      ]);

      // Resolve top supplier name
      let topSupplierName: string | null = null;
      let topSupplierSpend = 0;
      if (topSuppliers.length > 0) {
        const supplier = await prisma.supplier.findUnique({
          where: { id: topSuppliers[0].supplierId },
          select: { name: true },
        });
        topSupplierName = supplier?.name ?? null;
        topSupplierSpend = topSuppliers[0]._sum.totalAmount?.toNumber() || 0;
      }

      const overdueApAmount =
        (Number(overdueApAgg._sum.totalAmount) || 0) -
        (Number(overdueApAgg._sum.paidAmount) || 0);

      const agingPrsMapped = agingPrs.map((pr) => ({
        id: pr.id,
        requestNumber: pr.requestNumber,
        daysOld: Math.floor((now.getTime() - new Date(pr.createdAt).getTime()) / 86400000),
        status: pr.status,
      }));

      const suggestedReorder: SuggestedReorderItem[] = suggestedReorderRaw
        .slice(0, 10)
        .map((v) => ({
          id: v.id,
          name: v.name,
          skuCode: v.skuCode,
          supplierName: v.preferredSupplier?.name ?? null,
          totalStock: v.totalStock,
          reorderPoint: v.reorderPoint?.toNumber() ?? null,
          reorderQuantity: v.reorderQuantity?.toNumber() ?? null,
        }));

      return {
        counts: {
          pendingPrs,
          draftPos,
          awaitingReceiptPos,
          partialPos,
          overdueApCount,
          overdueApAmount,
          monthlySpend: monthlySpendAgg._sum.totalAmount?.toNumber() || 0,
        },
        attention: {
          agingPrs: agingPrsMapped,
          draftPos: draftPosList.map((po) => ({
            id: po.id,
            orderNumber: po.orderNumber,
            supplierName: po.supplier?.name ?? "-",
            daysOld: Math.floor((now.getTime() - new Date(po.createdAt).getTime()) / 86400000),
          })),
          awaitingReceipt: awaitingReceiptList.map((po) => ({
            id: po.id,
            orderNumber: po.orderNumber,
            supplierName: po.supplier?.name ?? "-",
          })),
          partialPos: partialPosList.map((po) => ({
            id: po.id,
            orderNumber: po.orderNumber,
            supplierName: po.supplier?.name ?? "-",
          })),
          overdueAp: overdueApList.map((inv) => ({
            id: inv.id,
            invoiceNumber: inv.invoiceNumber,
            supplierName: inv.purchaseOrder?.supplier?.name ?? "-",
            remaining: Number(inv.totalAmount) - Number(inv.paidAmount),
            dueDate: inv.dueDate?.toISOString() ?? "",
          })),
          suggestedReorder,
        },
        performance: {
          monthlySpend: monthlySpendAgg._sum.totalAmount?.toNumber() || 0,
          topSupplierName,
          topSupplierSpend,
        },
      };
    });
  },
);

export const getPurchasingDashboardStats = withTenant(
  async function getPurchasingDashboardStats() {
    return safeAction(async () => {
      await requireAuth();

      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

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

      const pendingPrs = await prisma.purchaseRequest.count({
        where: {
          status: {
            in: [PurchaseRequestStatus.OPEN, PurchaseRequestStatus.APPROVED],
          },
        },
      });

      const monthlySpend = await prisma.purchaseOrder.aggregate({
        where: {
          createdAt: { gte: startOfMonth },
          status: {
            notIn: [PurchaseOrderStatus.CANCELLED, PurchaseOrderStatus.DRAFT],
          },
        },
        _sum: { totalAmount: true },
      });

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

export const getSuggestedReorderForPurchasing = withTenant(
  async function getSuggestedReorderForPurchasing() {
    return safeAction(async () => {
      await requireAuth();

      const items = await getSuggestedPurchases();
      return items.slice(0, 20).map((v) => ({
        id: v.id,
        name: v.name,
        skuCode: v.skuCode,
        supplierName: v.preferredSupplier?.name ?? null,
        totalStock: v.totalStock,
        reorderPoint: v.reorderPoint?.toNumber() ?? null,
        reorderQuantity: v.reorderQuantity?.toNumber() ?? null,
      }));
    });
  },
);
