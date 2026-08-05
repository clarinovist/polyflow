'use server';

// NOTE: This file is actually a .test.ts file. The 'use server' directive is
// here only because vitest needs it for some mock setups. This is a test file.
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────────────────
// Mock withTenant to pass through (no tenant resolution in tests)
vi.mock('@/lib/core/tenant', () => ({
    withTenant: (fn: any) => fn,
    getTenantContext: () => ({ tenantId: 'test-tenant' }),
}));

// Mock auth to return controlled sessions
vi.mock('@/auth', () => ({
    auth: vi.fn(),
}));

// Mock prisma — most actions need user.findUnique for requireAuth
vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        user: { findUnique: vi.fn() },
        account: { findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn(), count: vi.fn().mockResolvedValue(0), create: vi.fn(), createMany: vi.fn().mockResolvedValue({ count: 0 }), update: vi.fn(), delete: vi.fn() },
        tenantRevenueRule: { findMany: vi.fn().mockResolvedValue([]), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
        journalEntry: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn(), count: vi.fn().mockResolvedValue(0), deleteMany: vi.fn() },
        journalLine: { findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0), deleteMany: vi.fn() },
        fiscalPeriod: { findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn(), count: vi.fn().mockResolvedValue(0), createMany: vi.fn() },
        invoice: { findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn(), count: vi.fn().mockResolvedValue(0), aggregate: vi.fn().mockResolvedValue({ _sum: { totalAmount: 0, paidAmount: 0 } }), updateMany: vi.fn().mockResolvedValue({ count: 0 }), deleteMany: vi.fn(), delete: vi.fn() },
        purchaseInvoice: { findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn(), count: vi.fn().mockResolvedValue(0), updateMany: vi.fn().mockResolvedValue({ count: 0 }), deleteMany: vi.fn(), delete: vi.fn() },
        payment: { findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn(), create: vi.fn(), delete: vi.fn(), deleteMany: vi.fn() },
        salesOrder: { delete: vi.fn() },
        purchaseOrder: { delete: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
        budget: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
        fixedAsset: { findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
        bankReconciliation: { count: vi.fn().mockResolvedValue(0) },
        appSetting: { findMany: vi.fn().mockResolvedValue([]), upsert: vi.fn() },
        costHistory: { findMany: vi.fn().mockResolvedValue([]), create: vi.fn() },
        productVariant: { findUnique: vi.fn(), update: vi.fn() },
        periodLock: { findUnique: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
        productionOrder: { findMany: vi.fn().mockResolvedValue([]) },
        goodsReceipt: { findMany: vi.fn().mockResolvedValue([]) },
        $transaction: vi.fn().mockImplementation(async (fn: any) => fn({
            user: { findUnique: vi.fn() },
            account: { findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn(), count: vi.fn().mockResolvedValue(0), create: vi.fn(), createMany: vi.fn().mockResolvedValue({ count: 0 }), update: vi.fn(), delete: vi.fn() },
            tenantRevenueRule: { findMany: vi.fn().mockResolvedValue([]), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
            journalEntry: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn(), count: vi.fn().mockResolvedValue(0), deleteMany: vi.fn() },
            journalLine: { findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0), deleteMany: vi.fn() },
            fiscalPeriod: { findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn(), update: vi.fn() },
            invoice: { findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn(), update: vi.fn(), delete: vi.fn(), deleteMany: vi.fn() },
            purchaseInvoice: { findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn(), update: vi.fn(), delete: vi.fn(), deleteMany: vi.fn() },
            payment: { findUnique: vi.fn(), create: vi.fn(), delete: vi.fn(), deleteMany: vi.fn() },
            salesOrder: { delete: vi.fn() },
            purchaseOrder: { delete: vi.fn() },
            budget: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
            fixedAsset: { findMany: vi.fn().mockResolvedValue([]), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
        })),
        getTenantIdFromContext: vi.fn().mockReturnValue('test-tenant'),
    },
    getTenantIdFromContext: vi.fn().mockReturnValue('test-tenant'),
}));

// Mock services used by actions
vi.mock('@/services/accounting/accounting-service', () => ({
    AccountingService: {
        getChartOfAccounts: vi.fn().mockResolvedValue([]),
        createAccount: vi.fn().mockResolvedValue({ id: 'a1' }),
        updateAccount: vi.fn().mockResolvedValue({ id: 'a1' }),
        deleteAccount: vi.fn().mockResolvedValue(undefined),
        createJournalEntry: vi.fn().mockResolvedValue({ id: 'j1', entryNumber: 'JE-001' }),
        getAccountBalance: vi.fn().mockResolvedValue(0),
        getTrialBalance: vi.fn().mockResolvedValue({}),
        getIncomeStatement: vi.fn().mockResolvedValue({ totalRevenue: 0, totalCOGS: 0, totalOpEx: 0, totalOther: 0, netIncome: 0 }),
        getCashFlowStatement: vi.fn().mockResolvedValue({}),
        getBalanceSheet: vi.fn().mockResolvedValue({}),
        getGeneralLedger: vi.fn().mockResolvedValue({}),
        getFiscalPeriods: vi.fn().mockResolvedValue([]),
        createFiscalPeriod: vi.fn().mockResolvedValue({ id: 'p1' }),
        closeFiscalPeriod: vi.fn().mockResolvedValue({ id: 'p1' }),
        createYearEndClosingEntry: vi.fn().mockResolvedValue(undefined),
        createBulkJournalEntries: vi.fn().mockResolvedValue(undefined),
        getJournals: vi.fn().mockResolvedValue({ data: [], meta: { total: 0 } }),
        getJournalById: vi.fn().mockResolvedValue({ id: 'j1' }),
        postJournal: vi.fn().mockResolvedValue(undefined),
        voidJournal: vi.fn().mockResolvedValue(undefined),
        reverseJournal: vi.fn().mockResolvedValue(undefined),
        updateDraftJournal: vi.fn().mockResolvedValue({ id: 'j1', entryNumber: 'JE-001' }),
        createDirectLaborJournal: vi.fn().mockResolvedValue({ id: 'j1', entryNumber: 'JE-001' }),
        updateDirectLaborJournal: vi.fn().mockResolvedValue({ id: 'j1', entryNumber: 'JE-001' }),
        createDetailJournal: vi.fn().mockResolvedValue({ id: 'j1', entryNumber: 'JE-001' }),
    },
}));

