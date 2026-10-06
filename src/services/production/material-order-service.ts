import { MaterialOrderStatus, Prisma } from '@prisma/client';
import { prisma } from '@/lib/core/prisma';
import { BusinessRuleError, NotFoundError } from '@/lib/errors/errors';
import type { CreateMaterialOrderValues } from '@/lib/schemas/material-order';
import { logActivity } from '@/lib/tools/audit';
import { toBusinessDateString } from '@/lib/utils/timezone';

async function buildOrderNumber(tx: Prisma.TransactionClient, prefix: string): Promise<string> {
  const datePart = toBusinessDateString(new Date()).slice(2).replace(/-/g, '');
  const dailyPrefix = prefix + '-' + datePart + '-';
  const last = await tx.materialOrder.findFirst({
    where: { orderNumber: { startsWith: dailyPrefix } },
    orderBy: { orderNumber: 'desc' },
    select: { orderNumber: true },
  });
  let next = 1;
  if (last?.orderNumber) {
    const n = parseInt(last.orderNumber.slice(dailyPrefix.length), 10);
    if (!isNaN(n)) next = n + 1;
  }
  return dailyPrefix + String(next).padStart(3, '0');
}

export class MaterialOrderService {
  static async create(data: CreateMaterialOrderValues, userId: string) {
    const existing = await prisma.materialOrder.findUnique({
      where: { clientRequestId: data.clientRequestId },
      select: { id: true, status: true, orderNumber: true },
    });
    if (existing) return { ...existing, idempotent: true };

    return await prisma.$transaction(async (tx) => {
      const prefix = 'MO-' + (data.orderType || 'HD');
      const orderNumber = await buildOrderNumber(tx, prefix);
      const created = await tx.materialOrder.create({
        data: {
          orderNumber,
          orderType: data.orderType || 'HD',
          bomId: data.bomId,
          outputVariantId: data.outputVariantId,
          plannedQuantity: data.plannedQuantity,
          notes: data.notes,
          createdById: userId,
          status: MaterialOrderStatus.DRAFT,
          clientRequestId: data.clientRequestId,
          items: {
            create: data.items.map((it) => ({
              productVariantId: it.productVariantId,
              quantity: it.quantity,
              zakQuantity: it.zakQuantity,
              note: it.note,
            })),
          },
        },
        include: { items: true },
      });
      await logActivity({
        userId, action: 'CREATE_MATERIAL_ORDER', entityType: 'MaterialOrder',
        entityId: created.id, details: 'Buat ' + orderNumber, fromStatus: undefined, toStatus: 'DRAFT', tx,
      });
      return { ...created, idempotent: false };
    });
  }

  static async submit(id: string, userId: string) {
    return await prisma.$transaction(async (tx) => {
      const { count } = await tx.materialOrder.updateMany({
        where: { id, status: MaterialOrderStatus.DRAFT },
        data: { status: MaterialOrderStatus.PENDING },
      });
      if (count !== 1) throw new BusinessRuleError('Hanya DRAFT yang bisa disubmit.', { id }, 'INVALID_MATERIAL_ORDER_STATUS');
      await logActivity({
        userId, action: 'SUBMIT_MATERIAL_ORDER', entityType: 'MaterialOrder',
        entityId: id, fromStatus: 'DRAFT', toStatus: 'PENDING', tx,
      });
      return tx.materialOrder.findUniqueOrThrow({ where: { id }, include: { items: true } });
    });
  }

  static async approve(id: string, actorId: string) {
    return await prisma.$transaction(async (tx) => {
      const { count } = await tx.materialOrder.updateMany({
        where: { id, status: MaterialOrderStatus.PENDING },
        data: { status: MaterialOrderStatus.APPROVED, approvedById: actorId, approvedAt: new Date(), rejectionReason: null },
      });
      if (count !== 1) throw new BusinessRuleError('Hanya PENDING yang bisa disetujui. Refresh dulu.', { id }, 'STALE_STATUS');
      const updated = await tx.materialOrder.findUniqueOrThrow({ where: { id }, include: { items: true } });
      await logActivity({
        userId: actorId, action: 'APPROVE_MATERIAL_ORDER', entityType: 'MaterialOrder',
        entityId: id, details: 'Setujui ' + updated.orderNumber, fromStatus: 'PENDING', toStatus: 'APPROVED', tx,
      });
      return updated;
    });
  }

  static async reject(id: string, actorId: string, reason: string) {
    const trimmed = reason.trim();
    if (!trimmed) throw new BusinessRuleError('Alasan tolak wajib diisi.', {}, 'REJECTION_REASON_REQUIRED');
    return await prisma.$transaction(async (tx) => {
      const { count } = await tx.materialOrder.updateMany({
        where: { id, status: MaterialOrderStatus.PENDING },
        data: { status: MaterialOrderStatus.REJECTED, approvedById: actorId, approvedAt: new Date(), rejectionReason: trimmed },
      });
      if (count !== 1) throw new BusinessRuleError('Hanya PENDING yang bisa ditolak.', { id }, 'STALE_STATUS');
      await logActivity({
        userId: actorId, action: 'REJECT_MATERIAL_ORDER', entityType: 'MaterialOrder',
        entityId: id, fromStatus: 'PENDING', toStatus: 'REJECTED', tx,
      });
      return tx.materialOrder.findUniqueOrThrow({ where: { id }, include: { items: true } });
    });
  }

  static async getById(id: string) {
    const row = await prisma.materialOrder.findUnique({ where: { id }, include: { items: true } });
    if (!row) throw new NotFoundError('Material Order', id);
    return row;
  }
}
