import { Prisma, type PrismaClient } from '@prisma/client';
import { getTenantDbFromContext } from '@/lib/core/prisma';
import { BusinessRuleError, NotFoundError } from '@/lib/errors/errors';
import { buildOverduePurchaseInvoiceWhere } from '@/services/finance/purchase-payable-query';
import { sumInventoryAlertQuantity } from '@/lib/constants/locations';
import {
    getWibDayBounds,
    toBusinessDateString,
} from '@/lib/utils/timezone';

export const PURCHASING_MOBILE_SAMPLE_LIMIT = 10;

export const PURCHASING_MOBILE_FILTERS = [
    'ALL',
    'REQUESTS',
    'DRAFT_PO',
    'RECEIPTS',
    'ETA',
    'REORDER',
] as const;

export type PurchasingMobileTaskFilter =
    (typeof PURCHASING_MOBILE_FILTERS)[number];
export type PurchasingMobileDetailKind = 'REQUEST' | 'ORDER' | 'RECEIPT';
export type PurchasingMobileTaskKind =
    | 'REQUEST'
    | 'DRAFT_PO'
    | 'RECEIPT'
    | 'REORDER';

type TenantDb = Pick<
    PrismaClient,
    '$transaction' | 'purchaseRequest' | 'purchaseOrder' | 'purchaseInvoice' | 'productVariant'
>;

type QueryDb = Omit<TenantDb, '$transaction'>;

export interface PurchasingMobileTaskDto {
    id: string;
    kind: PurchasingMobileTaskKind;
    title: string;
    subtitle: string;
    status: string;
    priority: 'NORMAL' | 'HIGH' | 'URGENT';
    href: string | null;
    sortAt: string;
}

export interface PurchasingMobileReorderDto {
    id: string;
    name: string;
    skuCode: string;
    unit: string;
    supplierName: string | null;
    totalStock: number;
    reorderPoint: number;
    reorderQuantity: number | null;
}

export interface PurchasingMobileOverviewDto {
    generatedAt: string;
    filter: PurchasingMobileTaskFilter;
    highlights: {
        pendingRequestCount: number;
        draftPoCount: number;
        waitingReceiptCount: number;
        etaExceptionCount: number;
        suggestedReorderCount: number;
        overdueApCount: number;
        overdueApAmount?: number;
    };
    queue: {
        total: number;
        returned: number;
        items: PurchasingMobileTaskDto[];
    };
    suggestedReorder: {
        total: number;
        returned: number;
        items: PurchasingMobileReorderDto[];
    };
}

export type PurchasingMobileDetailDto =
    | {
          kind: 'REQUEST';
          id: string;
          number: string;
          status: string;
          priority: string;
          requestedAt: string;
          createdByName: string;
          reviewedByName: string | null;
          items: Array<{
              id: string;
              name: string;
              skuCode: string;
              quantity: number;
              unit: string;
          }>;
      }
    | {
          kind: 'ORDER';
          id: string;
          number: string;
          status: string;
          supplierName: string;
          orderedAt: string;
          expectedAt: string | null;
          totalAmount?: number;
          items: Array<{
              id: string;
              name: string;
              skuCode: string;
              quantity: number;
              receivedQuantity: number;
              unit: string;
              unitPrice?: number;
              subtotal?: number;
          }>;
      }
    | {
          kind: 'RECEIPT';
          id: string;
          number: string;
          status: string;
          supplierName: string;
          expectedAt: string | null;
          latestReceiptAt: string | null;
          receiptCount: number;
          items: Array<{
              id: string;
              name: string;
              skuCode: string;
              orderedQuantity: number;
              receivedQuantity: number;
              remainingQuantity: number;
              unit: string;
          }>;
      };

function requireTenantDb(): TenantDb {
    const tenantDb = getTenantDbFromContext();
    if (!tenantDb) {
        throw new BusinessRuleError(
            'Konteks tenant untuk Purchasing Mobile tidak tersedia.',
        );
    }
    return tenantDb;
}

