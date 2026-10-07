'use server';

import { revalidatePath } from 'next/cache';
import { withTenant } from '@/lib/core/tenant';
import { prisma } from '@/lib/core/prisma';
import { safeAction, BusinessRuleError } from '@/lib/errors/errors';
import { requireAuth } from '@/lib/tools/auth-checks';
import { serializeData } from '@/lib/utils/utils';
import {
    MaintenanceStatus,
    MaintenanceUrgency,
    NotificationType,
    Prisma,
    Role,
} from '@prisma/client';
import { createMaintenanceRequestSchema } from '@/lib/schemas/maintenance';
import { MaintenanceService } from '@/services/production/maintenance-service';
import { NotificationService } from '@/services/core/notification-service';

const APPROVER_ROLES: Role[] = [Role.ADMIN, Role.FACTORY_MANAGER];
const OPEN_STATUSES: MaintenanceStatus[] = [
    MaintenanceStatus.PENDING,
    MaintenanceStatus.APPROVED,
    MaintenanceStatus.IN_PROGRESS,
];
const CLOSED_STATUSES: MaintenanceStatus[] = [
    MaintenanceStatus.DONE,
    MaintenanceStatus.REJECTED,
    MaintenanceStatus.CANCELLED,
];
const LIST_STATUSES = new Set(Object.values(MaintenanceStatus));
const LIST_URGENCIES = new Set(Object.values(MaintenanceUrgency));
const PAGE_SIZE = 20;
const MAX_PAGE = 10_000;

type SessionLike = {
    user?: { id?: string; role?: Role; roles?: Role[] };
};

export type MaintenanceQueue = 'ACTION' | 'ACTIVE' | 'CLOSED' | 'ALL';
export interface MaintenanceListInput {
    status?: string;
    queue?: MaintenanceQueue;
    urgency?: string;
    machineStopped?: boolean;
    q?: string;
    page?: number;
}

function sessionRoles(session: unknown): Role[] {
    const user = (session as SessionLike | null)?.user;
    return [
        ...new Set([
            ...(user?.roles ?? []),
            ...(user?.role ? [user.role] : []),
        ]),
    ];
}

async function rolesOf(userId: string, session: unknown): Promise<Role[]> {
    const current = sessionRoles(session);
    if (current.length) return current;
    const rows = await prisma.userRole.findMany({
        where: { userId },
        select: { role: true },
    });
    return rows.map((row) => row.role);
}

async function hasApproverRole(
    userId: string,
    session: unknown,
): Promise<boolean> {
    const roles = await rolesOf(userId, session);
    return roles.some((role) => APPROVER_ROLES.includes(role));
}

async function requireApprover(
    userId: string,
    session: unknown,
): Promise<void> {
    if (!(await hasApproverRole(userId, session))) {
        throw new BusinessRuleError(
            'Hanya Admin atau Kepala Pabrik yang boleh memutuskan laporan maintenance.',
            { userId },
            'APPROVER_ROLE_REQUIRED',
        );
    }
}

async function requireExecutor(
    order: {
        createdById: string;
        assigneeId: string | null;
    },
    userId: string,
    session: unknown,
): Promise<void> {
    const isApprover = await hasApproverRole(userId, session);
    const isAssigned = order.assigneeId === userId;
    const isLegacyReporter = !order.assigneeId && order.createdById === userId;
    if (isApprover || isAssigned || isLegacyReporter) return;
    throw new BusinessRuleError(
        'Hanya teknisi yang ditunjuk atau Kepala Pabrik/Admin yang dapat memproses pekerjaan ini.',
        { userId },
        'EXECUTOR_ROLE_REQUIRED',
    );
}

function revalidateMaintenance(id?: string) {
    revalidatePath('/production/maintenance');
    revalidatePath('/production/mobile');
    revalidatePath('/production/mobile/maintenance');
    if (id) {
        revalidatePath('/production/maintenance/' + id);
        revalidatePath('/production/mobile/maintenance/' + id);
    }
}

