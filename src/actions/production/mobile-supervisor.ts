'use server';

/* eslint-disable @typescript-eslint/no-explicit-any */
import { withTenant } from '@/lib/core/tenant';
import { prisma } from '@/lib/core/prisma';
import { safeAction, AuthorizationError } from '@/lib/errors/errors';
import { requireAuth } from '@/lib/tools/auth-checks';
import { serializeData } from '@/lib/utils/utils';
import {
    getWibDayBounds,
    toBusinessDateString,
    parseBusinessDate,
} from '@/lib/utils/timezone';
import { hasAnyRole } from '@/lib/auth/roles';

export type TargetUnitMode = 'MIXED' | 'SINGLE' | 'NONE';

export interface MobileSupervisorOverview {
    generatedAt: string;
    highlights: {
        activeOrdersCount: number;
        outputToday: number;
        /** Sum of plannedQuantity for non-cancelled SPKs planned today; null when unavailable. */
        targetToday: number | null;
        /** Unit comparability of the daily target aggregate. */
        targetUnitMode: TargetUnitMode;
        /** Output unit when all planned SPKs share one unit, else null. */
        targetUnit: string | null;
        downtimeMinutesToday: number;
        scrapToday: number;
        qcPendingCount: number;
    };
    recentOrders: Array<{
        id: string;
        spkNumber: string;
        productName: string;
        status: string;
        progressPercent: number;
    }>;
    downtimeAlerts: Array<{
        id: string;
        machineName: string;
        reason: string;
        durationMinutes: number;
        startTime: string;
    }>;
}

/** Actionable SPK list for mobile supervisor — extends recentOrders with machine/target. */
export interface MobileSupervisorSpkItem {
    id: string;
    spkNumber: string;
    productName: string;
    productCode: string;
    status: string;
    priority: string;
    progressPercent: number;
    plannedQty: number;
    actualQty: number;
    machineId: string | null;
    machineName: string | null;
    machineCode: string | null;
    locationName: string | null;
    plannedStartDate: string;
}

export interface MobileSupervisorSpkList {
    generatedAt: string;
    items: MobileSupervisorSpkItem[];
}

export interface MobileTeamAttendanceFilters {
    date: string; // YYYY-MM-DD
    workShiftId?: string;
    status?: 'PRESENT' | 'ABSENT' | 'ON_LEAVE' | 'ALL';
    q?: string;
    role?: string; // OPERATOR / HELPER / PACKER / etc or ALL
}

export interface MobileTeamAttendanceRecord {
    id: string | null;
    employeeId: string;
    employeeName: string;
    employeeCode: string;
    employeeRole: string;
    workDate: string;
    workShiftId: string | null;
    shiftName: string | null;
    clockInAt: string | null;
    clockOutAt: string | null;
    status: 'PRESENT' | 'ABSENT' | 'ON_LEAVE' | 'NO_RECORD';
    actualHours: number | null;
    isLate: boolean | null;
    source: string | null;
}

export interface MobileTeamAttendanceResult {
    generatedAt: string;
    date: string;
    workDate: string;
    totalEmployees: number;
    presentCount: number;
    absentCount: number;
    onLeaveCount: number;
    noRecordCount: number;
    shifts: Array<{ id: string; name: string }>;
    records: MobileTeamAttendanceRecord[];
}

export interface MobileQuickSpkFormData {
    boms: Array<{
        id: string;
        name: string;
        category: string;
        productVariantId: string;
        productVariantName: string;
        productName: string;
        skuCode: string;
        isDefault: boolean;
    }>;
    machines: Array<{
        id: string;
        name: string;
        code: string;
        type: string;
        status: string;
    }>;
}

function assertSupervisorAccess(user: {
    role?: string;
    roles?: string[];
    isSuperAdmin?: boolean;
}) {
    const allowed =
        hasAnyRole(user, ['PRODUCTION', 'PLANNING', 'ADMIN']) ||
        !!user.isSuperAdmin;
    if (!allowed) {
        throw new AuthorizationError(
            'Hanya supervisor produksi, planning, atau admin yang dapat mengakses data ini.',
        );
    }
}

