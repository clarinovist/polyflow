'use server';

import { withTenant } from "@/lib/core/tenant";
import { prisma } from '@/lib/core/prisma';
import { requireAuth } from '@/lib/tools/auth-checks';
import { safeAction } from '@/lib/errors/errors';
import { Decimal } from "@prisma/client/runtime/library";
import { logActivity } from "@/lib/tools/audit";

type VisitLogInput = {
  customerId: string;
  checkInTime: string;
  checkOutTime: string;
  durationSeconds: number;
  latitude: number;
  longitude: number;
  distance: number;
  notes: string | null;
  photoUrl: string | null;
};

export const syncVisitLogsAction = withTenant(
  async function syncVisitLogsAction(logs: VisitLogInput[]) {
    return safeAction(async () => {
      const session = await requireAuth();
      const userId = session.user.id;

      // Batch insert into database using transaction
      const createdVisits = await prisma.$transaction(
        logs.map((log) =>
          prisma.salesVisit.create({
            data: {
              customerId: log.customerId,
              userId: userId,
              checkInTime: new Date(log.checkInTime),
              checkOutTime: new Date(log.checkOutTime),
              durationSeconds: log.durationSeconds,
              latitude: new Decimal(log.latitude),
              longitude: new Decimal(log.longitude),
              distance: log.distance,
              notes: log.notes,
              photoUrl: log.photoUrl,
            },
          })
        )
      );

      // Audit log for synced visits
      for (const visit of createdVisits) {
        await logActivity({
          userId,
          action: "VISIT_SYNCED",
          entityType: "SalesVisit",
          entityId: visit.id,
          details: `Kunjungan ke customer ${visit.customerId} disinkronisasi (${visit.durationSeconds}s)`,
        });
      }

      return { count: createdVisits.length };
    });
  }
);