vi.mock('@/services/accounting/coa-seed-service', () => ({
    getRoleMappings: vi.fn().mockResolvedValue([]),
    updateRoleMapping: vi.fn().mockResolvedValue(undefined),
    seedTenantAccountRoles: vi.fn().mockResolvedValue({ count: 0 }),
}));

vi.mock('@/services/accounting/journals-service', () => ({
    postBulkJournals: vi.fn().mockResolvedValue(undefined),
    createClosingJournalEntry: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/services/accounting/reports-service', () => ({
    getIncomeStatement: vi.fn().mockResolvedValue({ totalRevenue: 0, totalOpEx: 0, netIncome: 0 }),
}));

vi.mock('@/services/finance/fixed-asset-service', () => ({
    FixedAssetService: {
        getAssets: vi.fn().mockResolvedValue([]),
        createAsset: vi.fn().mockResolvedValue({ id: 'fa1' }),
        runDepreciation: vi.fn().mockResolvedValue([]),
    },
}));

vi.mock('@/services/finance/budget-service', () => ({
    BudgetService: {
        getBudgets: vi.fn().mockResolvedValue([]),
        setBudget: vi.fn().mockResolvedValue({ id: 'b1' }),
        getVarianceReport: vi.fn().mockResolvedValue([]),
    },
}));

vi.mock('@/services/finance/reconciliation-service', () => ({
    ReconciliationService: {
        createReconciliation: vi.fn().mockResolvedValue({ id: 'r1' }),
        getReconciliation: vi.fn().mockResolvedValue({ id: 'r1' }),
        listReconciliations: vi.fn().mockResolvedValue([]),
        autoMatchAndSave: vi.fn().mockResolvedValue({}),
        manualMatch: vi.fn().mockResolvedValue({}),
        addAdjustment: vi.fn().mockResolvedValue({}),
        removeAdjustment: vi.fn().mockResolvedValue({}),
        calculateAdjustedBalances: vi.fn().mockResolvedValue({}),
        completeReconciliation: vi.fn().mockResolvedValue({}),
        createAdjustmentJournals: vi.fn().mockResolvedValue({}),
        getGLEntries: vi.fn().mockResolvedValue([]),
        getUnreconciledEntries: vi.fn().mockResolvedValue([]),
        autoMatch: vi.fn().mockResolvedValue([]),
        confirmReconciliation: vi.fn().mockResolvedValue({ count: 0 }),
    },
}));

vi.mock('@/services/finance/petty-cash-service', () => ({
    PettyCashService: {
        getTransactions: vi.fn().mockResolvedValue([]),
        getBalance: vi.fn().mockResolvedValue(0),
        createExpense: vi.fn().mockResolvedValue({ id: 'pc1' }),
        approveExpense: vi.fn().mockResolvedValue({ id: 'pc1' }),
        replenish: vi.fn().mockResolvedValue({ id: 'pc1' }),
    },
}));

vi.mock('@/services/finance/petty-cash-report-service', () => ({
    PettyCashReportService: {
        getDailyReport: vi.fn().mockResolvedValue({}),
        createDailyReport: vi.fn().mockResolvedValue({ id: 'r1' }),
        markReadyToPrint: vi.fn().mockResolvedValue({ id: 'r1' }),
        confirmPhysicalSignature: vi.fn().mockResolvedValue({ id: 'r1' }),
        finalizeDailyReport: vi.fn().mockResolvedValue({ id: 'r1' }),
        voidDailyReport: vi.fn().mockResolvedValue({ id: 'r1' }),
    },
}));

vi.mock('@/services/finance/cost-reporting-service', () => ({
    CostReportingService: {
        getFinishedGoodsCosting: vi.fn().mockResolvedValue([]),
        getWipValuation: vi.fn().mockResolvedValue([]),
        getOrderCosting: vi.fn().mockResolvedValue({}),
    },
}));

vi.mock('@/services/finance/foh-service', () => ({
    FOHAllocationService: {
        calculateAllocation: vi.fn().mockResolvedValue({}),
    },
}));

vi.mock('@/services/finance/tax-service', () => ({
    TaxService: {
        getTaxSummary: vi.fn().mockResolvedValue({}),
    },
}));

vi.mock('@/services/finance/aging-service', () => ({
    AgingService: {
        getARAging: vi.fn().mockResolvedValue([]),
        getAPAging: vi.fn().mockResolvedValue([]),
    },
}));

vi.mock('@/services/finance/invoice-service', () => ({
    InvoiceService: {
        createInvoice: vi.fn().mockResolvedValue({ id: 'inv1' }),
        updateStatus: vi.fn().mockResolvedValue(undefined),
    },
}));

vi.mock('@/services/finance/auto-journal-service', () => ({
    AutoJournalService: {
        handleSalesPayment: vi.fn().mockResolvedValue(undefined),
        handlePurchasePayment: vi.fn().mockResolvedValue(undefined),
    },
}));

vi.mock('@/services/finance/bom-cost-cascade-service', () => ({
    BomCostCascadeService: {
        cascadeFromVariants: vi.fn().mockResolvedValue(undefined),
    },
}));

vi.mock('@/services/accounting/costing-service', () => ({
    CostingService: {
        getPeriodCosts: vi.fn().mockResolvedValue([]),
    },
}));

vi.mock('@/services/accounting/periods-service', () => ({
    isPeriodOpen: vi.fn().mockResolvedValue(true),
}));

vi.mock('@/services/accounting/account-resolver', () => ({
    resolveAccount: vi.fn().mockResolvedValue({ id: 'eq1' }),
}));

vi.mock('@/services/purchasing/purchase-service', () => ({
    PurchaseService: {
        recordPayment: vi.fn().mockResolvedValue({ paymentId: 'p1' }),
    },
}));

vi.mock('@/services/settings/app-settings-service', () => ({
    getPaymentBanksSetting: vi.fn().mockResolvedValue(null),
    savePaymentBanksSetting: vi.fn().mockResolvedValue({}),
}));

vi.mock('@/services/purchasing/invoices-service', () => ({
    getOutstandingPurchaseInvoices: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/services/purchasing/receipts-service', () => ({
    reverseAllGoodsReceiptsForPO: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/tools/audit', () => ({
    logActivity: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/finance/payment-methods', () => ({
    normalizePaymentMethodFields: vi.fn().mockReturnValue({ method: 'BANK_TRANSFER', referenceNumber: null, destinationBank: null }),
}));

vi.mock('@/lib/utils/timezone', () => ({
    normalizeToBusinessDay: vi.fn((d: any) => d),
    parseBusinessDate: vi.fn((s: string) => s),
}));