export const getProductionSupervisorOverview = withTenant(
    async function getProductionSupervisorOverview() {
        return safeAction(async () => {
            const session = await requireAuth();
            assertSupervisorAccess(session.user as never);

            const todayStr = toBusinessDateString(new Date());
            const { startOfDay, endOfDay } = getWibDayBounds(todayStr);

            const [orders, executions, downtimes, qcPending, targetOrders] =
                await Promise.all([
                    prisma.productionOrder
                        ? prisma.productionOrder.findMany({
                              where: {
                                  status: {
                                      in: ['IN_PROGRESS', 'RELEASED', 'DRAFT'],
                                  },
                              },
                              take: 10,
                              orderBy: { updatedAt: 'desc' },
                              include: {
                                  bom: { select: { name: true } },
                              },
                          }).catch(() => [])
                        : Promise.resolve([]),
                    prisma.productionExecution
                        ? prisma.productionExecution.aggregate({
                              where: { createdAt: { gte: startOfDay } },
                              _sum: {
                                  quantityProduced: true,
                                  scrapQuantity: true,
                              },
                          }).catch(() => ({
                              _sum: {
                                  quantityProduced: null,
                                  scrapQuantity: null,
                              },
                          }))
                        : Promise.resolve({
                              _sum: {
                                  quantityProduced: null,
                                  scrapQuantity: null,
                              },
                          }),
                    prisma.machineDowntime
                        ? prisma.machineDowntime.findMany({
                              where: { createdAt: { gte: startOfDay } },
                              take: 5,
                              orderBy: { createdAt: 'desc' },
                              include: { machine: { select: { name: true } } },
                          }).catch(() => [])
                        : Promise.resolve([]),
                    prisma.qualityInspection
                        ? prisma.qualityInspection.count({
                              where: { result: 'QUARANTINE' },
                          }).catch(() => 0)
                        : Promise.resolve(0),
                    // Daily target aggregate — separate from the recent-order
                    // list so take:10 never truncates the planned-day total.
                    prisma.productionOrder
                        ? prisma.productionOrder
                              .findMany({
                                  where: {
                                      status: { not: 'CANCELLED' },
                                      plannedStartDate: {
                                          gte: startOfDay,
                                          lte: endOfDay,
                                      },
                                  },
                                  select: {
                                      plannedQuantity: true,
                                      bom: {
                                          select: {
                                              productVariant: {
                                                  select: {
                                                      primaryUnit: true,
                                                  },
                                              },
                                          },
                                      },
                                  },
                              })
                              .catch(() => null)
                        : Promise.resolve([]),
                ]);

            const activeOrdersCount = orders.filter((o) => o.status === 'IN_PROGRESS').length;
            const outputToday = Number(executions._sum?.quantityProduced ?? 0);
            const scrapToday = Number(executions._sum?.scrapQuantity ?? 0);

            let targetToday: number | null = null;
            let targetUnitMode: TargetUnitMode = 'NONE';
            let targetUnit: string | null = null;
            if (targetOrders) {
                const units = new Set<string>(
                    targetOrders
                        .map((o) => o.bom?.productVariant?.primaryUnit)
                        .filter((u): u is NonNullable<typeof u> => u != null)
                        .map(String),
                );
                targetToday = targetOrders.reduce(
                    (sum, o) => sum + Number(o.plannedQuantity),
                    0,
                );
                if (units.size > 1) {
                    targetUnitMode = 'MIXED';
                } else if (units.size === 1) {
                    targetUnitMode = 'SINGLE';
                    targetUnit = units.values().next().value ?? null;
                }
            }

            const getDowntimeMinutes = (d: { startTime: Date; endTime: Date | null }) => {
                if (!d.endTime) return 15;
                return Math.max(
                    1,
                    Math.round(
                        (new Date(d.endTime).getTime() -
                            new Date(d.startTime).getTime()) /
                            60000,
                    ),
                );
            };

            const totalDowntimeMinutes = downtimes.reduce(
                (sum, d) => sum + getDowntimeMinutes(d),
                0,
            );

            const recentOrders = orders.map((o) => {
                const target = Number(o.plannedQuantity ?? 1);
                const actual = Number(o.actualQuantity ?? 0);
                const progress =
                    target > 0
                        ? Math.min(100, Math.round((actual / target) * 100))
                        : 0;
                return {
                    id: o.id,
                    spkNumber: o.orderNumber || o.id.substring(0, 8),
                    productName: o.bom?.name ?? 'Formulasi BOM',
                    status: o.status,
                    progressPercent: progress,
                };
            });

            const downtimeAlerts = downtimes.map((d) => ({
                id: d.id,
                machineName: d.machine?.name ?? 'Mesin',
                reason: d.reason || 'Downtime',
                durationMinutes: getDowntimeMinutes(d),
                startTime: d.startTime
                    ? new Date(d.startTime).toISOString()
                    : new Date(d.createdAt).toISOString(),
            }));

            const overview: MobileSupervisorOverview = {
                generatedAt: new Date().toISOString(),
                highlights: {
                    activeOrdersCount,
                    outputToday,
                    targetToday,
                    targetUnitMode,
                    targetUnit,
                    downtimeMinutesToday: totalDowntimeMinutes,
                    scrapToday,
                    qcPendingCount: qcPending,
                },
                recentOrders,
                downtimeAlerts,
            };

            return serializeData(overview);
        });
    },
);

