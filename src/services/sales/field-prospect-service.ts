import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/core/prisma';
import { logActivity } from '@/lib/tools/audit';
import { getNextCustomerCode } from '@/actions/sales/customer';
import { BusinessRuleError, ConflictError } from '@/lib/errors/errors';

const MAX_CODE_ATTEMPTS = 5;

/**
 * `getNextCustomerCode` reads-then-increments outside any lock, so two
 * field reps creating a prospect around the same time can both compute the
 * same next code. Detect that specific collision so the caller can retry
 * with a freshly recomputed code instead of surfacing a raw DB error.
 */
function isCustomerCodeUniqueViolation(error: unknown): boolean {
    return (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002' &&
        Array.isArray(error.meta?.target) &&
        error.meta.target.includes('code')
    );
}

type CreateProspectInput = {
    name: string;
    phone?: string;
    billingAddress?: string;
    latitude?: number;
    longitude?: number;
    city?: string;
    photoUrl?: string;
    salesUserId: string;
};

type DuplicateCheckResult = {
    isDuplicate: boolean;
    matches: {
        id: string;
        name: string;
        phone: string | null;
        distance: number | null;
    }[];
};

/**
 * Checks for duplicate customers based on phone, name, and nearby GPS.
 */
export async function checkCustomerDuplicate(
    name: string,
    phone?: string,
    latitude?: number,
    longitude?: number,
): Promise<DuplicateCheckResult> {
    const conditions: object[] = [];

    if (phone && phone.length >= 8) {
        conditions.push({ phone: { contains: phone } });
    }

    if (name && name.length >= 3) {
        conditions.push({
            name: { contains: name, mode: 'insensitive' as const },
        });
    }

    if (conditions.length === 0) {
        return { isDuplicate: false, matches: [] };
    }

    const matches = await prisma.customer.findMany({
        where: { OR: conditions } as never,
        select: {
            id: true,
            name: true,
            phone: true,
            latitude: true,
            longitude: true,
        },
        take: 5,
    });

    // Check nearby GPS matches
    if (latitude && longitude) {
        const nearby = await prisma.$queryRawUnsafe<
            {
                id: string;
                name: string;
                phone: string | null;
                distance: number;
            }[]
        >(
            `SELECT id, name, phone,
       ST_Distance(
         ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography,
         ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
       ) as distance
       FROM "Customer"
       WHERE latitude IS NOT NULL AND longitude IS NOT NULL
         AND ABS(latitude - $2) < 0.001
         AND ABS(longitude - $1) < 0.001
       ORDER BY distance ASC
       LIMIT 3`,
            longitude,
            latitude,
        );

        // Merge nearby results
        for (const n of nearby) {
            if (!matches.find((m) => m.id === n.id)) {
                matches.push({ ...n, latitude: null, longitude: null });
            }
        }
    }

    return {
        isDuplicate: matches.length > 0,
        matches: matches.map((m) => ({
            id: m.id,
            name: m.name,
            phone: m.phone,
            distance: (m as Record<string, unknown>).distance
                ? Number((m as Record<string, unknown>).distance)
                : null,
        })),
    };
}

/**
 * Creates a prospect customer, assigns to sales, all in one transaction.
 * Returns the created customer.
 */
