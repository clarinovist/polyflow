'use server';

/* eslint-disable @typescript-eslint/no-explicit-any */
import { withTenant } from '@/lib/core/tenant';
import { getTenantDbFromContext, prisma } from '@/lib/core/prisma';
import {
    safeAction,
    AuthorizationError,
    BusinessRuleError,
} from '@/lib/errors/errors';
import { requireAuth } from '@/lib/tools/auth-checks';
import { serializeData } from '@/lib/utils/utils';
import { toBusinessDateString, parseBusinessDate } from '@/lib/utils/timezone';
import { hasAnyRole, hasRole } from '@/lib/auth/roles';
import { isPathAllowedByResources } from '@/lib/auth/access-policy';
import { requireMobilePortalAccess } from '@/lib/mobile/mobile-portal-access';
import { canSeeNavHref } from '@/lib/auth/permission-match';
import {
    readProductionMobileOverview,
    type ProductionMobileOverview,
} from '@/services/production/production-mobile-dashboard-service';
import { readWarehouseInventoryThresholdSnapshot } from '@/services/inventory/warehouse-dashboard-service';
import { buildPurchasingDashboardWaitingReceiptWhere } from '@/services/purchasing/purchasing-dashboard-query';
import { readHrdDashboardMobileAggregate } from '@/services/hrd/hrd-dashboard-service';

export type MobileSupervisorOverview = ProductionMobileOverview;

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
    href: `/kiosk/jobs/${string}` | null;
}

export interface MobileSupervisorSpkList {
    generatedAt: string;
    total: number;
    returned: number;
    limit: number;
    createHref: '/production/mobile/tasks/new' | null;
    items: MobileSupervisorSpkItem[];
}

export interface MobileTeamAttendanceFilters {
    date: string; // YYYY-MM-DD
    workShiftId?: string;
    status?: 'PRESENT' | 'ABSENT' | 'ON_LEAVE' | 'NO_RECORD' | 'ALL';
    q?: string;
    role?: string; // OPERATOR / HELPER / PACKER / etc or ALL
}

