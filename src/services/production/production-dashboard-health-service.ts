import type { BomCategory, MachineType, Role, Unit } from '@prisma/client';
import { prisma } from '@/lib/core/prisma';
import { AuthorizationError } from '@/lib/errors/errors';
import {
    PROCESS_KEYS,
    processKeyFromCategory,
    type ProcessKey,
} from '@/lib/production/process-keys';
import { aggregateTodayOutputItems } from '@/lib/production/live-overview';
import { executionScrapTotal } from '@/lib/production/execution-scrap';
import { isScrapAnomaly } from '@/lib/production/alert-thresholds';
import {
    assessMissingShift,
    missingShiftMessage,
} from '@/lib/production/shift-coverage';
import { formatWIB } from '@/lib/utils/timezone';
import type { ProductionAlertThresholds } from '@/lib/production/alert-thresholds';

export const PRODUCTION_DASHBOARD_SAMPLE_LIMIT = 5;
export const PRODUCTION_OUTPUT_SAMPLE_LIMIT = 6;
export const PRODUCTION_ATTENTION_SAMPLE_LIMIT = 12;
export const PRODUCTION_OUTPUT_ROW_LIMIT = 2_000;
export const PRODUCTION_SCRAP_ROW_LIMIT = 2_000;

export type ProductionDashboardResources = string[] | 'ALL';
export type ProductionDashboardSectionState = 'AVAILABLE' | 'UNAVAILABLE';

export type ProductionDashboardLinks = {
    outputReport: string | null;
    daily: string | null;
    orders: string | null;
    warehouseMaterials: string | null;
    kiosk: string | null;
};

export type ProductionExecutionRow = {
    quantityProduced: unknown;
    productionOrder: {
        id: string;
        bom: {
            category: BomCategory | null;
            productVariant: {
                id: string;
                name: string;
                skuCode: string;
                primaryUnit: Unit;
            };
        };
    };
};

export type ProductionShiftFact = {
    count: number;
    latestStartTime: Date | null;
    latestEndTime: Date | null;
};

export type ProductionActiveOrderRow = {
    id: string;
    orderNumber: string;
    plannedQuantity: unknown;
    actualQuantity: unknown;
    plannedEndDate: Date | null;
    actualStartDate: Date | null;
    createdAt: Date;
    bom: {
        category: BomCategory | null;
        productVariant: { name: string; primaryUnit: Unit };
    };
    machine: { code: string } | null;
    _count: { shifts: number };
    shifts: Array<{
        operatorId: string | null;
        startTime: Date;
        endTime: Date;
        operator: { name: string } | null;
    }>;
    executions: Array<{ startTime: Date }>;
};

export type ProductionDowntimeRow = {
    id: string;
    machineId: string;
    startTime: Date;
    reason: string;
    machine: { code: string; type: MachineType };
};

export type ProductionScrapExecutionRow = {
    productionOrderId: string;
    quantityProduced: unknown;
    scrapQuantity: unknown;
    scrapProngkolQty: unknown;
    scrapDaunQty: unknown;
};

export type ProductionIssueRow = {
    id: string;
    productionOrderId: string;
    description: string;
    reportedAt: Date;
    productionOrder: {
        orderNumber: string;
        bom: { category: BomCategory | null };
    };
};

export type ProductionWaitingMaterialRow = {
    id: string;
    orderNumber: string;
    createdAt: Date;
    bom: { category: BomCategory | null };
};

export type ProductionRunningOrder = {
    id: string;
    orderNumber: string;
    productName: string;
    machineCode: string;
    operatorName: string;
    plannedQty: number;
    actualQty: number;
    progress: number;
    isLate: boolean;
    processKey: ProcessKey;
    unit: string;
    startedAt: Date;
    estimatedDoneAt: Date | null;
};

export type ProductionAttentionItem = {
    type:
        | 'downtime'
        | 'waiting_material'
        | 'issue'
        | 'no_operator'
        | 'no_shift'
        | 'late'
        | 'high_scrap';
    severity: 'red' | 'amber';
    title: string;
    subtitle: string;
    orderId?: string;
    machineId?: string;
    ageMinutes: number;
    processKey: ProcessKey | 'ALL';
    href?: string;
    secondaryHref?: string;
    secondaryLabel?: string;
};

