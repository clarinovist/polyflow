/**
 * Employee allowances (tunjangan tetap) — scoped by employeeId on every write.
 */

import type { PrismaClient, Prisma } from '@prisma/client';
import { BusinessRuleError, NotFoundError } from '@/lib/errors/errors';

type TxClient = Prisma.TransactionClient;

export interface AllowanceInput {
    name: string;
    amount: number;
    isActive?: boolean;
}

/** Create or update one allowance row (update is scoped to the employee); returns its id. */
async function upsertAllowanceItem(
    tx: TxClient,
    employeeId: string,
    item: AllowanceInput & { id?: string },
): Promise<string> {
    const fields = {
        name: item.name.trim(),
        amount: item.amount,
        isActive: item.isActive ?? true,
    };
    if (!item.id) {
        const created = await tx.employeeAllowance.create({
            data: { employeeId, ...fields },
        });
        return created.id;
    }
    const updated = await tx.employeeAllowance.updateMany({
        where: { id: item.id, employeeId },
        data: fields,
    });
    if (updated.count !== 1)
        throw new NotFoundError('Tunjangan tidak ditemukan');
    return item.id;
}

export const EmployeeAllowanceService = {
    async list(db: PrismaClient, employeeId: string) {
        return db.employeeAllowance.findMany({
            where: { employeeId },
            orderBy: { createdAt: 'asc' },
        });
    },

    /**
     * Replace active set of allowances for an employee.
     * - Updates existing by id when provided
     * - Creates new rows without id
     * - Soft-deactivates rows not present in the payload (isActive=false)
     */
    async replaceForEmployee(
        db: PrismaClient,
        employeeId: string,
        items: Array<AllowanceInput & { id?: string }>,
    ) {
        const employee = await db.employee.findUnique({
            where: { id: employeeId },
            select: { id: true },
        });
        if (!employee) throw new NotFoundError('Karyawan tidak ditemukan');

        for (const item of items) {
            if (!item.name.trim())
                throw new BusinessRuleError('Nama tunjangan wajib diisi');
            if (!Number.isFinite(item.amount) || item.amount < 0)
                throw new BusinessRuleError(
                    'Nominal tunjangan tidak boleh negatif',
                );
        }

        return db.$transaction(async (tx) => {
            const existing = await tx.employeeAllowance.findMany({
                where: { employeeId },
            });
            const keepIds = new Set(
                items.map((i) => i.id).filter(Boolean) as string[],
            );

            // Soft-deactivate removed (scoped to this employee)
            for (const row of existing) {
                if (!keepIds.has(row.id)) {
                    await tx.employeeAllowance.updateMany({
                        where: { id: row.id, employeeId },
                        data: { isActive: false },
                    });
                }
            }

            const touchedIds: string[] = [];
            for (const item of items) {
                touchedIds.push(
                    await upsertAllowanceItem(tx, employeeId, item),
                );
            }
            return tx.employeeAllowance.findMany({
                where: { employeeId, id: { in: touchedIds } },
                orderBy: { createdAt: 'asc' },
            });
        });
    },

    /**
     * Soft-delete (keeps history references; payslip snapshots copy name/amount).
     * Scoped by employeeId so an id of another employee's allowance cannot be hit.
     */
    async remove(db: PrismaClient, id: string, employeeId: string) {
        const result = await db.employeeAllowance.updateMany({
            where: { id, employeeId },
            data: { isActive: false },
        });
        if (result.count !== 1)
            throw new NotFoundError('Tunjangan tidak ditemukan');
        return result;
    },
};
