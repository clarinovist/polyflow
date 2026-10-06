import { MaintenanceStatus, Prisma } from '@prisma/client';
import { prisma } from '@/lib/core/prisma';
import { BusinessRuleError, NotFoundError } from '@/lib/errors/errors';
import type { CreateMaintenanceRequestValues } from '@/lib/schemas/maintenance';
import { logActivity } from '@/lib/tools/audit';
import { toBusinessDateString } from '@/lib/utils/timezone';

async function buildOrderNumber(tx: Prisma.TransactionClient): Promise<string> {
  const datePart = toBusinessDateString(new Date()).slice(2).replace(/-/g, '');
  const dailyPrefix = 'MT-' + datePart + '-';
  const last = await tx.maintenanceRequest.findFirst({
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

export class MaintenanceService {
  static async create(data: CreateMaintenanceRequestValues, userId: string) {
    const existing = await prisma.maintenanceRequest.findUnique({
      where: { clientRequestId: data.clientRequestId },
      select: { id: true, status: true, orderNumber: true },
    });
    if (existing) return { ...existing, idempotent: true };

    return await prisma.$transaction(async (tx) => {
      const orderNumber = await buildOrderNumber(tx);
      const created = await tx.maintenanceRequest.create({
        data: {
          orderNumber,
          machineId: data.machineId,
          complaint: data.complaint,
          urgency: data.urgency,
          machineStopped: data.machineStopped ?? false,
          createdById: userId,
          status: MaintenanceStatus.DRAFT,
          clientRequestId: data.clientRequestId,
          spareParts: { create: data.spareParts.map((s) => ({ name: s.name, spec: s.spec, quantity: s.quantity, note: s.note })) },
        },
        include: { spareParts: true },
      });
      await logActivity({
        userId, action: 'CREATE_MAINTENANCE', entityType: 'MaintenanceRequest',
        entityId: created.id, details: 'Buat ' + orderNumber, toStatus: 'DRAFT', tx,
      });
      return { ...created, idempotent: false };
    });
  }

  static async submit(id: string, userId: string) {
    return await prisma.$transaction(async (tx) => {
      const { count } = await tx.maintenanceRequest.updateMany({
        where: { id, status: MaintenanceStatus.DRAFT },
        data: { status: MaintenanceStatus.PENDING },
      });
      if (count !== 1) throw new BusinessRuleError('Hanya DRAFT yang bisa disubmit.', { id }, 'INVALID_MAINTENANCE_STATUS');
      await logActivity({
        userId, action: 'SUBMIT_MAINTENANCE', entityType: 'MaintenanceRequest',
        entityId: id, fromStatus: 'DRAFT', toStatus: 'PENDING', tx,
      });
      return tx.maintenanceRequest.findUniqueOrThrow({ where: { id }, include: { spareParts: true } });
    });
  }

  static async approve(id: string, actorId: string, assigneeName?: string) {
    return await prisma.$transaction(async (tx) => {
      const current = await tx.maintenanceRequest.findUnique({ where: { id }, select: { status: true, machineId: true, machineStopped: true } });
      if (!current) throw new NotFoundError('Maintenance Request', id);
      if (current.status !== MaintenanceStatus.PENDING) throw new BusinessRuleError('Hanya PENDING yang bisa disetujui. Refresh dulu.', { id }, 'STALE_STATUS');
      let downtimeId: string | undefined;
      if (current.machineStopped) {
        const dt = await tx.machineDowntime.create({
          data: { machineId: current.machineId, reason: 'Maintenance ' + id, startTime: new Date(), createdById: actorId },
          select: { id: true },
        });
        downtimeId = dt.id;
      }
      const { count } = await tx.maintenanceRequest.updateMany({
        where: { id, status: MaintenanceStatus.PENDING },
        data: {
          status: MaintenanceStatus.APPROVED, approvedById: actorId, approvedAt: new Date(),
          rejectionReason: null, assigneeName: assigneeName?.trim() || undefined, downtimeId,
        },
      });
      if (count !== 1) throw new BusinessRuleError('Status berubah, silakan refresh.', { id }, 'STALE_STATUS');
      const updated = await tx.maintenanceRequest.findUniqueOrThrow({ where: { id }, include: { spareParts: true } });
      await logActivity({
        userId: actorId, action: 'APPROVE_MAINTENANCE', entityType: 'MaintenanceRequest',
        entityId: id, details: 'Setujui ' + updated.orderNumber, fromStatus: 'PENDING', toStatus: 'APPROVED', tx,
      });
      return updated;
    });
  }

  static async reject(id: string, actorId: string, reason: string) {
    const trimmed = reason.trim();
    if (!trimmed) throw new BusinessRuleError('Alasan tolak wajib diisi.', {}, 'REJECTION_REASON_REQUIRED');
    return await prisma.$transaction(async (tx) => {
      const { count } = await tx.maintenanceRequest.updateMany({
        where: { id, status: MaintenanceStatus.PENDING },
        data: { status: MaintenanceStatus.REJECTED, approvedById: actorId, approvedAt: new Date(), rejectionReason: trimmed },
      });
      if (count !== 1) throw new BusinessRuleError('Hanya PENDING yang bisa ditolak.', { id }, 'STALE_STATUS');
      await logActivity({
        userId: actorId, action: 'REJECT_MAINTENANCE', entityType: 'MaintenanceRequest',
        entityId: id, fromStatus: 'PENDING', toStatus: 'REJECTED', tx,
      });
      return tx.maintenanceRequest.findUniqueOrThrow({ where: { id }, include: { spareParts: true } });
    });
  }

  static async start(id: string, actorId: string) {
    return await prisma.$transaction(async (tx) => {
      const { count } = await tx.maintenanceRequest.updateMany({
        where: { id, status: MaintenanceStatus.APPROVED },
        data: { status: MaintenanceStatus.IN_PROGRESS },
      });
      if (count !== 1) throw new BusinessRuleError('Hanya APPROVED yang bisa dikerjakan.', { id }, 'STALE_STATUS');
      await logActivity({
        userId: actorId, action: 'START_MAINTENANCE', entityType: 'MaintenanceRequest',
        entityId: id, fromStatus: 'APPROVED', toStatus: 'IN_PROGRESS', tx,
      });
      return tx.maintenanceRequest.findUniqueOrThrow({ where: { id }, include: { spareParts: true } });
    });
  }

  static async complete(id: string, actorId: string, note: string, fulfilledIds: string[]) {
    const trimmed = note.trim();
    if (!trimmed) throw new BusinessRuleError('Catatan hasil wajib diisi.', {}, 'COMPLETION_NOTE_REQUIRED');
    return await prisma.$transaction(async (tx) => {
      const current = await tx.maintenanceRequest.findUnique({ where: { id }, select: { status: true, downtimeId: true } });
      if (!current) throw new NotFoundError('Maintenance Request', id);
      if (current.status !== MaintenanceStatus.IN_PROGRESS) throw new BusinessRuleError('Hanya IN_PROGRESS yang bisa diselesaikan.', { id }, 'STALE_STATUS');
      if (fulfilledIds.length) {
        await tx.maintenanceSparePartNeed.updateMany({ where: { id: { in: fulfilledIds }, maintenanceRequestId: id }, data: { fulfilled: true } });
      }
      if (current.downtimeId) {
        await tx.machineDowntime.updateMany({ where: { id: current.downtimeId, endTime: null }, data: { endTime: new Date() } });
      }
      const { count } = await tx.maintenanceRequest.updateMany({
        where: { id, status: MaintenanceStatus.IN_PROGRESS },
        data: { status: MaintenanceStatus.DONE, completionNote: trimmed, completedAt: new Date() },
      });
      if (count !== 1) throw new BusinessRuleError('Status berubah, silakan refresh.', { id }, 'STALE_STATUS');
      await logActivity({
        userId: actorId, action: 'COMPLETE_MAINTENANCE', entityType: 'MaintenanceRequest',
        entityId: id, fromStatus: 'IN_PROGRESS', toStatus: 'DONE', tx,
      });
      return tx.maintenanceRequest.findUniqueOrThrow({ where: { id }, include: { spareParts: true } });
    });
  }

  static async getById(id: string) {
    const row = await prisma.maintenanceRequest.findUnique({ where: { id }, include: { spareParts: true, machine: { select: { name: true, code: true } } } });
    if (!row) throw new NotFoundError('Maintenance Request', id);
    return row;
  }
}
