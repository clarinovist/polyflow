import { prisma } from '@/lib/core/prisma';
import { logActivity } from '@/lib/tools/audit';
import { Decimal } from '@prisma/client/runtime/library';
import { NotFoundError } from '@/lib/errors/errors';

type StartVisitInput = {
    userId: string;
    customerId: string;
    routePlanItemId?: string;
    latitude: number;
    longitude: number;
    distance: number;
    clientVisitId: string;
    isExtraCall?: boolean;
    extraReason?: string;
};

type CheckOutVisitInput = {
    userId: string;
    clientVisitId: string;
    notes: string;
    photoUrl?: string;
};

/**
 * Starts a visit session. Creates the visit record server-side
 * and links it to the route plan item if provided.
 */
export async function startFieldVisit(input: StartVisitInput) {
    const {
        userId,
        customerId,
        routePlanItemId,
        latitude,
        longitude,
        distance,
        clientVisitId,
        isExtraCall = false,
        extraReason,
    } = input;

    return prisma.$transaction(async (tx) => {
        // Check idempotency
        const existing = await tx.salesVisit.findUnique({
            where: { userId_clientVisitId: { userId, clientVisitId } },
        });

        if (existing) {
            return existing; // Already started
        }

        // Validate customer exists
        const customer = await tx.customer.findUnique({
            where: { id: customerId },
        });
        if (!customer) {
            throw new NotFoundError('Customer', customerId);
        }

        // Validate route plan item if provided
        if (routePlanItemId) {
            const routeItem = await tx.salesRoutePlanItem.findUnique({
                where: { id: routePlanItemId },
            });
            if (!routeItem) {
                throw new NotFoundError('Route Item', routePlanItemId);
            }
        }

        const now = new Date();
        // Set checkOutTime to now as placeholder; will be updated on actual checkout
        const visit = await tx.salesVisit.create({
            data: {
                customerId,
                userId,
                checkInTime: now,
                checkOutTime: now,
                durationSeconds: 0,
                latitude: new Decimal(latitude),
                longitude: new Decimal(longitude),
                distance,
                clientVisitId,
                routePlanItemId: routePlanItemId || undefined,
                isExtraCall,
                extraReason: isExtraCall
                    ? (extraReason as
                          | 'TOKO_BARU'
                          | 'DEKAT_RUTE'
                          | 'PERMINTAAN_DADAKAN'
                          | 'TOKO_TUTUP_GANTI')
                    : undefined,
            },
        });

        // Update route plan item status to VISITING
        if (routePlanItemId) {
            await tx.salesRoutePlanItem.update({
                where: { id: routePlanItemId },
                data: { status: 'VISITING' },
            });
        }

        await logActivity({
            userId,
            action: 'VISIT_STARTED',
            entityType: 'SalesVisit',
            entityId: visit.id,
            details: `Check-in ke ${customer.name}${isExtraCall ? ' (Extra Call)' : ''}`,
        });

        return visit;
    });
}

/**
 * Checks out a visit session. Updates duration, notes, photo,
 * and marks route plan item as COMPLETED.
 */
export async function completeFieldVisit(input: CheckOutVisitInput) {
    const { userId, clientVisitId, notes, photoUrl } = input;

    return prisma.$transaction(async (tx) => {
        const visit = await tx.salesVisit.findUnique({
            where: { userId_clientVisitId: { userId, clientVisitId } },
            include: { routePlanItem: true },
        });

        if (!visit) {
            throw new NotFoundError('Kunjungan', clientVisitId);
        }

        const now = new Date();
        const durationSeconds = Math.floor(
            (now.getTime() - visit.checkInTime.getTime()) / 1000,
        );

        const updated = await tx.salesVisit.update({
            where: { id: visit.id },
            data: {
                checkOutTime: now,
                durationSeconds,
                notes: notes || null,
                photoUrl: photoUrl || null,
            },
        });

        // Complete route plan item if linked
        if (visit.routePlanItemId && visit.routePlanItem) {
            await tx.salesRoutePlanItem.update({
                where: { id: visit.routePlanItemId },
                data: { status: 'COMPLETED' },
            });
        }

        await logActivity({
            userId,
            action: 'VISIT_COMPLETED',
            entityType: 'SalesVisit',
            entityId: visit.id,
            details: `Check-out durasi ${durationSeconds}s`,
        });

        return updated;
    });
}

/**
 * Syncs offline visit logs with idempotency.
 * Returns the result for each client visit.
 */
export async function syncVisitLogs(
    userId: string,
    logs: {
        clientVisitId: string;
        customerId: string;
        checkInTime: string;
        checkOutTime: string;
        durationSeconds: number;
        latitude: number;
        longitude: number;
        distance: number;
        notes: string | null;
        photoUrl: string | null;
        isExtraCall?: boolean;
        extraReason?: string;
        routePlanItemId?: string;
    }[],
) {
    const results: {
        clientVisitId: string;
        success: boolean;
        visitId?: string;
        error?: string;
    }[] = [];

    for (const log of logs) {
        try {
            // Check idempotency
            const existing = await prisma.salesVisit.findUnique({
                where: {
                    userId_clientVisitId: {
                        userId,
                        clientVisitId: log.clientVisitId,
                    },
                },
            });

            if (existing) {
                results.push({
                    clientVisitId: log.clientVisitId,
                    success: true,
                    visitId: existing.id,
                });
                continue;
            }

            const visit = await prisma.salesVisit.create({
                data: {
                    customerId: log.customerId,
                    userId,
                    checkInTime: new Date(log.checkInTime),
                    checkOutTime: new Date(log.checkOutTime),
                    durationSeconds: log.durationSeconds,
                    latitude: new Decimal(log.latitude),
                    longitude: new Decimal(log.longitude),
                    distance: log.distance,
                    notes: log.notes,
                    photoUrl: log.photoUrl,
                    clientVisitId: log.clientVisitId,
                    isExtraCall: log.isExtraCall ?? false,
                    extraReason: log.extraReason
                        ? (log.extraReason as
                              | 'TOKO_BARU'
                              | 'DEKAT_RUTE'
                              | 'PERMINTAAN_DADAKAN'
                              | 'TOKO_TUTUP_GANTI')
                        : undefined,
                    routePlanItemId: log.routePlanItemId || undefined,
                },
            });

            // Complete route item if linked
            if (log.routePlanItemId) {
                await prisma.salesRoutePlanItem.update({
                    where: { id: log.routePlanItemId },
                    data: { status: 'COMPLETED' },
                });
            }

            await logActivity({
                userId,
                action: 'VISIT_SYNCED',
                entityType: 'SalesVisit',
                entityId: visit.id,
                details: `Kunjungan sync dari offline (${log.durationSeconds}s)`,
            });

            results.push({
                clientVisitId: log.clientVisitId,
                success: true,
                visitId: visit.id,
            });
        } catch (error) {
            results.push({
                clientVisitId: log.clientVisitId,
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    }

    return results;
}