interface MobileTeamAttendanceRecord {
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

/**
 * Read access to production mobile monitoring. FACTORY_MANAGER (Kepala
 * Pabrik) joins here: the executive surface is monitoring-only.
 */
type MobileSupervisorUser = {
    role?: string;
    roles?: string[];
    isSuperAdmin?: boolean;
    allowedResources?: string[] | 'ALL';
};

function assertSupervisorAccess(user: MobileSupervisorUser) {
    const operational =
        hasAnyRole(user, ['PRODUCTION', 'PLANNING', 'ADMIN']) ||
        !!user.isSuperAdmin;
    if (!operational && !hasRole(user, 'FACTORY_MANAGER')) {
        throw new AuthorizationError(
            'Hanya supervisor produksi, planning, kepala pabrik berizin, atau admin yang dapat mengakses data ini.',
        );
    }
}

function assertFactoryManagerExecutiveAccess(
    user: MobileSupervisorUser,
    permissions: string[] | 'ALL',
) {
    if (hasRole(user, 'ADMIN')) return;
    if (!hasRole(user, 'FACTORY_MANAGER')) {
        throw new AuthorizationError(
            'Hanya kepala pabrik atau admin yang dapat melihat ringkasan eksekutif.',
        );
    }

    const requiredResources = [
        '/production/daily',
        '/warehouse/inventory',
        '/purchasing/requests',
        '/purchasing/orders',
    ];
    if (
        requiredResources.some(
            (resource) => !isPathAllowedByResources(resource, permissions),
        )
    ) {
        throw new AuthorizationError(
            'Izin monitoring eksekutif kepala pabrik belum lengkap.',
        );
    }
}

/**
 * Mutation access (quick SPK form, execution affordances). FACTORY_MANAGER is
 * deliberately excluded — read-only monitoring.
 */
function assertSupervisorMutationAccess(user: {
    role?: string;
    roles?: string[];
    isSuperAdmin?: boolean;
}) {
    if (hasRole(user, 'FACTORY_MANAGER') && !hasRole(user, 'ADMIN')) {
        throw new AuthorizationError(
            'Kepala pabrik tidak dapat menjalankan mutasi produksi dari portal mobile.',
        );
    }
    const allowed =
        hasAnyRole(user, ['PRODUCTION', 'PLANNING', 'ADMIN']) ||
        !!user.isSuperAdmin;
    if (!allowed) {
        throw new AuthorizationError(
            'Hanya supervisor produksi, planning, atau admin yang dapat melakukan aksi ini.',
        );
    }
}

export const getProductionSupervisorOverview = withTenant(
    async function getProductionSupervisorOverview() {
        return safeAction(async () => {
            const session = await requireAuth();
            assertSupervisorAccess(session.user as never);
            const access = await requireMobilePortalAccess(
                'production-supervisor',
            );
            const db = getTenantDbFromContext();
            if (!db) {
                throw new BusinessRuleError(
                    'Konteks tenant Production Mobile tidak tersedia.',
                );
            }
            const permissions =
                access.permissions === 'ALL' ? 'ALL' : [...access.permissions];
            const canOpen = (href: string) =>
                canSeeNavHref(href, permissions, '/production');
            const user = session.user as MobileSupervisorUser;
            const canCreateSpk =
                !hasRole(user, 'FACTORY_MANAGER') || hasRole(user, 'ADMIN');

            const overview = await readProductionMobileOverview({
                db,
                canOpen,
                canCreateSpk,
                audience:
                    hasRole(user, 'FACTORY_MANAGER') && !hasRole(user, 'ADMIN')
                        ? 'EXECUTIVE'
                        : 'OPERATIONAL',
            });
            return serializeData(overview);
        });
    },
);

const MOBILE_SPK_SAMPLE_LIMIT = 50;

export const getMobileSupervisorSpkList = withTenant(
    async function getMobileSupervisorSpkList(filters?: {
        status?: string;
        q?: string;
        machineId?: string;
    }) {
        return safeAction(async () => {
            const session = await requireAuth();
            assertSupervisorAccess(session.user as never);
            const access = await requireMobilePortalAccess(
                'production-supervisor',
            );
            const permissions =
                access.permissions === 'ALL' ? 'ALL' : [...access.permissions];
            const canOpenKiosk = canSeeNavHref('/kiosk', permissions, '/kiosk');
            const user = session.user as MobileSupervisorUser;
            const canCreateSpk =
                (!hasRole(user, 'FACTORY_MANAGER') || hasRole(user, 'ADMIN')) &&
                canSeeNavHref(
                    '/production/mobile/tasks/new',
                    permissions,
                    '/production',
                );

            const where: Record<string, unknown> = {};
            const statusFilter = filters?.status?.trim();
            if (statusFilter && statusFilter !== 'ALL') {
                where.status = statusFilter;
            } else {
                where.status = {
                    in: [
                        'RELEASED',
                        'IN_PROGRESS',
                        'DRAFT',
                        'WAITING_MATERIAL',
                    ],
                };
            }
            if (filters?.machineId) where.machineId = filters.machineId;

            const q = filters?.q?.trim();
            if (q) {
                where.AND = [
                    {
                        OR: [
                            {
                                orderNumber: {
                                    contains: q,
                                    mode: 'insensitive',
                                },
                            },
                            {
                                bom: {
                                    is: {
                                        name: {
                                            contains: q,
                                            mode: 'insensitive',
                                        },
                                    },
                                },
                            },
                            {
                                bom: {
                                    is: {
                                        productVariant: {
                                            is: {
                                                name: {
                                                    contains: q,
                                                    mode: 'insensitive',
                                                },
                                            },
                                        },
                                    },
                                },
                            },
                        ],
                    },
                ];
            }

            const orderSelect = {
                id: true,
                orderNumber: true,
                status: true,
                priority: true,
                plannedQuantity: true,
                actualQuantity: true,
                machineId: true,
                plannedStartDate: true,
                createdAt: true,
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
            } as const;
            // Prisma/PostgreSQL enum sorting is not relied on here. Explicit
            // buckets prove URGENT → NORMAL → LOW, while every bucket is read
            // through the full global sample limit before the final cap.
            const perPriority = await Promise.all(
                (['URGENT', 'NORMAL', 'LOW'] as const).map((priority) =>
                    Promise.all([
                        prisma.productionOrder.count({
                            where: { ...where, priority } as never,
                        }),
                        prisma.productionOrder.findMany({
                            where: { ...where, priority } as never,
                            take: MOBILE_SPK_SAMPLE_LIMIT,
                            orderBy: [
                                { plannedStartDate: 'asc' },
                                { id: 'asc' },
                            ],
                            select: orderSelect,
                        }),
                    ]),
                ),
            );
            const total = perPriority.reduce((sum, [count]) => sum + count, 0);
            const orders = perPriority
                .flatMap(([, rows]) => rows)
                .slice(0, MOBILE_SPK_SAMPLE_LIMIT);

            const items: MobileSupervisorSpkItem[] = (orders as Array<any>).map(
                (order) => {
                    const planned = Number(order.plannedQuantity ?? 0);
                    const actual = Number(order.actualQuantity ?? 0);
                    const progress =
                        planned > 0
                            ? Math.min(
                                  100,
                                  Math.round((actual / planned) * 100),
                              )
                            : 0;
                    return {
                        id: order.id,
                        spkNumber:
                            order.orderNumber || order.id.substring(0, 8),
                        productName:
                            order.bom?.productVariant?.name ??
                            order.bom?.name ??
                            'Formulasi BOM',
                        productCode: order.bom?.productVariant?.skuCode ?? '',
                        status: order.status,
                        priority: order.priority ?? 'NORMAL',
                        progressPercent: progress,
                        plannedQty: planned,
                        actualQty: actual,
                        machineId: order.machine?.id ?? order.machineId ?? null,
                        machineName: order.machine?.name ?? null,
                        machineCode: order.machine?.code ?? null,
                        locationName: order.location?.name ?? null,
                        plannedStartDate: order.plannedStartDate
                            ? new Date(order.plannedStartDate).toISOString()
                            : new Date(order.createdAt).toISOString(),
                        href: canOpenKiosk
                            ? (`/kiosk/jobs/${order.id}` as const)
                            : null,
                    };
                },
            );

            const result: MobileSupervisorSpkList = {
                generatedAt: new Date().toISOString(),
                total,
                returned: items.length,
                limit: MOBILE_SPK_SAMPLE_LIMIT,
                createHref: canCreateSpk
                    ? '/production/mobile/tasks/new'
                    : null,
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
            assertSupervisorMutationAccess(session.user as never);

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
                              select: {
                                  id: true,
                                  name: true,
                                  code: true,
                                  type: true,
                                  status: true,
                              },
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
                    productName:
                        b.productVariant?.product?.name ??
                        b.productVariant?.name ??
                        b.name,
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
            await requireMobilePortalAccess('production-supervisor');

            if (
                filters?.status &&
                !['ALL', 'PRESENT', 'ABSENT', 'ON_LEAVE', 'NO_RECORD'].includes(
                    filters.status,
                )
            ) {
                throw new BusinessRuleError(
                    'Filter status absensi tidak valid.',
                );
            }
            if (
                filters?.role &&
                !['ALL', 'OPERATOR', 'HELPER', 'PACKER'].includes(filters.role)
            ) {
                throw new BusinessRuleError(
                    'Filter peran produksi tidak valid.',
                );
            }
            const rawDate =
                filters?.date?.trim() || toBusinessDateString(new Date());
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
                      })
                    : Promise.resolve([] as any[]),
                prisma.attendanceRecord
                    ? prisma.attendanceRecord.findMany({
                          where: {
                              workDate,
                              employee: employeeWhere,
                              ...(filters?.workShiftId
                                  ? { workShiftId: filters.workShiftId }
                                  : {}),
                          },
                          include: {
                              employee: {
                                  select: {
                                      id: true,
                                      name: true,
                                      code: true,
                                      role: true,
                                  },
                              },
                              workShift: {
                                  select: {
                                      id: true,
                                      name: true,
                                      startTime: true,
                                  },
                              },
                          },
                          orderBy: { clockInAt: 'desc' },
                      })
                    : Promise.resolve([] as any[]),
                prisma.workShift
                    ? prisma.workShift.findMany({
                          where: { status: 'ACTIVE' },
                          select: { id: true, name: true },
                          orderBy: { startTime: 'asc' },
                      })
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
                    if (
                        existing.status !== 'PRESENT' &&
                        rec.status === 'PRESENT'
                    ) {
                        recordByEmployee.set(rec.employeeId, rec);
                    } else if (
                        rec.status === existing.status &&
                        rec.clockInAt &&
                        existing.clockInAt
                    ) {
                        if (
                            new Date(rec.clockInAt) >
                            new Date(existing.clockInAt)
                        ) {
                            recordByEmployee.set(rec.employeeId, rec);
                        }
                    }
                }
            }

            // Build unified records — include employees without attendance when status filter not restrictive
            const includeNoRecord =
                !filters?.status || filters.status === 'ALL';
            const searchLower = filters?.q?.trim()?.toLowerCase() ?? '';

            const allEmployees =
                (employees as Array<any>).length > 0
                    ? (employees as Array<any>)
                    : (attendanceRecords as Array<any>).map((r) => r.employee);

            // Dedup employees list + attendance employees
            const employeeMap = new Map<
                string,
                { id: string; name: string; code: string; role: string }
            >();
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

            const records: MobileTeamAttendanceRecord[] = unifiedEmployees.map(
                (emp) => {
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
                            const wibClock = new Date(
                                clockDate.getTime() + 7 * 3600 * 1000,
                            );
                            const clockMinutes =
                                wibClock.getUTCHours() * 60 +
                                wibClock.getUTCMinutes();
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
                        workShiftId:
                            rec.workShiftId ?? rec.workShift?.id ?? null,
                        shiftName: rec.workShift?.name ?? null,
                        clockInAt: rec.clockInAt
                            ? new Date(rec.clockInAt).toISOString()
                            : null,
                        clockOutAt: rec.clockOutAt
                            ? new Date(rec.clockOutAt).toISOString()
                            : null,
                        status: (rec.status as any) ?? 'NO_RECORD',
                        actualHours,
                        isLate,
                        source: rec.source ?? null,
                    };
                },
            );

