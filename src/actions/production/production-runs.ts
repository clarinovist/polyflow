'use server';

import { withTenant } from '@/lib/core/tenant';
import { safeAction, BusinessRuleError } from '@/lib/errors/errors';
import { requirePlanningRole } from '@/lib/tools/auth-checks';
import { createProductionRunSchema, cancelProductionRunSchema } from '@/lib/schemas/production-routing';
import type { CreateProductionRunValues, CancelProductionRunValues } from '@/lib/schemas/production-routing';
import { ProductionRoutingRunService } from '@/services/production/routing-run-service';
import { RoutingCostService } from '@/services/production/routing-cost-service';
import { revalidatePath } from 'next/cache';
import { serializeData } from '@/lib/utils/utils';
import { isRoutingEnabled } from '@/lib/production/routing-feature-flag';

export const listProductionRuns = withTenant(async function listProductionRuns(filter?: {
  productVariantId?: string;
  status?: 'DRAFT' | 'RELEASED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  routeId?: string;
  salesOrderId?: string;
  search?: string;
}) {
  return safeAction(async () => {
    await requirePlanningRole();
    const data = await ProductionRoutingRunService.listRuns(filter as never);
    return serializeData(data);
  });
});

export const getProductionRun = withTenant(async function getProductionRun(id: string) {
  return safeAction(async () => {
    await requirePlanningRole();
    const data = await ProductionRoutingRunService.getRunById(id);
    return serializeData(data);
  });
});

export const createProductionRun = withTenant(async function createProductionRun(raw: CreateProductionRunValues) {
  return safeAction(async () => {
    if (!(await isRoutingEnabled())) {
      throw new BusinessRuleError('Fitur routing belum diaktifkan untuk tenant ini.', undefined, 'ROUTING_DISABLED');
    }
    const session = await requirePlanningRole();
    const parsed = createProductionRunSchema.parse(raw);
    const result = await ProductionRoutingRunService.createRun({
      routeId: parsed.routeId,
      plannedQuantity: parsed.plannedQuantity,
      salesOrderId: parsed.salesOrderId,
      priority: parsed.priority,
      plannedStartDate: parsed.plannedStartDate,
      plannedEndDate: parsed.plannedEndDate,
      notes: parsed.notes,
      idempotencyKey: parsed.idempotencyKey ?? undefined,
      createdById: (session as { user?: { id?: string } })?.user?.id,
    });
    revalidatePath('/production/runs');
    revalidatePath('/production/orders');
    return serializeData(result);
  });
});

export const cancelProductionRun = withTenant(async function cancelProductionRun(raw: string | CancelProductionRunValues) {
  return safeAction(async () => {
    const session = await requirePlanningRole();
    const parsed = typeof raw === 'string' ? { id: raw, force: false } : cancelProductionRunSchema.parse(raw);
    const result = await ProductionRoutingRunService.cancelRun(parsed.id, (session as { user?: { id?: string } })?.user?.id, {
      force: parsed.force ?? false,
      reason: parsed.reason ?? undefined,
    });
    revalidatePath('/production/runs');
    revalidatePath(`/production/runs/${parsed.id}`);
    revalidatePath('/production/orders');
    return serializeData(result);
  });
});

export const getRunCost = withTenant(async function getRunCost(id: string) {
  return safeAction(async () => {
    await requirePlanningRole();
    const result = await RoutingCostService.computeRunCost(id);
    return serializeData(result);
  });
});

export const checkRunRmAvailability = withTenant(async function checkRunRmAvailability(id: string) {
  return safeAction(async () => {
    await requirePlanningRole();
    const result = await ProductionRoutingRunService.checkRmAvailability(id);
    return serializeData(result);
  });
});

export const getRunProgress = withTenant(async function getRunProgress(id: string) {
  return safeAction(async () => {
    await requirePlanningRole();
    const data = await ProductionRoutingRunService.computeRunProgress(id);
    return serializeData(data);
  });
});

export const getRunReadiness = withTenant(async function getRunReadiness(id: string) {
  return safeAction(async () => {
    await requirePlanningRole();
    const data = await ProductionRoutingRunService.computeRunReadiness(id);
    return serializeData(data);
  });
});