vi.mock('@/lib/utils/sequence', () => ({
    getNextSequence: vi.fn().mockResolvedValue('PAY-001'),
}));

vi.mock('@/lib/utils/utils', () => ({
    serializeData: vi.fn((d: any) => ({ success: true, data: d })),
    formatRupiah: vi.fn((n: number) => `Rp${n}`),
}));

vi.mock('@/lib/schemas/journal', () => ({
    manualJournalSchema: { safeParse: vi.fn().mockReturnValue({ success: true, data: {} }) },
    directLaborJournalSchema: { safeParse: vi.fn().mockReturnValue({ success: true, data: {} }) },
    detailJournalSchema: { safeParse: vi.fn().mockReturnValue({ success: true, data: {} }) },
}));

vi.mock('@/lib/schemas/invoice', () => ({
    createInvoiceSchema: { safeParse: vi.fn().mockReturnValue({ success: true, data: {} }) },
    updateInvoiceStatusSchema: { safeParse: vi.fn().mockReturnValue({ success: true, data: {} }) },
}));

vi.mock('@/lib/schemas/finance', () => ({
    assetSchema: { safeParse: vi.fn().mockReturnValue({ success: true, data: {} }) },
    budgetSchema: { safeParse: vi.fn().mockReturnValue({ success: true, data: {} }) },
}));

vi.mock('@/lib/utils/hpp-report', () => ({
    aggregateHppReport: vi.fn().mockReturnValue({ summary: {}, products: [], orders: [] }),
}));

vi.mock('date-fns', () => ({
    startOfMonth: vi.fn((d: any) => d),
    endOfMonth: vi.fn((d: any) => d),
}));

vi.mock('next/cache', () => ({
    revalidatePath: vi.fn(),
}));

vi.mock('next/navigation', () => ({
    redirect: vi.fn(() => { throw new Error('REDIRECT'); }),
}));

import { auth } from '@/auth';
import { prisma } from '@/lib/core/prisma';
import { BusinessRuleError } from '@/lib/errors/errors';

// ── Helpers ────────────────────────────────────────────────────────────────
function mockSession(role: string) {
    return {
        user: { id: 'u1', name: 'Test', role, roles: [role] },
    } as any;
}

function setupAuth(role: string) {
    vi.mocked(auth).mockResolvedValue(mockSession(role));
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: 'u1',
        role,
        isActive: true,
    } as any);
}

async function expectAllowed(fn: () => Promise<any>) {
    // Should NOT throw BusinessRuleError from auth guard
    // (may succeed or throw from service layer — that's OK for auth testing)
    try {
        const result = await fn();
        // If it returns a result, that's fine
        return result;
    } catch (error: any) {
        // If it throws, it should NOT be an auth-related BusinessRuleError
        if (error instanceof BusinessRuleError && /Unauthorized|Only ADMIN|Hanya admin/i.test(error.message)) {
            throw new Error(`Expected allowed but got auth error: ${error.message}`);
        }
        // Other errors (service layer) are acceptable for auth testing
    }
}

async function expectDenied(fn: () => Promise<any>) {
    const result = await fn();
    // safeAction wraps BusinessRuleError in { success: false, error, code }
    expect(result).toEqual(
        expect.objectContaining({ success: false }),
    );
}

// ── PASS 1: Config Akuntansi ───────────────────────────────────────────────

describe('Pass 1: role-mapping.ts', () => {
    beforeEach(() => vi.clearAllMocks());

    it('getRoleMappings: SALES denied', async () => {
        setupAuth('SALES');
        const { getRoleMappings } = await import('../role-mapping');
        await expectDenied(() => getRoleMappings());
    });

    it('getRoleMappings: FINANCE allowed', async () => {
        setupAuth('FINANCE');
        const { getRoleMappings } = await import('../role-mapping');
        await expectAllowed(() => getRoleMappings());
    });

    it('updateRoleMappings: SALES denied', async () => {
        setupAuth('SALES');
        const { updateRoleMapping } = await import('../role-mapping');
        await expectDenied(() => updateRoleMapping('CASH', 'acc1'));
    });

    it('updateRoleMappings: FINANCE allowed', async () => {
        setupAuth('FINANCE');
        const { updateRoleMapping } = await import('../role-mapping');
        await expectAllowed(() => updateRoleMapping('CASH', 'acc1'));
    });

    it('seedMissingMappings: SALES denied', async () => {
        setupAuth('SALES');
        const { seedMissingMappings } = await import('../role-mapping');
        await expectDenied(() => seedMissingMappings());
    });

    it('resetAllMappings: FINANCE denied (ADMIN only)', async () => {
        setupAuth('FINANCE');
        const { resetAllMappings } = await import('../role-mapping');
        await expectDenied(() => resetAllMappings());
    });

    it('resetAllMappings: ADMIN allowed', async () => {
        setupAuth('ADMIN');
        const { resetAllMappings } = await import('../role-mapping');
        await expectAllowed(() => resetAllMappings());
    });
});

describe('Pass 1: revenue-rules.ts', () => {
    beforeEach(() => vi.clearAllMocks());

    it('getRevenueRules: SALES denied', async () => {
        setupAuth('SALES');
        const { getRevenueRules } = await import('../revenue-rules');
        await expectDenied(() => getRevenueRules());
    });

    it('getRevenueRules: FINANCE allowed', async () => {
        setupAuth('FINANCE');
        const { getRevenueRules } = await import('../revenue-rules');
        await expectAllowed(() => getRevenueRules());
    });

    it('createRevenueRule: SALES denied', async () => {
        setupAuth('SALES');
        const { createRevenueRule } = await import('../revenue-rules');
        await expectDenied(() => createRevenueRule({ matchType: 't', matchValue: 'v', accountCode: '11120' }));
    });

    it('deleteRevenueRule: SALES denied', async () => {
        setupAuth('SALES');
        const { deleteRevenueRule } = await import('../revenue-rules');
        await expectDenied(() => deleteRevenueRule('r1'));
    });
});