            // Apply status filter post-merge for NO_RECORD handling
            let filteredRecords = records;
            if (filters?.status && filters.status !== 'ALL') {
                filteredRecords = records.filter(
                    (r) => r.status === filters.status,
                );
            } else if (!includeNoRecord) {
                filteredRecords = records.filter(
                    (r) => r.status !== 'NO_RECORD',
                );
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

            const presentCount = filteredRecords.filter(
                (r) => r.status === 'PRESENT',
            ).length;
            const absentCount = filteredRecords.filter(
                (r) => r.status === 'ABSENT',
            ).length;
            const onLeaveCount = filteredRecords.filter(
                (r) => r.status === 'ON_LEAVE',
            ).length;
            const noRecordCount = filteredRecords.filter(
                (r) => r.status === 'NO_RECORD',
            ).length;

            const result: MobileTeamAttendanceResult = {
                generatedAt: new Date().toISOString(),
                date: businessDate,
                workDate: workDate.toISOString(),
                totalEmployees: filteredRecords.length,
                presentCount,
                absentCount,
                onLeaveCount,
                noRecordCount,
                shifts: (shifts as Array<any>).map((s) => ({
                    id: s.id,
                    name: s.name,
                })),
                records: filteredRecords,
            };

            return serializeData(result);
        });
    },
);

