"use server";

import { withTenant } from "@/lib/core/tenant";
import { prisma } from "@/lib/core/prisma";
import { requireAuth } from "@/lib/tools/auth-checks";
import { safeAction, NotFoundError } from "@/lib/errors/errors";
import { logActivity } from "@/lib/tools/audit";
import { revalidatePath } from "next/cache";

// ── Types ────────────────────────────────────────────────────────────

type RoutePlanItemInput = {
  customerId: string;
  sortOrder: number;
};

type CreateRoutePlanInput = {
  date: string; // ISO date string
  userId: string;
  items: RoutePlanItemInput[];
};

type UpdateRoutePlanInput = {
  id: string;
  items: RoutePlanItemInput[];
  status?: "DRAFT" | "PUBLISHED";
};

// ── Get route plan for a specific date + rep ────────────────────────

export const getRoutePlan = withTenant(
  async function getRoutePlan(date: string, userId: string) {
    return safeAction(async () => {
      await requireAuth();

      const plan = await prisma.salesRoutePlan.findUnique({
        where: {
          date_userId: {
            date: new Date(date),
            userId,
          },
        },
        include: {
          items: {
            orderBy: { sortOrder: "asc" },
            include: {
              customer: {
                select: {
                  id: true,
                  name: true,
                  code: true,
                  city: true,
                  latitude: true,
                  longitude: true,
                },
              },
            },
          },
          user: {
            select: { id: true, name: true },
          },
        },
      });

      return plan;
    });
  },
);

// ── Get today's route plan for current user ──────────────────────────

export const getTodayRoutePlan = withTenant(
  async function getTodayRoutePlan() {
    return safeAction(async () => {
      const session = await requireAuth();
      const userId = session.user.id;

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const plan = await prisma.salesRoutePlan.findUnique({
        where: {
          date_userId: {
            date: today,
            userId,
          },
        },
        include: {
          items: {
            orderBy: { sortOrder: "asc" },
            include: {
              customer: {
                select: {
                  id: true,
                  name: true,
                  code: true,
                  city: true,
                },
              },
            },
          },
        },
      });

      return plan;
    });
  },
);

// ── List route plans (admin view — filter by date range + rep) ──────

export const listRoutePlans = withTenant(
  async function listRoutePlans(filters: {
    startDate?: string;
    endDate?: string;
    userId?: string;
  }) {
    return safeAction(async () => {
      await requireAuth();

      const where: Record<string, unknown> = {};
      if (filters.startDate || filters.endDate) {
        where.date = {};
        if (filters.startDate) {
          (where.date as Record<string, unknown>).gte = new Date(filters.startDate);
        }
        if (filters.endDate) {
          (where.date as Record<string, unknown>).lte = new Date(filters.endDate);
        }
      }
      if (filters.userId) {
        where.userId = filters.userId;
      }

      const plans = await prisma.salesRoutePlan.findMany({
        where,
        include: {
          items: {
            orderBy: { sortOrder: "asc" },
            include: {
              customer: {
                select: {
                  id: true,
                  name: true,
                  code: true,
                  city: true,
                },
              },
            },
          },
          user: {
            select: { id: true, name: true },
          },
        },
        orderBy: { date: "desc" },
        take: 50,
      });

      return plans;
    });
  },
);

// ── Create route plan ───────────────────────────────────────────────