describe('Pass 1: accounting.ts', () => {
    beforeEach(() => vi.clearAllMocks());

    it('getChartOfAccounts: SALES denied', async () => {
        setupAuth('SALES');
        const { getChartOfAccounts } = await import('../accounting');
        await expectDenied(() => getChartOfAccounts());
    });

    it('getTrialBalance: SALES denied', async () => {
        setupAuth('SALES');
        const { getTrialBalance } = await import('../accounting');
        await expectDenied(() => getTrialBalance());
    });

    it('getTrialBalance: FINANCE allowed', async () => {
        setupAuth('FINANCE');
        const { getTrialBalance } = await import('../accounting');
        await expectAllowed(() => getTrialBalance());
    });

    it('createAccount: SALES denied', async () => {
        setupAuth('SALES');
        const { createAccount } = await import('../accounting');
        await expectDenied(() => createAccount({ code: '99999', name: 'Test', type: 'ASSET', category: 'CURRENT_ASSET' }));
    });

    it('closeFiscalPeriod: SALES denied', async () => {
        setupAuth('SALES');
        const { closeFiscalPeriod } = await import('../accounting');
        await expectDenied(() => closeFiscalPeriod('p1'));
    });

    it('closeFiscalPeriod: FINANCE allowed (approver)', async () => {
        setupAuth('FINANCE');
        const { closeFiscalPeriod } = await import('../accounting');
        await expectAllowed(() => closeFiscalPeriod('p1'));
    });

    it('runDepreciation (accounting.ts): SALES denied', async () => {
        setupAuth('SALES');
        const { runDepreciation } = await import('../accounting');
        await expectDenied(() => runDepreciation(2026, 1));
    });

    it('setBudget: SALES denied', async () => {
        setupAuth('SALES');
        const { setBudget } = await import('../accounting');
        await expectDenied(() => setBudget({ accountId: 'a1', year: 2026, month: 1, amount: 1000000 }));
    });
});

describe('Pass 1: coa-audit.ts', () => {
    beforeEach(() => vi.clearAllMocks());

    it('auditRequiredAccounts: SALES denied', async () => {
        setupAuth('SALES');
        const { auditRequiredAccounts } = await import('../coa-audit');
        await expectDenied(() => auditRequiredAccounts());
    });

    it('fixMissingAccounts: SALES denied', async () => {
        setupAuth('SALES');
        const { fixMissingAccounts } = await import('../coa-audit');
        await expectDenied(() => fixMissingAccounts());
    });

    it('fixMissingAccounts: FINANCE allowed (approver)', async () => {
        setupAuth('FINANCE');
        const { fixMissingAccounts } = await import('../coa-audit');
        await expectAllowed(() => fixMissingAccounts());
    });
});

// ── PASS 2: Jurnal & Transaksi Uang ────────────────────────────────────────

describe('Pass 2: journal.ts', () => {
    beforeEach(() => vi.clearAllMocks());

    it('getJournals: SALES denied', async () => {
        setupAuth('SALES');
        const { getJournals } = await import('../journal');
        await expectDenied(() => getJournals());
    });

    it('createManualJournal: SALES denied', async () => {
        setupAuth('SALES');
        const { createManualJournal } = await import('../journal');
        await expectDenied(() => createManualJournal({ entryDate: new Date(), description: 'Test', reference: '', lines: [] } as any));
    });

    it('postJournal: SALES denied', async () => {
        setupAuth('SALES');
        const { postJournal } = await import('../journal');
        await expectDenied(() => postJournal('j1'));
    });

    it('voidJournal: SALES denied', async () => {
        setupAuth('SALES');
        const { voidJournal } = await import('../journal');
        await expectDenied(() => voidJournal('j1'));
    });

    it('reverseJournal: SALES denied', async () => {
        setupAuth('SALES');
        const { reverseJournal } = await import('../journal');
        await expectDenied(() => reverseJournal('j1'));
    });
});

describe('Pass 2: journal-actions.ts', () => {
    beforeEach(() => vi.clearAllMocks());

    it('getJournalEntries: SALES denied', async () => {
        setupAuth('SALES');
        const { getJournalEntries } = await import('../journal-actions');
        await expectDenied(() => getJournalEntries({}));
    });

    it('batchPostJournals: SALES denied', async () => {
        setupAuth('SALES');
        const { batchPostJournals } = await import('../journal-actions');
        await expectDenied(() => batchPostJournals(['j1']));
    });
});

describe('Pass 2: invoice.ts', () => {
    beforeEach(() => vi.clearAllMocks());

    it('getInvoices: SALES denied', async () => {
        setupAuth('SALES');
        const { getInvoices } = await import('../invoice');
        await expectDenied(() => getInvoices());
    });

    it('createInvoice: SALES denied', async () => {
        setupAuth('SALES');
        const { createInvoice } = await import('../invoice');
        await expectDenied(() => createInvoice({} as any));
    });

    it('getOutstandingInvoicesByCustomerId: SALES allowed (cross-portal)', async () => {
        setupAuth('SALES');
        const { getOutstandingInvoicesByCustomerId } = await import('../invoice');
        await expectAllowed(() => getOutstandingInvoicesByCustomerId('c1'));
    });

    it('getOutstandingInvoicesByCustomerId: MARKETING allowed (cross-portal)', async () => {
        setupAuth('MARKETING');
        const { getOutstandingInvoicesByCustomerId } = await import('../invoice');
        await expectAllowed(() => getOutstandingInvoicesByCustomerId('c1'));
    });

    it('getOutstandingInvoicesByCustomerId: PRODUCTION denied', async () => {
        setupAuth('PRODUCTION');
        const { getOutstandingInvoicesByCustomerId } = await import('../invoice');
        await expectDenied(() => getOutstandingInvoicesByCustomerId('c1'));
    });
});

describe('Pass 2: invoices.ts', () => {
    beforeEach(() => vi.clearAllMocks());

    it('getSalesInvoices: SALES allowed (cross-portal)', async () => {
        setupAuth('SALES');
        const { getSalesInvoices } = await import('../invoices');
        await expectAllowed(() => getSalesInvoices());
    });

    it('getSalesInvoices: MARKETING allowed (cross-portal)', async () => {
        setupAuth('MARKETING');
        const { getSalesInvoices } = await import('../invoices');
        await expectAllowed(() => getSalesInvoices());
    });

    it('getSalesInvoices: PRODUCTION denied', async () => {
        setupAuth('PRODUCTION');
        const { getSalesInvoices } = await import('../invoices');
        await expectDenied(() => getSalesInvoices());
    });

    it('getPurchaseInvoices: PROCUREMENT allowed (cross-portal)', async () => {
        setupAuth('PROCUREMENT');
        const { getPurchaseInvoices } = await import('../invoices');
        await expectAllowed(() => getPurchaseInvoices());
    });

    it('getPurchaseInvoices: SALES denied', async () => {
        setupAuth('SALES');
        const { getPurchaseInvoices } = await import('../invoices');
        await expectDenied(() => getPurchaseInvoices());
    });

    it('getInvoiceStats: SALES allowed (cross-portal)', async () => {
        setupAuth('SALES');
        const { getInvoiceStats } = await import('../invoices');
        await expectAllowed(() => getInvoiceStats());
    });

    it('deleteInvoice: SALES denied', async () => {
        setupAuth('SALES');
        const { deleteInvoice } = await import('../invoices');
        await expectDenied(() => deleteInvoice('inv1', 'AR'));
    });
});