export const getMobileSupervisorSpkList = withTenant(
    async function getMobileSupervisorSpkList(filters?: {
        status?: string;
        q?: string;
        machineId?: string;
    }) {
        return safeAction(async () => {
            const session = await requireAuth();
            assertSupervisorAccess(session.user as never);

            const where: Record<string, unknown> = {};
            const statusFilter = filters?.status?.trim();
            if (statusFilter && statusFilter !== 'ALL') {
                (where as { status: unknown }).status = statusFilter;
            } else {
                (where as { status: unknown }).status = {
                    in: ['RELEASED', 'IN_PROGRESS', 'DRAFT', 'WAITING_MATERIAL'],
                };
            }
            if (filters?.machineId) {
                (where as { machineId: unknown }).machineId = filters.machineId;
            }

            const q = filters?.q?.trim();
            const andClauses: unknown[] = [];

            if (q) {
                andClauses.push({
                    OR: [
                        { orderNumber: { contains: q, mode: 'insensitive' } },
                        { bom: { is: { name: { contains: q, mode: 'insensitive' } } } },
                        {
                            bom: {
                                is: {
                                    productVariant: {
                                        is: { name: { contains: q, mode: 'insensitive' } },
                                    },
                                },
                            },
                        },
                    ],
                });
            }

            const finalWhere =
                andClauses.length > 0
                    ? { ...where, AND: andClauses }
                    : where;

            const orders = await (prisma.productionOrder
                ? prisma.productionOrder.findMany({
                      where: finalWhere as never,
                      take: 50,
                      orderBy: [{ priority: 'desc' }, { plannedStartDate: 'desc' }],
                      include: {
                          bom: {
                              select: {
                                  name: true,
                                  productVariant: {
                                      select: { name: true, skuCode: true },
                                  },
                              },
                          },
                          machine: { select: { id: true, name: true, code: true } },
                          location: { select: { name: true } },
                      },
                  })
                : Promise.resolve([] as never[]));

            const items: MobileSupervisorSpkItem[] = (orders as Array<any>).map((o) => {
                const planned = Number(o.plannedQuantity ?? 0);
                const actual = Number(o.actualQuantity ?? 0);
                const progress =
                    planned > 0
                        ? Math.min(100, Math.round((actual / planned) * 100))
                        : 0;
                return {
                    id: o.id,
                    spkNumber: o.orderNumber || o.id.substring(0, 8),
                    productName: o.bom?.productVariant?.name ?? o.bom?.name ?? 'Formulasi BOM',
                    productCode: o.bom?.productVariant?.skuCode ?? '',
                    status: o.status,
                    priority: o.priority ?? 'NORMAL',
                    progressPercent: progress,
                    plannedQty: planned,
                    actualQty: actual,
                    machineId: o.machine?.id ?? o.machineId ?? null,
                    machineName: o.machine?.name ?? null,
                    machineCode: o.machine?.code ?? null,
                    locationName: o.location?.name ?? null,
                    plannedStartDate: o.plannedStartDate
                        ? new Date(o.plannedStartDate).toISOString()
                        : new Date(o.createdAt).toISOString(),
                };
            });

            const result: MobileSupervisorSpkList = {
                generatedAt: new Date().toISOString(),
                items,
            };
            return serializeData(result);
        });
    },
);

