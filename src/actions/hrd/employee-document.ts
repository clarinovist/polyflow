'use server';

import { withTenant } from '@/lib/core/tenant';
import { prisma } from '@/lib/core/prisma';
import { safeAction } from '@/lib/errors/errors';
import { requireHrdApprover, requireHrdFinance } from '@/lib/auth/hrd-access';
import { logActivity } from '@/lib/tools/audit';
import {
    EmployeeDocumentService,
    type CreateDocumentInput,
} from '@/lib/hrd/employee-document';

export const listEmployeeDocuments = withTenant(
    async function listEmployeeDocuments(employeeId: string, includeArchived?: boolean) {
        return safeAction(async () => {
            await requireHrdFinance();
            return EmployeeDocumentService.list(prisma, employeeId, includeArchived);
        });
    },
);

export const createEmployeeDocument = withTenant(
    async function createEmployeeDocument(data: CreateDocumentInput) {
        return safeAction(async () => {
            const session = await requireHrdApprover();
            const doc = await EmployeeDocumentService.create(prisma, {
                ...data,
                uploadedById: session.user.id,
            });
            await logActivity({
                userId: session.user.id,
                action: 'EMPLOYEE_DOCUMENT_UPLOADED',
                entityType: 'EmployeeDocument',
                entityId: doc.id,
                details: `Uploaded ${data.category} "${data.name}" for employee ${data.employeeId}`,
            });
            return doc;
        });
    },
);

export const archiveEmployeeDocument = withTenant(
    async function archiveEmployeeDocument(documentId: string) {
        return safeAction(async () => {
            const session = await requireHrdApprover();
            const doc = await EmployeeDocumentService.archive(prisma, documentId);
            await logActivity({
                userId: session.user.id,
                action: 'EMPLOYEE_DOCUMENT_ARCHIVED',
                entityType: 'EmployeeDocument',
                entityId: documentId,
                details: `Archived document ${documentId}`,
            });
            return doc;
        });
    },
);

export const restoreEmployeeDocument = withTenant(
    async function restoreEmployeeDocument(documentId: string) {
        return safeAction(async () => {
            const session = await requireHrdApprover();
            const doc = await EmployeeDocumentService.restore(prisma, documentId);
            await logActivity({
                userId: session.user.id,
                action: 'EMPLOYEE_DOCUMENT_RESTORED',
                entityType: 'EmployeeDocument',
                entityId: documentId,
                details: `Restored document ${documentId}`,
            });
            return doc;
        });
    },
);

export const deleteEmployeeDocument = withTenant(
    async function deleteEmployeeDocument(documentId: string) {
        return safeAction(async () => {
            const session = await requireHrdApprover();
            await EmployeeDocumentService.remove(prisma, documentId);
            await logActivity({
                userId: session.user.id,
                action: 'EMPLOYEE_DOCUMENT_DELETED',
                entityType: 'EmployeeDocument',
                entityId: documentId,
                details: `Deleted document ${documentId}`,
            });
            return null;
        });
    },
);
