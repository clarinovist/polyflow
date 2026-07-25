"use server";

import { withTenant } from "@/lib/core/tenant";
import { prisma } from "@/lib/core/prisma";
import { safeAction } from "@/lib/errors/errors";
import { requireAuth } from "@/lib/tools/auth-checks";

export interface StatusTimelineEntry {
  id: string;
  action: string;
  fromStatus: string | null;
  toStatus: string | null;
  details: string | null;
  createdAt: string;
  userName: string;
}

export const getEntityStatusTimeline = withTenant(
  async function getEntityStatusTimeline(
    entityType: string,
    entityId: string,
  ) {
    return safeAction(async () => {
      await requireAuth();

      const logs = await prisma.auditLog.findMany({
        where: {
          entityType,
          entityId,
        },
        include: {
          user: { select: { name: true } },
        },
        orderBy: { createdAt: "asc" },
      });

      return logs.map((log) => ({
        id: log.id,
        action: log.action,
        fromStatus: log.fromStatus,
        toStatus: log.toStatus,
        details: log.details,
        createdAt: log.createdAt.toISOString(),
        userName: log.user?.name ?? "System",
      }));
    });
  },
);