export const getMobileQuickSpkFormData = withTenant(
    async function getMobileQuickSpkFormData() {
        return safeAction(async () => {
            const session = await requireAuth();
            assertSupervisorAccess(session.user as never);

            const [boms, machines] = await Promise.all([
                prisma.bom
                    ? prisma.bom
                          .findMany({
                              where: { isActive: true },
                              select: {
                                  id: true,
                                  name: true,
                                  category: true,
                                  isDefault: true,
                                  productVariantId: true,
                                  productVariant: {
                                      select: {
                                          name: true,
                                          skuCode: true,
                                          product: { select: { name: true } },
                                      },
                                  },
                              },
                              orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
                              take: 100,
                          })
                          .catch(() => [] as any[])
                    : Promise.resolve([] as any[]),
                prisma.machine
                    ? prisma.machine
                          .findMany({
                              where: { status: 'ACTIVE' },
                              select: { id: true, name: true, code: true, type: true, status: true },
                              orderBy: { code: 'asc' },
                          })
                          .catch(() => [] as any[])
                    : Promise.resolve([] as any[]),
            ]);

            const data: MobileQuickSpkFormData = {
                boms: (boms as Array<any>).map((b) => ({
                    id: b.id,
                    name: b.name,
                    category: b.category,
                    productVariantId: b.productVariantId,
                    productVariantName: b.productVariant?.name ?? b.name,
                    productName: b.productVariant?.product?.name ?? b.productVariant?.name ?? b.name,
                    skuCode: b.productVariant?.skuCode ?? '',
                    isDefault: !!b.isDefault,
                })),
                machines: (machines as Array<any>).map((m) => ({
                    id: m.id,
                    name: m.name,
                    code: m.code,
                    type: m.type,
                    status: m.status,
                })),
            };

            return serializeData(data);
        });
    },
);

