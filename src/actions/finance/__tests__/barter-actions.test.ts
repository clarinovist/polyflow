import { beforeEach, describe, expect, it, vi } from 'vitest';

const { guards, partnerService, settlementService, prisma } = vi.hoisted(() => ({
    guards: {
        access: vi.fn(),
        admin: vi.fn(),
        approver: vi.fn(),
        mutation: vi.fn(),
    },
    partnerService: {
        getSettings: vi.fn(),
        save: vi.fn(),
    },
    settlementService: {
        create: vi.fn(),
        void: vi.fn(),
    },
    prisma: {
        invoice: { findUnique: vi.fn() },
        barterPartner: { findUnique: vi.fn() },
        purchaseInvoice: { findMany: vi.fn(), fields: { totalAmount: 'totalAmount' } },
    },
}));

vi.mock('@/lib/core/tenant', () => ({ withTenant: (fn: unknown) => fn }));
vi.mock('@/lib/core/prisma', () => ({ prisma }));
vi.mock('@/lib/auth/finance-access', () => ({
    requireFinanceAccess: guards.access,
    requireFinanceAdmin: guards.admin,
    requireFinanceApprover: guards.approver,
    requireFinanceMutation: guards.mutation,
}));
vi.mock('@/services/finance/barter-partner-service', () => ({
    BarterPartnerService: partnerService,
}));
vi.mock('@/services/finance/barter-settlement-service', () => ({
    BarterSettlementService: settlementService,
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import {
    createBarterSettlement,
    getBarterOptions,
    getBarterPartnerSettings,
    saveBarterPartner,
    voidBarterSettlement,
} from '../barter-actions';

const customerId = '11111111-1111-4111-8111-111111111111';
const supplierId = '22222222-2222-4222-8222-222222222222';
const invoiceId = '33333333-3333-4333-8333-333333333333';
const purchaseInvoiceId = '44444444-4444-4444-8444-444444444444';
const settlementId = '55555555-5555-4555-8555-555555555555';

describe('barter actions authorization and routing', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        guards.access.mockResolvedValue({ user: { id: 'finance-1' } });
        guards.admin.mockResolvedValue({ user: { id: 'admin-1' } });
        guards.approver.mockResolvedValue({ user: { id: 'approver-1' } });
        guards.mutation.mockResolvedValue({ user: { id: 'finance-1' } });
    });

    it('uses Admin guard for allowlist read and write', async () => {
        partnerService.getSettings.mockResolvedValue({
            partner: null,
            candidates: [],
        });
        partnerService.save.mockResolvedValue({ id: 'partner-1' });

        expect((await getBarterPartnerSettings(customerId)).success).toBe(true);
        expect(
            (
                await saveBarterPartner({
                    customerId,
                    supplierId,
                    isActive: true,
                })
            ).success,
        ).toBe(true);
        expect(guards.admin).toHaveBeenCalledTimes(2);
        expect(partnerService.save).toHaveBeenCalledWith(
            expect.objectContaining({ customerId, supplierId }),
            'admin-1',
        );
    });

    it('uses mutation guard for create and approver guard for void', async () => {
        settlementService.create.mockResolvedValue({
            id: settlementId,
            settlementNumber: 'BRT-00001',
        });
        settlementService.void.mockResolvedValue({
            id: settlementId,
            settlementNumber: 'BRT-00001',
            status: 'VOIDED',
        });

        const createResult = await createBarterSettlement({
            invoiceId,
            purchaseInvoiceId,
            barterAmount: 100,
            barterDate: new Date('2026-09-09T00:00:00.000Z'),
            includeCashPayment: false,
            notes: 'Kesepakatan barter',
            idempotencyKey: 'retry-key-123',
        });
        const voidResult = await voidBarterSettlement({
            settlementId,
            reason: 'Dokumen salah',
        });

        expect(createResult.success).toBe(true);
        expect(voidResult.success).toBe(true);
        expect(guards.mutation).toHaveBeenCalledOnce();
        expect(guards.approver).toHaveBeenCalledOnce();
    });

    it('filters AP options by the server-side partner id', async () => {
        prisma.invoice.findUnique.mockResolvedValue({
            id: invoiceId,
            status: 'UNPAID',
            totalAmount: {
                minus: () => ({ lte: () => false, valueOf: () => 500 }),
            },
            paidAmount: 0,
            salesOrder: { customerId },
        });
        prisma.barterPartner.findUnique.mockResolvedValue({
            isActive: true,
            supplierId,
            customer: {
                id: customerId,
                isActive: true,
                lifecycleStatus: 'ACTIVE',
            },
            supplier: { id: supplierId, name: 'PT Sama', isActive: true },
        });
        prisma.purchaseInvoice.findMany.mockResolvedValue([]);

        const result = await getBarterOptions(invoiceId);

        expect(result.success).toBe(true);
        expect(prisma.purchaseInvoice.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    purchaseOrder: { supplierId },
                paidAmount: { lt: 'totalAmount' },
                }),
            }),
        );
    });

    it('does not offer barter for an already paid invoice', async () => {
        prisma.invoice.findUnique.mockResolvedValue({
            id: invoiceId,
            status: 'PAID',
            totalAmount: { minus: () => ({ lte: () => true }) },
            paidAmount: 500,
            salesOrder: { customerId },
        });

        const result = await getBarterOptions(invoiceId);

        expect(result).toMatchObject({
            success: true,
            data: { eligible: false, purchaseInvoices: [] },
        });
        expect(prisma.barterPartner.findUnique).not.toHaveBeenCalled();
    });
});
