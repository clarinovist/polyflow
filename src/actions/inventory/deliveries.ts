'use server';

import { withTenant } from '@/lib/core/tenant';
import { prisma } from '@/lib/core/prisma';
import { Prisma, RateType, DeliveryStatus } from '@prisma/client';
import {
    safeAction,
    NotFoundError,
    BusinessRuleError,
} from '@/lib/errors/errors';
import { requireAuth } from '@/lib/tools/auth-checks';
import { requireSalesApprover } from '@/lib/auth/sales-access';
import {
    createManualDeliveryOrderSchema,
    updateDeliveryPricingSchema,
    updateDeliveryItemQuantitiesSchema,
    updateDeliveryItemNotesSchema,
    saveDeliveryLoadVerificationSchema,
    reverseDeliveryShipmentSchema,
} from '@/lib/schemas/sales';
import { logActivity } from '@/lib/tools/audit';
import { canTransition } from '@/lib/sales/delivery-status';
import { computeDeliveryTotals } from '@/lib/sales/delivery-pricing';
import { getActiveTariff } from '@/actions/sales/vehicle-tariffs';
import { revalidatePath } from 'next/cache';
import { requireWarehouseResourcePermission } from '@/lib/tools/auth-checks';
import { logger } from '@/lib/config/logger';
import { DELIVERY_ORDERS_LIST_ROUTE } from '@/lib/constants/performance';

export const getDeliveryOrders = withTenant(
    async function getDeliveryOrders(dateRange?: {
        startDate?: Date;
        endDate?: Date;
    }) {
        return safeAction(async () => {
            // Always include open (PENDING/LOADING) DOs so drafts don't "disappear"
            // when outside the selected deliveryDate month filter.
            const where: Prisma.DeliveryOrderWhereInput = {};
            if (dateRange?.startDate && dateRange?.endDate) {
                where.OR = [
                    {
                        deliveryDate: {
                            gte: dateRange.startDate,
                            lte: dateRange.endDate,
                        },
                    },
                    {
                        status: {
                            in: [
                                DeliveryStatus.PENDING,
                                DeliveryStatus.LOADING,
                            ],
                        },
                    },
                ];
            }

            const queryStartedAt = performance.now();
            const deliveryOrders = await prisma.deliveryOrder.findMany({
                where,
                orderBy: [
                    { status: 'asc' }, // rough: open statuses tend to sort usefully with createdAt
                    { createdAt: 'desc' },
                ],
                include: {
                    salesOrder: {
                        select: {
                            orderNumber: true,
                            customer: {
                                select: {
                                    name: true,
                                },
                            },
                        },
                    },
                    sourceLocation: {
                        select: {
                            name: true,
                        },
                    },
                    items: {
                        select: {
                            id: true,
                            verifiedQuantity: true,
                        },
                    },
                },
            });

            const durationMs = Math.round(performance.now() - queryStartedAt);
            // Fire-and-forget — recording the sample must not add latency to
            // this response. Failure here is non-fatal (see
            // docs/plan/2026-08-12-extend-performance-metrics-list-routes.md).
            prisma.performanceMetric
                .create({
                    data: { route: DELIVERY_ORDERS_LIST_ROUTE, durationMs },
                })
                .catch((error) =>
                    logger.error('Failed to record performance metric', {
                        module: 'inventory',
                        error,
                    }),
                );

            // Surface open DOs first for operators
            const open = deliveryOrders.filter(
                (d) =>
                    d.status === DeliveryStatus.PENDING ||
                    d.status === DeliveryStatus.LOADING,
            );
            const rest = deliveryOrders.filter(
                (d) =>
                    d.status !== DeliveryStatus.PENDING &&
                    d.status !== DeliveryStatus.LOADING,
            );
            return [...open, ...rest];
        });
    },
);
/**
 * Dedicated query for open delivery queue (PENDING/LOADING only).
 * Minimal select for desktop/mobile outgoing pages.
 * Canonical ordering: LOADING first, then deliveryDate ascending.
 */
