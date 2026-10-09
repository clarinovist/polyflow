'use server';

import { getMyExplicitFeaturePermissions } from '@/actions/admin/permissions';
import { requirePurchasingAccess } from '@/lib/auth/purchasing-access';
import { prisma } from '@/lib/core/prisma';
import { withTenant } from '@/lib/core/tenant';
import { safeAction } from '@/lib/errors/errors';
import { buildOverduePurchaseInvoiceWhere } from '@/services/finance/purchase-payable-query';
import { getSuggestedPurchases } from '@/services/inventory/analytics-service';
import { readPurchasingDashboardNominalMetrics } from '@/services/purchasing/dashboard-metrics-service';
import { PurchaseOrderStatus, PurchaseRequestStatus } from '@prisma/client';
import type { SuggestedReorderItem } from './purchasing-types';
import { PR_AGING_THRESHOLD_DAYS } from './purchasing-types';

export const getPurchasingShiftBoard = withTenant(
    async function getPurchasingShiftBoard() {
        return safeAction(async () => {
            await requirePurchasingAccess();

            const now = new Date();
            const featurePermissionsPromise = getMyExplicitFeaturePermissions();
            const overdueApWhere = buildOverduePurchaseInvoiceWhere(
                prisma,
                now,
            );

            const [
                pendingPrs,
                draftPos,
                awaitingReceiptPos,
                partialPos,
                overdueApCount,
                agingPrs,
                draftPosList,
                awaitingReceiptList,
                partialPosList,
                suggestedReorderRaw,
                featurePermissions,
            ] = await Promise.all([
                prisma.purchaseRequest.count({
                    where: {
                        status: {
                            in: [
                                PurchaseRequestStatus.OPEN,
                                PurchaseRequestStatus.APPROVED,
                            ],
                        },
                    },
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
                prisma.purchaseInvoice.count({ where: overdueApWhere }),
                prisma.purchaseRequest.findMany({
                    where: {
                        status: {
                            in: [
                                PurchaseRequestStatus.OPEN,
                                PurchaseRequestStatus.APPROVED,
                            ],
                        },
                        createdAt: {
                            lte: new Date(
                                now.getTime() -
                                    PR_AGING_THRESHOLD_DAYS * 86400000,
                            ),
                        },
                    },
                    orderBy: { createdAt: 'asc' },
                    take: 5,
                    select: {
                        id: true,
                        requestNumber: true,
                        createdAt: true,
                        status: true,
                    },
                }),
                prisma.purchaseOrder.findMany({
                    where: { status: PurchaseOrderStatus.DRAFT },
                    orderBy: { createdAt: 'asc' },
                    take: 5,
                    select: {
                        id: true,
                        orderNumber: true,
                        createdAt: true,
                        supplier: { select: { name: true } },
                    },
                }),
                prisma.purchaseOrder.findMany({
                    where: { status: PurchaseOrderStatus.SENT },
                    orderBy: { expectedDate: 'asc' },
                    take: 5,
                    select: {
                        id: true,
                        orderNumber: true,
                        supplier: { select: { name: true } },
                    },
                }),
                prisma.purchaseOrder.findMany({
                    where: { status: PurchaseOrderStatus.PARTIAL_RECEIVED },
                    orderBy: { expectedDate: 'asc' },
                    take: 5,
                    select: {
                        id: true,
                        orderNumber: true,
                        supplier: { select: { name: true } },
                    },
                }),
                getSuggestedPurchases(),
                featurePermissionsPromise,
            ]);
            const canViewNominal =
                featurePermissions.success &&
                featurePermissions.data.includes('feature:view-prices');

            const nominal = canViewNominal
                ? await Promise.all([
                      prisma.purchaseInvoice.aggregate({
                          where: overdueApWhere,
                          _sum: { totalAmount: true, paidAmount: true },
                      }),
                      prisma.purchaseInvoice.findMany({
                          where: overdueApWhere,
                          orderBy: { dueDate: 'asc' },
                          take: 5,
                          select: {
                              id: true,
                              invoiceNumber: true,
                              totalAmount: true,
                              paidAmount: true,
                              dueDate: true,
                              purchaseOrder: {
                                  select: {
                                      supplier: { select: { name: true } },
                                  },
                              },
                          },
                      }),
                      readPurchasingDashboardNominalMetrics(prisma, now),
                  ])
                : null;

            const agingPrsMapped = agingPrs.map((pr) => ({
                id: pr.id,
                requestNumber: pr.requestNumber,
                daysOld: Math.floor(
                    (now.getTime() - new Date(pr.createdAt).getTime()) /
                        86400000,
                ),
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

            const overdueApAgg = nominal?.[0] ?? null;
            const overdueApList = nominal?.[1] ?? [];
            const spendMetrics = nominal?.[2] ?? null;
            const overdueApAmount = overdueApAgg
                ? (Number(overdueApAgg._sum.totalAmount) || 0) -
                  (Number(overdueApAgg._sum.paidAmount) || 0)
                : null;

            return {
                generatedAt: new Date().toISOString(),
                nominalAccess: canViewNominal
                    ? ('AVAILABLE' as const)
                    : ('RESTRICTED' as const),
                counts: {
                    pendingPrs,
                    draftPos,
                    awaitingReceiptPos,
                    partialPos,
                    overdueApCount,
                    ...(canViewNominal
                        ? {
                              overdueApAmount: overdueApAmount ?? 0,
                              monthlySpend: spendMetrics?.monthlySpend ?? 0,
                          }
                        : {}),
                },
                attention: {
                    agingPrs: agingPrsMapped,
                    draftPos: draftPosList.map((po) => ({
                        id: po.id,
                        orderNumber: po.orderNumber,
                        supplierName: po.supplier?.name ?? '-',
                        daysOld: Math.floor(
                            (now.getTime() - new Date(po.createdAt).getTime()) /
                                86400000,
                        ),
                    })),
                    awaitingReceipt: awaitingReceiptList.map((po) => ({
                        id: po.id,
                        orderNumber: po.orderNumber,
                        supplierName: po.supplier?.name ?? '-',
                    })),
                    partialPos: partialPosList.map((po) => ({
                        id: po.id,
                        orderNumber: po.orderNumber,
                        supplierName: po.supplier?.name ?? '-',
                    })),
                    overdueAp: overdueApList.map((inv) => ({
                        id: inv.id,
                        invoiceNumber: inv.invoiceNumber,
                        supplierName: inv.purchaseOrder?.supplier?.name ?? '-',
                        remaining:
                            Number(inv.totalAmount) - Number(inv.paidAmount),
                        dueDate: inv.dueDate?.toISOString() ?? '',
                    })),
                    suggestedReorder,
                },
                performance: spendMetrics
                    ? {
                          monthlySpend: spendMetrics.monthlySpend,
                          previousFullMonthSpend:
                              spendMetrics.previousFullMonthSpend,
                          previousFullMonthChangePercent:
                              spendMetrics.previousFullMonthChangePercent,
                          topSupplierName: spendMetrics.topSupplierName,
                          topSupplierSpend: spendMetrics.topSupplierSpend,
                      }
                    : {},
            };
        });
    },
);