export type ProductionAttentionData = {
    state: ProductionDashboardSectionState;
    total: number | null;
    returned: number;
    items: ProductionAttentionItem[];
};

export type ProductionLiveOrdersData = {
    state: ProductionDashboardSectionState;
    total: number | null;
    lateTotal: number | null;
    returned: number;
    items: ProductionRunningOrder[];
};

export type ProductionOutputHealthData = {
    state: ProductionDashboardSectionState;
    totalGroups: number;
    returned: number;
    truncated: boolean;
    processTotals: Array<{
        processKey: ProcessKey;
        unit: string;
        quantity: number;
    }>;
    items: ReturnType<typeof aggregateTodayOutputItems>;
};

export type ProductionDowntimeData = {
    state: ProductionDashboardSectionState;
    total: number | null;
    thresholdMinutes: number | null;
    longest: {
        incidentId: string;
        machineId: string;
        machineCode: string;
        reason: string;
        minutes: number;
        severity: 'red' | 'amber';
        href?: string;
    } | null;
};

export type ProductionLateProcessDriver = {
    processKey: ProcessKey;
    lateCount: number;
    oldestDelayMinutes: number;
};

export type ProductionDriversData = {
    state: ProductionDashboardSectionState;
    longestDowntime: ProductionDowntimeData['longest'];
    lateProcess: ProductionLateProcessDriver | null;
};

function minutesSince(now: Date, date: Date): number {
    return Math.max(0, Math.floor((now.getTime() - date.getTime()) / 60_000));
}

function machineTypeToProcess(type: MachineType): ProcessKey | 'ALL' {
    if (type === 'MIXER') return 'MIXING';
    if (type === 'EXTRUDER' || type === 'REWINDER') return 'EXTRUSION';
    if (type === 'PACKER' || type === 'GRANULATOR') return 'PACKING';
    return 'ALL';
}

export async function resolveFreshProductionDashboardAccess(
    userId: string,
): Promise<{ resources: ProductionDashboardResources }> {
    const current = await prisma.user.findUnique({
        where: { id: userId },
        select: {
            isActive: true,
            isSuperAdmin: true,
            role: true,
            roles: { select: { role: true } },
        },
    });
    if (!current?.isActive || current.isSuperAdmin) {
        throw new AuthorizationError(
            'Akun Production tidak aktif atau bukan pengguna tenant.',
        );
    }

    const roles = [
        ...new Set([current.role, ...current.roles.map((entry) => entry.role)]),
    ] as Role[];
    if (roles.includes('ADMIN')) return { resources: 'ALL' };
    if (roles.includes('FACTORY_MANAGER')) {
        throw new AuthorizationError(
            'Factory Manager tetap menggunakan monitoring mobile atau nested.',
        );
    }
    if (!roles.some((role) => role === 'PRODUCTION' || role === 'PLANNING')) {
        throw new AuthorizationError(
            'Dashboard Production hanya untuk Admin, Production, atau Planning aktif.',
        );
    }

    const grants = await prisma.rolePermission.findMany({
        where: { role: { in: roles }, canAccess: true },
        select: { resource: true },
    });
    const resources = [...new Set(grants.map((grant) => grant.resource))];
    if (resources.includes('ALL')) return { resources: 'ALL' };
    if (!resources.includes('/production')) {
        throw new AuthorizationError(
            'Akses root /production diperlukan untuk membuka dashboard Production.',
        );
    }
    return { resources };
}