export const createRoutePlan = withTenant(
  async function createRoutePlan(data: CreateRoutePlanInput) {
    return safeAction(async () => {
      const session = await requireAuth();
      const userId = session.user.id;

      const plan = await prisma.salesRoutePlan.upsert({
        where: {
          date_userId: {
            date: new Date(data.date),
            userId: data.userId,
          },
        },
        update: {
          items: {
            deleteMany: {},
            create: data.items.map((item) => ({
              customerId: item.customerId,
              sortOrder: item.sortOrder,
              status: "PENDING",
            })),
          },
          createdBy: userId,
        },
        create: {
          date: new Date(data.date),
          userId: data.userId,
          createdBy: userId,
          items: {
            create: data.items.map((item) => ({
              customerId: item.customerId,
              sortOrder: item.sortOrder,
              status: "PENDING",
            })),
          },
        },
        include: {
          items: {
            orderBy: { sortOrder: "asc" },
            include: {
              customer: {
                select: { id: true, name: true, code: true, city: true },
              },
            },
          },
          user: { select: { id: true, name: true } },
        },
      });

      await logActivity({
        userId,
        action: "ROUTE_PLAN_CREATED",
        entityType: "SalesRoutePlan",
        entityId: plan.id,
        details: `Rute ${data.date} untuk ${data.userId}: ${data.items.length} toko`,
      });

      revalidatePath("/sales/routes");
      revalidatePath("/field/sales");
      return plan;
    });
  },
);

// ── Publish route plan (DRAFT → PUBLISHED) ──────────────────────────

export const publishRoutePlan = withTenant(
  async function publishRoutePlan(id: string) {
    return safeAction(async () => {
      const session = await requireAuth();
      const userId = session.user.id;

      const plan = await prisma.salesRoutePlan.findUnique({ where: { id } });
      if (!plan) throw new NotFoundError("Route plan tidak ditemukan");

      const updated = await prisma.salesRoutePlan.update({
        where: { id },
        data: { status: "PUBLISHED" },
        include: {
          items: {
            orderBy: { sortOrder: "asc" },
            include: {
              customer: {
                select: { id: true, name: true, code: true, city: true },
              },
            },
          },
          user: { select: { id: true, name: true } },
        },
      });

      await logActivity({
        userId,
        action: "ROUTE_PLAN_PUBLISHED",
        entityType: "SalesRoutePlan",
        entityId: id,
        details: `Rute ${plan.date.toISOString().split("T")[0]} dipublikasikan`,
      });

      revalidatePath("/sales/routes");
      revalidatePath("/field/sales");
      return updated;
    });
  },
);

// ── Update route plan items ─────────────────────────────────────────

export const updateRoutePlanItems = withTenant(
  async function updateRoutePlanItems(data: UpdateRoutePlanInput) {
    return safeAction(async () => {
      const session = await requireAuth();
      const userId = session.user.id;

      const plan = await prisma.salesRoutePlan.findUnique({ where: { id: data.id } });
      if (!plan) throw new NotFoundError("Route plan tidak ditemukan");

      const updated = await prisma.salesRoutePlan.update({
        where: { id: data.id },
        data: {
          ...(data.status ? { status: data.status } : {}),
          items: {
            deleteMany: {},
            create: data.items.map((item) => ({
              customerId: item.customerId,
              sortOrder: item.sortOrder,
              status: "PENDING",
            })),
          },
        },
        include: {
          items: {
            orderBy: { sortOrder: "asc" },
            include: {
              customer: {
                select: { id: true, name: true, code: true, city: true },
              },
            },
          },
          user: { select: { id: true, name: true } },
        },
      });

      await logActivity({
        userId,
        action: "ROUTE_PLAN_UPDATED",
        entityType: "SalesRoutePlan",
        entityId: data.id,
        details: `Rute diperbarui: ${data.items.length} toko`,
      });

      revalidatePath("/sales/routes");
      revalidatePath("/field/sales");
      return updated;
    });
  },
);

// ── Delete route plan ───────────────────────────────────────────────

export const deleteRoutePlan = withTenant(
  async function deleteRoutePlan(id: string) {
    return safeAction(async () => {
      const session = await requireAuth();
      const userId = session.user.id;

      const plan = await prisma.salesRoutePlan.findUnique({ where: { id } });
      if (!plan) throw new NotFoundError("Route plan tidak ditemukan");

      await prisma.salesRoutePlan.delete({ where: { id } });

      await logActivity({
        userId,
        action: "ROUTE_PLAN_DELETED",
        entityType: "SalesRoutePlan",
        entityId: id,
        details: `Rute ${plan.date.toISOString().split("T")[0]} dihapus`,
      });

      revalidatePath("/sales/routes");
      revalidatePath("/field/sales");
      return { success: true };
    });
  },
);

