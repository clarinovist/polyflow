'use server';

import { withTenant } from '@/lib/core/tenant';
import { safeAction, BusinessRuleError } from '@/lib/errors/errors';
import { requirePlanningRole } from '@/lib/tools/auth-checks';
import { isRoutingEnabled } from '@/lib/production/routing-feature-flag';
import {
    createProductionProcessSchema,
    updateProductionProcessSchema,
    createRouteSchema,
    updateRouteSchema,
    createRouteStepSchema,
    updateRouteStepSchema,
    reorderRouteStepsSchema,
    createMachineCapabilitySchema,
} from '@/lib/schemas/production-routing';

async function assertRoutingEnabled() {
    if (!(await isRoutingEnabled())) {
        throw new BusinessRuleError(
            'Fitur routing belum diaktifkan untuk tenant ini.',
            undefined,
            'ROUTING_DISABLED',
        );
    }
}
import type {
    CreateProductionProcessValues,
    UpdateProductionProcessValues,
    CreateRouteValues,
    UpdateRouteValues,
    CreateRouteStepValues,
    UpdateRouteStepValues,
    ReorderRouteStepsValues,
    CreateMachineCapabilityValues,
} from '@/lib/schemas/production-routing';
import { ProductionRoutingService } from '@/services/production/routing-service';
import { revalidatePath } from 'next/cache';
import { serializeData } from '@/lib/utils/utils';

// ── Process ───────────────────────────────────────────

export const listProcesses = withTenant(async function listProcesses(filter?: {
    isActive?: boolean;
    search?: string;
}) {
    return safeAction(async () => {
        await requirePlanningRole();
        const data = await ProductionRoutingService.listProcesses(filter);
        return serializeData(data);
    });
});

export const getProcess = withTenant(async function getProcess(id: string) {
    return safeAction(async () => {
        await requirePlanningRole();
        const data = await ProductionRoutingService.getProcessById(id);
        return serializeData(data);
    });
});

export const createProcess = withTenant(async function createProcess(
    raw: CreateProductionProcessValues,
) {
    return safeAction(async () => {
        await assertRoutingEnabled();
        await requirePlanningRole();
        const parsed = createProductionProcessSchema.parse(raw);
        const result = await ProductionRoutingService.createProcess(parsed);
        revalidatePath('/production/routings');
        return serializeData(result);
    });
});

export const updateProcess = withTenant(async function updateProcess(
    raw: UpdateProductionProcessValues,
) {
    return safeAction(async () => {
        await assertRoutingEnabled();
        await requirePlanningRole();
        const parsed = updateProductionProcessSchema.parse(raw);
        const { id, ...rest } = parsed;
        const result = await ProductionRoutingService.updateProcess(id, rest);
        revalidatePath('/production/routings');
        return serializeData(result);
    });
});

export const deleteProcess = withTenant(async function deleteProcess(
    id: string,
) {
    return safeAction(async () => {
        await assertRoutingEnabled();
        await requirePlanningRole();
        const result = await ProductionRoutingService.deleteProcess(id);
        revalidatePath('/production/routings');
        return serializeData(result);
    });
});

// ── Machine Capability ────────────────────────────────

export const listMachineCapabilities = withTenant(
    async function listMachineCapabilities(
        machineId?: string,
        processId?: string,
    ) {
        return safeAction(async () => {
            await requirePlanningRole();
            const data = await ProductionRoutingService.listMachineCapabilities(
                machineId,
                processId,
            );
            return serializeData(data);
        });
    },
);

export const addMachineCapability = withTenant(
    async function addMachineCapability(raw: CreateMachineCapabilityValues) {
        return safeAction(async () => {
            await assertRoutingEnabled();
            await requirePlanningRole();
            const parsed = createMachineCapabilitySchema.parse(raw);
            const result = await ProductionRoutingService.addCapability(
                parsed.machineId,
                parsed.processId,
                parsed.isPrimary,
            );
            revalidatePath('/production/routings');
            return serializeData(result);
        });
    },
);

export const removeMachineCapability = withTenant(
    async function removeMachineCapability(
        machineId: string,
        processId: string,
    ) {
        return safeAction(async () => {
            await assertRoutingEnabled();
            await requirePlanningRole();
            const result = await ProductionRoutingService.removeCapability(
                machineId,
                processId,
            );
            revalidatePath('/production/routings');
            return serializeData(result);
        });
    },
);

// ── Routes ────────────────────────────────────────────

export const listRoutes = withTenant(async function listRoutes(filter?: {
    productVariantId?: string;
    status?: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
    search?: string;
    isDefault?: boolean;
}) {
    return safeAction(async () => {
        await requirePlanningRole();
        const data = await ProductionRoutingService.listRoutes(filter as never);
        return serializeData(data);
    });
});

export const getRoute = withTenant(async function getRoute(id: string) {
    return safeAction(async () => {
        await requirePlanningRole();
        const data = await ProductionRoutingService.getRouteById(id);
        return serializeData(data);
    });
});