export function composeProductionOutputHealth(
    executions: readonly ProductionExecutionRow[],
    truncated: boolean,
): ProductionOutputHealthData {
    const allItems = aggregateTodayOutputItems(executions);
    const totals = new Map<
        string,
        { processKey: ProcessKey; unit: string; quantity: number }
    >();
    for (const item of allItems) {
        const key = `${item.processKey}:${item.unit}`;
        const total = totals.get(key) ?? {
            processKey: item.processKey,
            unit: item.unit,
            quantity: 0,
        };
        total.quantity += item.quantity;
        totals.set(key, total);
    }
    const processTotals = [...totals.values()].sort(
        (left, right) =>
            PROCESS_KEYS.indexOf(left.processKey) -
                PROCESS_KEYS.indexOf(right.processKey) ||
            left.unit.localeCompare(right.unit),
    );
    const items = allItems.slice(0, PRODUCTION_OUTPUT_SAMPLE_LIMIT);
    return {
        state: 'AVAILABLE',
        totalGroups: allItems.length,
        returned: items.length,
        truncated,
        processTotals,
        items,
    };
}

export function composeProductionLiveOrders(
    orders: readonly ProductionActiveOrderRow[],
    now: Date,
): ProductionLiveOrdersData {
    const ranked = orders.map((order) => {
        const plannedQty = Number(order.plannedQuantity ?? 0);
        const actualQty = Number(order.actualQuantity ?? 0);
        const progress = plannedQty > 0 ? (actualQty / plannedQty) * 100 : 0;
        const isLate = order.plannedEndDate
            ? order.plannedEndDate.getTime() < now.getTime()
            : false;
        const executionStarts = order.executions.map((execution) =>
            execution.startTime.getTime(),
        );
        const startedAt =
            order.actualStartDate ??
            (executionStarts.length > 0
                ? new Date(Math.min(...executionStarts))
                : order.createdAt);
        let estimatedDoneAt = order.plannedEndDate;
        const elapsedMs = now.getTime() - startedAt.getTime();
        if (actualQty > 0 && elapsedMs > 0) {
            const remaining = Math.max(0, plannedQty - actualQty);
            estimatedDoneAt = new Date(
                now.getTime() + remaining / (actualQty / elapsedMs),
            );
        }
        const item: ProductionRunningOrder = {
            id: order.id,
            orderNumber: order.orderNumber,
            productName: order.bom.productVariant.name,
            machineCode: order.machine?.code ?? 'N/A',
            operatorName: order.shifts[0]?.operator?.name ?? 'Unassigned',
            plannedQty,
            actualQty,
            progress,
            isLate,
            processKey: processKeyFromCategory(order.bom.category),
            unit: order.bom.productVariant.primaryUnit,
            startedAt,
            estimatedDoneAt,
        };
        return {
            item,
            lateMinutes:
                isLate && order.plannedEndDate
                    ? minutesSince(now, order.plannedEndDate)
                    : 0,
        };
    });

    ranked.sort((left, right) => {
        if (left.item.isLate !== right.item.isLate)
            return left.item.isLate ? -1 : 1;
        return (
            right.lateMinutes - left.lateMinutes ||
            right.item.progress - left.item.progress ||
            left.item.orderNumber.localeCompare(right.item.orderNumber) ||
            left.item.id.localeCompare(right.item.id)
        );
    });
    const items = ranked.map(({ item }) => item);

    return {
        state: 'AVAILABLE',
        total: items.length,
        lateTotal: items.filter((item) => item.isLate).length,
        returned: Math.min(items.length, PRODUCTION_DASHBOARD_SAMPLE_LIMIT),
        items: items.slice(0, PRODUCTION_DASHBOARD_SAMPLE_LIMIT),
    };
}

export function composeProductionDowntime(
    rows: readonly ProductionDowntimeRow[],
    now: Date,
    thresholds: ProductionAlertThresholds,
    machineHref: (machineId: string) => string | null,
): ProductionDowntimeData {
    const ranked = rows
        .map((row) => ({ row, minutes: minutesSince(now, row.startTime) }))
        .sort(
            (left, right) =>
                right.minutes - left.minutes ||
                left.row.id.localeCompare(right.row.id),
        );
    const first = ranked[0];
    return {
        state: 'AVAILABLE',
        total: rows.length,
        thresholdMinutes: thresholds.downtimeCriticalMinutes,
        longest: first
            ? {
                  incidentId: first.row.id,
                  machineId: first.row.machineId,
                  machineCode: first.row.machine.code,
                  reason: first.row.reason,
                  minutes: first.minutes,
                  severity:
                      first.minutes > thresholds.downtimeCriticalMinutes
                          ? 'red'
                          : 'amber',
                  href: machineHref(first.row.machineId) ?? undefined,
              }
            : null,
    };
}