export async function createProspectWithAssignment(input: CreateProspectInput) {
    const {
        name,
        phone,
        billingAddress,
        latitude,
        longitude,
        city,
        photoUrl,
        salesUserId,
    } = input;

    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
        // Generate unique code — recomputed fresh each attempt so a retry
        // sees the code committed by whichever request won the race.
        const code = await getNextCustomerCode();

        try {
            return await prisma.$transaction(async (tx) => {
                // Create customer prospect
                const customer = await tx.customer.create({
                    data: {
                        name: name.trim(),
                        code,
                        phone: phone?.trim() || null,
                        billingAddress: billingAddress?.trim() || null,
                        latitude: latitude ?? undefined,
                        longitude: longitude ?? undefined,
                        city: city?.trim() || null,
                        photoUrl,
                        lifecycleStatus: 'PROSPECT',
                        createdById: salesUserId,
                        source: 'FIELD_FIRST_VISIT',
                    },
                });

                // Auto-assign to the sales rep
                await tx.customerSalesAssignment.create({
                    data: {
                        customerId: customer.id,
                        userId: salesUserId,
                        isPrimary: true,
                        assignedById: salesUserId,
                        notes: 'Auto-assignment dari first visit',
                    },
                });

                await logActivity({
                    userId: salesUserId,
                    action: 'CUSTOMER_PROSPECT_CREATED',
                    entityType: 'Customer',
                    entityId: customer.id,
                    details: `Prospek baru "${customer.name}" dibuat dari first visit lapangan`,
                });

                return customer;
            });
        } catch (error) {
            if (!isCustomerCodeUniqueViolation(error)) {
                throw error;
            }
            if (attempt === MAX_CODE_ATTEMPTS - 1) {
                throw new ConflictError(
                    'Gagal membuat kode customer unik setelah beberapa percobaan',
                );
            }
            // Collision on `code` — loop and recompute a fresh one.
        }
    }

    throw new ConflictError(
        'Gagal membuat kode customer unik setelah beberapa percobaan',
    );
}

/**
 * Verifies a prospect customer (back-office action).
 */
export async function verifyProspect(customerId: string, verifiedById: string) {
    return prisma.$transaction(async (tx) => {
        const customer = await tx.customer.findUnique({
            where: { id: customerId },
        });
        if (!customer || customer.lifecycleStatus !== 'PROSPECT') {
            throw new BusinessRuleError(
                'Customer bukan prospect atau tidak ditemukan',
            );
        }

        const updated = await tx.customer.update({
            where: { id: customerId },
            data: {
                lifecycleStatus: 'ACTIVE',
                verifiedAt: new Date(),
                verifiedById,
            },
        });

        await logActivity({
            userId: verifiedById,
            action: 'CUSTOMER_PROSPECT_VERIFIED',
            entityType: 'Customer',
            entityId: customerId,
            details: `Prospek "${customer.name}" diverifikasi`,
        });

        return updated;
    });
}

/**
 * Lists prospect customers (lifecycleStatus = PROSPECT).
 */
export async function listProspects(page: number = 1, pageSize: number = 50) {
    const p = Math.max(1, page);
    const ps = Math.min(200, Math.max(1, pageSize));
    const skip = (p - 1) * ps;

    const where = { lifecycleStatus: 'PROSPECT' as const };

    const [customers, total] = await Promise.all([
        prisma.customer.findMany({
            where: where as never,
            orderBy: { createdAt: 'desc' },
            skip,
            take: ps,
        }),
        prisma.customer.count({ where: where as never }),
    ]);

    return {
        customers,
        total,
        page: p,
        pageSize: ps,
        totalPages: Math.ceil(total / ps),
    };
}

/**
 * Rejects a prospect: set lifecycleStatus = INACTIVE (no REJECTED in enum).
 */
export async function rejectProspect(customerId: string, rejectedById: string) {
    return prisma.$transaction(async (tx) => {
        const customer = await tx.customer.findUnique({
            where: { id: customerId },
        });
        if (!customer || customer.lifecycleStatus !== 'PROSPECT') {
            throw new BusinessRuleError(
                'Customer bukan prospect atau tidak ditemukan',
            );
        }

        const updated = await tx.customer.update({
            where: { id: customerId },
            data: {
                lifecycleStatus: 'INACTIVE',
            },
        });

        await logActivity({
            userId: rejectedById,
            action: 'CUSTOMER_PROSPECT_REJECTED',
            entityType: 'Customer',
            entityId: customerId,
            details: `Prospek "${customer.name}" ditolak`,
        });

        return updated;
    });
}
