/**
 * Employee document vault service — CRUD for EmployeeDocument.
 * Gelombang B2.
 */

import type { PrismaClient } from '@prisma/client';
import { BusinessRuleError, NotFoundError } from '@/lib/errors/errors';

export interface CreateDocumentInput {
  employeeId: string;
  category: string;
  name: string;
  fileUrl: string;
  fileSize?: number;
  mimeType?: string;
  notes?: string;
  uploadedById?: string;
}

export const EmployeeDocumentService = {
  async list(db: PrismaClient, employeeId: string, includeArchived = false) {
    const where: Record<string, unknown> = { employeeId };
    if (!includeArchived) where.status = 'ACTIVE';
    return db.employeeDocument.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  },

  async create(db: PrismaClient, data: CreateDocumentInput) {
    const employee = await db.employee.findUnique({ where: { id: data.employeeId }, select: { id: true } });
    if (!employee) throw new NotFoundError('Karyawan tidak ditemukan');
    return db.employeeDocument.create({
      data: {
        employeeId: data.employeeId,
        category: data.category as never,
        name: data.name,
        fileUrl: data.fileUrl,
        fileSize: data.fileSize ?? null,
        mimeType: data.mimeType ?? null,
        notes: data.notes ?? null,
        uploadedById: data.uploadedById ?? null,
      },
    });
  },

  async archive(db: PrismaClient, documentId: string) {
    const doc = await db.employeeDocument.findUnique({ where: { id: documentId } });
    if (!doc) throw new NotFoundError('Dokumen tidak ditemukan');
    if (doc.status === 'ARCHIVED') throw new BusinessRuleError('Dokumen sudah diarsipkan');
    return db.employeeDocument.update({
      where: { id: documentId },
      data: { status: 'ARCHIVED' },
    });
  },

  async restore(db: PrismaClient, documentId: string) {
    const doc = await db.employeeDocument.findUnique({ where: { id: documentId } });
    if (!doc) throw new NotFoundError('Dokumen tidak ditemukan');
    if (doc.status === 'ACTIVE') throw new BusinessRuleError('Dokumen sudah aktif');
    return db.employeeDocument.update({
      where: { id: documentId },
      data: { status: 'ACTIVE' },
    });
  },

  async remove(db: PrismaClient, documentId: string) {
    const doc = await db.employeeDocument.findUnique({ where: { id: documentId } });
    if (!doc) throw new NotFoundError('Dokumen tidak ditemukan');
    return db.employeeDocument.delete({ where: { id: documentId } });
  },
};
