'use server';

import { withTenant } from '@/lib/core/tenant';
import { prisma } from '@/lib/core/prisma';
import { safeAction, BusinessRuleError } from '@/lib/errors/errors';
import { requireAuth } from '@/lib/tools/auth-checks';
import { serializeData } from '@/lib/utils/utils';
import { MaintenanceStatus, NotificationType, Role } from '@prisma/client';
import { createMaintenanceRequestSchema } from '@/lib/schemas/maintenance';
import { MaintenanceService } from '@/services/production/maintenance-service';
import { NotificationService } from '@/services/core/notification-service';

const APPROVER_ROLES: Role[] = [Role.ADMIN, Role.FACTORY_MANAGER];

function sessionRoles(session: unknown): Role[] {
  const r = (session as { user?: { role?: Role; roles?: Role[] } } | null)?.user;
  return [...new Set([...(r?.roles ?? []), ...(r?.role ? [r.role] : [])])];
}

async function rolesOf(userId: string, session: unknown): Promise<Role[]> {
  const s = sessionRoles(session);
  if (s.length) return s;
  const rows = await prisma.userRole.findMany({ where: { userId }, select: { role: true } });
  return rows.map((row) => row.role);
}

async function requireApprover(userId: string, session: unknown): Promise<void> {
  const roles = await rolesOf(userId, session);
  if (!roles.some((r) => APPROVER_ROLES.includes(r))) {
    throw new BusinessRuleError('Hanya ADMIN atau Kepala Pabrik yang boleh menyetujui maintenance.', { userId }, 'APPROVER_ROLE_REQUIRED');
  }
}

async function requireExecutor(order: { createdById: string }, userId: string, session: unknown): Promise<void> {
  const roles = await rolesOf(userId, session);
  if (roles.some((r) => APPROVER_ROLES.includes(r)) || order.createdById === userId) return;
  throw new BusinessRuleError('Hanya Kepala Pabrik/Admin atau pelapor yang boleh memproses maintenance.', { userId }, 'EXECUTOR_ROLE_REQUIRED');
}

export const getMaintenanceFormData = withTenant(async function getMaintenanceFormData() {
  return safeAction(async () => {
    await requireAuth();
    const [machines, spareCatalog, locations] = await Promise.all([
      prisma.machine.findMany({
        where: { status: { not: 'INACTIVE' as never } },
        select: { id: true, name: true, code: true, status: true },
        orderBy: { code: 'asc' },
        take: 200,
      }).catch(() => []),
      prisma.productVariant.findMany({
        where: { archivedAt: null, product: { productType: 'OPERATIONAL' } },
        select: { id: true, name: true, skuCode: true },
        orderBy: { name: 'asc' },
        take: 300,
      }).catch(() => []),
      prisma.location.findMany({
        select: { id: true, name: true, slug: true },
        orderBy: { name: 'asc' },
        take: 100,
      }).catch(() => []),
    ]);
    return serializeData({ machines, spareCatalog, locations });
  });
});

export const createMaintenanceRequest = withTenant(async function createMaintenanceRequest(input: unknown) {
  return safeAction(async () => {
    const session = await requireAuth();
    const userId = (session.user as { id: string }).id;
    const parsed = createMaintenanceRequestSchema.parse(input);
    const order = await MaintenanceService.create(parsed, userId);
    return serializeData({ id: order.id, orderNumber: order.orderNumber });
  });
});

export const submitMaintenanceRequest = withTenant(async function submitMaintenanceRequest(id: string) {
  return safeAction(async () => {
    const session = await requireAuth();
    const userId = (session.user as { id: string }).id;
    await MaintenanceService.submit(id, userId);
    try {
      const approvers = await prisma.user.findMany({
        where: { isActive: true, roles: { some: { role: { in: APPROVER_ROLES } } } },
        select: { id: true },
        take: 20,
      });
      if (approvers.length) {
        await NotificationService.createBulkNotifications(approvers.map((a) => ({
          userId: a.id, type: NotificationType.SYSTEM, title: 'Maintenance perlu persetujuan',
          message: 'Permintaan maintenance baru menunggu persetujuan.',
          entityType: 'MaintenanceRequest', entityId: id, link: '/production/mobile/maintenance/' + id,
        })));
      }
    } catch { /* best-effort */ }
    return serializeData({ id });
  });
});