async function getActiveTechnicians() {
    const users = await prisma.user.findMany({
        where: {
            isActive: true,
            OR: [
                { role: { in: [Role.PRODUCTION, Role.ADMIN] } },
                {
                    roles: {
                        some: {
                            role: { in: [Role.PRODUCTION, Role.ADMIN] },
                        },
                    },
                },
            ],
        },
        select: { id: true, name: true, email: true },
        orderBy: [{ name: 'asc' }, { email: 'asc' }],
    });
    return users.map((user) => ({
        id: user.id,
        name: user.name?.trim() || user.email,
    }));
}

export const getMaintenanceFormData = withTenant(
    async function getMaintenanceFormData() {
        return safeAction(async () => {
            const session = await requireAuth();
            const [machines, spareCatalog, locations, viewerRoles] = await Promise.all([
                prisma.machine.findMany({
                    where: { status: { not: 'INACTIVE' as never } },
                    select: { id: true, name: true, code: true, status: true },
                    orderBy: { code: 'asc' },
                    take: 200,
                }),
                prisma.productVariant
                    .findMany({
                        where: {
                            archivedAt: null,
                            product: { productType: 'OPERATIONAL' },
                        },
                        select: { id: true, name: true, skuCode: true },
                        orderBy: { name: 'asc' },
                        take: 300,
                    })
                    .catch(() => []),
                prisma.location
                    .findMany({
                        select: { id: true, name: true, slug: true },
                        orderBy: { name: 'asc' },
                        take: 100,
                    })
                    .catch(() => []),
                rolesOf((session.user as { id: string }).id, session),
            ]);
            return serializeData({
                machines,
                spareCatalog,
                locations,
                canManageSpareParts: viewerRoles.includes(Role.ADMIN),
            });
        });
    },
);

export const createMaintenanceRequest = withTenant(
    async function createMaintenanceRequest(input: unknown) {
        return safeAction(async () => {
            const session = await requireAuth();
            const userId = (session.user as { id: string }).id;
            const parsed = createMaintenanceRequestSchema.parse(input);
            const order = await MaintenanceService.create(parsed, userId);
            revalidateMaintenance(order.id);
            return serializeData({
                id: order.id,
                orderNumber: order.orderNumber,
            });
        });
    },
);

export const submitMaintenanceRequest = withTenant(
    async function submitMaintenanceRequest(id: string) {
        return safeAction(async () => {
            const session = await requireAuth();
            const userId = (session.user as { id: string }).id;
            const submittedOrder = await MaintenanceService.submit(id, userId);
            try {
                const approvers = await prisma.user.findMany({
                    where: {
                        isActive: true,
                        OR: [
                            { role: { in: APPROVER_ROLES } },
                            {
                                roles: {
                                    some: { role: { in: APPROVER_ROLES } },
                                },
                            },
                        ],
                    },
                    select: { id: true },
                    take: 20,
                });
                if (approvers.length) {
                    await NotificationService.createBulkNotifications(
                        approvers.map((approver) => ({
                            userId: approver.id,
                            type: NotificationType.SYSTEM,
                            title: 'Maintenance perlu persetujuan',
                            message:
                                submittedOrder.orderNumber +
                                ' menunggu keputusan.',
                            entityType: 'MaintenanceRequest',
                            entityId: id,
                            link: '/production/mobile/maintenance/' + id,
                        })),
                    );
                }
            } catch {
                // Notifications are best-effort; the audited status transition won.
            }
            revalidateMaintenance(id);
            return serializeData({ id });
        });
    },
);

