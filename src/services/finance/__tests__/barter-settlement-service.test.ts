import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';

const { tx, prisma, postSales, offsetJournal, cashJournal, audit } = vi.hoisted(
    () => {
        const tx = {
            $queryRaw: vi.fn().mockResolvedValue([]),
            account: { findMany: vi.fn() },
            barterPartner: { findUnique: vi.fn() },
            barterSettlement: {
                findUnique: vi.fn(),
                create: vi.fn(),
                update: vi.fn(),
                findUniqueOrThrow: vi.fn(),
            },
            invoice: { findUnique: vi.fn(), update: vi.fn() },
            purchaseInvoice: { findUnique: vi.fn(), update: vi.fn() },
            payment: { createMany: vi.fn(), deleteMany: vi.fn() },
            journalEntry: { findMany: vi.fn(), updateMany: vi.fn() },
            salesRemittanceItem: { count: vi.fn() },
            purchaseRemittanceItem: { count: vi.fn() },
            auditLog: { create: vi.fn() },
        };
        return {
            tx,
            prisma: {
                barterSettlement: { findUnique: vi.fn() },
                $transaction: vi.fn(
                    async (fn: (client: typeof tx) => unknown) => fn(tx),
                ),
            },
            postSales: vi.fn(),
            offsetJournal: vi.fn(),
            cashJournal: vi.fn(),
            audit: vi.fn(),
        };
    },
);

vi.mock('@/lib/core/prisma', () => ({ prisma, getTenantDbFromContext: () => prisma }));
vi.mock('@/lib/tools/audit', () => ({ logActivity: audit }));
vi.mock('@/lib/utils/sequence', () => ({
    getNextSequence: vi.fn(async (key: string) => `${key}-00001`),
}));
vi.mock('@/services/settings/app-settings-service', () => ({
    getPaymentBanksSetting: vi.fn().mockResolvedValue([]),
}));
vi.mock('@/services/accounting/account-resolver', () => ({
    resolveAccount: vi.fn(async (role: string) => ({
        id: role === 'accounts-receivable' ? 'ar' : 'ap',
    })),
}));
vi.mock('../auto-journal-shared', () => ({
    resolvePaymentBankAccount: vi.fn().mockResolvedValue({ id: 'cash' }),
}));
vi.mock('../sales-recognition-service', () => ({
    postSalesInvoiceJournal: postSales,
    requireOpenJournalPeriod: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../barter-journal-service', () => ({
    BarterJournalService: {
        validatePurchaseInvoiceJournal: vi.fn().mockResolvedValue(undefined),
        postOffset: offsetJournal,
        postCashPayment: cashJournal,
    },
}));

import {
    BarterSettlementService,
    buildBarterPayloadFingerprint,
} from '../barter-settlement-service';

const input = {
    invoiceId: '11111111-1111-4111-8111-111111111111',
    purchaseInvoiceId: '22222222-2222-4222-8222-222222222222',
    barterAmount: 600,
    barterDate: new Date('2026-09-09T00:00:00.000Z'),
    includeCashPayment: false,
    notes: 'Kesepakatan barter',
    idempotencyKey: 'retry-key-123',
};

const partner = {
    id: 'partner-1',
    customerId: 'customer-1',
    supplierId: 'supplier-1',
    isActive: true,
    customer: {
        id: 'customer-1',
        isActive: true,
        lifecycleStatus: 'ACTIVE',
    },
    supplier: { id: 'supplier-1', isActive: true },
};
const salesInvoice = {
    id: input.invoiceId,
    invoiceNumber: 'INV-1',
    status: 'UNPAID',
    totalAmount: new Prisma.Decimal(600),
    paidAmount: new Prisma.Decimal(0),
    creditedAmount: new Prisma.Decimal(0),
    dueDate: null,
    salesOrder: { customerId: 'customer-1', entrySource: 'STANDARD' },
};
const purchaseInvoice = {
    id: input.purchaseInvoiceId,
    invoiceNumber: 'BILL-1',
    status: 'UNPAID',
    totalAmount: new Prisma.Decimal(1000),
    paidAmount: new Prisma.Decimal(0),
    dueDate: null,
    purchaseOrder: { supplierId: 'supplier-1' },
};

function prepareCreate() {
    prisma.barterSettlement.findUnique.mockResolvedValue(null);
    tx.barterSettlement.findUnique.mockResolvedValue(null);
    tx.invoice.findUnique
        .mockResolvedValueOnce({
            salesOrder: { customerId: 'customer-1' },
        })
        .mockResolvedValueOnce(salesInvoice);
    tx.barterPartner.findUnique.mockResolvedValue(partner);
    tx.purchaseInvoice.findUnique.mockResolvedValue(purchaseInvoice);
    tx.account.findMany.mockResolvedValue([
        {
            id: 'ar',
            type: 'ASSET',
            currency: 'IDR',
            isActive: true,
            isCashAccount: false,
        },
        {
            id: 'ap',
            type: 'LIABILITY',
            currency: 'IDR',
            isActive: true,
            isCashAccount: false,
        },
    ]);
    tx.barterSettlement.create.mockResolvedValue({ id: 'settlement-1' });
    tx.invoice.update.mockResolvedValue({});
    tx.purchaseInvoice.update.mockResolvedValue({});
    tx.payment.createMany.mockResolvedValue({ count: 2 });
    offsetJournal.mockResolvedValue({ id: 'journal-1', entryNumber: 'JE-1' });
    tx.barterSettlement.update.mockResolvedValue({});
    tx.barterSettlement.findUniqueOrThrow.mockResolvedValue({
        id: 'settlement-1',
        settlementNumber: 'BRT-00001',
        status: 'POSTED',
    });
}