// ── Copy last week (same weekday) ─────────────────────────────────

export const copyLastWeekRoute = withTenant(
  async function copyLastWeekRoute(date: string, userId: string) {
    return safeAction(async () => {
      await requireAuth();

      const targetDate = new Date(date);
      const lastWeek = new Date(targetDate);
      lastWeek.setDate(lastWeek.getDate() - 7);

      const lastWeekPlan = await prisma.salesRoutePlan.findUnique({
        where: {
          date_userId: { date: lastWeek, userId },
        },
        include: { items: { orderBy: { sortOrder: "asc" } } },
      });

      if (!lastWeekPlan || lastWeekPlan.items.length === 0) {
        throw new NotFoundError("Rute minggu lalu tidak ditemukan");
      }

      const plan = await prisma.salesRoutePlan.upsert({
        where: {
          date_userId: { date: targetDate, userId },
        },
        update: {
          items: {
            deleteMany: {},
            create: lastWeekPlan.items.map((item, idx) => ({
              customerId: item.customerId,
              sortOrder: idx + 1,
              status: "PENDING",
            })),
          },
        },
        create: {
          date: targetDate,
          userId,
          createdBy: (await requireAuth()).user.id,
          items: {
            create: lastWeekPlan.items.map((item, idx) => ({
              customerId: item.customerId,
              sortOrder: idx + 1,
              status: "PENDING",
            })),
          },
        },
        include: {
          items: {
            orderBy: { sortOrder: "asc" },
            include: { customer: { select: { id: true, name: true, code: true, city: true } } },
          },
          user: { select: { id: true, name: true } },
        },
      });

      revalidatePath("/sales/routes");
      revalidatePath("/field/sales");
      return plan;
    });
  },
);

// ── Import from Excel (parse client-side, send customerCodes) ───────

export const importRouteExcel = withTenant(
  async function importRouteExcel(data: {
    date: string;
    userId: string;
    customerCodes: string[];
  }) {
    return safeAction(async () => {
      const session = await requireAuth();
      const userId = session.user.id;

      const customers = await prisma.customer.findMany({
        where: {
          code: { in: data.customerCodes },
          isActive: true,
        },
        select: { id: true, code: true },
      });

      const codeToId = new Map(customers.map((c) => [c.code, c.id]));
      const items: RoutePlanItemInput[] = [];

      for (const code of data.customerCodes) {
        const id = codeToId.get(code);
        if (id) {
          items.push({ customerId: id, sortOrder: items.length + 1 });
        }
      }

      if (items.length === 0) {
        throw new NotFoundError("Tidak ada customer yang cocok dari file Excel");
      }

      const plan = await prisma.salesRoutePlan.upsert({
        where: {
          date_userId: { date: new Date(data.date), userId: data.userId },
        },
        update: {
          items: {
            deleteMany: {},
            create: items.map((item) => ({
              customerId: item.customerId,
              sortOrder: item.sortOrder,
              status: "PENDING",
            })),
          },
          createdBy: userId,
        },
        create: {
          date: new Date(data.date),
          userId: data.userId,
          createdBy: userId,
          items: {
            create: items.map((item) => ({
              customerId: item.customerId,
              sortOrder: item.sortOrder,
              status: "PENDING",
            })),
          },
        },
        include: {
          items: {
            orderBy: { sortOrder: "asc" },
            include: { customer: { select: { id: true, name: true, code: true, city: true } } },
          },
          user: { select: { id: true, name: true } },
        },
      });

      await logActivity({
        userId,
        action: "ROUTE_PLAN_IMPORTED",
        entityType: "SalesRoutePlan",
        entityId: plan.id,
        details: `Import Excel: ${items.length} toko dari ${data.customerCodes.length} kode`,
      });

      revalidatePath("/sales/routes");
      revalidatePath("/field/sales");
      return plan;
    });
  },
);

// ── Nearest-neighbor route optimization ────────────────────────────