export const getOpenDeliveryOrders = withTenant(
    async function getOpenDeliveryOrders() {
        return safeAction(async () => {
            const deliveryOrders = await prisma.deliveryOrder.findMany({
                where: {
                    status: {
                        in: [DeliveryStatus.PENDING, DeliveryStatus.LOADING],
                    },
                },
                orderBy: [
                    { deliveryDate: 'asc' },
                    { createdAt: 'asc' },
                    { id: 'asc' },
                ],
                select: {
                    id: true,
                    orderNumber: true,
                    salesOrderId: true,
                    status: true,
                    deliveryDate: true,
                    loadVerifiedAt: true,
                    loadingStartedAt: true,
                    salesOrder: {
                        select: {
                            orderNumber: true,
                            customer: {
                                select: { name: true },
                            },
                        },
                    },
                    sourceLocation: {
                        select: { name: true },
                    },
                    items: {
                        select: {
                            id: true,
                            quantity: true,
                            verifiedQuantity: true,
                        },
                    },
                },
            });

            // LOADING first, then PENDING
            const statusOrder = (s: string) =>
                s === DeliveryStatus.LOADING ? 0 : 1;
            deliveryOrders.sort((a, b) => {
                const diff = statusOrder(a.status) - statusOrder(b.status);
                if (diff !== 0) return diff;
                const d1 = a.deliveryDate
                    ? new Date(a.deliveryDate).getTime()
                    : 0;
                const d2 = b.deliveryDate
                    ? new Date(b.deliveryDate).getTime()
                    : 0;
                if (d1 !== d2) return d1 - d2;
                return a.id.localeCompare(b.id);
            });

            return deliveryOrders;
        });
    },
);

/**
 * Summary count for open delivery queue (for mobile home badge).
 */
export const getOpenDeliveryOrderCount = withTenant(
    async function getOpenDeliveryOrderCount() {
        return safeAction(async () => {
            const count = await prisma.deliveryOrder.count({
                where: {
                    status: {
                        in: [DeliveryStatus.PENDING, DeliveryStatus.LOADING],
                    },
                },
            });
            return count;
        });
    },
);

export const getDeliveryOrderById = withTenant(
    async function getDeliveryOrderById(id: string) {
        return safeAction(async () => {
            const deliveryOrder = await prisma.deliveryOrder.findUnique({
                where: { id },
                include: {
                    salesOrder: {
                        include: {
                            customer: true,
                            // Drives the combined "SJ + Invoice" ESC/P button
                            // and the "Batalkan Pengiriman" visibility guard
                            // (hidden once any invoice is PAID/PARTIAL); a SO
                            // can carry more than one invoice, so the UI asks
                            // instead of guessing.
                            invoices: {
                                select: {
                                    id: true,
                                    invoiceNumber: true,
                                    status: true,
                                },
                                orderBy: { invoiceDate: 'asc' },
                            },
                        },
                    },
                    sourceLocation: true,
                    vehicle: true,
                    items: {
                        include: {
                            productVariant: {
                                include: {
                                    product: true,
                                },
                            },
                        },
                    },
                    createdBy: {
                        select: {
                            name: true,
                        },
                    },
                },
            });

            return deliveryOrder;
        });
    },
);

export const createManualDeliveryOrder = withTenant(
    async function createManualDeliveryOrder(data: {
        salesOrderId: string;
        sourceLocationId: string;
        carrier?: string;
        trackingNumber?: string;
        notes?: string;
        vehicleId?: string;
        appliedRateType?: string;
        appliedCostRate?: number;
        appliedChargeRate?: number;
        appliedRouteName?: string;
        totalCost?: number;
        totalCharge?: number;
        estimatedWeightKg?: number;
        destinationAddress?: string;
    }) {
        return safeAction(async () => {
            const session = await requireWarehouseResourcePermission(
                '/warehouse/outgoing',
            );
            const validatedData = createManualDeliveryOrderSchema.parse(data);

            // Single source of truth: hardened create (D1/D6/D7/D12) — no stock deduct
            const { createDeliveryOrderFromSalesOrder } =
                await import('@/services/sales/delivery-fulfillment-service');
            const deliveryOrder = await createDeliveryOrderFromSalesOrder({
                salesOrderId: validatedData.salesOrderId,
                sourceLocationId: validatedData.sourceLocationId,
                userId: session.user.id,
                carrier: validatedData.carrier,
                trackingNumber: validatedData.trackingNumber,
                notes: validatedData.notes,
                vehicleId: validatedData.vehicleId,
                appliedRateType: validatedData.appliedRateType,
                appliedCostRate: validatedData.appliedCostRate,
                appliedChargeRate: validatedData.appliedChargeRate,
                appliedRouteName: validatedData.appliedRouteName ?? undefined,
                totalCost: validatedData.totalCost,
                totalCharge: validatedData.totalCharge,
                estimatedWeightKg: validatedData.estimatedWeightKg,
                destinationAddress: validatedData.destinationAddress,
            });

            // Sync SO shipping cost from DO charges
            try {
                const { syncSalesOrderShippingFromDeliveries } =
                    await import('@/services/sales/delivery-shipping-sync');
                await syncSalesOrderShippingFromDeliveries(
                    validatedData.salesOrderId,
                    {
                        userId: session.user.id,
                    },
                );
            } catch (err) {
                console.warn(
                    '[delivery-shipping-sync] sync failed (non-blocking):',
                    err,
                );
            }

            revalidatePath('/sales/deliveries');
            revalidatePath(`/sales/orders/${validatedData.salesOrderId}`);
            revalidatePath('/warehouse/outgoing');

            return deliveryOrder;
        });
    },
);