describe('BarterSettlementService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        prepareCreate();
    });

    it('creates both noncash legs, one offset journal, and updates both balances atomically', async () => {
        const result = await BarterSettlementService.create(input, 'user-1');

        expect(result).toMatchObject({ id: 'settlement-1' });
        expect(tx.payment.createMany).toHaveBeenCalledWith({
            data: expect.arrayContaining([
                expect.objectContaining({
                    method: 'Barter',
                    barterLeg: 'AR_OFFSET',
                    invoiceId: input.invoiceId,
                    amount: new Prisma.Decimal(600),
                }),
                expect.objectContaining({
                    method: 'Barter',
                    barterLeg: 'AP_OFFSET',
                    purchaseInvoiceId: input.purchaseInvoiceId,
                    amount: new Prisma.Decimal(600),
                }),
            ]),
        });
        expect(tx.invoice.update).toHaveBeenCalledWith(
            expect.objectContaining({ data: { paidAmount: new Prisma.Decimal(600), status: 'PAID' } }),
        );
        expect(tx.purchaseInvoice.update).toHaveBeenCalledWith(
            expect.objectContaining({ data: { paidAmount: new Prisma.Decimal(600), status: 'PARTIAL' } }),
        );
        expect(offsetJournal).toHaveBeenCalledOnce();
        expect(cashJournal).not.toHaveBeenCalled();
        expect(audit).toHaveBeenCalledWith(
            expect.objectContaining({ tx, action: 'CREATE_BARTER_SETTLEMENT' }),
        );
    });

    it('rejects a barter above receivable after return credits', async () => {
        tx.invoice.findUnique.mockReset();
        tx.invoice.findUnique.mockResolvedValueOnce({ salesOrder: { customerId: 'customer-1' } }).mockResolvedValueOnce({ ...salesInvoice, creditedAmount: new Prisma.Decimal(100) });
        await expect(BarterSettlementService.create(input, 'user-1')).rejects.toMatchObject({ code: 'BARTER_EXCEEDS_BALANCE' });
        expect(tx.invoice.update).not.toHaveBeenCalled();
    });

    it('settles exactly the remaining receivable after return credits', async () => {
        tx.invoice.findUnique.mockReset();
        tx.invoice.findUnique.mockResolvedValueOnce({ salesOrder: { customerId: 'customer-1' } }).mockResolvedValueOnce({ ...salesInvoice, creditedAmount: new Prisma.Decimal(100) });
        await BarterSettlementService.create({ ...input, barterAmount: 500 }, 'user-1');
        expect(tx.invoice.update).toHaveBeenCalledWith(expect.objectContaining({ data: { paidAmount: new Prisma.Decimal(500), status: 'PAID' } }));
    });

    it('returns an existing matching idempotency key and rejects a changed payload', async () => {
        const fingerprint = buildBarterPayloadFingerprint(input);
        prisma.barterSettlement.findUnique.mockResolvedValueOnce({
            id: 'existing',
            payloadFingerprint: fingerprint,
        });
        await expect(
            BarterSettlementService.create(input, 'user-1'),
        ).resolves.toMatchObject({ id: 'existing' });
        expect(prisma.$transaction).not.toHaveBeenCalled();

        prisma.barterSettlement.findUnique.mockResolvedValueOnce({
            id: 'existing',
            payloadFingerprint: 'different',
        });
        await expect(
            BarterSettlementService.create(input, 'user-1'),
        ).rejects.toMatchObject({ code: 'BARTER_IDEMPOTENCY_CONFLICT' });
    });

    it('rejects an inactive partner before any balance write', async () => {
        tx.barterPartner.findUnique.mockResolvedValueOnce({
            ...partner,
            isActive: false,
        });
        await expect(
            BarterSettlementService.create(input, 'user-1'),
        ).rejects.toMatchObject({ code: 'BARTER_PARTNER_NOT_ACTIVE' });
        expect(tx.invoice.update).not.toHaveBeenCalled();
    });

    it('voids the complete package and restores both balances', async () => {
        const settlement = {
            id: 'settlement-1',
            status: 'POSTED',
            invoiceId: input.invoiceId,
            purchaseInvoiceId: input.purchaseInvoiceId,
            barterAmount: new Prisma.Decimal(600),
            cashAmount: new Prisma.Decimal(0),
            offsetJournalId: 'journal-1',
            cashJournalId: null,
            payments: [
                { id: 'ar-leg', barterLeg: 'AR_OFFSET' },
                { id: 'ap-leg', barterLeg: 'AP_OFFSET' },
            ],
        };
        tx.barterSettlement.findUnique.mockReset();
        tx.invoice.findUnique.mockReset();
        tx.purchaseInvoice.findUnique.mockReset();
        tx.barterSettlement.findUnique.mockResolvedValueOnce(settlement);
        tx.invoice.findUnique.mockResolvedValueOnce({
            ...salesInvoice,
            paidAmount: new Prisma.Decimal(600),
        });
        tx.purchaseInvoice.findUnique.mockResolvedValueOnce({
            ...purchaseInvoice,
            paidAmount: new Prisma.Decimal(600),
        });
        tx.journalEntry.findMany.mockResolvedValueOnce([
            {
                id: 'journal-1',
                referenceType: 'BARTER_SETTLEMENT',
                referenceId: 'settlement-1',
                status: 'POSTED',
                entryDate: new Date('2026-09-09T00:00:00.000Z'),
                lines: [
                    { reconciledAt: null, bankReconciliationItems: [] },
                ],
            },
        ]);
        tx.salesRemittanceItem.count.mockResolvedValue(0);
        tx.purchaseRemittanceItem.count.mockResolvedValue(0);
        tx.payment.deleteMany.mockResolvedValue({ count: 2 });
        tx.journalEntry.updateMany.mockResolvedValue({ count: 1 });
        tx.barterSettlement.update.mockResolvedValue({
            ...settlement,
            status: 'VOIDED',
        });

        const result = await BarterSettlementService.void(
            { settlementId: settlement.id, reason: 'Dokumen salah' },
            'approver-1',
        );

        expect(result).toMatchObject({ status: 'VOIDED' });
        expect(tx.payment.deleteMany).toHaveBeenCalledWith({
            where: { barterSettlementId: settlement.id },
        });
        expect(tx.invoice.update).toHaveBeenCalledWith(
            expect.objectContaining({ data: { paidAmount: new Prisma.Decimal(0), status: 'UNPAID' } }),
        );
        expect(tx.journalEntry.updateMany).toHaveBeenCalledWith(
            expect.objectContaining({ data: expect.objectContaining({ status: 'VOIDED' }) }),
        );
    });

    it('treats a second void as idempotent', async () => {
        tx.barterSettlement.findUnique.mockReset();
        tx.barterSettlement.findUnique.mockResolvedValueOnce({
            id: 'settlement-1',
            status: 'VOIDED',
            payments: [],
        });

        await expect(
            BarterSettlementService.void(
                { settlementId: 'settlement-1', reason: 'Sudah batal' },
                'approver-1',
            ),
        ).resolves.toMatchObject({ status: 'VOIDED' });
        expect(tx.invoice.update).not.toHaveBeenCalled();
    });

    it('rejects void when a cash journal line is reconciled', async () => {
        tx.barterSettlement.findUnique.mockReset();
        tx.invoice.findUnique.mockReset();
        tx.purchaseInvoice.findUnique.mockReset();
        tx.barterSettlement.findUnique.mockResolvedValueOnce({
            id: 'settlement-1',
            status: 'POSTED',
            invoiceId: input.invoiceId,
            purchaseInvoiceId: input.purchaseInvoiceId,
            barterAmount: new Prisma.Decimal(600),
            cashAmount: new Prisma.Decimal(100),
            offsetJournalId: 'journal-1',
            cashJournalId: 'journal-2',
            payments: [
                { id: 'ar-leg', barterLeg: 'AR_OFFSET' },
                { id: 'ap-leg', barterLeg: 'AP_OFFSET' },
                { id: 'cash-leg', barterLeg: 'AP_CASH' },
            ],
        });
        tx.invoice.findUnique.mockResolvedValueOnce(salesInvoice);
        tx.purchaseInvoice.findUnique.mockResolvedValueOnce(purchaseInvoice);
        tx.journalEntry.findMany.mockResolvedValueOnce([
            {
                id: 'journal-1',
                referenceType: 'BARTER_SETTLEMENT',
                referenceId: 'settlement-1',
                status: 'POSTED',
                entryDate: new Date(),
                lines: [{ reconciledAt: null, bankReconciliationItems: [] }],
            },
            {
                id: 'journal-2',
                referenceType: 'PURCHASE_PAYMENT',
                referenceId: undefined,
                status: 'POSTED',
                entryDate: new Date(),
                lines: [{ reconciledAt: new Date(), bankReconciliationItems: [] }],
            },
        ]);

        await expect(
            BarterSettlementService.void(
                { settlementId: 'settlement-1', reason: 'Dokumen salah' },
                'approver-1',
            ),
        ).rejects.toMatchObject({ code: 'BARTER_RECONCILED' });
        expect(tx.payment.deleteMany).not.toHaveBeenCalled();
    });
});