export const approveMaintenanceRequest = withTenant(async function approveMaintenanceRequest(id: string, assigneeName?: string) {
  return safeAction(async () => {
    const session = await requireAuth();
    const userId = (session.user as { id: string }).id;
    await requireApprover(userId, session);
    const existing = await MaintenanceService.getById(id);
    if (existing.createdById === userId && !sessionRoles(session).includes(Role.ADMIN)) {
      throw new BusinessRuleError('Pembuat tidak boleh menyetujui sendiri.', { id }, 'SELF_APPROVAL_NOT_ALLOWED');
    }
    const order = await MaintenanceService.approve(id, userId, assigneeName);
    try {
      await NotificationService.createNotification({
        userId: order.createdById, type: NotificationType.SYSTEM, title: 'Maintenance disetujui ' + order.orderNumber,
        message: 'Teknisi: ' + (order.assigneeName || '-') + '. Segera kerjakan.',
        entityType: 'MaintenanceRequest', entityId: id, link: '/production/mobile/maintenance/' + id,
      });
    } catch { /* best-effort */ }
    return serializeData({ id: order.id });
  });
});

export const rejectMaintenanceRequest = withTenant(async function rejectMaintenanceRequest(id: string, reason: string) {
  return safeAction(async () => {
    const session = await requireAuth();
    const userId = (session.user as { id: string }).id;
    await requireApprover(userId, session);
    await MaintenanceService.reject(id, userId, reason);
    return serializeData({ id });
  });
});

export const startMaintenanceRequest = withTenant(async function startMaintenanceRequest(id: string) {
  return safeAction(async () => {
    const session = await requireAuth();
    const userId = (session.user as { id: string }).id;
    const existing = await MaintenanceService.getById(id);
    await requireExecutor(existing, userId, session);
    await MaintenanceService.start(id, userId);
    return serializeData({ id });
  });
});

export const completeMaintenanceRequest = withTenant(async function completeMaintenanceRequest(id: string, note: string, fulfilledIds: string[]) {
  return safeAction(async () => {
    const session = await requireAuth();
    const userId = (session.user as { id: string }).id;
    const existing = await MaintenanceService.getById(id);
    await requireExecutor(existing, userId, session);
    const order = await MaintenanceService.complete(id, userId, note, fulfilledIds);
    try {
      const owners = await prisma.user.findMany({
        where: { isActive: true, OR: [{ isSuperAdmin: true }, { roles: { some: { role: Role.ADMIN } } }] },
        select: { id: true },
        take: 10,
      });
      if (owners.length) {
        await NotificationService.createBulkNotifications(owners.map((o) => ({
          userId: o.id, type: NotificationType.SYSTEM, title: 'Maintenance selesai ' + order.orderNumber,
          message: 'FYI: ' + order.orderNumber + ' selesai. ' + (order.completionNote || ''),
          entityType: 'MaintenanceRequest', entityId: id, link: '/production/maintenance/' + id,
        })));
      }
    } catch { /* best-effort */ }
    return serializeData({ id });
  });
});

export const getMaintenanceRequests = withTenant(async function getMaintenanceRequests(status?: string) {
  return safeAction(async () => {
    await requireAuth();
    const rows = await prisma.maintenanceRequest.findMany({
      where: status ? { status: status as MaintenanceStatus } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, orderNumber: true, urgency: true, status: true, assigneeName: true, machine: { select: { name: true, code: true } } },
    });
    return serializeData(rows);
  });
});

export const getMaintenanceDetail = withTenant(async function getMaintenanceDetail(id: string) {
  return safeAction(async () => {
    await requireAuth();
    const order = await MaintenanceService.getById(id);
    return serializeData(order);
  });
});