/**
 * Update delivery order status with transition validation.
 * When target = DELIVERED, also calls deliverOrder to sync SalesOrder.
 */
export const updateDeliveryStatus = withTenant(
    async function updateDeliveryStatus(
        deliveryOrderId: string,
        newStatus: string,
    ) {
        return safeAction(async () => {
            const session = await requireWarehouseResourcePermission(
                '/warehouse/outgoing',
            );

            const doRecord = await prisma.deliveryOrder.findUnique({
                where: { id: deliveryOrderId },
                select: {
                    id: true,
                    status: true,
                    salesOrderId: true,
                    orderNumber: true,
                },
            });
            if (!doRecord)
                throw new NotFoundError('Delivery Order', deliveryOrderId);

            if (!canTransition(doRecord.status, newStatus)) {
                throw new BusinessRuleError(
                    `Tidak dapat mengubah status dari ${doRecord.status} ke ${newStatus}.`,
                    { from: doRecord.status, to: newStatus, deliveryOrderId },
                    'INVALID_DELIVERY_STATUS',
                );
            }

            // SHIPPED→CANCELLED is only valid through reverseDeliveryShipment,
            // which reverses stock/invoice/reservations atomically. Block the
            // generic path even though canTransition (delivery-status.ts)
            // allows it, so no route can flip status without reversing stock.
            if (doRecord.status === 'SHIPPED' && newStatus === 'CANCELLED') {
                throw new BusinessRuleError(
                    'DO sudah SHIPPED — gunakan "Batalkan Pengiriman" (reverseDeliveryShipment) untuk membalik stok dan invoice, bukan ubah status langsung.',
                    { deliveryOrderId },
                    'USE_REVERSE_DELIVERY_SHIPMENT',
                );
            }

            let invoicePending = false;
            // When transitioning to SHIPPED → commit stock (all-in-one)
            if (newStatus === 'SHIPPED') {
                const { commitDeliveryShipment } =
                    await import('@/services/sales/delivery-fulfillment-service');
                const shipment = await commitDeliveryShipment(
                    deliveryOrderId,
                    session.user.id,
                );
                invoicePending = shipment.invoicePending;
            } else if (newStatus === 'DELIVERED') {
                const { receiveDelivery } =
                    await import('@/services/sales/delivery-receiving-service');
                await receiveDelivery(deliveryOrderId, session.user.id);
            } else if (newStatus === 'LOADING') {
                // Conditional update: a concurrent shipment must not be reopened by stale UI.
                await prisma.deliveryOrder.update({
                    where: { id: deliveryOrderId, status: doRecord.status },
                    data: {
                        status: newStatus as DeliveryStatus,
                        loadingStartedAt: new Date(),
                        loadingStartedById: session.user.id,
                    },
                });
            } else {
                // Reject a stale transition if revision/shipment changed status while waiting.
                await prisma.deliveryOrder.update({
                    where: { id: deliveryOrderId, status: doRecord.status },
                    data: { status: newStatus as DeliveryStatus },
                });
            }

            // Sync SO shipping cost when DO status changes (CANCELLED/RETURNED affect sum)
            if (newStatus === 'CANCELLED' || newStatus === 'RETURNED') {
                try {
                    const { syncSalesOrderShippingFromDeliveries } =
                        await import('@/services/sales/delivery-shipping-sync');
                    await syncSalesOrderShippingFromDeliveries(
                        doRecord.salesOrderId,
                        {
                            userId: session.user.id,
                        },
                    );
                } catch (err) {
                    console.warn(
                        '[delivery-shipping-sync] sync failed (non-blocking):',
                        err,
                    );
                }
            }

            await logActivity({
                userId: session.user.id,
                action: 'UPDATE_DELIVERY_STATUS',
                entityType: 'DeliveryOrder',
                entityId: deliveryOrderId,
                details: `DO ${doRecord.orderNumber}: ${doRecord.status} -> ${newStatus}`,
                fromStatus: doRecord.status as string,
                toStatus: newStatus as string,
            });

            revalidatePath('/sales/deliveries');
            revalidatePath(`/sales/deliveries/${deliveryOrderId}`);
            revalidatePath(`/sales/orders/${doRecord.salesOrderId}`);
            revalidatePath('/warehouse/outgoing');
            revalidatePath(`/warehouse/outgoing/${deliveryOrderId}`);

            return { success: true, invoicePending };
        });
    },
);