function decimalNumber(value: unknown): number {
    if (value == null) return 0;
    if (typeof value === 'number') return value;
    if (typeof value === 'object' && 'toNumber' in value) {
        return (value as { toNumber: () => number }).toNumber();
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function totalForFilter(
    filter: PurchasingMobileTaskFilter,
    counts: {
        requests: number;
        drafts: number;
        receipts: number;
        eta: number;
        reorder: number;
    },
): number {
    switch (filter) {
        case 'REQUESTS':
            return counts.requests;
        case 'DRAFT_PO':
            return counts.drafts;
        case 'RECEIPTS':
            return counts.receipts;
        case 'ETA':
            return counts.eta;
        case 'REORDER':
            return counts.reorder;
        default:
            return (
                counts.requests +
                counts.drafts +
                counts.receipts +
                counts.reorder
            );
    }
}

const TASK_PRIORITY = { URGENT: 0, HIGH: 1, NORMAL: 2 } as const;

function sortTasks(items: PurchasingMobileTaskDto[]) {
    return items.sort(
        (a, b) =>
            TASK_PRIORITY[a.priority] - TASK_PRIORITY[b.priority] ||
            a.sortAt.localeCompare(b.sortAt) ||
            a.kind.localeCompare(b.kind) ||
            a.id.localeCompare(b.id),
    );
}

function requestWhere(prOwnerId?: string): Prisma.PurchaseRequestWhereInput {
    return {
        status: { in: ['OPEN', 'APPROVED'] },
        ...(prOwnerId ? { createdById: prOwnerId } : {}),
    };
}

function waitingReceiptWhere(): Prisma.PurchaseOrderWhereInput {
    return { status: { in: ['SENT', 'PARTIAL_RECEIVED'] } };
}

function etaWhere(now: Date): Prisma.PurchaseOrderWhereInput {
    return {
        status: { in: ['SENT', 'PARTIAL_RECEIVED'] },
        expectedDate: { lt: now },
    };
}

async function readReorderRows(
    db: QueryDb,
): Promise<PurchasingMobileReorderDto[]> {
    const variants = await db.productVariant.findMany({
        where: { archivedAt: null, reorderPoint: { not: null } },
        select: {
            id: true,
            name: true,
            skuCode: true,
            primaryUnit: true,
            reorderPoint: true,
            reorderQuantity: true,
            preferredSupplier: { select: { name: true } },
            inventories: {
                select: {
                    quantity: true,
                    location: {
                        select: { locationType: true, locationPurpose: true },
                    },
                },
            },
        },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });

    return variants
        .map((variant) => {
            const totalStock = sumInventoryAlertQuantity(
                variant.inventories,
            );
            return {
                id: variant.id,
                name: variant.name,
                skuCode: variant.skuCode,
                unit: variant.primaryUnit,
                supplierName: variant.preferredSupplier?.name ?? null,
                totalStock,
                reorderPoint: decimalNumber(variant.reorderPoint),
                reorderQuantity:
                    variant.reorderQuantity == null
                        ? null
                        : decimalNumber(variant.reorderQuantity),
            };
        })
        .filter((variant) => variant.totalStock < variant.reorderPoint)
        .sort(
            (a, b) =>
                a.totalStock -
                    a.reorderPoint -
                    (b.totalStock - b.reorderPoint) ||
                a.name.localeCompare(b.name, 'id') ||
                a.id.localeCompare(b.id),
        );
}

export async function readPurchasingMobileOverview(input: {
    filter: PurchasingMobileTaskFilter;
    prOwnerId?: string;
    canViewAmounts: boolean;
    now?: Date;
}): Promise<PurchasingMobileOverviewDto> {
    const tenantDb = requireTenantDb();
    const now = input.now ?? new Date();
    const { startOfDay } = getWibDayBounds(toBusinessDateString(now));
    const prWhere = requestWhere(input.prOwnerId);
    const receiptWhere = waitingReceiptWhere();
    const overdueWhere = buildOverduePurchaseInvoiceWhere(tenantDb, now);
    const wantsRequests = input.filter === 'ALL' || input.filter === 'REQUESTS';
    const wantsDrafts = input.filter === 'ALL' || input.filter === 'DRAFT_PO';
    const wantsReceipts =
        input.filter === 'ALL' ||
        input.filter === 'RECEIPTS' ||
        input.filter === 'ETA';
    const wantsReorder =
        input.filter === 'ALL' || input.filter === 'REORDER';

    return tenantDb.$transaction(
        async (tx) => {
            const [
                pendingRequestCount,
                draftPoCount,
                waitingReceiptCount,
                etaExceptionCount,
                overdueApCount,
                overdueApAmount,
                requests,
                drafts,
                receipts,
                reorderRows,
            ] = await Promise.all([
                tx.purchaseRequest.count({ where: prWhere }),
                tx.purchaseOrder.count({ where: { status: 'DRAFT' } }),
                tx.purchaseOrder.count({ where: receiptWhere }),
                tx.purchaseOrder.count({ where: etaWhere(startOfDay) }),
                tx.purchaseInvoice.count({ where: overdueWhere }),
                input.canViewAmounts
                    ? tx.purchaseInvoice.aggregate({
                          where: overdueWhere,
                          _sum: { totalAmount: true, paidAmount: true },
                      })
                    : Promise.resolve(null),
                wantsRequests
                    ? tx.purchaseRequest.findMany({
                          where: prWhere,
                          take: PURCHASING_MOBILE_SAMPLE_LIMIT,
                          // URGENT is the only elevated domain priority for PRs.
                          // Within that bucket, OPEN precedes APPROVED, then age
                          // and id keep the bounded sample deterministic.
                          orderBy: [
                              { priority: 'desc' },
                              { status: 'desc' },
                              { createdAt: 'asc' },
                              { id: 'asc' },
                          ],
                          select: {
                              id: true,
                              requestNumber: true,
                              status: true,
                              priority: true,
                              createdAt: true,
                              createdBy: { select: { name: true } },
                          },
                      })
                    : Promise.resolve([]),
                wantsDrafts
                    ? tx.purchaseOrder.findMany({
                          where: { status: 'DRAFT' },
                          take: PURCHASING_MOBILE_SAMPLE_LIMIT,
                          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
                          select: {
                              id: true,
                              orderNumber: true,
                              status: true,
                              createdAt: true,
                              supplier: { select: { name: true } },
                          },
                      })
                    : Promise.resolve([]),
                wantsReceipts
                    ? input.filter === 'ETA'
                        ? tx.purchaseOrder.findMany({
                              where: etaWhere(startOfDay),
                              take: PURCHASING_MOBILE_SAMPLE_LIMIT,
                              orderBy: [
                                  { expectedDate: 'asc' },
                                  { updatedAt: 'asc' },
                                  { id: 'asc' },
                              ],
                              select: {
                                  id: true,
                                  orderNumber: true,
                                  status: true,
                                  expectedDate: true,
                                  updatedAt: true,
                                  supplier: { select: { name: true } },
                              },
                          })
                        : Promise.all(
                              (['PARTIAL_RECEIVED', 'SENT'] as const).map(
                                  (status) =>
                                      tx.purchaseOrder.findMany({
                                          where: { status },
                                          take: PURCHASING_MOBILE_SAMPLE_LIMIT,
                                          orderBy: [
                                              { expectedDate: 'asc' },
                                              { updatedAt: 'asc' },
                                              { id: 'asc' },
                                          ],
                                          select: {
                                              id: true,
                                              orderNumber: true,
                                              status: true,
                                              expectedDate: true,
                                              updatedAt: true,
                                              supplier: {
                                                  select: { name: true },
                                              },
                                          },
                                      }),
                              ),
                          ).then((rows) => rows.flat())
                    : Promise.resolve([]),
                wantsReorder ? readReorderRows(tx) : Promise.resolve([]),
            ]);

            const requestTasks: PurchasingMobileTaskDto[] = requests.map(
                (request) => ({
                    id: request.id,
                    kind: 'REQUEST',
                    title: request.requestNumber,
                    subtitle:
                        request.createdBy.name ?? 'Pembuat tidak tersedia',
                    status: request.status,
                    priority:
                        request.priority === 'URGENT'
                            ? 'URGENT'
                            : request.status === 'OPEN'
                              ? 'HIGH'
                              : 'NORMAL',
                    href: `/purchasing/mobile/requests/${request.id}`,
                    sortAt: request.createdAt.toISOString(),
                }),
            );
            const draftTasks: PurchasingMobileTaskDto[] = drafts.map((order) => ({
                id: order.id,
                kind: 'DRAFT_PO',
                title: order.orderNumber,
                subtitle: order.supplier.name,
                status: order.status,
                priority: 'NORMAL',
                href: `/purchasing/mobile/orders/${order.id}`,
                sortAt: order.createdAt.toISOString(),
            }));
            const receiptTasks: PurchasingMobileTaskDto[] = receipts.map(
                (order) => {
                    const isLate =
                        order.expectedDate != null &&
                        order.expectedDate < startOfDay;
                    return {
                        id: order.id,
                        kind: 'RECEIPT',
                        title: order.orderNumber,
                        subtitle: order.supplier.name,
                        status: isLate
                            ? 'ETA_TERLEWAT'
                            : order.status,
                        priority: isLate
                            ? 'URGENT'
                            : order.status === 'PARTIAL_RECEIVED'
                              ? 'HIGH'
                              : 'NORMAL',
                        href: `/purchasing/mobile/receipts/${order.id}`,
                        sortAt: (
                            order.expectedDate ?? order.updatedAt
                        ).toISOString(),
                    };
                },
            );
            const reorderTasks: PurchasingMobileTaskDto[] = reorderRows.map(
                (variant) => ({
                    id: variant.id,
                    kind: 'REORDER',
                    title: variant.name,
                    subtitle:
                        variant.supplierName ?? 'Supplier belum ditetapkan',
                    status: 'DI_BAWAH_REORDER_POINT',
                    priority: variant.totalStock <= 0 ? 'URGENT' : 'HIGH',
                    href: null,
                    sortAt: '9999-12-31T23:59:59.999Z',
                }),
            );

            const selected = sortTasks([
                ...requestTasks,
                ...draftTasks,
                ...receiptTasks,
                ...(wantsReorder ? reorderTasks : []),
            ]).slice(0, PURCHASING_MOBILE_SAMPLE_LIMIT);
            const counts = {
                requests: pendingRequestCount,
                drafts: draftPoCount,
                receipts: waitingReceiptCount,
                eta: etaExceptionCount,
                reorder: reorderRows.length,
            };
            const netOverdue = overdueApAmount
                ? decimalNumber(overdueApAmount._sum.totalAmount) -
                  decimalNumber(overdueApAmount._sum.paidAmount)
                : undefined;
            const reorderSample = reorderRows.slice(
                0,
                PURCHASING_MOBILE_SAMPLE_LIMIT,
            );

            return {
                generatedAt: now.toISOString(),
                filter: input.filter,
                highlights: {
                    pendingRequestCount,
                    draftPoCount,
                    waitingReceiptCount,
                    etaExceptionCount,
                    suggestedReorderCount: reorderRows.length,
                    overdueApCount,
                    ...(netOverdue === undefined
                        ? {}
                        : { overdueApAmount: netOverdue }),
                },
                queue: {
                    total: totalForFilter(input.filter, counts),
                    returned: selected.length,
                    items: selected,
                },
                suggestedReorder: {
                    total: reorderRows.length,
                    returned: reorderSample.length,
                    items: reorderSample,
                },
            };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
}

export async function readPurchasingMobileDetail(input: {
    kind: PurchasingMobileDetailKind;
    id: string;
    prOwnerId?: string;
    canViewAmounts: boolean;
}): Promise<PurchasingMobileDetailDto> {
    const tenantDb = requireTenantDb();

    if (input.kind === 'REQUEST') {
        const request = await tenantDb.purchaseRequest.findFirst({
            where: {
                id: input.id,
                status: { in: ['OPEN', 'APPROVED'] },
                ...(input.prOwnerId ? { createdById: input.prOwnerId } : {}),
            },
            select: {
                id: true,
                requestNumber: true,
                status: true,
                priority: true,
                requestDate: true,
                createdBy: { select: { name: true } },
                reviewedBy: { select: { name: true } },
                items: {
                    orderBy: { id: 'asc' },
                    select: {
                        id: true,
                        quantity: true,
                        productVariant: {
                            select: {
                                name: true,
                                skuCode: true,
                                primaryUnit: true,
                            },
                        },
                    },
                },
            },
        });
        if (!request) throw new NotFoundError('Purchase Request', input.id);
        return {
            kind: 'REQUEST',
            id: request.id,
            number: request.requestNumber,
            status: request.status,
            priority: request.priority,
            requestedAt: request.requestDate.toISOString(),
            createdByName: request.createdBy.name ?? 'Pembuat tidak tersedia',
            reviewedByName: request.reviewedBy?.name ?? null,
            items: request.items.map((item) => ({
                id: item.id,
                name: item.productVariant.name,
                skuCode: item.productVariant.skuCode,
                quantity: decimalNumber(item.quantity),
                unit: item.productVariant.primaryUnit,
            })),
        };
    }

    const order = await tenantDb.purchaseOrder.findFirst({
        where: {
            id: input.id,
            status:
                input.kind === 'ORDER'
                    ? 'DRAFT'
                    : { in: ['SENT', 'PARTIAL_RECEIVED'] },
        },
        select: {
            id: true,
            orderNumber: true,
            status: true,
            orderDate: true,
            expectedDate: true,
            supplier: { select: { name: true } },
            ...(input.canViewAmounts ? { totalAmount: true } : {}),
            items: {
                orderBy: { id: 'asc' },
                select: {
                    id: true,
                    quantity: true,
                    receivedQty: true,
                    ...(input.canViewAmounts
                        ? { unitPrice: true, subtotal: true }
                        : {}),
                    productVariant: {
                        select: {
                            name: true,
                            skuCode: true,
                            primaryUnit: true,
                        },
                    },
                },
            },
            goodsReceipts: {
                orderBy: [{ receivedDate: 'desc' }, { id: 'asc' }],
                take: 1,
                select: { receivedDate: true },
            },
            _count: { select: { goodsReceipts: true } },
        },
    });
    if (!order) {
        throw new NotFoundError(
            input.kind === 'ORDER' ? 'Purchase Order' : 'GoodsReceipt',
            input.id,
        );
    }

    if (input.kind === 'ORDER') {
        return {
            kind: 'ORDER',
            id: order.id,
            number: order.orderNumber,
            status: order.status,
            supplierName: order.supplier.name,
            orderedAt: order.orderDate.toISOString(),
            expectedAt: order.expectedDate?.toISOString() ?? null,
            ...(input.canViewAmounts
                ? {
                      totalAmount: decimalNumber(
                          (order as { totalAmount?: unknown }).totalAmount,
                      ),
                  }
                : {}),
            items: order.items.map((item) => ({
                id: item.id,
                name: item.productVariant.name,
                skuCode: item.productVariant.skuCode,
                quantity: decimalNumber(item.quantity),
                receivedQuantity: decimalNumber(item.receivedQty),
                unit: item.productVariant.primaryUnit,
                ...(input.canViewAmounts
                    ? {
                          unitPrice: decimalNumber(
                              (item as { unitPrice?: unknown }).unitPrice,
                          ),
                          subtotal: decimalNumber(
                              (item as { subtotal?: unknown }).subtotal,
                          ),
                      }
                    : {}),
            })),
        };
    }

    return {
        kind: 'RECEIPT',
        id: order.id,
        number: order.orderNumber,
        status: order.status,
        supplierName: order.supplier.name,
        expectedAt: order.expectedDate?.toISOString() ?? null,
        latestReceiptAt:
            order.goodsReceipts[0]?.receivedDate.toISOString() ?? null,
        receiptCount: order._count.goodsReceipts,
        items: order.items.map((item) => {
            const orderedQuantity = decimalNumber(item.quantity);
            const receivedQuantity = decimalNumber(item.receivedQty);
            return {
                id: item.id,
                name: item.productVariant.name,
                skuCode: item.productVariant.skuCode,
                orderedQuantity,
                receivedQuantity,
                remainingQuantity: Math.max(
                    0,
                    orderedQuantity - receivedQuantity,
                ),
                unit: item.productVariant.primaryUnit,
            };
        }),
    };
}
