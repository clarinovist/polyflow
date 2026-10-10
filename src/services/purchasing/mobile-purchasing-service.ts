import { Prisma, type PrismaClient } from '@prisma/client';
import { getTenantDbFromContext } from '@/lib/core/prisma';
import { BusinessRuleError, NotFoundError } from '@/lib/errors/errors';
import { buildOverduePurchaseInvoiceWhere } from '@/services/finance/purchase-payable-query';
import { readWarehouseInventoryThresholdSnapshot } from '@/services/inventory/warehouse-dashboard-service';
import { buildPurchasingDashboardWaitingReceiptWhere } from '@/services/purchasing/purchasing-dashboard-query';
import type { MobileSectionStatus } from '@/services/dashboard/mobile-section-state';
import {
    observeDashboardSection,
    recordDashboardSectionState,
} from '@/services/dashboard/dashboard-section-observability';
import { getWibDayBounds, toBusinessDateString } from '@/lib/utils/timezone';

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

export type PurchasingMobileSectionKey =
    | 'requests'
    | 'drafts'
    | 'receipts'
    | 'reorder'
    | 'ap'
    | 'apNominal';

export type PurchasingMobileSections = Partial<
    Record<PurchasingMobileSectionKey, MobileSectionStatus>
>;

type TenantDb = Pick<
    PrismaClient,
    '$transaction' | 'purchaseRequest' | 'purchaseOrder' | 'purchaseInvoice'