export function composeLateProcessDriver(
    orders: readonly ProductionActiveOrderRow[],
    now: Date,
): ProductionLateProcessDriver | null {
    const byProcess = new Map<ProcessKey, ProductionLateProcessDriver>();
    for (const order of orders) {
        if (!order.plannedEndDate || order.plannedEndDate >= now) continue;
        const processKey = processKeyFromCategory(order.bom.category);
        const delay = minutesSince(now, order.plannedEndDate);
        const current = byProcess.get(processKey) ?? {
            processKey,
            lateCount: 0,
            oldestDelayMinutes: 0,
        };
        current.lateCount += 1;
        current.oldestDelayMinutes = Math.max(
            current.oldestDelayMinutes,
            delay,
        );
        byProcess.set(processKey, current);
    }
    return (
        [...byProcess.values()].sort(
            (left, right) =>
                right.lateCount - left.lateCount ||
                right.oldestDelayMinutes - left.oldestDelayMinutes ||
                PROCESS_KEYS.indexOf(left.processKey) -
                    PROCESS_KEYS.indexOf(right.processKey),
        )[0] ?? null
    );
}

export function composeProductionAttention(input: {
    now: Date;
    activeOrders: readonly ProductionActiveOrderRow[];
    downtimes: readonly ProductionDowntimeRow[];
    issues: readonly ProductionIssueRow[];
    waitingMaterials: readonly ProductionWaitingMaterialRow[];
    scrapExecutions: readonly ProductionScrapExecutionRow[];
    thresholds: ProductionAlertThresholds | null;
    shiftFacts: ReadonlyMap<string, ProductionShiftFact> | null;
    orderHref: (orderId: string) => string | null;
    machineHref: (machineId: string) => string | null;
    warehouseMaterialsHref: string | null;
}): ProductionAttentionData {
    const items: ProductionAttentionItem[] = [];
    if (input.thresholds) {
        for (const downtime of input.downtimes) {
            const ageMinutes = minutesSince(input.now, downtime.startTime);
            items.push({
                type: 'downtime',
                severity:
                    ageMinutes > input.thresholds.downtimeCriticalMinutes
                        ? 'red'
                        : 'amber',
                title: `Mesin ${downtime.machine.code} Downtime`,
                subtitle: `${downtime.reason} (Sejak ${formatWIB(downtime.startTime, 'HH:mm')})`,
                machineId: downtime.machineId,
                ageMinutes,
                processKey: machineTypeToProcess(downtime.machine.type),
                href: input.machineHref(downtime.machineId) ?? undefined,
            });
        }
    }
    for (const issue of input.issues) {
        items.push({
            type: 'issue',
            severity: 'red',
            title: `Isu SPK #${issue.productionOrder.orderNumber}`,
            subtitle: issue.description,
            orderId: issue.productionOrderId,
            ageMinutes: minutesSince(input.now, issue.reportedAt),
            processKey: processKeyFromCategory(
                issue.productionOrder.bom.category,
            ),
            href: input.orderHref(issue.productionOrderId) ?? undefined,
        });
    }
    const scrapByOrder = new Map<string, { produced: number; scrap: number }>();
    for (const execution of input.scrapExecutions) {
        const summary = scrapByOrder.get(execution.productionOrderId) ?? {
            produced: 0,
            scrap: 0,
        };
        summary.produced += Number(execution.quantityProduced ?? 0);
        summary.scrap += executionScrapTotal(execution);
        scrapByOrder.set(execution.productionOrderId, summary);
    }
    for (const order of input.activeOrders) {
        const processKey = processKeyFromCategory(order.bom.category);
        const href = input.orderHref(order.id) ?? undefined;
        const scrap = scrapByOrder.get(order.id);
        const scrapDenominator = (scrap?.produced ?? 0) + (scrap?.scrap ?? 0);
        if (input.thresholds && scrap && scrapDenominator > 0) {
            const scrapRatio = (scrap.scrap / scrapDenominator) * 100;
            if (isScrapAnomaly(input.thresholds, scrapRatio)) {
                items.push({
                    type: 'high_scrap',
                    severity: 'red',
                    title: `Scrap Tinggi SPK #${order.orderNumber}`,
                    subtitle: `Scrap ratio ${scrapRatio.toFixed(1)}% (${scrap.scrap.toFixed(0)} unit)`,
                    orderId: order.id,
                    ageMinutes: 0,
                    processKey,
                    href,
                });
            }
        }
        const assignedActiveShift = order.shifts[0];
        if (order._count.shifts > 0 && !assignedActiveShift?.operatorId) {
            items.push({
                type: 'no_operator',
                severity: 'amber',
                title: `SPK #${order.orderNumber} Tanpa Operator`,
                subtitle:
                    'Shift berjalan aktif tetapi belum ditugaskan operator',
                orderId: order.id,
                ageMinutes: minutesSince(input.now, order.createdAt),
                processKey,
                href,
            });
        }
        const shiftFact = input.shiftFacts?.get(order.id);
        if (shiftFact) {
            // `order.shifts` is the bounded current/recent window. The fact is
            // complete all-time existence plus the single latest window,
            // preventing a missing window from masquerading as "never had".
            const assessmentShifts =
                order._count.shifts > 0
                    ? [
                          assignedActiveShift ?? {
                              operatorId: null,
                              operator: null,
                              startTime: input.now,
                              endTime: input.now,
                          },
                      ]
                    : shiftFact.count > 0 &&
                        shiftFact.latestStartTime &&
                        shiftFact.latestEndTime
                      ? [
                            {
                                startTime: shiftFact.latestStartTime,
                                endTime: shiftFact.latestEndTime,
                            },
                        ]
                      : [];
            const missingShift = assessMissingShift({
                shifts: assessmentShifts,
                executions: order.executions,
                createdAt: order.createdAt,
                now: input.now,
            });
            if (missingShift.alert) {
                items.push({
                    type: 'no_shift',
                    severity: missingShift.severity,
                    title: `SPK #${order.orderNumber} Tanpa Shift Aktif`,
                    subtitle: missingShiftMessage(assessmentShifts, input.now),
                    orderId: order.id,
                    ageMinutes: missingShift.ageMinutes,
                    processKey,
                    href,
                    secondaryHref: href,
                    secondaryLabel: href ? 'Tambah Shift' : undefined,
                });
            }
        }
        if (order.plannedEndDate && order.plannedEndDate < input.now) {
            items.push({
                type: 'late',
                severity: 'amber',
                title: `SPK #${order.orderNumber} Terlambat`,
                subtitle: `Target selesai ${formatWIB(order.plannedEndDate, 'dd MMM HH:mm')} telah terlewati`,
                orderId: order.id,
                ageMinutes: minutesSince(input.now, order.plannedEndDate),
                processKey,
                href,
            });
        }
    }
    for (const order of input.waitingMaterials) {
        items.push({
            type: 'waiting_material',
            severity: 'amber',
            title: `SPK #${order.orderNumber} Tunggu Material`,
            subtitle: 'Menunggu rilis bahan baku ke lini produksi',
            orderId: order.id,
            ageMinutes: minutesSince(input.now, order.createdAt),
            processKey: processKeyFromCategory(order.bom.category),
            href: input.orderHref(order.id) ?? undefined,
            secondaryHref: input.warehouseMaterialsHref ?? undefined,
            secondaryLabel: input.warehouseMaterialsHref
                ? 'Bahan di Gudang'
                : undefined,
        });
    }

    items.sort((left, right) => {
        if (left.severity !== right.severity)
            return left.severity === 'red' ? -1 : 1;
        return (
            right.ageMinutes - left.ageMinutes ||
            left.type.localeCompare(right.type) ||
            left.title.localeCompare(right.title, 'id-ID')
        );
    });
    return {
        state: 'AVAILABLE',
        total: items.length,
        returned: Math.min(items.length, PRODUCTION_ATTENTION_SAMPLE_LIMIT),
        items: items.slice(0, PRODUCTION_ATTENTION_SAMPLE_LIMIT),
    };
}