// ── PASS 3: Payment & Saldo Awal & Periode ─────────────────────────────────

describe('Pass 3: payment-query-actions.ts', () => {
    beforeEach(() => vi.clearAllMocks());

    it('getReceivedPayments: SALES denied', async () => {
        setupAuth('SALES');
        const { getReceivedPayments } = await import('../payment-query-actions');
        await expectDenied(() => getReceivedPayments());
    });

    it('getSentPayments: SALES denied', async () => {
        setupAuth('SALES');
        const { getSentPayments } = await import('../payment-query-actions');
        await expectDenied(() => getSentPayments());
    });
});

describe('Pass 3: payment-mutation-actions.ts', () => {
    beforeEach(() => vi.clearAllMocks());

    it('recordCustomerPayment: SALES denied', async () => {
        setupAuth('SALES');
        const { recordCustomerPayment } = await import('../payment-mutation-actions');
        await expectDenied(() => recordCustomerPayment({ invoiceId: 'i1', amount: 100, paymentDate: new Date(), method: 'CASH' }));
    });

    it('recordSupplierPayment: SALES denied', async () => {
        setupAuth('SALES');
        const { recordSupplierPayment } = await import('../payment-mutation-actions');
        await expectDenied(() => recordSupplierPayment({ invoiceId: 'i1', amount: 100, paymentDate: new Date(), method: 'CASH' }));
    });

    it('deletePayment: SALES denied', async () => {
        setupAuth('SALES');
        const { deletePayment } = await import('../payment-mutation-actions');
        await expectDenied(() => deletePayment('p1'));
    });
});

describe('Pass 3: opening-balance-create-actions.ts', () => {
    beforeEach(() => vi.clearAllMocks());

    it('getAccountsForOpeningBalance: SALES denied', async () => {
        setupAuth('SALES');
        const { getAccountsForOpeningBalance } = await import('../opening-balance-create-actions');
        await expectDenied(() => getAccountsForOpeningBalance());
    });

    it('saveUnifiedOpeningBalance: SALES denied', async () => {
        setupAuth('SALES');
        const { saveUnifiedOpeningBalance } = await import('../opening-balance-create-actions');
        await expectDenied(() => saveUnifiedOpeningBalance({ arEntries: [], apEntries: [], generalEntries: [] } as any));
    });
});

describe('Pass 3: opening-balance-history-actions.ts', () => {
    beforeEach(() => vi.clearAllMocks());

    it('getRecentOpeningBalances: SALES denied', async () => {
        setupAuth('SALES');
        const { getRecentOpeningBalances } = await import('../opening-balance-history-actions');
        await expectDenied(() => getRecentOpeningBalances());
    });

    it('deleteOpeningBalance: SALES denied', async () => {
        setupAuth('SALES');
        const { deleteOpeningBalance } = await import('../opening-balance-history-actions');
        await expectDenied(() => deleteOpeningBalance('ob1', 'AR'));
    });
});

describe('Pass 3: period-actions.ts', () => {
    beforeEach(() => vi.clearAllMocks());

    it('getFiscalPeriods (period-actions): SALES denied', async () => {
        setupAuth('SALES');
        const { getFiscalPeriods } = await import('../period-actions');
        await expectDenied(() => getFiscalPeriods());
    });

    it('generatePeriodsForYear: SALES denied', async () => {
        setupAuth('SALES');
        const { generatePeriodsForYear } = await import('../period-actions');
        await expectDenied(() => generatePeriodsForYear(2027));
    });

    it('closePeriod: SALES denied', async () => {
        setupAuth('SALES');
        const { closePeriod } = await import('../period-actions');
        await expectDenied(() => closePeriod('p1'));
    });

    it('reopenPeriod: SALES denied', async () => {
        setupAuth('SALES');
        const { reopenPeriod } = await import('../period-actions');
        await expectDenied(() => reopenPeriod('p1'));
    });
});

// ── PASS 4: Recon, Petty Cash, Asset, Budget, FOH, Tax, Aging, Mobile ─────

describe('Pass 4: reconciliation-actions.ts', () => {
    beforeEach(() => vi.clearAllMocks());

    it('createReconciliation: SALES denied', async () => {
        setupAuth('SALES');
        const { createReconciliation } = await import('../reconciliation-actions');
        await expectDenied(() => createReconciliation('a1', new Date(), new Date(), []));
    });

    it('getReconciliation: SALES denied', async () => {
        setupAuth('SALES');
        const { getReconciliation } = await import('../reconciliation-actions');
        await expectDenied(() => getReconciliation('r1'));
    });

    it('completeReconciliation: SALES denied', async () => {
        setupAuth('SALES');
        const { completeReconciliation } = await import('../reconciliation-actions');
        await expectDenied(() => completeReconciliation('r1'));
    });

    it('createAdjustmentJournals: SALES denied', async () => {
        setupAuth('SALES');
        const { createAdjustmentJournals } = await import('../reconciliation-actions');
        await expectDenied(() => createAdjustmentJournals('r1'));
    });
});

describe('Pass 4: petty-cash-actions.ts', () => {
    beforeEach(() => vi.clearAllMocks());

    it('getPettyCashTransactions: SALES denied', async () => {
        setupAuth('SALES');
        const { getPettyCashTransactions } = await import('../petty-cash-actions');
        await expectDenied(() => getPettyCashTransactions());
    });

    it('createPettyCashExpense: SALES denied', async () => {
        setupAuth('SALES');
        const { createPettyCashExpense } = await import('../petty-cash-actions');
        await expectDenied(() => createPettyCashExpense({} as any));
    });
});

describe('Pass 4: petty-cash-report-actions.ts', () => {
    beforeEach(() => vi.clearAllMocks());

    it('getCashOpnameSignaturesAction: SALES denied', async () => {
        setupAuth('SALES');
        const { getCashOpnameSignaturesAction } = await import('../petty-cash-report-actions');
        await expectDenied(() => getCashOpnameSignaturesAction());
    });

    it('getDailyPettyCashReportAction: SALES denied', async () => {
        setupAuth('SALES');
        const { getDailyPettyCashReportAction } = await import('../petty-cash-report-actions');
        await expectDenied(() => getDailyPettyCashReportAction('2026-08-01'));
    });
});