export const approveMaintenanceRequest = withTenant(
    async function approveMaintenanceRequest(id: string, assigneeId: string) {
        return safeAction(async () => {
            const session = await requireAuth();
            const userId = (session.user as { id: string }).id;
            await requireApprover(userId, session);
            const existing = await MaintenanceService.getById(id);
            if (
                existing.createdById === userId &&
                !sessionRoles(session).includes(Role.ADMIN)
            ) {
                throw new BusinessRuleError(
                    'Pembuat laporan tidak boleh menyetujui laporannya sendiri.',
                    { id },
                    'SELF_APPROVAL_NOT_ALLOWED',
                );
            }
            if (!assigneeId) {
                throw new BusinessRuleError(
                    'Pilih teknisi sebelum menyetujui pekerjaan.',
                    { id },
                    'ASSIGNEE_REQUIRED',
                );
            }
            const assignee = await prisma.user.findFirst({
                where: {
                    id: assigneeId,
                    isActive: true,
                    OR: [
                        { role: { in: [Role.PRODUCTION, Role.ADMIN] } },
                        {
                            roles: {
                                some: {
                                    role: {
                                        in: [Role.PRODUCTION, Role.ADMIN],
                                    },
                                },
                            },
                        },
                    ],
                },
                select: { id: true, name: true, email: true },
            });
            if (!assignee) {
                throw new BusinessRuleError(
                    'Teknisi tidak aktif atau tidak memiliki akses operasional maintenance.',
                    { assigneeId },
                    'INVALID_MAINTENANCE_ASSIGNEE',
                );
            }
            const assigneeName = assignee.name?.trim() || assignee.email;
            const order = await MaintenanceService.approve(
                id,
                userId,
                assignee.id,
            );
            try {
                const recipientIds = [
                    ...new Set([order.createdById, assignee.id]),
                ];
                await NotificationService.createBulkNotifications(
                    recipientIds.map((recipientId) => ({
                        userId: recipientId,
                        type: NotificationType.SYSTEM,
                        title: 'Maintenance disetujui ' + order.orderNumber,
                        message: 'Teknisi: ' + assigneeName + '.',
                        entityType: 'MaintenanceRequest',
                        entityId: id,
                        link: '/production/mobile/maintenance/' + id,
                    })),
                );
            } catch {
                // Notifications are best-effort.
            }
            revalidateMaintenance(id);
            return serializeData({ id: order.id });
        });
    },
);

export const rejectMaintenanceRequest = withTenant(
    async function rejectMaintenanceRequest(id: string, reason: string) {
        return safeAction(async () => {
            const session = await requireAuth();
            const userId = (session.user as { id: string }).id;
            await requireApprover(userId, session);
            const existing = await MaintenanceService.getById(id);
            if (
                existing.createdById === userId &&
                !sessionRoles(session).includes(Role.ADMIN)
            ) {
                throw new BusinessRuleError(
                    'Pembuat laporan tidak boleh menolak laporannya sendiri.',
                    { id },
                    'SELF_APPROVAL_NOT_ALLOWED',
                );
            }
            await MaintenanceService.reject(id, userId, reason);
            revalidateMaintenance(id);
            return serializeData({ id });
        });
    },
);

export const startMaintenanceRequest = withTenant(
    async function startMaintenanceRequest(id: string) {
        return safeAction(async () => {
            const session = await requireAuth();
            const userId = (session.user as { id: string }).id;
            const existing = await MaintenanceService.getById(id);
            await requireExecutor(existing, userId, session);
            await MaintenanceService.start(id, userId);
            revalidateMaintenance(id);
            return serializeData({ id });
        });
    },
);

