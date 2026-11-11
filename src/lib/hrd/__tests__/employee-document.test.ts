import { describe, it, expect, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { BusinessRuleError } from '@/lib/errors/errors';
import { EmployeeDocumentService } from '../employee-document';

function makeDb() {
    const create = vi.fn().mockResolvedValue({ id: 'doc-1' });
    const db = {
        employee: {
            findUnique: vi.fn().mockResolvedValue({ id: 'emp-1' }),
        },
        employeeDocument: { create },
    } as unknown as PrismaClient;
    return { db, create };
}

const baseInput = {
    employeeId: 'emp-1',
    category: 'KTP',
    name: 'KTP',
};

describe('EmployeeDocumentService.create — fileUrl safety', () => {
    it.each(['javascript:alert(1)', 'data:text/html,x', '//evil.test/a.jpg', 'http://x.test/a.pdf'])(
        'rejects unsafe fileUrl %s without writing',
        async (fileUrl) => {
            const { db, create } = makeDb();

            await expect(
                EmployeeDocumentService.create(db, { ...baseInput, fileUrl }),
            ).rejects.toBeInstanceOf(BusinessRuleError);
            expect(create).not.toHaveBeenCalled();
        },
    );

    it('stores a safe internal image url', async () => {
        const { db, create } = makeDb();
        const fileUrl = '/api/images/acme/hrd-docs/employee/emp-1/1.jpg';

        await EmployeeDocumentService.create(db, { ...baseInput, fileUrl });

        expect(create).toHaveBeenCalledTimes(1);
        expect(create.mock.calls[0][0].data.fileUrl).toBe(fileUrl);
    });
});
