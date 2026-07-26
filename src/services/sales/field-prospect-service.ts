import { prisma } from "@/lib/core/prisma";
import { logActivity } from "@/lib/tools/audit";
import { getNextCustomerCode } from "@/actions/sales/customer";
import { BusinessRuleError } from "@/lib/errors/errors";

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
    conditions.push({ name: { contains: name, mode: "insensitive" as const } });
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
    const nearby = await prisma.$queryRawUnsafe<{ id: string; name: string; phone: string | null; distance: number }[]>(
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
export async function createProspectWithAssignment(
  input: CreateProspectInput,
) {
  const { name, phone, billingAddress, latitude, longitude, city, photoUrl, salesUserId } = input;

  return prisma.$transaction(async (tx) => {
    // Generate unique code
    const code = await getNextCustomerCode();

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
        lifecycleStatus: "PROSPECT",
        createdById: salesUserId,
        source: "FIELD_FIRST_VISIT",
      },
    });

    // Auto-assign to the sales rep
    await tx.customerSalesAssignment.create({
      data: {
        customerId: customer.id,
        userId: salesUserId,
        isPrimary: true,
        assignedById: salesUserId,
        notes: "Auto-assignment dari first visit",
      },
    });

    await logActivity({
      userId: salesUserId,
      action: "CUSTOMER_PROSPECT_CREATED",
      entityType: "Customer",
      entityId: customer.id,
      details: `Prospek baru "${customer.name}" dibuat dari first visit lapangan`,
    });

    return customer;
  });
}

/**
 * Verifies a prospect customer (back-office action).
 */
export async function verifyProspect(
  customerId: string,
  verifiedById: string,
) {
  return prisma.$transaction(async (tx) => {
    const customer = await tx.customer.findUnique({ where: { id: customerId } });
    if (!customer || customer.lifecycleStatus !== "PROSPECT") {
      throw new BusinessRuleError("Customer bukan prospect atau tidak ditemukan");
    }

    const updated = await tx.customer.update({
      where: { id: customerId },
      data: {
        lifecycleStatus: "ACTIVE",
        verifiedAt: new Date(),
        verifiedById,
      },
    });

    await logActivity({
      userId: verifiedById,
      action: "CUSTOMER_PROSPECT_VERIFIED",
      entityType: "Customer",
      entityId: customerId,
      details: `Prospek "${customer.name}" diverifikasi`,
    });

    return updated;
  });
}
