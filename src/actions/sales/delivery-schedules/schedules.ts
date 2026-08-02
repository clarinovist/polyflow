'use server';

import {
    withTenant,
    prisma,
    requireDeliveryAccess,
    requireSalesAccess,
    requireSalesApprover,
    safeAction,
    BusinessRuleError,
    NotFoundError,
    canTransitionSchedule,
    canActivateSchedule,
    canCloseSchedule,
    ScheduleStatus,
    Prisma,
    revalidatePath,
} from './shared';

// ============================================
// Helpers
// ============================================

function generateScheduleNumber(date: Date): string {
    const year = date.getFullYear();
    const d = new Date(
        Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
    );
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil(
        ((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
    );
    return `JADWAL-${year}-W${weekNo.toString().padStart(2, '0')}`;
}

function getWeekBounds(date: Date): { monday: Date; sunday: Date } {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d);
    monday.setDate(diff);
    monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);
    return { monday, sunday };
}

// ============================================
// Schedule Header (existing, updated)
// ============================================

/**
 * List all delivery schedules with trip and stop counts.
 */
export const getDeliverySchedules = withTenant(
    async function getDeliverySchedules(filters?: {
        status?: string;
        year?: number;
    }) {
        return safeAction(async () => {
            await requireDeliveryAccess();

            const where: Prisma.DeliveryScheduleWhereInput = {};
            if (filters?.status)
                where.status = filters.status as ScheduleStatus;
            if (filters?.year) {
                where.weekStart = { gte: new Date(`${filters.year}-01-01`) };
            }

            return prisma.deliverySchedule.findMany({
                where,
                include: {
                    trips: {
                        include: {
                            vehicle: {
                                select: {
                                    id: true,
                                    plateNumber: true,
                                    name: true,
                                    driverName: true,
                                    capacityKg: true,
                                },
                            },
                            orders: {
                                select: {
                                    id: true,
                                    status: true,
                                    deliveryOrderId: true,
                                },
                            },
                        },
                    },
                    createdBy: { select: { name: true } },
                },
                orderBy: { weekStart: 'desc' },
            });
        });
    },
);

/**
 * Get single delivery schedule with full details.
 */
export const getDeliverySchedule = withTenant(
    async function getDeliverySchedule(id: string) {
        return safeAction(async () => {
            await requireDeliveryAccess();

            const schedule = await prisma.deliverySchedule.findUnique({
                where: { id },
                include: {
                    trips: {
                        include: {
                            vehicle: true,
                            orders: {
                                include: {
                                    salesOrder: {
                                        include: {
                                            customer: {
                                                select: {
                                                    id: true,
                                                    name: true,
                                                },
                                            },
                                            items: {
                                                include: {
                                                    productVariant: {
                                                        select: {
                                                            id: true,
                                                            name: true,
                                                            skuCode: true,
                                                            primaryUnit: true,
                                                        },
                                                    },
                                                },
                                            },
                                        },
                                    },
                                    deliveryOrder: {
                                        include: {
                                            salesOrder: {
                                                include: {
                                                    customer: {
                                                        select: {
                                                            id: true,
                                                            name: true,
                                                        },
                                                    },
                                                    items: {
                                                        include: {
                                                            productVariant: {
                                                                select: {
                                                                    id: true,
                                                                    name: true,
                                                                    skuCode: true,
                                                                    primaryUnit: true,
                                                                },
                                                            },
                                                        },
                                                    },
                                                },
                                            },
                                        },
                                    },
                                },
                            },
                        },
                        orderBy: { sequence: 'asc' },
                    },
                    createdBy: { select: { name: true } },
                },
            });
            if (!schedule) throw new NotFoundError('Jadwal Kirim', id);
            return schedule;
        });
    },
);

/**
 * Create a new weekly delivery schedule.
 */
export const createDeliverySchedule = withTenant(
    async function createDeliverySchedule(data?: {
        weekStart?: Date;
        weekEnd?: Date;
        notes?: string;
    }) {
        return safeAction(async () => {
            const session = await requireSalesAccess();

            const now = data?.weekStart || new Date();
            const { monday, sunday } = getWeekBounds(now);

            const existing = await prisma.deliverySchedule.findFirst({
                where: {
                    weekStart: { lte: sunday },
                    weekEnd: { gte: monday },
                },
            });
            if (existing) {
                throw new BusinessRuleError(
                    `Sudah ada jadwal untuk minggu ini (${existing.scheduleNumber}). Edit jadwal yang sudah ada atau pilih minggu lain.`,
                );
            }

            const scheduleNumber = generateScheduleNumber(monday);

            const schedule = await prisma.deliverySchedule.create({
                data: {
                    scheduleNumber,
                    weekStart: monday,
                    weekEnd: sunday,
                    status: 'DRAFT',
                    notes: data?.notes || null,
                    createdById: session.user.id,
                },
            });

            revalidatePath('/sales/delivery-schedules');
            return schedule;
        });
    },
);

/**
 * Update schedule header (status + notes).
 * Status transitions use normalized values with guard checks.
 */