export const completeMaintenanceRequest = withTenant(
    async function completeMaintenanceRequest(
        id: string,
        note: string,
        fulfilledIds: string[],
    ) {
        return safeAction(async () => {
            const session = await requireAuth();
            const userId = (session.user as { id: string }).id;
            const existing = await MaintenanceService.getById(id);
            await requireExecutor(existing, userId, session);
            const order = await MaintenanceService.complete(
                id,
                userId,
                note,
                fulfilledIds,
            );
            try {
                const owners = await prisma.user.findMany({
                    where: {
                        isActive: true,
                        OR: [
                            { isSuperAdmin: true },
                            { role: Role.ADMIN },
                            { roles: { some: { role: Role.ADMIN } } },
                        ],
                    },
                    select: { id: true },
                    take: 10,
                });
                if (owners.length) {
                    await NotificationService.createBulkNotifications(
                        owners.map((owner) => ({
                            userId: owner.id,
                            type: NotificationType.SYSTEM,
                            title: 'Maintenance selesai ' + order.orderNumber,
                            message:
                                'FYI: ' +
                                order.orderNumber +
                                ' selesai. ' +
                                (order.completionNote || ''),
                            entityType: 'MaintenanceRequest',
                            entityId: id,
                            link: '/production/maintenance/' + id,
                        })),
                    );
                }
            } catch {
                // Notifications are best-effort.
            }
            revalidateMaintenance(id);
            return serializeData({ id });
        });
    },
);

function normalizeListInput(
    input?: string | MaintenanceListInput,
): Required<Pick<MaintenanceListInput, 'queue' | 'page'>> &
    Omit<MaintenanceListInput, 'queue' | 'page'> {
    if (typeof input === 'string') {
        return { status: input, queue: 'ALL', page: 1 };
    }
    return {
        status: input?.status,
        queue: input?.queue ?? 'ACTIVE',
        urgency: input?.urgency,
        machineStopped: input?.machineStopped,
        q: input?.q?.trim(),
        page:
            Number.isFinite(input?.page) && Number(input?.page) > 0
                ? Math.min(Math.floor(Number(input?.page)), MAX_PAGE)
                : 1,
    };
}

function buildStatusWhere(
    status: string | undefined,
    queue: MaintenanceQueue,
): Prisma.MaintenanceRequestWhereInput {
    if (status && LIST_STATUSES.has(status as MaintenanceStatus)) {
        return { status: status as MaintenanceStatus };
    }
    if (queue === 'ACTION') {
        return {
            status: {
                in: [MaintenanceStatus.PENDING, MaintenanceStatus.APPROVED],
            },
        };
    }
    if (queue === 'CLOSED') return { status: { in: CLOSED_STATUSES } };
    if (queue === 'ALL') return {};
    return { status: { in: OPEN_STATUSES } };
}