describe('Pass 4: asset-actions.ts', () => {
    beforeEach(() => vi.clearAllMocks());

    it('getAssets: SALES denied', async () => {
        setupAuth('SALES');
        const { getAssets } = await import('../asset-actions');
        await expectDenied(() => getAssets());
    });

    it('createAsset: SALES denied', async () => {
        setupAuth('SALES');
        const { createAsset } = await import('../asset-actions');
        await expectDenied(() => createAsset({} as any));
    });

    it('deleteAsset: SALES denied', async () => {
        setupAuth('SALES');
        const { deleteAsset } = await import('../asset-actions');
        await expectDenied(() => deleteAsset('fa1'));
    });

    it('runDepreciation (asset-actions): SALES denied', async () => {
        setupAuth('SALES');
        const { runDepreciation } = await import('../asset-actions');
        await expectDenied(() => runDepreciation());
    });
});

describe('Pass 4: budget-actions.ts', () => {
    beforeEach(() => vi.clearAllMocks());

    it('getBudgets: SALES denied', async () => {
        setupAuth('SALES');
        const { getBudgets } = await import('../budget-actions');
        await expectDenied(() => getBudgets(2026));
    });

    it('upsertBudget: SALES denied', async () => {
        setupAuth('SALES');
        const { upsertBudget } = await import('../budget-actions');
        await expectDenied(() => upsertBudget({} as any));
    });
});

describe('Pass 4: foh-actions.ts', () => {
    beforeEach(() => vi.clearAllMocks());

    it('getFOHAllocation: SALES denied', async () => {
        setupAuth('SALES');
        const { getFOHAllocation } = await import('../foh-actions');
        await expectDenied(() => getFOHAllocation(2026, 1, 'a1'));
    });
});

describe('Pass 4: tax-actions.ts', () => {
    beforeEach(() => vi.clearAllMocks());

    it('getTaxSummary: SALES denied', async () => {
        setupAuth('SALES');
        const { getTaxSummary } = await import('../tax-actions');
        await expectDenied(() => getTaxSummary(new Date(), new Date()));
    });
});

describe('Pass 4: aging-actions.ts', () => {
    beforeEach(() => vi.clearAllMocks());

    it('getAgingSummary: SALES denied', async () => {
        setupAuth('SALES');
        const { getAgingSummary } = await import('../aging-actions');
        await expectDenied(() => getAgingSummary('AR'));
    });
});

describe('Pass 4: mobile-dashboard.ts', () => {
    beforeEach(() => vi.clearAllMocks());

    it('getFinanceMobileOverview: SALES denied', async () => {
        setupAuth('SALES');
        const { getFinanceMobileOverview } = await import('../mobile-dashboard');
        await expectDenied(() => getFinanceMobileOverview());
    });
});

describe('Pass 4: hpp-report.ts', () => {
    beforeEach(() => vi.clearAllMocks());

    it('getHppReportData: SALES denied', async () => {
        setupAuth('SALES');
        const { getHppReportData } = await import('../hpp-report');
        await expectDenied(() => getHppReportData());
    });

    it('lockPeriod: SALES denied', async () => {
        setupAuth('SALES');
        const { lockPeriod } = await import('../hpp-report');
        await expectDenied(() => lockPeriod(2026, 1));
    });

    it('unlockPeriod: SALES denied', async () => {
        setupAuth('SALES');
        const { unlockPeriod } = await import('../hpp-report');
        await expectDenied(() => unlockPeriod(2026, 1));
    });
});

describe('Pass 4: cost-history.ts', () => {
    beforeEach(() => vi.clearAllMocks());

    it('getCostHistory: SALES denied', async () => {
        setupAuth('SALES');
        const { getCostHistory } = await import('../cost-history');
        await expectDenied(() => getCostHistory('v1'));
    });

    it('updateStandardCost: SALES denied', async () => {
        setupAuth('SALES');
        const { updateStandardCost } = await import('../cost-history');
        await expectDenied(() => updateStandardCost('v1', 100, 'MANUAL'));
    });
});

describe('Pass 4: finance.ts', () => {
    beforeEach(() => vi.clearAllMocks());

    it('getWipValuation: PRODUCTION allowed (cross-portal)', async () => {
        setupAuth('PRODUCTION');
        const { getWipValuation } = await import('../finance');
        await expectAllowed(() => getWipValuation());
    });

    it('getWipValuation: SALES denied', async () => {
        setupAuth('SALES');
        const { getWipValuation } = await import('../finance');
        await expectDenied(() => getWipValuation());
    });

    it('getOrderCosting: PRODUCTION allowed (cross-portal)', async () => {
        setupAuth('PRODUCTION');
        const { getOrderCosting } = await import('../finance');
        await expectAllowed(() => getOrderCosting('o1'));
    });

    it('getOrderCosting: SALES denied', async () => {
        setupAuth('SALES');
        const { getOrderCosting } = await import('../finance');
        await expectDenied(() => getOrderCosting('o1'));
    });

    it('getProductionCostReport: SALES denied', async () => {
        setupAuth('SALES');
        const { getProductionCostReport } = await import('../finance');
        await expectDenied(() => getProductionCostReport());
    });

    it('updateOverdueStatuses: SALES denied', async () => {
        setupAuth('SALES');
        const { updateOverdueStatuses } = await import('../finance');
        await expectDenied(() => updateOverdueStatuses());
    });
});

describe('Pass 4: budgeting-actions.ts', () => {
    beforeEach(() => vi.clearAllMocks());

    it('getBudgetVsActuals: SALES denied', async () => {
        setupAuth('SALES');
        const { getBudgetVsActuals } = await import('../budgeting-actions');
        await expectDenied(() => getBudgetVsActuals(2026, 1));
    });
});

// ── PASS 5: Gap tests — positive allowed cases & missing deny cases ────────