export const getMobileTeamAttendance = withTenant(
    async function getMobileTeamAttendance(
        filters?: MobileTeamAttendanceFilters,
    ) {
        return safeAction(async () => {
            const session = await requireAuth();
            assertSupervisorAccess(session.user as never);

            const rawDate = filters?.date?.trim() || toBusinessDateString(new Date());
            const businessDate = parseBusinessDate(rawDate);
            // workDate storage is UTC midnight of business date
            const workDate = new Date(`${businessDate}T00:00:00.000Z`);

            const employeeWhere = {
                status: 'ACTIVE' as const,
                role: {
                    in: ['OPERATOR', 'HELPER', 'PACKER'],
                },
                ...(filters?.role && filters.role !== 'ALL'
                    ? { role: filters.role }
                    : {}),
                ...(filters?.q?.trim()
                    ? {
                          OR: [
                              {
                                  name: {
                                      contains: filters.q.trim(),
                                      mode: 'insensitive' as const,
                                  },
                              },
                              {
                                  code: {
                                      contains: filters.q.trim(),
                                      mode: 'insensitive' as const,
                                  },
                              },
                          ],
                      }
                    : {}),
            };

            const [employees, attendanceRecords, shifts] = await Promise.all([
                prisma.employee
                    ? prisma.employee.findMany({
                          where: employeeWhere,
                          select: {
                              id: true,
                              name: true,
                              code: true,
                              role: true,
                          },
                          orderBy: { name: 'asc' },
                          take: 200,
                      }).catch(() => [] as any[])
                    : Promise.resolve([] as any[]),
                prisma.attendanceRecord
                    ? prisma.attendanceRecord
                          .findMany({
                               where: {
                                   workDate,
                                   employee: employeeWhere,
                                  ...(filters?.workShiftId
                                      ? { workShiftId: filters.workShiftId }
                                      : {}),
                                  ...(filters?.status && filters.status !== 'ALL'
                                      ? { status: filters.status as any }
                                      : {}),
                              },
                              include: {
                                  employee: {
                                      select: { id: true, name: true, code: true, role: true },
                                  },
                                  workShift: { select: { id: true, name: true, startTime: true } },
                              },
                              orderBy: { clockInAt: 'asc' },
                          })
                          .catch(() => [] as any[])
                    : Promise.resolve([] as any[]),
                prisma.workShift
                    ? prisma.workShift
                          .findMany({
                              where: { status: 'ACTIVE' },
                              select: { id: true, name: true },
                              orderBy: { startTime: 'asc' },
                          })
                          .catch(() => [] as any[])
                    : Promise.resolve([] as any[]),
            ]);

            // Keep the latest matching record per employee for the summary view.
            const recordByEmployee = new Map<string, any>();
            for (const rec of attendanceRecords as Array<any>) {
                const existing = recordByEmployee.get(rec.employeeId);
                // Keep present over absent, or later clockIn
                if (!existing) {
                    recordByEmployee.set(rec.employeeId, rec);
                } else {
                    // Prefer PRESENT > others, then latest clockIn
                    if (existing.status !== 'PRESENT' && rec.status === 'PRESENT') {
                        recordByEmployee.set(rec.employeeId, rec);
                    } else if (rec.clockInAt && existing.clockInAt) {
                        if (new Date(rec.clockInAt) > new Date(existing.clockInAt)) {
                            recordByEmployee.set(rec.employeeId, rec);
                        }
                    }
                }
            }

            // Build unified records — include employees without attendance when status filter not restrictive
            const includeNoRecord = !filters?.status || filters.status === 'ALL';
            const searchLower = filters?.q?.trim()?.toLowerCase() ?? '';

            const allEmployees =
                (employees as Array<any>).length > 0
                    ? (employees as Array<any>)
                    : (attendanceRecords as Array<any>).map((r) => r.employee);

            // Dedup employees list + attendance employees
            const employeeMap = new Map<string, { id: string; name: string; code: string; role: string }>();
            for (const e of allEmployees) {
                if (e?.id && !employeeMap.has(e.id)) {
                    employeeMap.set(e.id, {
                        id: e.id,
                        name: e.name ?? 'Karyawan',
                        code: e.code ?? '',
                        role: e.role ?? 'OPERATOR',
                    });
                }
            }
            let unifiedEmployees = Array.from(employeeMap.values());
            if (searchLower) {
                unifiedEmployees = unifiedEmployees.filter(
                    (e) =>
                        e.name.toLowerCase().includes(searchLower) ||
                        e.code.toLowerCase().includes(searchLower),
                );
            }

            const records: MobileTeamAttendanceRecord[] = unifiedEmployees.map((emp) => {
                const rec = recordByEmployee.get(emp.id);
                if (!rec) {
                    return {
                        id: null,
                        employeeId: emp.id,
                        employeeName: emp.name,
                        employeeCode: emp.code,
                        employeeRole: emp.role,
                        workDate: workDate.toISOString(),
                        workShiftId: null,
                        shiftName: null,
                        clockInAt: null,
                        clockOutAt: null,
                        status: 'NO_RECORD',
                        actualHours: null,
                        isLate: null,
                        source: null,
                    };
                }

                // isLate heuristic: clockIn after shift start + 15 min tolerance
                let isLate: boolean | null = null;
                if (rec.clockInAt && rec.workShift?.startTime) {
                    try {
                        const [sh, sm] = String(rec.workShift.startTime)
                            .split(':')
                            .map(Number);
                        const shiftStartMinutes = sh * 60 + sm;
                        const clockDate = new Date(rec.clockInAt);
                        const wibClock = new Date(clockDate.getTime() + 7 * 3600 * 1000);
                        const clockMinutes = wibClock.getUTCHours() * 60 + wibClock.getUTCMinutes();
                        isLate = clockMinutes > shiftStartMinutes + 15;
                    } catch {
                        isLate = null;
                    }
                }

                const actualHours =
                    rec.actualHours != null
                        ? Number(rec.actualHours)
                        : rec.clockInAt && rec.clockOutAt
                          ? Math.round(
                                ((new Date(rec.clockOutAt).getTime() -
                                    new Date(rec.clockInAt).getTime()) /
                                    3600000) *
                                    100,
                            ) / 100
                          : null;

                return {
                    id: rec.id ?? null,
                    employeeId: emp.id,
                    employeeName: emp.name,
                    employeeCode: emp.code,
                    employeeRole: emp.role,
                    workDate: rec.workDate
                        ? new Date(rec.workDate).toISOString()
                        : workDate.toISOString(),
                    workShiftId: rec.workShiftId ?? rec.workShift?.id ?? null,
                    shiftName: rec.workShift?.name ?? null,
                    clockInAt: rec.clockInAt ? new Date(rec.clockInAt).toISOString() : null,
                    clockOutAt: rec.clockOutAt ? new Date(rec.clockOutAt).toISOString() : null,
                    status: (rec.status as any) ?? 'NO_RECORD',
                    actualHours,
                    isLate,
                    source: rec.source ?? null,
                };
            });

            // Apply status filter post-merge for NO_RECORD handling
            let filteredRecords = records;
            if (filters?.status && filters.status !== 'ALL') {
                filteredRecords = records.filter((r) => r.status === filters.status);
            } else if (!includeNoRecord) {
                filteredRecords = records.filter((r) => r.status !== 'NO_RECORD');
            }

            // Sort: PRESENT first, then ABSENT, then others
            const statusOrder: Record<string, number> = {
                PRESENT: 0,
                ABSENT: 1,
                ON_LEAVE: 2,
                NO_RECORD: 3,
            };
            filteredRecords.sort((a, b) => {
                const ao = statusOrder[a.status] ?? 9;
                const bo = statusOrder[b.status] ?? 9;
                if (ao !== bo) return ao - bo;
                return a.employeeName.localeCompare(b.employeeName);
            });

            const presentCount = filteredRecords.filter((r) => r.status === 'PRESENT').length;
            const absentCount = filteredRecords.filter((r) => r.status === 'ABSENT').length;
            const onLeaveCount = filteredRecords.filter((r) => r.status === 'ON_LEAVE').length;
            const noRecordCount = filteredRecords.filter((r) => r.status === 'NO_RECORD').length;

            const result: MobileTeamAttendanceResult = {
                generatedAt: new Date().toISOString(),
                date: businessDate,
                workDate: workDate.toISOString(),
                totalEmployees: filteredRecords.length,
                presentCount,
                absentCount,
                onLeaveCount,
                noRecordCount,
                shifts: (shifts as Array<any>).map((s) => ({ id: s.id, name: s.name })),
                records: filteredRecords,
            };

            return serializeData(result);
        });
    },
);