/**
 * Update delivery order pricing (vehicle, route, rates, weight, totals).
 * Auto-resolves tariff if vehicle changed and rates are empty.
 * Recomputes totals from rates when recomputeFromRates=true (default).
 * Calls syncSalesOrderShippingFromDeliveries after update.
 */
export const updateDeliveryPricing = withTenant(
    async function updateDeliveryPricing(data: {
        deliveryOrderId: string;
        vehicleId?: string | null;
        appliedRouteName?: string | null;
        appliedRateType?: string | null;
        appliedCostRate?: number | null;
        appliedChargeRate?: number | null;
        estimatedWeightKg?: number | null;
        totalCost?: number | null;
        totalCharge?: number | null;
        recomputeFromRates?: boolean;
    }) {
        return safeAction(async () => {
            const session = await requireWarehouseResourcePermission(
                '/warehouse/outgoing',
            );
            const validated = updateDeliveryPricingSchema.parse(data);

            // Load DO
            const doRecord = await prisma.deliveryOrder.findUnique({
                where: { id: validated.deliveryOrderId },
                select: {
                    id: true,
                    status: true,
                    salesOrderId: true,
                    orderNumber: true,
                    vehicleId: true,
                    appliedRouteName: true,
                    appliedRateType: true,
                    appliedCostRate: true,
                    appliedChargeRate: true,
                    estimatedWeightKg: true,
                    totalCost: true,
                    totalCharge: true,
                    salesOrder: { select: { customerId: true } },
                },
            });
            if (!doRecord)
                throw new NotFoundError(
                    'Delivery Order',
                    validated.deliveryOrderId,
                );
            if (doRecord.status === 'CANCELLED') {
                throw new BusinessRuleError(
                    'Cannot edit pricing for a cancelled Delivery Order.',
                    {
                        status: doRecord.status,
                        deliveryOrderId: validated.deliveryOrderId,
                    },
                    'INVALID_DELIVERY_STATUS',
                );
            }

            // Resolve fields — use provided values or keep existing
            const vehicleId =
                validated.vehicleId !== undefined
                    ? validated.vehicleId
                    : doRecord.vehicleId;
            const routeName =
                validated.appliedRouteName !== undefined
                    ? validated.appliedRouteName
                    : doRecord.appliedRouteName;
            const weightKg =
                validated.estimatedWeightKg !== undefined
                    ? validated.estimatedWeightKg != null
                        ? Number(validated.estimatedWeightKg)
                        : null
                    : doRecord.estimatedWeightKg
                      ? Number(doRecord.estimatedWeightKg)
                      : null;

            let rateType =
                validated.appliedRateType ?? doRecord.appliedRateType;
            let costRate =
                validated.appliedCostRate ??
                (doRecord.appliedCostRate
                    ? Number(doRecord.appliedCostRate)
                    : null);
            let chargeRate =
                validated.appliedChargeRate ??
                (doRecord.appliedChargeRate
                    ? Number(doRecord.appliedChargeRate)
                    : null);
            let totalCost =
                validated.totalCost ??
                (doRecord.totalCost ? Number(doRecord.totalCost) : null);
            let totalCharge =
                validated.totalCharge ??
                (doRecord.totalCharge ? Number(doRecord.totalCharge) : null);

            // If vehicle changed and rates are empty → auto-resolve tariff
            if (
                vehicleId &&
                (!rateType || costRate == null || chargeRate == null)
            ) {
                const tariffResult = await getActiveTariff(
                    vehicleId,
                    routeName,
                    doRecord.salesOrder?.customerId,
                );
                const tariff = tariffResult?.success ? tariffResult.data : null;
                if (tariff) {
                    rateType = tariff.rateType;
                    costRate = Number(tariff.costRate);
                    chargeRate = Number(tariff.chargeRate);
                }
            }

            // Recompute totals from rates if requested and rates are available
            if (
                validated.recomputeFromRates &&
                rateType &&
                costRate != null &&
                chargeRate != null
            ) {
                const computed = computeDeliveryTotals({
                    rateType: rateType as 'PER_KG' | 'FLAT_RATE',
                    costRate,
                    chargeRate,
                    weightKg,
                    minKg: null, // minKg from tariff not stored on DO; use 0
                });
                totalCost = computed.totalCost;
                totalCharge = computed.totalCharge;
            }

            // Update DO
            const updated = await prisma.deliveryOrder.update({
                where: { id: validated.deliveryOrderId },
                data: {
                    ...(vehicleId !== undefined && {
                        vehicleId: vehicleId || null,
                    }),
                    ...(routeName !== undefined && {
                        appliedRouteName: routeName || null,
                    }),
                    ...(rateType && { appliedRateType: rateType as RateType }),
                    ...(costRate != null && { appliedCostRate: costRate }),
                    ...(chargeRate != null && {
                        appliedChargeRate: chargeRate,
                    }),
                    ...(weightKg != null && { estimatedWeightKg: weightKg }),
                    ...(totalCost != null && { totalCost }),
                    ...(totalCharge != null && { totalCharge }),
                },
            });

            await logActivity({
                userId: session.user.id,
                action: 'UPDATE_DELIVERY_PRICING',
                entityType: 'DeliveryOrder',
                entityId: validated.deliveryOrderId,
                details: `DO ${doRecord.orderNumber}: pricing updated (charge=${totalCharge ?? 'n/a'})`,
            });

            // Sync SO shipping (Phase 3 service — stub for now)
            let shippingSync: {
                synced: boolean;
                reason: string;
                shippingCost: number;
            } = {
                synced: false,
                reason: 'NOT_IMPLEMENTED',
                shippingCost: 0,
            };
            try {
                const { syncSalesOrderShippingFromDeliveries } =
                    await import('@/services/sales/delivery-shipping-sync');
                const result = await syncSalesOrderShippingFromDeliveries(
                    doRecord.salesOrderId,
                    {
                        userId: session.user.id,
                    },
                );
                shippingSync = {
                    synced: result.synced,
                    reason: result.reason,
                    shippingCost: result.shippingCost,
                };
            } catch (err) {
                console.warn(
                    '[delivery-shipping-sync] sync failed (non-blocking):',
                    err,
                );
            }

            revalidatePath('/sales/deliveries');
            revalidatePath(`/sales/deliveries/${validated.deliveryOrderId}`);
            revalidatePath(`/sales/orders/${doRecord.salesOrderId}`);

            return { deliveryOrder: updated, shippingSync };
        });
    },
);