export const createRoute = withTenant(async function createRoute(
    raw: CreateRouteValues,
) {
    return safeAction(async () => {
        await assertRoutingEnabled();
        const session = await requirePlanningRole();
        const parsed = createRouteSchema.parse(raw);
        const result = await ProductionRoutingService.createRoute({
            ...parsed,
            createdById: (session as { user?: { id?: string } })?.user?.id,
        });
        revalidatePath('/production/routings');
        return serializeData(result);
    });
});

export const updateRoute = withTenant(async function updateRoute(
    raw: UpdateRouteValues,
) {
    return safeAction(async () => {
        await assertRoutingEnabled();
        const session = await requirePlanningRole();
        const parsed = updateRouteSchema.parse(raw);
        const { id, ...rest } = parsed;
        const result = await ProductionRoutingService.updateRoute(
            id,
            rest,
            (session as { user?: { id?: string } })?.user?.id,
        );
        revalidatePath('/production/routings');
        revalidatePath(`/production/routings/${id}`);
        return serializeData(result);
    });
});

export const duplicateRoute = withTenant(async function duplicateRoute(
    id: string,
) {
    return safeAction(async () => {
        await assertRoutingEnabled();
        const session = await requirePlanningRole();
        const result = await ProductionRoutingService.duplicateRoute(
            id,
            (session as { user?: { id?: string } })?.user?.id,
        );
        revalidatePath('/production/routings');
        return serializeData(result);
    });
});

export const deleteRoute = withTenant(async function deleteRoute(id: string) {
    return safeAction(async () => {
        await assertRoutingEnabled();
        await requirePlanningRole();
        const result = await ProductionRoutingService.deleteRoute(id);
        revalidatePath('/production/routings');
        return serializeData(result);
    });
});

export const validateRouteAction = withTenant(
    async function validateRouteAction(routeId: string) {
        return safeAction(async () => {
            await requirePlanningRole();
            const result =
                await ProductionRoutingService.validateRoute(routeId);
            return serializeData(result);
        });
    },
);

export const publishRoute = withTenant(async function publishRoute(
    routeId: string,
) {
    return safeAction(async () => {
        await assertRoutingEnabled();
        const session = await requirePlanningRole();
        const result = await ProductionRoutingService.publishRoute(
            routeId,
            (session as { user?: { id?: string } })?.user?.id,
        );
        revalidatePath('/production/routings');
        revalidatePath(`/production/routings/${routeId}`);
        return serializeData(result);
    });
});

export const archiveRoute = withTenant(async function archiveRoute(
    routeId: string,
) {
    return safeAction(async () => {
        await assertRoutingEnabled();
        await requirePlanningRole();
        const result = await ProductionRoutingService.archiveRoute(routeId);
        revalidatePath('/production/routings');
        return serializeData(result);
    });
});

export const setDefaultRoute = withTenant(async function setDefaultRoute(
    routeId: string,
) {
    return safeAction(async () => {
        await assertRoutingEnabled();
        await requirePlanningRole();
        const result = await ProductionRoutingService.setDefaultRoute(routeId);
        revalidatePath('/production/routings');
        revalidatePath(`/production/routings/${routeId}`);
        return serializeData(result);
    });
});

// ── Route Steps ──────────────────────────────────────

export const addRouteStep = withTenant(async function addRouteStep(
    raw: CreateRouteStepValues,
) {
    return safeAction(async () => {
        await assertRoutingEnabled();
        await requirePlanningRole();
        const parsed = createRouteStepSchema.parse(raw);
        const result = await ProductionRoutingService.addRouteStep(parsed);
        revalidatePath('/production/routings');
        revalidatePath(`/production/routings/${parsed.routeId}`);
        return serializeData(result);
    });
});

export const updateRouteStep = withTenant(async function updateRouteStep(
    raw: UpdateRouteStepValues,
) {
    return safeAction(async () => {
        await assertRoutingEnabled();
        await requirePlanningRole();
        const parsed = updateRouteStepSchema.parse(raw);
        const { id, ...rest } = parsed;
        const result = await ProductionRoutingService.updateRouteStep(
            id,
            rest as never,
        );
        revalidatePath('/production/routings');
        return serializeData(result);
    });
});

export const deleteRouteStep = withTenant(async function deleteRouteStep(
    id: string,
) {
    return safeAction(async () => {
        await assertRoutingEnabled();
        await requirePlanningRole();
        const result = await ProductionRoutingService.deleteRouteStep(id);
        revalidatePath('/production/routings');
        return serializeData(result);
    });
});

export const reorderRouteSteps = withTenant(async function reorderRouteSteps(
    raw: ReorderRouteStepsValues,
) {
    return safeAction(async () => {
        await assertRoutingEnabled();
        await requirePlanningRole();
        const parsed = reorderRouteStepsSchema.parse(raw);
        const result = await ProductionRoutingService.reorderSteps(
            parsed.routeId,
            parsed.orderedIds,
        );
        revalidatePath('/production/routings');
        revalidatePath(`/production/routings/${parsed.routeId}`);
        return serializeData(result);
    });
});