export interface FactoryManagerExecutiveOverview {
    generatedAt: string;
    stock:
        | {
              status: 'AVAILABLE';
              data: {
                  lowStockCount: number;
                  suggestedReorderCount: number;
              };
          }
        | { status: 'UNAVAILABLE'; data: null };
    purchasing:
        | {
              status: 'AVAILABLE';
              data: { waitingReceiptCount: number };
          }
        | { status: 'UNAVAILABLE'; data: null };
    workforce:
        | {
              status: 'AVAILABLE';
              data: {
                  activeCount: number | null;
                  presentCount: number | null;
                  absentCount: number | null;
                  onLeaveCount: number | null;
              };
          }
        | { status: 'UNAVAILABLE'; data: null };
}

export const getFactoryManagerExecutiveOverview = withTenant(
    async function getFactoryManagerExecutiveOverview() {
        return safeAction(async () => {
            const session = await requireAuth();
            const access = await requireMobilePortalAccess(
                'production-supervisor',
            );
            const permissions =
                access.permissions === 'ALL' ? 'ALL' : [...access.permissions];
            assertFactoryManagerExecutiveAccess(
                session.user as MobileSupervisorUser,
                permissions,
            );
            const db = getTenantDbFromContext();
            if (!db) {
                throw new BusinessRuleError(
                    'Konteks tenant monitor Kepala Pabrik tidak tersedia.',
                );
            }

            const [stock, purchasing, workforce] = await Promise.allSettled([
                readWarehouseInventoryThresholdSnapshot(),
                db.purchaseOrder.count({
                    where: buildPurchasingDashboardWaitingReceiptWhere(),
                }),
                readHrdDashboardMobileAggregate(db),
            ]);

            let workforceSection: FactoryManagerExecutiveOverview['workforce'] =
                { status: 'UNAVAILABLE', data: null };
            if (workforce.status === 'fulfilled') {
                const active = workforce.value.health.activeHeadcount;
                const attendance = workforce.value.health.attendanceToday;
                if (
                    active.status === 'AVAILABLE' ||
                    attendance.status === 'AVAILABLE'
                ) {
                    workforceSection = {
                        status: 'AVAILABLE',
                        data: {
                            activeCount:
                                active.status === 'AVAILABLE'
                                    ? active.data.count
                                    : null,
                            presentCount:
                                attendance.status === 'AVAILABLE'
                                    ? attendance.data.present
                                    : null,
                            absentCount:
                                attendance.status === 'AVAILABLE'
                                    ? attendance.data.absent
                                    : null,
                            onLeaveCount:
                                attendance.status === 'AVAILABLE'
                                    ? attendance.data.onLeave
                                    : null,
                        },
                    };
                }
            }

            const overview: FactoryManagerExecutiveOverview = {
                generatedAt: new Date().toISOString(),
                stock:
                    stock.status === 'fulfilled'
                        ? {
                              status: 'AVAILABLE',
                              data: {
                                  lowStockCount: stock.value.lowStockCount,
                                  suggestedReorderCount:
                                      stock.value.reorderCount,
                              },
                          }
                        : { status: 'UNAVAILABLE', data: null },
                purchasing:
                    purchasing.status === 'fulfilled'
                        ? {
                              status: 'AVAILABLE',
                              data: {
                                  waitingReceiptCount: purchasing.value,
                              },
                          }
                        : { status: 'UNAVAILABLE', data: null },
                workforce: workforceSection,
            };

            return serializeData(overview);
        });
    },
);
