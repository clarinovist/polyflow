import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildOperationalSalesReceivableOrderWhere } from '@/lib/sales/operational-receivables';

const withTenantMock = vi.hoisted(() => vi.fn((fn: unknown) => fn));

vi.mock('@/lib/core/tenant', () => ({
    withTenant: withTenantMock,
    getTenantContext: () => ({ tenantId: 'test-tenant' }),
}));

vi.mock('@/auth', () => ({ auth: vi.fn() }));

vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        user: { findUnique: vi.fn() },
        invoice: { findFirst: vi.fn(), findUnique: vi.fn() },
    },
}));

vi.mock('next/navigation', () => ({
    redirect: vi.fn(() => {
        throw new Error('REDIRECT');
    }),
}));

vi.mock('@/lib/utils/utils', () => ({
    serializeData: vi.fn((value: unknown) => value),
}));

import { auth } from '@/auth';
import { prisma } from '@/lib/core/prisma';
import { getSalesInvoiceForPrint } from '../invoice-print';

// Captured at import time: clearAllMocks() in beforeEach wipes mock.calls.
const withTenantCalls = [...withTenantMock.mock.calls];

const INVOICE_ID = 'invoice-1';
const ALLOWED_ROLES = ['MARKETING', 'SALES', 'FINANCE', 'ADMIN'] as const;
const DENIED_ROLES = ['WAREHOUSE', 'PRODUCTION', 'PROCUREMENT', 'HRD'] as const;

function signInAs(role: string) {
    vi.mocked(auth).mockResolvedValue({
        user: { id: 'u1', name: 'Test', role, roles: [role] },
    } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'u1' } as never);
}

describe('getSalesInvoiceForPrint', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(prisma.invoice.findFirst).mockResolvedValue({
            id: INVOICE_ID,
            invoiceNumber: 'INV-001',
        } as never);
    });

    it('is wrapped with withTenant', () => {
        expect(withTenantCalls).toHaveLength(1);
        const [wrapped] = withTenantCalls[0] as [{ name: string }];
        expect(wrapped.name).toBe('getSalesInvoiceForPrint');
    });

    it.each(ALLOWED_ROLES)('allows %s to read the invoice', async (role) => {
        signInAs(role);

        const result = await getSalesInvoiceForPrint(INVOICE_ID);

        expect(result).toEqual({
            success: true,
            data: { id: INVOICE_ID, invoiceNumber: 'INV-001' },
        });
    });

    it.each(DENIED_ROLES)(
        'denies %s and never queries the invoice',
        async (role) => {
            signInAs(role);

            const result = await getSalesInvoiceForPrint(INVOICE_ID);

            expect(result).toEqual(
                expect.objectContaining({ success: false }),
            );
            expect(prisma.invoice.findFirst).not.toHaveBeenCalled();
        },
    );

    it('scopes the lookup to operational receivables with findFirst', async () => {
        signInAs('MARKETING');

        await getSalesInvoiceForPrint(INVOICE_ID);

        expect(prisma.invoice.findUnique).not.toHaveBeenCalled();
        expect(prisma.invoice.findFirst).toHaveBeenCalledTimes(1);
        const args = vi.mocked(prisma.invoice.findFirst).mock.calls[0][0];
        expect(args?.where).toEqual({
            id: INVOICE_ID,
            salesOrder: buildOperationalSalesReceivableOrderWhere(),
        });
    });

    it('selects only the fields the print template renders', async () => {
        signInAs('SALES');

        await getSalesInvoiceForPrint(INVOICE_ID);

        const args = vi.mocked(prisma.invoice.findFirst).mock.calls[0][0];
        expect(args?.include).toBeUndefined();
        expect(args?.select).toEqual(
            expect.objectContaining({
                invoiceNumber: true,
                commercialSnapshot: true,
                salesOrder: {
                    select: {
                        orderNumber: true,
                        customer: {
                            select: {
                                name: true,
                                phone: true,
                                email: true,
                                billingAddress: true,
                                shippingAddress: true,
                                taxId: true,
                            },
                        },
                    },
                },
            }),
        );
    });

    it('never selects product cost data', async () => {
        signInAs('MARKETING');

        await getSalesInvoiceForPrint(INVOICE_ID);

        const args = vi.mocked(prisma.invoice.findFirst).mock.calls[0][0];
        const serialized = JSON.stringify(args?.select);
        expect(serialized).not.toMatch(
            /buyPrice|standardCost|costingMethod|productVariant|items/,
        );
    });

    it('returns null data when the invoice is outside the operational scope', async () => {
        signInAs('MARKETING');
        vi.mocked(prisma.invoice.findFirst).mockResolvedValue(null);

        const result = await getSalesInvoiceForPrint('historical-invoice');

        expect(result).toEqual({ success: true, data: null });
    });

    it('surfaces a database failure as an error result', async () => {
        signInAs('MARKETING');
        vi.mocked(prisma.invoice.findFirst).mockRejectedValue(
            new Error('db down'),
        );

        const result = await getSalesInvoiceForPrint(INVOICE_ID);

        expect(result).toEqual(expect.objectContaining({ success: false }));
    });
});