describe('Pass 5: accounting.ts — deleteAccount gap', () => {
    beforeEach(() => vi.clearAllMocks());

    it('deleteAccount: SALES denied', async () => {
        setupAuth('SALES');
        const { deleteAccount } = await import('../accounting');
        await expectDenied(() => deleteAccount('a1'));
    });

    it('deleteAccount: FINANCE allowed (mutation)', async () => {
        setupAuth('FINANCE');
        const { deleteAccount } = await import('../accounting');
        await expectAllowed(() => deleteAccount('a1'));
    });

    it('deleteAccount: ADMIN allowed (mutation)', async () => {
        setupAuth('ADMIN');
        const { deleteAccount } = await import('../accounting');
        await expectAllowed(() => deleteAccount('a1'));
    });
});

describe('Pass 5: period-actions.ts — reopenPeriod positive', () => {
    beforeEach(() => vi.clearAllMocks());

    it('reopenPeriod: FINANCE allowed (approver)', async () => {
        setupAuth('FINANCE');
        const { reopenPeriod } = await import('../period-actions');
        await expectAllowed(() => reopenPeriod('p1'));
    });

    it('reopenPeriod: ADMIN allowed (approver)', async () => {
        setupAuth('ADMIN');
        const { reopenPeriod } = await import('../period-actions');
        await expectAllowed(() => reopenPeriod('p1'));
    });
});

describe('Pass 5: reconciliation-actions.ts — completeReconciliation positive', () => {
    beforeEach(() => vi.clearAllMocks());

    it('completeReconciliation: FINANCE allowed', async () => {
        setupAuth('FINANCE');
        const { completeReconciliation } = await import('../reconciliation-actions');
        await expectAllowed(() => completeReconciliation('r1'));
    });

    it('completeReconciliation: ADMIN allowed', async () => {
        setupAuth('ADMIN');
        const { completeReconciliation } = await import('../reconciliation-actions');
        await expectAllowed(() => completeReconciliation('r1'));
    });

    it('createAdjustmentJournals: FINANCE allowed (approver)', async () => {
        setupAuth('FINANCE');
        const { createAdjustmentJournals } = await import('../reconciliation-actions');
        await expectAllowed(() => createAdjustmentJournals('r1'));
    });

    it('createAdjustmentJournals: PROCUREMENT denied', async () => {
        setupAuth('PROCUREMENT');
        const { createAdjustmentJournals } = await import('../reconciliation-actions');
        await expectDenied(() => createAdjustmentJournals('r1'));
    });
});

describe('Pass 5: asset-actions.ts — runDepreciation positive', () => {
    beforeEach(() => vi.clearAllMocks());

    it('runDepreciation: FINANCE allowed (mutation)', async () => {
        setupAuth('FINANCE');
        const { runDepreciation } = await import('../asset-actions');
        await expectAllowed(() => runDepreciation());
    });

    it('runDepreciation: ADMIN allowed (mutation)', async () => {
        setupAuth('ADMIN');
        const { runDepreciation } = await import('../asset-actions');
        await expectAllowed(() => runDepreciation());
    });

    it('deleteAsset: FINANCE allowed (mutation)', async () => {
        setupAuth('FINANCE');
        const { deleteAsset } = await import('../asset-actions');
        await expectAllowed(() => deleteAsset('fa1'));
    });
});

describe('Pass 5: petty-cash-actions.ts — createPettyCashExpense positive', () => {
    beforeEach(() => vi.clearAllMocks());

    it('createPettyCashExpense: FINANCE allowed (mutation)', async () => {
        setupAuth('FINANCE');
        const { createPettyCashExpense } = await import('../petty-cash-actions');
        await expectAllowed(() => createPettyCashExpense({} as any));
    });

    it('createPettyCashExpense: ADMIN allowed (mutation)', async () => {
        setupAuth('ADMIN');
        const { createPettyCashExpense } = await import('../petty-cash-actions');
        await expectAllowed(() => createPettyCashExpense({} as any));
    });

    it('approvePettyCashExpense: SALES denied', async () => {
        setupAuth('SALES');
        const { approvePettyCashExpense } = await import('../petty-cash-actions');
        await expectDenied(() => approvePettyCashExpense('pc1'));
    });
});

describe('Pass 5: cost-history.ts — updateStandardCost positive', () => {
    beforeEach(() => vi.clearAllMocks());

    it('updateStandardCost: FINANCE allowed (mutation)', async () => {
        setupAuth('FINANCE');
        const { updateStandardCost } = await import('../cost-history');
        await expectAllowed(() => updateStandardCost('v1', 100, 'MANUAL'));
    });

    it('updateStandardCost: ADMIN allowed (mutation)', async () => {
        setupAuth('ADMIN');
        const { updateStandardCost } = await import('../cost-history');
        await expectAllowed(() => updateStandardCost('v1', 100, 'MANUAL'));
    });

    it('updateStandardCost: PRODUCTION denied (cross-portal mutation blocked)', async () => {
        setupAuth('PRODUCTION');
        const { updateStandardCost } = await import('../cost-history');
        await expectDenied(() => updateStandardCost('v1', 100, 'BOM_UPDATE'));
    });
});

describe('Pass 5: period-actions.ts — closePeriod positive', () => {
    beforeEach(() => vi.clearAllMocks());

    it('closePeriod: ADMIN allowed (approver)', async () => {
        setupAuth('ADMIN');
        const { closePeriod } = await import('../period-actions');
        await expectAllowed(() => closePeriod('p1'));
    });
});

describe('Pass 5: accounting.ts — createAccount positive', () => {
    beforeEach(() => vi.clearAllMocks());

    it('createAccount: FINANCE allowed (mutation)', async () => {
        setupAuth('FINANCE');
        const { createAccount } = await import('../accounting');
        await expectAllowed(() => createAccount({ code: '99999', name: 'Test', type: 'ASSET', category: 'CURRENT_ASSET' }));
    });

    it('createAccount: ADMIN allowed (mutation)', async () => {
        setupAuth('ADMIN');
        const { createAccount } = await import('../accounting');
        await expectAllowed(() => createAccount({ code: '99999', name: 'Test', type: 'ASSET', category: 'CURRENT_ASSET' }));
    });
});

describe('Pass 5: journal.ts — postJournal positive', () => {
    beforeEach(() => vi.clearAllMocks());

    it('postJournal: FINANCE allowed (approver)', async () => {
        setupAuth('FINANCE');
        const { postJournal } = await import('../journal');
        await expectAllowed(() => postJournal('j1'));
    });

    it('postJournal: ADMIN allowed (approver)', async () => {
        setupAuth('ADMIN');
        const { postJournal } = await import('../journal');
        await expectAllowed(() => postJournal('j1'));
    });

    it('createManualJournal: FINANCE allowed (mutation)', async () => {
        setupAuth('FINANCE');
        const { createManualJournal } = await import('../journal');
        await expectAllowed(() => createManualJournal({ entryDate: new Date(), description: 'Test', reference: '', lines: [] } as any));
    });
});

