'use server';

import { withTenant } from '@/lib/core/tenant';
import { prisma } from '@/lib/core/prisma';
import { safeAction, BusinessRuleError } from '@/lib/errors/errors';
import { requireAuth } from '@/lib/tools/auth-checks';
import { serializeData } from '@/lib/utils/utils';
import { MaterialOrderStatus, NotificationType, Role } from '@prisma/client';
import { createMaterialOrderSchema } from '@/lib/schemas/material-order';
import { MaterialOrderService } from '@/services/production/material-order-service';
import { NotificationService } from '@/services/core/notification-service';

/** Matrix generik: pembuat (PPIC/Produksi) submit -> ADMIN/Kepala Pabrik approve -> Owner FYI. Tanpa nama orang/divisi hardcoded. */
const APPROVER_ROLES: Role[] = [Role.ADMIN, Role.FACTORY_MANAGER];

function sessionRoles(session: unknown): Role[] {
  const r = (session as { user?: { role?: Role; roles?: Role[] } } | null)?.user;
  const list = [...(r?.roles ?? []), ...(r?.role ? [r.role] : [])];
  return [...new Set(list)];
}

async function requireApprover(userId: string, session: unknown): Promise<void> {
  let roles = sessionRoles(session);
  if (!roles.length) {
    const rows = await prisma.userRole.findMany({ where: { userId }, select: { role: true } });
    roles = rows.map((row) => row.role);
  }
  if (!roles.some((r) => APPROVER_ROLES.includes(r))) {
    throw new BusinessRuleError('Hanya ADMIN atau Kepala Pabrik yang boleh menyetujui Material Order.', { userId }, 'APPROVER_ROLE_REQUIRED');
  }
}

export const getMaterialOrderFormData = withTenant(async function getMaterialOrderFormData() {
  return safeAction(async () => {
    await requireAuth();
    const [boms, materials, orderTypes] = await Promise.all([
      prisma.bom.findMany({
        where: { isActive: true },
        select: {
          id: true, name: true,
          productVariant: { select: { name: true, skuCode: true, product: { select: { name: true } } } },
          items: { select: { quantity: true, productVariant: { select: { id: true, name: true, skuCode: true } } } },
        },
        orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
        take: 100,
      }).catch(() => []),
      prisma.productVariant.findMany({
        where: { archivedAt: null },
        select: { id: true, name: true, skuCode: true },
        orderBy: { name: 'asc' },
        take: 300,
      }).catch(() => []),
      prisma.materialOrder.findMany({ select: { orderType: true }, distinct: ['orderType'], take: 20 }).catch(() => [] as Array<{ orderType: string }>),
    ]);
    return serializeData({
      boms: boms.map((b) => ({
        id: b.id,
        name: b.name,
        productName: b.productVariant?.product?.name ?? b.productVariant?.name ?? b.name,
        items: b.items.map((it) => ({
          productVariantId: it.productVariant.id,
          name: it.productVariant.name,
          skuCode: it.productVariant.skuCode,
          quantity: Number(it.quantity),
        })),
      })),
      materials: materials.map((m) => ({ id: m.id, name: m.name, skuCode: m.skuCode })),
      orderTypes: [...new Set(orderTypes.map((o) => o.orderType))],
    });
  });
});

export const createMaterialOrder = withTenant(async function createMaterialOrder(input: unknown) {
  return safeAction(async () => {
    const session = await requireAuth();
    const userId = (session.user as { id: string }).id;
    const parsed = createMaterialOrderSchema.parse(input);
    const order = await MaterialOrderService.create(parsed, userId);
    return serializeData({ id: order.id, orderNumber: order.orderNumber });
  });
});

export const submitMaterialOrder = withTenant(async function submitMaterialOrder(id: string) {
  return safeAction(async () => {
    const session = await requireAuth();
    const userId = (session.user as { id: string }).id;
    await MaterialOrderService.submit(id, userId);
    try {
      const approvers = await prisma.user.findMany({
        where: { isActive: true, roles: { some: { role: { in: APPROVER_ROLES } } } },
        select: { id: true },
        take: 20,
      });
      if (approvers.length) {
        await NotificationService.createBulkNotifications(approvers.map((a) => ({
          userId: a.id, type: NotificationType.SYSTEM, title: 'Material Order perlu persetujuan',
          message: 'Material Order baru menunggu persetujuan.',
          entityType: 'MaterialOrder', entityId: id, link: '/production/mobile/material-orders/' + id,
        })));
      }
    } catch { /* notif best-effort */ }
    return serializeData({ id });
  });
});

export const approveMaterialOrder = withTenant(async function approveMaterialOrder(id: string) {
  return safeAction(async () => {
    const session = await requireAuth();
    const userId = (session.user as { id: string }).id;
    await requireApprover(userId, session);
    const existing = await MaterialOrderService.getById(id);
    if (existing.createdById === userId) {
      const roles = sessionRoles(session);
      if (!roles.includes(Role.ADMIN)) throw new BusinessRuleError('Pembuat order tidak boleh menyetujui order sendiri.', { id }, 'SELF_APPROVAL_NOT_ALLOWED');
    }
    const order = await MaterialOrderService.approve(id, userId);
    try {
      const owners = await prisma.user.findMany({
        where: { isActive: true, OR: [{ isSuperAdmin: true }, { roles: { some: { role: Role.ADMIN } } }] },
        select: { id: true },
        take: 10,
      });
      if (owners.length) {
        await NotificationService.createBulkNotifications(owners.map((o) => ({
          userId: o.id, type: NotificationType.SYSTEM, title: 'Material Order disetujui ' + order.orderNumber,
          message: 'FYI: ' + order.orderNumber + ' (' + order.orderType + '). Tidak perlu tindakan.',
          entityType: 'MaterialOrder', entityId: order.id, link: '/production/material-orders/' + order.id,
        })));
      }
    } catch { /* best-effort */ }
    return serializeData({ id: order.id });
  });
});

export const rejectMaterialOrder = withTenant(async function rejectMaterialOrder(id: string, reason: string) {
  return safeAction(async () => {
    const session = await requireAuth();
    const userId = (session.user as { id: string }).id;
    await requireApprover(userId, session);
    await MaterialOrderService.reject(id, userId, reason);
    return serializeData({ id });
  });
});

export const getMaterialOrders = withTenant(async function getMaterialOrders(status?: string) {
  return safeAction(async () => {
    await requireAuth();
    const rows = await prisma.materialOrder.findMany({
      where: status ? { status: status as MaterialOrderStatus } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, orderNumber: true, orderType: true, status: true, createdAt: true, _count: { select: { items: true } } },
    });
    return serializeData(rows.map((r) => ({ ...r, itemCount: r._count.items })));
  });
});

export const getMaterialOrderDetail = withTenant(async function getMaterialOrderDetail(id: string) {
  return safeAction(async () => {
    await requireAuth();
    const order = await MaterialOrderService.getById(id);
    return serializeData(order);
  });
});