>;

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
    sections: PurchasingMobileSections;
    highlights: {
        pendingRequestCount: number | null;
        draftPoCount: number | null;
        waitingReceiptCount: number | null;
        etaExceptionCount: number | null;
        suggestedReorderCount: number | null;
        overdueApCount: number | null;
        overdueApAmount?: number;
    };
    queue: {
        total: number | null;
        returned: number;
        items: PurchasingMobileTaskDto[];
    };
    suggestedReorder: {
        total: number | null;
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
        requests: number | null;
        drafts: number | null;
        receipts: number | null;
        eta: number | null;
        reorder: number | null;
    },
): number | null {
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
        default: {
            const values = [
                counts.requests,
                counts.drafts,
                counts.receipts,
                counts.reorder,
            ];
            return values.some((value) => value == null)
                ? null
                : values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
        }
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

/** Canonical waiting-receipt status, composed with the factual ETA exception. */
function etaWhere(startOfDay: Date): Prisma.PurchaseOrderWhereInput {
    return {
        ...buildPurchasingDashboardWaitingReceiptWhere(),
        expectedDate: { lt: startOfDay },
    };
}

const RECEIPT_SELECT = {
    id: true,
    orderNumber: true,
    status: true,
    expectedDate: true,
    updatedAt: true,
    supplier: { select: { name: true } },
} as const;

async function readRequestGroup(
    tx: Prisma.TransactionClient,
    prWhere: Prisma.PurchaseRequestWhereInput,
) {
    const [count, rows] = await Promise.all([
        tx.purchaseRequest.count({ where: prWhere }),
        tx.purchaseRequest.findMany({
            where: prWhere,
            take: PURCHASING_MOBILE_SAMPLE_LIMIT,
            // URGENT is the only elevated domain priority for PRs. Within that
            // bucket, OPEN precedes APPROVED, then age and id keep the bounded
            // sample deterministic.
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
        }),
    ]);
    return { count, rows };
}

async function readDraftGroup(tx: Prisma.TransactionClient) {
    const [count, rows] = await Promise.all([
        tx.purchaseOrder.count({ where: { status: 'DRAFT' } }),
        tx.purchaseOrder.findMany({
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
        }),
    ]);
    return { count, rows };
}

async function readReceiptGroup(
    tx: Prisma.TransactionClient,
    filter: PurchasingMobileTaskFilter,
    startOfDay: Date,
) {
    const [count, etaCount, rows] = await Promise.all([
        tx.purchaseOrder.count({
            where: buildPurchasingDashboardWaitingReceiptWhere(),
        }),
        tx.purchaseOrder.count({ where: etaWhere(startOfDay) }),
        filter === 'ETA'
            ? tx.purchaseOrder.findMany({
                  where: etaWhere(startOfDay),
                  take: PURCHASING_MOBILE_SAMPLE_LIMIT,
                  orderBy: [
                      { expectedDate: 'asc' },
                      { updatedAt: 'asc' },
                      { id: 'asc' },
                  ],
                  select: RECEIPT_SELECT,
              })
            : Promise.all(
                  (['PARTIAL_RECEIVED', 'SENT'] as const).map((status) =>
                      tx.purchaseOrder.findMany({
                          where: buildPurchasingDashboardWaitingReceiptWhere(
                              status,
                          ),
                          take: PURCHASING_MOBILE_SAMPLE_LIMIT,
                          orderBy: [
                              { expectedDate: 'asc' },
                              { updatedAt: 'asc' },
                              { id: 'asc' },
                          ],
                          select: RECEIPT_SELECT,
                      }),
                  ),
              ).then((groups) => groups.flat()),
    ]);
    return { count, etaCount, rows };
}

async function readReorderGroup(tx: Prisma.TransactionClient) {
    // Owner read owns eligibility/threshold and the full reorder count; the
    // consumer only maps owner fields and never re-derives totals from a sample.
    const snapshot = await readWarehouseInventoryThresholdSnapshot(tx, {
        reorderDriverLimit: PURCHASING_MOBILE_SAMPLE_LIMIT,
    });
    const items: PurchasingMobileReorderDto[] = snapshot.reorderDrivers.map(
        (driver) => ({
            id: driver.id,
            name: driver.name,
            skuCode: driver.skuCode,
            unit: driver.unit,
            supplierName: driver.preferredSupplierName,
            totalStock: driver.eligibleQuantity,
            reorderPoint: driver.threshold,
            reorderQuantity: driver.reorderQuantity,
        }),
    );
    return { count: snapshot.reorderCount, items };
}

async function readApGroup(
    tx: Prisma.TransactionClient,
    where: Prisma.PurchaseInvoiceWhereInput,
) {
    return { count: await tx.purchaseInvoice.count({ where }) };
}

async function readApNominalGroup(
    tx: Prisma.TransactionClient,
    where: Prisma.PurchaseInvoiceWhereInput,
) {
    const aggregate = await tx.purchaseInvoice.aggregate({
        where,
        _sum: { totalAmount: true, paidAmount: true },
    });
    return {
        net:
            decimalNumber(aggregate._sum.totalAmount) -
            decimalNumber(aggregate._sum.paidAmount),
    };
}

function settledValue<T>(outcome: PromiseSettledResult<T | null>): T | null {
    return outcome.status === 'fulfilled' ? outcome.value : null;
}

function outcomeStatus(
    outcome: PromiseSettledResult<unknown>,
): MobileSectionStatus {
    return outcome.status === 'fulfilled' ? 'AVAILABLE' : 'UNAVAILABLE';
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
    const wantsRequests = input.filter === 'ALL' || input.filter === 'REQUESTS';
    const wantsDrafts = input.filter === 'ALL' || input.filter === 'DRAFT_PO';
    const wantsReceipts =
        input.filter === 'ALL' ||
        input.filter === 'RECEIPTS' ||
        input.filter === 'ETA';
    const wantsReorder = input.filter === 'ALL' || input.filter === 'REORDER';
    if (!input.canViewAmounts) {
        recordDashboardSectionState({
            route: 'purchasing-mobile',
            section: 'overdue-ap-nominal',
            state: 'HIDDEN',
            generatedAt: now,
        });
    }

    const repeatableRead = <T>(
        reader: (tx: Prisma.TransactionClient) => Promise<T>,
    ) =>
        tenantDb.$transaction(reader, {
            isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
        });

    // A PostgreSQL statement error aborts its transaction. Give every section
    // an independent repeatable-read boundary so one failed reader cannot turn
    // unrelated sections unavailable through transaction-aborted (25P02).
    const [
        requestsOutcome,
        draftsOutcome,
        receiptsOutcome,
        reorderOutcome,
        apOutcome,
        apNominalOutcome,
    ] = await Promise.allSettled([
        wantsRequests
            ? observeDashboardSection({
                  route: 'purchasing-mobile',
                  section: 'requests',
                  generatedAt: now,
                  read: () =>
                      repeatableRead((tx) => readRequestGroup(tx, prWhere)),
              })
            : Promise.resolve(null),
        wantsDrafts
            ? observeDashboardSection({
                  route: 'purchasing-mobile',
                  section: 'drafts',
                  generatedAt: now,
                  read: () => repeatableRead((tx) => readDraftGroup(tx)),
              })
            : Promise.resolve(null),
        wantsReceipts
            ? observeDashboardSection({
                  route: 'purchasing-mobile',
                  section: 'receipts',
                  generatedAt: now,
                  read: () =>
                      repeatableRead((tx) =>
                          readReceiptGroup(tx, input.filter, startOfDay),
                      ),
              })
            : Promise.resolve(null),
        wantsReorder
            ? observeDashboardSection({
                  route: 'purchasing-mobile',
                  section: 'reorder',
                  generatedAt: now,
                  read: () => repeatableRead((tx) => readReorderGroup(tx)),
              })
            : Promise.resolve(null),
        observeDashboardSection({
            route: 'purchasing-mobile',
            section: 'overdue-ap',
            generatedAt: now,
            read: () =>
                repeatableRead((tx) =>
                    readApGroup(tx, buildOverduePurchaseInvoiceWhere(tx, now)),
                ),
        }),
        input.canViewAmounts
            ? observeDashboardSection({
                  route: 'purchasing-mobile',
                  section: 'overdue-ap-nominal',
                  generatedAt: now,
                  read: () =>
                      repeatableRead((tx) =>
                          readApNominalGroup(
                              tx,
                              buildOverduePurchaseInvoiceWhere(tx, now),
                          ),
                      ),
              })
            : Promise.resolve(null),
    ]);

    const requests = settledValue(requestsOutcome);
    const drafts = settledValue(draftsOutcome);
    const receipts = settledValue(receiptsOutcome);
    const reorder = settledValue(reorderOutcome);
    const ap = settledValue(apOutcome);
    const apNominal = settledValue(apNominalOutcome);

    const sections: PurchasingMobileSections = {};
    if (wantsRequests) sections.requests = outcomeStatus(requestsOutcome);
    if (wantsDrafts) sections.drafts = outcomeStatus(draftsOutcome);
    if (wantsReceipts) sections.receipts = outcomeStatus(receiptsOutcome);
    if (wantsReorder) sections.reorder = outcomeStatus(reorderOutcome);
    sections.ap = outcomeStatus(apOutcome);
    sections.apNominal = input.canViewAmounts
        ? outcomeStatus(apNominalOutcome)
        : 'HIDDEN';

    const requestTasks: PurchasingMobileTaskDto[] = (requests?.rows ?? []).map(
        (request) => ({
            id: request.id,
            kind: 'REQUEST',
            title: request.requestNumber,
            subtitle: request.createdBy.name ?? 'Pembuat tidak tersedia',
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
    const draftTasks: PurchasingMobileTaskDto[] = (drafts?.rows ?? []).map(
        (order) => ({
            id: order.id,
            kind: 'DRAFT_PO',
            title: order.orderNumber,
            subtitle: order.supplier.name,
            status: order.status,
            priority: 'NORMAL',
            href: `/purchasing/mobile/orders/${order.id}`,
            sortAt: order.createdAt.toISOString(),
        }),
    );
    const receiptTasks: PurchasingMobileTaskDto[] = (receipts?.rows ?? []).map(
        (order) => {
            const isLate =
                order.expectedDate != null && order.expectedDate < startOfDay;
            return {
                id: order.id,
                kind: 'RECEIPT',
                title: order.orderNumber,
                subtitle: order.supplier.name,
                status: isLate ? 'ETA_TERLEWAT' : order.status,
                priority: isLate
                    ? 'URGENT'
                    : order.status === 'PARTIAL_RECEIVED'
                      ? 'HIGH'
                      : 'NORMAL',
                href: `/purchasing/mobile/receipts/${order.id}`,
                sortAt: (order.expectedDate ?? order.updatedAt).toISOString(),
            };
        },
    );
    // Queue reorder candidacy is exactly suggestedReorder top-N
    // membership; no zero-stock promotion policy is added here.
    const reorderItems = reorder?.items ?? [];
    const reorderTasks: PurchasingMobileTaskDto[] = reorderItems.map(
        (variant) => ({
            id: variant.id,
            kind: 'REORDER',
            title: variant.name,
            subtitle: variant.supplierName ?? 'Supplier belum ditetapkan',
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
        ...reorderTasks,
    ]).slice(0, PURCHASING_MOBILE_SAMPLE_LIMIT);
    const counts = {
        requests: requests?.count ?? null,
        drafts: drafts?.count ?? null,
        receipts: receipts?.count ?? null,
        eta: receipts?.etaCount ?? null,
        reorder: reorder?.count ?? null,
    };
    const overdueApAmount = apNominal?.net;

    return {
        generatedAt: now.toISOString(),
        filter: input.filter,
        sections,
        highlights: {
            pendingRequestCount: requests?.count ?? null,
            draftPoCount: drafts?.count ?? null,
            waitingReceiptCount: receipts?.count ?? null,
            etaExceptionCount: receipts?.etaCount ?? null,
            suggestedReorderCount: reorder?.count ?? null,
            overdueApCount: ap?.count ?? null,
            ...(overdueApAmount === undefined ? {} : { overdueApAmount }),
        },
        queue: {
            total: totalForFilter(input.filter, counts),
            returned: selected.length,
            items: selected,
        },
        suggestedReorder: {
            total: reorder?.count ?? null,
            returned: reorderItems.length,
            items: reorderItems,
        },
    };
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
            ...(input.kind === 'ORDER'
                ? { status: 'DRAFT' as const }
                : buildPurchasingDashboardWaitingReceiptWhere()),
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