export const updateDeliverySchedule = withTenant(
    async function updateDeliverySchedule(
        id: string,
        data: { status?: ScheduleStatus; notes?: string },
    ) {
        return safeAction(async () => {
            await requireSalesAccess();

            const schedule = await prisma.deliverySchedule.findUnique({
                where: { id },
                include: {
                    trips: { select: { id: true, status: true } },
                },
            });
            if (!schedule) throw new NotFoundError('Jadwal Kirim', id);

            // Guard status transitions
            if (data.status && data.status !== schedule.status) {
                const transitionOk = canTransitionSchedule(
                    schedule.status,
                    data.status,
                );
                if (!transitionOk) {
                    throw new BusinessRuleError(
                        `Tidak bisa mengubah status dari "${schedule.status}" ke "${data.status}".`,
                    );
                }

                // Additional guards
                if (data.status === 'ACTIVE' || data.status === 'CONFIRMED') {
                    const guard = canActivateSchedule(schedule.trips.length);
                    if (guard.warning) {
                        // Soft warning — log but don't block
                        console.warn(`[schedule] ${guard.warning}`);
                    }
                }

                if (data.status === 'CLOSED' || data.status === 'COMPLETED') {
                    const guard = canCloseSchedule(schedule.trips);
                    if (!guard.ok) {
                        throw new BusinessRuleError(guard.error!);
                    }
                }
            }

            const updated = await prisma.deliverySchedule.update({
                where: { id },
                data: {
                    ...(data.status && { status: data.status }),
                    ...(data.notes !== undefined && { notes: data.notes }),
                },
            });

            revalidatePath('/sales/delivery-schedules');
            revalidatePath(`/sales/delivery-schedules/${id}`);
            return updated;
        });
    },
);

/**
 * Delete a delivery schedule.
 * Allowed only if there are no generated/linked Surat Jalans.
 */
export const deleteDeliverySchedule = withTenant(
    async function deleteDeliverySchedule(id: string) {
        return safeAction(async () => {
            await requireSalesApprover();

            const schedule = await prisma.deliverySchedule.findUnique({
                where: { id },
                include: {
                    trips: {
                        include: {
                            orders: true,
                        },
                    },
                },
            });
            if (!schedule) throw new NotFoundError('Jadwal Kirim', id);

            // Check if there are any generated/linked Surat Jalans
            const hasGeneratedSJ = schedule.trips.some((trip) =>
                trip.orders.some((order) => order.deliveryOrderId !== null),
            );
            if (hasGeneratedSJ) {
                throw new BusinessRuleError(
                    'Tidak dapat menghapus jadwal karena sudah ada Surat Jalan yang dibuat/dihubungkan. Batalkan atau hapus Surat Jalan terlebih dahulu.',
                );
            }

            // Safe to delete, Cascade onDelete handles the child records
            await prisma.deliverySchedule.delete({
                where: { id },
            });

            revalidatePath('/sales/delivery-schedules');
            return { success: true };
        });
    },
);

/**
 * Get board data for a specific week — sorted by day → run → stop sequence.
 * Returns flat list grouped by departureDate for board rendering.
 */
export const getDeliveryScheduleBoard = withTenant(
    async function getDeliveryScheduleBoard(scheduleId: string) {
        return safeAction(async () => {
            await requireDeliveryAccess();

            const schedule = await prisma.deliverySchedule.findUnique({
                where: { id: scheduleId },
                include: {
                    trips: {
                        include: {
                            vehicle: {
                                select: {
                                    id: true,
                                    plateNumber: true,
                                    name: true,
                                    driverName: true,
                                    capacityKg: true,
                                },
                            },
                            orders: {
                                include: {
                                    salesOrder: {
                                        include: {
                                            customer: {
                                                select: {
                                                    id: true,
                                                    name: true,
                                                },
                                            },
                                            items: {
                                                include: {
                                                    productVariant: {
                                                        select: {
                                                            id: true,
                                                            name: true,
                                                            skuCode: true,
                                                            primaryUnit: true,
                                                        },
                                                    },
                                                },
                                            },
                                        },
                                    },
                                    deliveryOrder: {
                                        select: {
                                            id: true,
                                            orderNumber: true,
                                            status: true,
                                        },
                                    },
                                    plannedItems: {
                                        include: {
                                            salesOrderItem: {
                                                include: {
                                                    productVariant: {
                                                        select: {
                                                            id: true,
                                                            name: true,
                                                            skuCode: true,
                                                            primaryUnit: true,
                                                        },
                                                    },
                                                },
                                            },
                                        },
                                    },
                                },
                                orderBy: { sequence: 'asc' },
                            },
                        },
                        orderBy: [
                            { departureDate: 'asc' },
                            { sequence: 'asc' },
                        ],
                    },
                    createdBy: { select: { name: true } },
                },
            });
            if (!schedule) throw new NotFoundError('Jadwal Kirim', scheduleId);
            return schedule;
        });
    },
);

export const closeOverdueDeliverySchedules = withTenant(
    async function closeOverdueDeliverySchedules(options?: {
        dryRun?: boolean;
        bufferDays?: number;
    }) {
        return safeAction(async () => {
            await requireSalesApprover();
            const { autoCloseExpiredDeliverySchedules } =
                await import('@/services/sales/delivery-schedule-auto-close');
            const result = await autoCloseExpiredDeliverySchedules({
                dryRun: options?.dryRun,
                bufferDays: options?.bufferDays ?? 2,
            });
            revalidatePath('/sales/delivery-schedules');
            return result;
        });
    },
);