export const getMaintenanceRequests = withTenant(
    async function getMaintenanceRequests(input?: string | MaintenanceListInput) {
        return safeAction(async () => {
            const session = await requireAuth();
            const userId = (session.user as { id: string }).id;
            const normalized = normalizeListInput(input);
            const visibilityWhere: Prisma.MaintenanceRequestWhereInput = {
                OR: [
                    { status: { not: MaintenanceStatus.DRAFT } },
                    { status: MaintenanceStatus.DRAFT, createdById: userId },
                ],
            };
            const where: Prisma.MaintenanceRequestWhereInput = {
                AND: [
                    visibilityWhere,
                    buildStatusWhere(normalized.status, normalized.queue),
                    normalized.urgency &&
                    LIST_URGENCIES.has(
                        normalized.urgency as MaintenanceUrgency,
                    )
                        ? {
                              urgency:
                                  normalized.urgency as MaintenanceUrgency,
                          }
                        : {},
                    normalized.machineStopped ? { machineStopped: true } : {},
                    normalized.q
                        ? {
                              OR: [
                                  {
                                      orderNumber: {
                                          contains: normalized.q,
                                          mode: 'insensitive',
                                      },
                                  },
                                  {
                                      complaint: {
                                          contains: normalized.q,
                                          mode: 'insensitive',
                                      },
                                  },
                                  {
                                      assigneeName: {
                                          contains: normalized.q,
                                          mode: 'insensitive',
                                      },
                                  },
                                  {
                                      machine: {
                                          is: {
                                              OR: [
                                                  {
                                                      code: {
                                                          contains: normalized.q,
                                                          mode: 'insensitive',
                                                      },
                                                  },
                                                  {
                                                      name: {
                                                          contains: normalized.q,
                                                          mode: 'insensitive',
                                                      },
                                                  },
                                              ],
                                          },
                                      },
                                  },
                              ],
                          }
                        : {},
                ],
            };
            const [rows, total, grouped, stopped] = await Promise.all([
                prisma.maintenanceRequest.findMany({
                    where,
                    orderBy: [
                        { machineStopped: 'desc' },
                        { urgency: 'desc' },
                        { createdAt: 'desc' },
                    ],
                    skip: (normalized.page - 1) * PAGE_SIZE,
                    take: PAGE_SIZE,
                    select: {
                        id: true,
                        orderNumber: true,
                        complaint: true,
                        urgency: true,
                        status: true,
                        assigneeName: true,
                        machineStopped: true,
                        createdAt: true,
                        updatedAt: true,
                        machine: {
                            select: { name: true, code: true },
                        },
                        _count: { select: { spareParts: true } },
                    },
                }),
                prisma.maintenanceRequest.count({ where }),
                prisma.maintenanceRequest.groupBy({
                    by: ['status'],
                    where: visibilityWhere,
                    _count: { _all: true },
                }),
                prisma.maintenanceRequest.count({
                    where: {
                        AND: [
                            visibilityWhere,
                            { status: { in: OPEN_STATUSES } },
                            { machineStopped: true },
                        ],
                    },
                }),
            ]);
            const statusCounts = new Map(
                grouped.map((item) => [item.status, item._count._all]),
            );
            return serializeData({
                rows: rows.map((row) => ({
                    ...row,
                    sparePartCount: row._count.spareParts,
                })),
                total,
                page: normalized.page,
                pageSize: PAGE_SIZE,
                totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
                stats: {
                    pending: statusCounts.get(MaintenanceStatus.PENDING) ?? 0,
                    approved: statusCounts.get(MaintenanceStatus.APPROVED) ?? 0,
                    inProgress:
                        statusCounts.get(MaintenanceStatus.IN_PROGRESS) ?? 0,
                    done: statusCounts.get(MaintenanceStatus.DONE) ?? 0,
                    machineStopped: stopped,
                },
            });
        });
    },
);

export const getMaintenanceDetail = withTenant(
    async function getMaintenanceDetail(id: string) {
        return safeAction(async () => {
            const session = await requireAuth();
            const userId = (session.user as { id: string }).id;
            const order = await MaintenanceService.getById(id);
            const roles = await rolesOf(userId, session);
            const isApproverRole = roles.some((role) =>
                APPROVER_ROLES.includes(role),
            );
            if (
                order.status === MaintenanceStatus.DRAFT &&
                order.createdById !== userId &&
                !isApproverRole
            ) {
                throw new BusinessRuleError(
                    'Draft maintenance hanya dapat dilihat oleh pembuatnya.',
                    { id },
                    'MAINTENANCE_DRAFT_OWNER_REQUIRED',
                );
            }
            const isAdmin = roles.includes(Role.ADMIN);
            const canDecide =
                isApproverRole &&
                (order.createdById !== userId || isAdmin) &&
                order.status === MaintenanceStatus.PENDING;
            const canExecute =
                order.assigneeId === userId ||
                (!order.assigneeId && order.createdById === userId);
            const technicians = canDecide ? await getActiveTechnicians() : [];
            return serializeData({
                ...order,
                technicians,
                viewer: {
                    canSubmit:
                        order.status === MaintenanceStatus.DRAFT &&
                        order.createdById === userId,
                    canApprove: canDecide,
                    canReject: canDecide,
                    canStart:
                        order.status === MaintenanceStatus.APPROVED &&
                        canExecute,
                    canComplete:
                        order.status === MaintenanceStatus.IN_PROGRESS &&
                        canExecute,
                },
            });
        });
    },
);