/**
 * Server action: fetch stock readiness for a Delivery Order.
 * Used by DeliveryOrderDetail (client component) to show soft warning banner.
 * Client must never import the Prisma service directly.
 */
export const fetchDeliveryStockReadiness = withTenant(
    async function fetchDeliveryStockReadiness(deliveryOrderId: string) {
        return safeAction(async () => {
            await requireAuth();
            const { getDeliveryStockReadiness } =
                await import('@/services/sales/delivery-fulfillment-service');
            return getDeliveryStockReadiness(deliveryOrderId);
        });
    },
);

/**
 * Update DO line quantities while PENDING/LOADING (before stock is committed).
 * Max qty per line = SO residual for that variant + current DO line qty
 * (PENDING does not consume deliveredQty yet).
 */
export const updateDeliveryItemQuantities = withTenant(
    async function updateDeliveryItemQuantities(data: {
        deliveryOrderId: string;
        items: Array<{ id: string; quantity: number }>;
    }) {
        return safeAction(async () => {
            const session = await requireWarehouseResourcePermission(
                '/warehouse/outgoing',
            );
            const validated = updateDeliveryItemQuantitiesSchema.parse(data);

            const { changeDeliveryLoad } =
                await import('@/services/sales/delivery-load-service');
            const doRecord = await changeDeliveryLoad(
                validated.deliveryOrderId,
                session.user.id,
                { kind: 'quantity', items: validated.items },
            );
            revalidatePath(
                `/warehouse/mobile/outgoing/${validated.deliveryOrderId}`,
            );

            revalidatePath('/sales/deliveries');
            revalidatePath(`/sales/deliveries/${validated.deliveryOrderId}`);
            revalidatePath(`/sales/orders/${doRecord.salesOrderId}`);
            revalidatePath('/warehouse/outgoing');
            revalidatePath(`/warehouse/outgoing/${validated.deliveryOrderId}`);

            return { success: true };
        });
    },
);