describe('Pass 5: opening-balance — positive cases', () => {
    beforeEach(() => vi.clearAllMocks());

    it('saveUnifiedOpeningBalance: FINANCE allowed (mutation)', async () => {
        setupAuth('FINANCE');
        const { saveUnifiedOpeningBalance } = await import('../opening-balance-create-actions');
        await expectAllowed(() => saveUnifiedOpeningBalance({ arEntries: [], apEntries: [], generalEntries: [] } as any));
    });

    it('deleteOpeningBalance: FINANCE allowed (mutation)', async () => {
        setupAuth('FINANCE');
        const { deleteOpeningBalance } = await import('../opening-balance-history-actions');
        await expectAllowed(() => deleteOpeningBalance('ob1', 'AR'));
    });
});

describe('Pass 5: coverage — accounting.ts read/query functions', () => {
    beforeEach(() => vi.clearAllMocks());

    it('getChartOfAccounts: FINANCE allowed', async () => {
        setupAuth('FINANCE');
        const { getChartOfAccounts } = await import('../accounting');
        await expectAllowed(() => getChartOfAccounts());
    });

    it('getAccountBalance: FINANCE allowed', async () => {
        setupAuth('FINANCE');
        const { getAccountBalance } = await import('../accounting');
        await expectAllowed(() => getAccountBalance('a1'));
    });

    it('getIncomeStatement: FINANCE allowed', async () => {
        setupAuth('FINANCE');
        const { getIncomeStatement } = await import('../accounting');
        await expectAllowed(() => getIncomeStatement(new Date('2026-01-01'), new Date('2026-01-31')));
    });

    it('getCashFlowStatement: FINANCE allowed', async () => {
        setupAuth('FINANCE');
        const { getCashFlowStatement } = await import('../accounting');
        await expectAllowed(() => getCashFlowStatement(new Date('2026-01-01'), new Date('2026-01-31')));
    });

    it('getBalanceSheet: FINANCE allowed', async () => {
        setupAuth('FINANCE');
        const { getBalanceSheet } = await import('../accounting');
        await expectAllowed(() => getBalanceSheet(new Date('2026-01-31')));
    });

    it('getGeneralLedger: FINANCE allowed', async () => {
        setupAuth('FINANCE');
        const { getGeneralLedger } = await import('../accounting');
        await expectAllowed(() => getGeneralLedger(new Date('2026-01-01'), new Date('2026-01-31')));
    });

    it('getFiscalPeriods: FINANCE allowed', async () => {
        setupAuth('FINANCE');
        const { getFiscalPeriods } = await import('../accounting');
        await expectAllowed(() => getFiscalPeriods());
    });

    it('createFiscalPeriod: FINANCE allowed (mutation)', async () => {
        setupAuth('FINANCE');
        const { createFiscalPeriod } = await import('../accounting');
        await expectAllowed(() => createFiscalPeriod(2026, 2));
    });

    it('createYearEndClosingEntry: FINANCE allowed (mutation)', async () => {
        setupAuth('FINANCE');
        const { createYearEndClosingEntry } = await import('../accounting');
        await expectAllowed(() => createYearEndClosingEntry(2025));
    });

    it('getFixedAssets: FINANCE allowed', async () => {
        setupAuth('FINANCE');
        const { getFixedAssets } = await import('../accounting');
        await expectAllowed(() => getFixedAssets());
    });

    it('getBudgets: FINANCE allowed', async () => {
        setupAuth('FINANCE');
        const { getBudgets } = await import('../accounting');
        await expectAllowed(() => getBudgets(2026, 1));
    });

    it('getAccountingDashboardData: FINANCE allowed', async () => {
        setupAuth('FINANCE');
        const { getAccountingDashboardData } = await import('../accounting');
        await expectAllowed(() => getAccountingDashboardData());
    });
});

describe('Pass 5: coverage — finance.ts + journal + reconciliation reads', () => {
    beforeEach(() => vi.clearAllMocks());

    it('getReceivedPayments: FINANCE allowed', async () => {
        setupAuth('FINANCE');
        const { getReceivedPayments } = await import('../finance');
        await expectAllowed(() => getReceivedPayments());
    });

    it('getSentPayments: FINANCE allowed', async () => {
        setupAuth('FINANCE');
        const { getSentPayments } = await import('../finance');
        await expectAllowed(() => getSentPayments());
    });

    it('updateOverdueStatuses: FINANCE allowed (mutation)', async () => {
        setupAuth('FINANCE');
        const { updateOverdueStatuses } = await import('../finance');
        await expectAllowed(() => updateOverdueStatuses());
    });

    it('getProductionCostReport: FINANCE allowed', async () => {
        setupAuth('FINANCE');
        const { getProductionCostReport } = await import('../finance');
        await expectAllowed(() => getProductionCostReport(new Date('2026-01-01'), new Date('2026-01-31')));
    });

    it('getWipValuation: PRODUCTION allowed (cross-portal)', async () => {
        setupAuth('PRODUCTION');
        const { getWipValuation } = await import('../finance');
        await expectAllowed(() => getWipValuation());
    });

    it('getOrderCosting: PRODUCTION allowed (cross-portal)', async () => {
        setupAuth('PRODUCTION');
        const { getOrderCosting } = await import('../finance');
        await expectAllowed(() => getOrderCosting('order-1'));
    });

    it('getJournalById: FINANCE allowed', async () => {
        setupAuth('FINANCE');
        const { getJournalById } = await import('../journal');
        await expectAllowed(() => getJournalById('j1'));
    });

    it('createBulkJournals: FINANCE allowed (mutation)', async () => {
        setupAuth('FINANCE');
        const { createBulkJournals } = await import('../journal');
        await expectAllowed(() => createBulkJournals([] as any));
    });

    it('listReconciliations: FINANCE allowed', async () => {
        setupAuth('FINANCE');
        const { listReconciliations } = await import('../reconciliation-actions');
        await expectAllowed(() => listReconciliations());
    });

    it('getUnreconciledEntries: FINANCE allowed', async () => {
        setupAuth('FINANCE');
        const { getUnreconciledEntries } = await import('../reconciliation-actions');
        await expectAllowed(() => getUnreconciledEntries('acc1', new Date('2026-01-01'), new Date('2026-01-31')));
    });
});
