import { customerCreditDb } from './customer-credit-shared';
import { BusinessRuleError } from '@/lib/errors/errors';
import {
    customerCreditLinkInput,
    revokeCustomerCreditLinkInput,
} from '@/lib/finance/customer-credit';
import { logActivity } from '@/lib/tools/audit';

/** ADMIN action only. Direct pair, no transitive groups or rewriting historical masters. */
export async function approveCustomerCreditLink(
    input: unknown,
    userId: string,
) {
    const data = customerCreditLinkInput.parse(input);
    const [fromCustomerId, toCustomerId] = [
        data.fromCustomerId,
        data.toCustomerId,
    ].sort();
    if (fromCustomerId === toCustomerId)
        throw new BusinessRuleError('Pilih dua master customer berbeda.');
    return customerCreditDb().$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Customer" WHERE id IN (${fromCustomerId},${toCustomerId}) ORDER BY id FOR UPDATE`;
        if (
            (await tx.customer.count({
                where: {
                    id: { in: [fromCustomerId, toCustomerId] },
                    isActive: true,
                },
            })) !== 2
        )
            throw new BusinessRuleError(
                'Kedua customer harus aktif dan berada pada tenant ini.',
            );
        const existing = await tx.customerCreditLink.findFirst({
            where: { fromCustomerId, toCustomerId, revokedAt: null },
        });
        if (existing) {
            if (
                existing.reason !== data.reason ||
                existing.evidence !== data.evidence
            )
                throw new BusinessRuleError(
                    'Hubungan sudah disetujui dengan bukti berbeda.',
                );
            return { id: existing.id };
        }
        const row = await tx.customerCreditLink.create({
            data: {
                fromCustomerId,
                toCustomerId,
                reason: data.reason,
                evidence: data.evidence,
                createdById: userId,
            },
        });
        await logActivity({
            userId,
            action: 'APPROVE_CUSTOMER_CREDIT_IDENTITY',
            entityType: 'CustomerCreditLink',
            entityId: row.id,
            details: data.reason,
            changes: { fromCustomerId, toCustomerId, evidence: data.evidence },
            tx,
        });
        return { id: row.id };
    });
}
export async function revokeCustomerCreditLink(input: unknown, userId: string) {
    const data = revokeCustomerCreditLinkInput.parse(input);
    return customerCreditDb().$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "CustomerCreditLink" WHERE id=${data.id} FOR UPDATE`;
        const row = await tx.customerCreditLink.findUniqueOrThrow({
            where: { id: data.id },
        });
        if (row.revokedAt) {
            if (row.revokeReason !== data.reason)
                throw new BusinessRuleError(
                    'Hubungan sudah dicabut dengan alasan berbeda.',
                );
            return { id: row.id };
        }
        await tx.customerCreditLink.update({
            where: { id: row.id },
            data: {
                revokedAt: new Date(),
                revokedById: userId,
                revokeReason: data.reason,
            },
        });
        await logActivity({
            userId,
            action: 'REVOKE_CUSTOMER_CREDIT_IDENTITY',
            entityType: 'CustomerCreditLink',
            entityId: row.id,
            details: data.reason,
            tx,
        });
        return { id: row.id };
    });
}
