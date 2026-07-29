import { prisma } from '@/lib/core/prisma';
import { ProductionRouteStatus } from '@prisma/client';
import {
  BusinessRuleError,
  NotFoundError,
  ValidationError,
} from '@/lib/errors/errors';
import {
  validateRouteContinuity,
  type ValidateRouteInput,
  type RouteValidationIssue,
} from './routing-readiness-policy';

function nextCode(prefix: string): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}-${date}-${rand}`;
}

export class ProductionRoutingService {
  // ── Process ──────────────────────────────────────────

  static async listProcesses(filter?: { isActive?: boolean; search?: string }) {
    return prisma.productionProcess.findMany({
      where: {
        ...(filter?.isActive !== undefined ? { isActive: filter.isActive } : {}),
        ...(filter?.search
          ? {
              OR: [
                { code: { contains: filter.search, mode: 'insensitive' as const } },
                { name: { contains: filter.search, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
      orderBy: [{ isActive: 'desc' }, { code: 'asc' }],
      include: { _count: { select: { capabilities: true, routeSteps: true } } },
    });
  }

  static async getProcessById(id: string) {
    const p = await prisma.productionProcess.findUnique({ where: { id }, include: { capabilities: { include: { machine: true } } } });
    if (!p) throw new NotFoundError('ProductionProcess', id);
    return p;
  }

  static async createProcess(data: {
    code: string;
    name: string;
    description?: string | null;
    requiresMachine?: boolean;
    requiresQualityGate?: boolean;
  }) {
    const exists = await prisma.productionProcess.findUnique({ where: { code: data.code } });
    if (exists) throw new BusinessRuleError(`Process code ${data.code} sudah ada`, undefined, 'ROUTE_DUPLICATE_CODE');
    return prisma.productionProcess.create({ data: { ...data, code: data.code.toUpperCase() } });
  }

  static async updateProcess(
    id: string,
    data: Partial<{ code: string; name: string; description: string | null; requiresMachine: boolean; requiresQualityGate: boolean; isActive: boolean }>,
  ) {
    await this.getProcessById(id);
    if (data.code) {
      const dup = await prisma.productionProcess.findFirst({ where: { code: data.code.toUpperCase(), NOT: { id } } });
      if (dup) throw new BusinessRuleError(`Process code ${data.code} sudah ada`, undefined, 'ROUTE_DUPLICATE_CODE');
      data.code = data.code.toUpperCase();
    }
    return prisma.productionProcess.update({ where: { id }, data });
  }

  static async deleteProcess(id: string) {
    const p = await this.getProcessById(id);
    const used = await prisma.productionRouteStep.count({ where: { processId: id } });
    if (used > 0) throw new BusinessRuleError(`Process ${p.code} masih dipakai di ${used} route step`, undefined, 'ROUTE_PROCESS_IN_USE');
    await prisma.machineProcessCapability.deleteMany({ where: { processId: id } });
    return prisma.productionProcess.delete({ where: { id } });
  }

  // ── Machine capability ───────────────────────────────

  static async setMachineCapabilities(
    machineId: string,
    processIds: string[],
    primaryProcessId?: string | null,
  ) {
    const machine = await prisma.machine.findUnique({ where: { id: machineId } });
    if (!machine) throw new NotFoundError('Machine', machineId);

    return prisma.$transaction(async (tx) => {
      await tx.machineProcessCapability.deleteMany({ where: { machineId } });
      if (processIds.length === 0) return [];
      const rows = processIds.map((pid) => ({
        id: `${machineId.slice(0, 8)}-${pid.slice(0, 8)}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        machineId,
        processId: pid,
        isPrimary: pid === primaryProcessId,
      }));
      // Use createMany but need valid uuids - generate proper
      const created = [];
      for (const r of rows) {
        const rec = await tx.machineProcessCapability.create({
          data: {
            machineId: r.machineId,
            processId: r.processId,
            isPrimary: r.isPrimary,
          },
        });
        created.push(rec);
      }
      return created;
    });
  }

  static async listMachineCapabilities(machineId?: string, processId?: string) {
    return prisma.machineProcessCapability.findMany({
      where: {
        ...(machineId ? { machineId } : {}),
        ...(processId ? { processId } : {}),
      },
      include: { machine: true, process: true },
    });
  }

  static async addCapability(machineId: string, processId: string, isPrimary = false) {
    const exists = await prisma.machineProcessCapability.findUnique({
      where: { machineId_processId: { machineId, processId } },
    });
    if (exists) throw new BusinessRuleError('Capability sudah ada', undefined, 'ROUTE_CAPABILITY_EXISTS');
    return prisma.machineProcessCapability.create({ data: { machineId, processId, isPrimary } });
  }

  static async removeCapability(machineId: string, processId: string) {
    return prisma.machineProcessCapability.delete({
      where: { machineId_processId: { machineId, processId } },
    });
  }

  // ── Route CRUD ───────────────────────────────────────

  static async listRoutes(filter?: {
    productVariantId?: string;
    status?: ProductionRouteStatus;
    search?: string;
    isDefault?: boolean;
  }) {
    return prisma.productionRoute.findMany({
      where: {
        ...(filter?.productVariantId ? { productVariantId: filter.productVariantId } : {}),
        ...(filter?.status ? { status: filter.status } : {}),
        ...(filter?.isDefault !== undefined ? { isDefault: filter.isDefault } : {}),
        ...(filter?.search
          ? {
              OR: [
                { code: { contains: filter.search, mode: 'insensitive' as const } },
                { name: { contains: filter.search, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
      orderBy: [{ productVariantId: 'asc' }, { version: 'desc' }],
      include: {
        productVariant: { select: { id: true, name: true, skuCode: true, product: { select: { name: true } } } },
        steps: {
          orderBy: { sequence: 'asc' },
          include: { process: true, bom: { select: { id: true, name: true, productVariantId: true, isActive: true } } },
        },
        _count: { select: { steps: true, runs: true } },
      },
    });
  }

  static async getRouteById(id: string) {
    const route = await prisma.productionRoute.findUnique({
      where: { id },
      include: {
        productVariant: { select: { id: true, name: true, skuCode: true, product: { select: { name: true } } } },
        steps: {
          orderBy: { sequence: 'asc' },
          include: {
            process: true,
            bom: {
              select: {
                id: true,
                name: true,
                productVariantId: true,
                isActive: true,
                outputQuantity: true,
                items: { select: { productVariantId: true } },
              },
            },
            materialSourceLocation: true,
            outputLocation: true,
          },
        },
        _count: { select: { runs: true } },
      },
    });
    if (!route) throw new NotFoundError('ProductionRoute', id);
    return route;
  }

  static async createRoute(data: {
    productVariantId: string;
    name: string;
    code?: string;
    isDefault?: boolean;
    notes?: string | null;
    createdById?: string;
  }) {
    const variant = await prisma.productVariant.findUnique({ where: { id: data.productVariantId } });
    if (!variant) throw new NotFoundError('ProductVariant', data.productVariantId);

    const lastRoute = await prisma.productionRoute.findFirst({
      where: { productVariantId: data.productVariantId },
      orderBy: { version: 'desc' },
    });
    const nextVersion = (lastRoute?.version ?? 0) + 1;
    const code = data.code ?? nextCode(`RT-${variant.skuCode.slice(0, 6)}`);

    return prisma.$transaction(async (tx) => {
      // I3: draft default must NOT unset active default — only ACTIVE routes can be default
      if (data.isDefault) {
        // Only unset active defaults if this draft is being created as ACTIVE (not possible at create) or we allow draft to become default after publish
        // For MVP: creating draft with isDefault=true is allowed but does NOT unset active default until publish.
        // So we do NOT unset here — unset happens at publish time.
        // If creator explicitly passes isDefault but route is DRAFT, keep false until publish.
        // Only if they create as ACTIVE via direct (shouldn't), unset.
      }

      return tx.productionRoute.create({
        data: {
          code,
          name: data.name,
          productVariantId: data.productVariantId,
          version: nextVersion,
          // Draft routes cannot be default initially — default only set at publish/setDefault
          isDefault: false,
          notes: data.notes,
          createdById: data.createdById,
        },
      });
    });
  }

  static async updateRoute(
    id: string,
    data: { name?: string; isDefault?: boolean; notes?: string | null },
    _actorId?: string,
  ) {
    const route = await this.getRouteById(id);
    if (route.status !== 'DRAFT') {
      throw new BusinessRuleError('Hanya route DRAFT yang bisa diedit. Duplicate sebagai versi baru.', undefined, 'ROUTE_VERSION_IMMUTABLE');
    }

    // I3: draft cannot become default — prevent unsetting active default by editing draft
    if (data.isDefault === true) {
      throw new BusinessRuleError('Draft tidak bisa jadi default. Publish dulu lalu set default.', undefined, 'ROUTE_DEFAULT_CONFLICT');
    }

    return prisma.$transaction(async (tx) => {
      return tx.productionRoute.update({ where: { id }, data: { name: data.name, notes: data.notes } });
    });
  }

  static async duplicateRoute(id: string, actorId?: string) {
    const route = await this.getRouteById(id);
    const lastRoute = await prisma.productionRoute.findFirst({
      where: { productVariantId: route.productVariantId },
      orderBy: { version: 'desc' },
    });
    const nextVersion = (lastRoute?.version ?? 0) + 1;

    return prisma.$transaction(async (tx) => {
      const newRoute = await tx.productionRoute.create({
        data: {
          code: nextCode(`RT-${route.productVariant.skuCode.slice(0, 6)}`),
          name: `${route.name} v${nextVersion}`,
          productVariantId: route.productVariantId,
          version: nextVersion,
          status: 'DRAFT',
          isDefault: false,
          notes: route.notes,
          createdById: actorId,
        },
      });

      for (const step of route.steps) {
        await tx.productionRouteStep.create({
          data: {
            routeId: newRoute.id,
            sequence: step.sequence,
            stepCode: step.stepCode,
            label: step.label,
            processId: step.processId,
            bomId: step.bomId,
            materialSourceLocationId: step.materialSourceLocationId,
            outputLocationId: step.outputLocationId,
            requiresQualityGate: step.requiresQualityGate,
            allowsPartialHandoff: step.allowsPartialHandoff,
            queueTimeMinutes: step.queueTimeMinutes,
            setupTimeMinutes: step.setupTimeMinutes,
          },
        });
      }

      return newRoute;
    });
  }

  static async deleteRoute(id: string) {
    const route = await this.getRouteById(id);
    if (route.status !== 'DRAFT') {
      throw new BusinessRuleError('Hanya DRAFT route yang bisa dihapus', undefined, 'ROUTE_VERSION_IMMUTABLE');
    }
    if (route._count.runs > 0) {
      throw new BusinessRuleError('Route sudah punya production runs, tidak bisa dihapus. Archive saja.', undefined, 'ROUTE_HAS_RUNS');
    }
    await prisma.productionRouteStep.deleteMany({ where: { routeId: id } });
    return prisma.productionRoute.delete({ where: { id } });
  }

  // ── Route Steps ──────────────────────────────────────

  static async addRouteStep(data: {
    routeId: string;
    stepCode: string;
    label: string;
    processId: string;
    bomId: string;
    materialSourceLocationId?: string | null;
    outputLocationId?: string | null;
    requiresQualityGate?: boolean;
    allowsPartialHandoff?: boolean;
    queueTimeMinutes?: number | null;
    setupTimeMinutes?: number | null;
  }) {
    const route = await prisma.productionRoute.findUnique({ where: { id: data.routeId } });
    if (!route) throw new NotFoundError('ProductionRoute', data.routeId);
    if (route.status !== 'DRAFT') throw new BusinessRuleError('Hanya DRAFT route yang bisa tambah step', undefined, 'ROUTE_VERSION_IMMUTABLE');

    const process = await prisma.productionProcess.findUnique({ where: { id: data.processId } });
    if (!process) throw new NotFoundError('ProductionProcess', data.processId);

    const bom = await prisma.bom.findUnique({ where: { id: data.bomId }, include: { items: true } });
    if (!bom) throw new NotFoundError('Bom', data.bomId);
    if (!bom.isActive) throw new BusinessRuleError('BOM tidak aktif', undefined, 'ROUTE_INACTIVE_BOM');

    const lastStep = await prisma.productionRouteStep.findFirst({
      where: { routeId: data.routeId },
      orderBy: { sequence: 'desc' },
    });
    const nextSeq = (lastStep?.sequence ?? -1) + 1;

    return prisma.productionRouteStep.create({
      data: {
        routeId: data.routeId,
        sequence: nextSeq,
        stepCode: data.stepCode.toUpperCase(),
        label: data.label,
        processId: data.processId,
        bomId: data.bomId,
        materialSourceLocationId: data.materialSourceLocationId,
        outputLocationId: data.outputLocationId,
        requiresQualityGate: data.requiresQualityGate ?? false,
        allowsPartialHandoff: data.allowsPartialHandoff ?? false,
        queueTimeMinutes: data.queueTimeMinutes,
        setupTimeMinutes: data.setupTimeMinutes,
      },
    });
  }

  static async updateRouteStep(
    id: string,
    data: Partial<{
      stepCode: string;
      label: string;
      processId: string;
      bomId: string;
      materialSourceLocationId: string | null;
      outputLocationId: string | null;
      requiresQualityGate: boolean;
      allowsPartialHandoff: boolean;
      queueTimeMinutes: number | null;
      setupTimeMinutes: number | null;
      sequence: number;
    }>,
  ) {
    const step = await prisma.productionRouteStep.findUnique({ where: { id }, include: { route: true } });
    if (!step) throw new NotFoundError('ProductionRouteStep', id);
    if (step.route.status !== 'DRAFT') throw new BusinessRuleError('Hanya DRAFT route yang bisa edit step', undefined, 'ROUTE_VERSION_IMMUTABLE');

    if (data.stepCode) data.stepCode = data.stepCode.toUpperCase();

    return prisma.productionRouteStep.update({ where: { id }, data });
  }

  static async deleteRouteStep(id: string) {
    const step = await prisma.productionRouteStep.findUnique({ where: { id }, include: { route: true } });
    if (!step) throw new NotFoundError('ProductionRouteStep', id);
    if (step.route.status !== 'DRAFT') throw new BusinessRuleError('Hanya DRAFT route yang bisa hapus step', undefined, 'ROUTE_VERSION_IMMUTABLE');

    await prisma.productionRouteStep.delete({ where: { id } });

    // Re-normalize sequences
    const remaining = await prisma.productionRouteStep.findMany({
      where: { routeId: step.routeId },
      orderBy: { sequence: 'asc' },
    });
    for (let i = 0; i < remaining.length; i++) {
      if (remaining[i].sequence !== i) {
        await prisma.productionRouteStep.update({ where: { id: remaining[i].id }, data: { sequence: i } });
      }
    }
  }

  static async reorderSteps(routeId: string, orderedIds: string[]) {
    const route = await prisma.productionRoute.findUnique({ where: { id: routeId } });
    if (!route) throw new NotFoundError('ProductionRoute', routeId);
    if (route.status !== 'DRAFT') throw new BusinessRuleError('Hanya DRAFT route yang bisa reorder', undefined, 'ROUTE_VERSION_IMMUTABLE');

    const existing = await prisma.productionRouteStep.findMany({ where: { routeId } });
    if (existing.length !== orderedIds.length) {
      throw new ValidationError(`Jumlah orderedIds (${orderedIds.length}) tidak sama dengan steps (${existing.length})`);
    }

    // I4: uniqueness check
    const seen = new Set<string>();
    for (const oid of orderedIds) {
      if (seen.has(oid)) throw new ValidationError(`orderedIds mengandung duplikat: ${oid}`);
      seen.add(oid);
    }

    const existingIds = new Set(existing.map((s) => s.id));
    for (const oid of orderedIds) {
      if (!existingIds.has(oid)) throw new ValidationError(`Step ${oid} bukan bagian dari route`);
    }

    return prisma.$transaction(async (tx) => {
      for (const s of existing) {
        await tx.productionRouteStep.update({ where: { id: s.id }, data: { sequence: -1 - s.sequence } });
      }
      for (let i = 0; i < orderedIds.length; i++) {
        await tx.productionRouteStep.update({ where: { id: orderedIds[i] }, data: { sequence: i } });
      }
      return tx.productionRouteStep.findMany({ where: { routeId }, orderBy: { sequence: 'asc' } });
    });
  }

  // ── Validation & Publish ─────────────────────────────

  static async validateRoute(routeId: string): Promise<{ valid: boolean; issues: RouteValidationIssue[] }> {
    const route = await this.getRouteById(routeId);

    const processIds = route.steps.map((s) => s.processId);
    const capabilities = await prisma.machineProcessCapability.findMany({
      where: { processId: { in: processIds } },
      select: { processId: true },
    });
    const capableSet = new Set(capabilities.map((c) => c.processId));

    // Detect risky locations by slug heuristics
    const isRiskySlug = (slug?: string | null) => {
      if (!slug) return false;
      const s = slug.toLowerCase();
      return s.includes('rm_warehouse') || s.includes('gudang-bahan-baku') || s === 'gudang-packaging' || s.includes('inactive');
    };

    const input: ValidateRouteInput = {
      finalProductVariantId: route.productVariantId,
      steps: route.steps.map((s) => ({
        stepCode: s.stepCode,
        sequence: s.sequence,
        bomId: s.bomId,
        bomOutputVariantId: s.bom.productVariantId,
        bomIsActive: s.bom.isActive,
        processCode: s.process.code,
        processIsActive: s.process.isActive,
        processRequiresMachine: s.process.requiresMachine,
        materialSourceLocationId: s.materialSourceLocationId,
        outputLocationId: s.outputLocationId,
        sourceLocationActive: s.materialSourceLocation ? true : undefined,
        outputLocationActive: s.outputLocation ? true : undefined,
        isRiskyOutput: isRiskySlug(s.outputLocation?.slug) || false,
        isRiskySource: isRiskySlug(s.materialSourceLocation?.slug) || false,
        bomItems: s.bom.items.map((bi) => ({ productVariantId: bi.productVariantId })),
        hasCapableMachine: capableSet.has(s.processId) || !s.process.requiresMachine,
      })),
    };

    const issues = validateRouteContinuity(input);
    return { valid: issues.filter((i) => i.severity === 'BLOCKING').length === 0, issues };
  }

  static async publishRoute(routeId: string, actorId?: string) {
    const route = await this.getRouteById(routeId);
    if (route.status !== 'DRAFT') throw new BusinessRuleError('Hanya DRAFT yang bisa dipublish', undefined, 'ROUTE_VERSION_IMMUTABLE');

    const { valid, issues } = await this.validateRoute(routeId);
    if (!valid) {
      throw new BusinessRuleError(
        `Route tidak valid: ${issues
          .filter((i) => i.severity === 'BLOCKING')
          .map((i) => i.message)
          .join('; ')}`,
        { issues },
        'ROUTE_VALIDATION_FAILED',
      );
    }

    return prisma.$transaction(async (tx) => {
      // If route was marked isDefault in draft (legacy rows) or isDefault true, unset others on publish
      if (route.isDefault) {
        await tx.productionRoute.updateMany({
          where: { productVariantId: route.productVariantId, isDefault: true, status: 'ACTIVE', NOT: { id: routeId } },
          data: { isDefault: false },
        });
      }

      return tx.productionRoute.update({
        where: { id: routeId },
        data: {
          status: 'ACTIVE',
          publishedAt: new Date(),
          publishedById: actorId,
        },
      });
    });
  }

  static async archiveRoute(routeId: string) {
    const route = await this.getRouteById(routeId);
    if (route.status === 'ARCHIVED') return route;
    // Allow archive from DRAFT or ACTIVE

    return prisma.productionRoute.update({
      where: { id: routeId },
      data: { status: 'ARCHIVED', isDefault: false },
    });
  }

  static async setDefaultRoute(routeId: string) {
    const route = await this.getRouteById(routeId);
    if (route.status !== 'ACTIVE') throw new BusinessRuleError('Hanya ACTIVE route yang bisa jadi default', undefined, 'ROUTE_DEFAULT_CONFLICT');

    return prisma.$transaction(async (tx) => {
      await tx.productionRoute.updateMany({
        where: { productVariantId: route.productVariantId, isDefault: true, NOT: { id: routeId } },
        data: { isDefault: false },
      });
      return tx.productionRoute.update({ where: { id: routeId }, data: { isDefault: true } });
    });
  }

  // ── Helpers for UI ───────────────────────────────────

  static async getActiveRouteByVariant(productVariantId: string) {
    return prisma.productionRoute.findFirst({
      where: { productVariantId, status: 'ACTIVE', isDefault: true },
      include: {
        steps: { orderBy: { sequence: 'asc' }, include: { process: true, bom: { select: { id: true, name: true, productVariantId: true, outputQuantity: true } } } },
      },
    });
  }

  static async listActiveRoutesByVariant(productVariantId: string) {
    return prisma.productionRoute.findMany({
      where: { productVariantId, status: 'ACTIVE' },
      orderBy: [{ isDefault: 'desc' }, { version: 'desc' }],
      include: { steps: { orderBy: { sequence: 'asc' }, include: { process: true } } },
    });
  }
}
