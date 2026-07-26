'use server';

import { withTenant } from "@/lib/core/tenant";
import { requireAuth } from "@/lib/tools/auth-checks";
import { safeAction } from "@/lib/errors/errors";
import { syncVisitLogs } from "@/services/sales/field-visit-service";

type VisitLogInput = {
  clientId?: string;
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
};

export const syncVisitLogsAction = withTenant(
  async function syncVisitLogsAction(logs: VisitLogInput[]) {
    return safeAction(async () => {
      const session = await requireAuth();

      const results = await syncVisitLogs(
        session.user.id,
        logs.map((log) => ({
          clientVisitId: log.clientId || `legacy:${Date.now()}-${Math.random().toString(36).slice(2)}`,
          customerId: log.customerId,
          checkInTime: log.checkInTime,
          checkOutTime: log.checkOutTime,
          durationSeconds: log.durationSeconds,
          latitude: log.latitude,
          longitude: log.longitude,
          distance: log.distance,
          notes: log.notes,
          photoUrl: log.photoUrl,
          isExtraCall: log.isExtraCall,
          extraReason: log.extraReason,
          routePlanItemId: log.routePlanItemId,
        })),
      );

      return {
        count: results.filter((r) => r.success).length,
        results,
      };
    });
  }
);