function haversineDistance(
  lat1: number, lon1: number, lat2: number, lon2: number
): number {
  const R = 6371e3;
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const dPhi = ((lat2 - lat1) * Math.PI) / 180;
  const dLambda = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dPhi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export const optimizeRouteNearestNeighbor = withTenant(
  async function optimizeRouteNearestNeighbor(id: string) {
    return safeAction(async () => {
      await requireAuth();

      const plan = await prisma.salesRoutePlan.findUnique({
        where: { id },
        include: {
          items: {
            include: {
              customer: {
                select: { id: true, latitude: true, longitude: true },
              },
            },
          },
        },
      });
      if (!plan) throw new NotFoundError("Route plan tidak ditemukan");

      const items = plan.items.filter(
        (i) => i.customer.latitude != null && i.customer.longitude != null
      );
      if (items.length <= 1) return plan;

      // Nearest-neighbor from first item
      const sorted: typeof items = [items[0]];
      const remaining = items.slice(1);

      while (remaining.length > 0) {
        const last = sorted[sorted.length - 1];
        const lastLat = Number(last.customer.latitude);
        const lastLng = Number(last.customer.longitude);

        let bestIdx = 0;
        let bestDist = Infinity;
        for (let i = 0; i < remaining.length; i++) {
          const d = haversineDistance(
            lastLat, lastLng,
            Number(remaining[i].customer.latitude!),
            Number(remaining[i].customer.longitude!)
          );
          if (d < bestDist) {
            bestDist = d;
            bestIdx = i;
          }
        }
        sorted.push(remaining[bestIdx]);
        remaining.splice(bestIdx, 1);
      }

      // Reassign sortOrder
      for (let i = 0; i < sorted.length; i++) {
        await prisma.salesRoutePlanItem.update({
          where: { id: sorted[i].id },
          data: { sortOrder: i + 1 },
        });
      }

      revalidatePath("/sales/routes");
      revalidatePath("/field/sales");
      return plan;
    });
  },
);

// ── Compliance KPI: EC stats for a rep on a date ──────────────────

export const getRouteComplianceStats = withTenant(
  async function getRouteComplianceStats(date: string, userId: string) {
    return safeAction(async () => {
      await requireAuth();

      const planDate = new Date(date);
      const plan = await prisma.salesRoutePlan.findUnique({
        where: { date_userId: { date: planDate, userId } },
        include: { items: true },
      });

      if (!plan) {
        return { assigned: 0, visited: 0, extraCalls: 0, compliance: 0 };
      }

      const assigned = plan.items.length;
      const visited = plan.items.filter(
        (i) => i.status === "COMPLETED" || i.status === "VISITING"
      ).length;
      const extraCalls = plan.items.filter((i) => i.isExtraCall).length;

      return {
        assigned,
        visited,
        extraCalls,
        compliance: assigned > 0 ? Math.round(((visited - extraCalls) / assigned) * 100) : 0,
      };
    });
  },
);

// ── Fetch server visits (for merge with local) ─────────────────────

export const getServerVisits = withTenant(
  async function getServerVisits(date?: string) {
    return safeAction(async () => {
      const session = await requireAuth();
      const userId = session.user.id;

      const where: Record<string, unknown> = { userId };
      if (date) {
        const d = new Date(date);
        const nextDay = new Date(d);
        nextDay.setDate(nextDay.getDate() + 1);
        where.checkInTime = { gte: d, lt: nextDay };
      }

      const visits = await prisma.salesVisit.findMany({
        where,
        include: {
          customer: { select: { id: true, name: true } },
        },
        orderBy: { checkInTime: "desc" },
        take: 50,
      });

      return visits.map((v) => ({
        id: v.id,
        customerId: v.customerId,
        customerName: v.customer?.name ?? "-",
        checkInTime: v.checkInTime.toISOString(),
        checkOutTime: v.checkOutTime.toISOString(),
        durationSeconds: v.durationSeconds,
        distance: v.distance,
        notes: v.notes,
        photoUrl: v.photoUrl,
        synced: true,
      }));
    });
  },
);