/**
 * Edit per-item Keterangan (rincian packing bebas, dicetak di Surat Jalan).
 * Terpisah dari updateDeliveryItemQuantities: hanya menyentuh `notes`, tidak
 * mereset verifikasi muat gudang (verifiedQuantity/verifiedAt/loadVerifiedAt).
 */
export const updateDeliveryItemNotes = withTenant(
    async function updateDeliveryItemNotes(data: {
        deliveryOrderId: string;
        items: Array<{ id: string; notes?: string }>;
    }) {
        return safeAction(async () => {
            const session = await requireWarehouseResourcePermission(
                '/warehouse/outgoing',
            );
            const validated = updateDeliveryItemNotesSchema.parse(data);

            const doRecord = await prisma.deliveryOrder.findUnique({
                where: { id: validated.deliveryOrderId },
                include: { items: true },
            });

            if (!doRecord) {
                throw new NotFoundError(
                    'Delivery Order',
                    validated.deliveryOrderId,
                );
            }

            if (
                doRecord.status !== DeliveryStatus.PENDING &&
                doRecord.status !== DeliveryStatus.LOADING
            ) {
                throw new BusinessRuleError(
                    'Keterangan hanya bisa diubah saat Surat Jalan masih PENDING atau LOADING.',
                    { status: doRecord.status },
                    'INVALID_DELIVERY_STATUS',
                );
            }

            const doItemIds = new Set(doRecord.items.map((i) => i.id));
            for (const patch of validated.items) {
                if (!doItemIds.has(patch.id)) {
                    throw new BusinessRuleError(
                        `Item SJ tidak ditemukan: ${patch.id}`,
                        { itemId: patch.id },
                    );
                }
            }

            await prisma.$transaction(
                validated.items.map((patch) =>
                    prisma.deliveryOrderItem.update({
                        where: { id: patch.id },
                        data: { notes: patch.notes || null },
                    }),
                ),
            );

            await logActivity({
                userId: session.user.id,
                action: 'UPDATE_DELIVERY_ITEM_NOTES',
                entityType: 'DeliveryOrder',
                entityId: validated.deliveryOrderId,
                details: `DO ${doRecord.orderNumber}: item Keterangan updated`,
            });

            revalidatePath('/sales/deliveries');
            revalidatePath(`/sales/deliveries/${validated.deliveryOrderId}`);
            revalidatePath('/warehouse/outgoing');
            revalidatePath(`/warehouse/outgoing/${validated.deliveryOrderId}`);

            return { success: true };
        });
    },
);

/**
 * Save per-line verified quantities (physical count at load).
 * Does not lock header verification — use confirmDeliveryLoadVerified after all match.
 */
export const saveDeliveryLoadVerification = withTenant(
    async function saveDeliveryLoadVerification(data: {
        deliveryOrderId: string;
        items: Array<{ id: string; verifiedQuantity: number }>;
    }) {
        return safeAction(async () => {
            const session = await requireWarehouseResourcePermission(
                '/warehouse/outgoing',
            );
            const validated = saveDeliveryLoadVerificationSchema.parse(data);

            const { changeDeliveryLoad } =
                await import('@/services/sales/delivery-load-service');
            await changeDeliveryLoad(
                validated.deliveryOrderId,
                session.user.id,
                { kind: 'verify', items: validated.items },
            );
            revalidatePath(
                `/warehouse/mobile/outgoing/${validated.deliveryOrderId}`,
            );

            revalidatePath('/sales/deliveries');
            revalidatePath(`/sales/deliveries/${validated.deliveryOrderId}`);
            revalidatePath('/warehouse/outgoing');
            revalidatePath(`/warehouse/outgoing/${validated.deliveryOrderId}`);

            return { success: true };
        });
    },
);

/**
 * Lock load verification when every line has verifiedQuantity matching planned quantity.
 */
export const confirmDeliveryLoadVerified = withTenant(
    async function confirmDeliveryLoadVerified(deliveryOrderId: string) {
        return safeAction(async () => {
            const session = await requireWarehouseResourcePermission(
                '/warehouse/outgoing',
            );

            const { changeDeliveryLoad } =
                await import('@/services/sales/delivery-load-service');
            await changeDeliveryLoad(deliveryOrderId, session.user.id, {
                kind: 'lock',
            });
            revalidatePath(`/warehouse/mobile/outgoing/${deliveryOrderId}`);

            revalidatePath('/sales/deliveries');
            revalidatePath(`/sales/deliveries/${deliveryOrderId}`);
            revalidatePath('/warehouse/outgoing');
            revalidatePath(`/warehouse/outgoing/${deliveryOrderId}`);

            return { success: true };
        });
    },
);

/**
 * One-click: correct DO line quantities to match verified (physical) quantities,
 * then re-save verification and lock. All in one atomic action.
 * Used when warehouse finds qty fisik ≠ perintah and wants to align DO to physical count.
 */
export const correctDeliveryQtyToVerified = withTenant(
    async function correctDeliveryQtyToVerified(deliveryOrderId: string) {
        return safeAction(async () => {
            const session = await requireWarehouseResourcePermission(
                '/warehouse/outgoing',
            );

            const { changeDeliveryLoad } =
                await import('@/services/sales/delivery-load-service');
            await changeDeliveryLoad(deliveryOrderId, session.user.id, {
                kind: 'correct',
            });
            revalidatePath(`/warehouse/mobile/outgoing/${deliveryOrderId}`);

            revalidatePath('/sales/deliveries');
            revalidatePath(`/sales/deliveries/${deliveryOrderId}`);
            revalidatePath('/warehouse/outgoing');
            revalidatePath(`/warehouse/outgoing/${deliveryOrderId}`);

            return { success: true };
        });
    },
);

/**
 * Reverse a SHIPPED Delivery Order: undoes stock OUT, restores reservations,
 * voids the draft/unpaid invoice(s), and reopens the Sales Order.
 * ADMIN only — destructive/override action per src/actions/sales/AGENTS.md guard matrix.
 */
export const reverseDeliveryShipment = withTenant(
    async function reverseDeliveryShipment(input: unknown) {
        return safeAction(async () => {
            const session = await requireSalesApprover();
            const data = reverseDeliveryShipmentSchema.parse(input);

            const { reverseDeliveryShipment: reverseShipment } =
                await import('@/services/sales/delivery-reversal-service');
            const doRecord = await prisma.deliveryOrder.findUnique({
                where: { id: data.deliveryOrderId },
                select: { salesOrderId: true },
            });
            const result = await reverseShipment(
                data.deliveryOrderId,
                session.user.id,
                data.reason,
            );

            revalidatePath('/sales/deliveries');
            revalidatePath(`/sales/deliveries/${data.deliveryOrderId}`);
            revalidatePath('/warehouse/outgoing');
            revalidatePath(`/warehouse/outgoing/${data.deliveryOrderId}`);
            revalidatePath('/sales/orders');
            if (doRecord?.salesOrderId) {
                revalidatePath(`/sales/orders/${doRecord.salesOrderId}`);
            }

            return result;
        });
    },
);
