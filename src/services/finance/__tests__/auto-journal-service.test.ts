import { beforeEach, describe, expect, it, vi } from "vitest";
import { JournalStatus, ReferenceType } from "@prisma/client";

vi.mock("@/lib/core/prisma", () => ({
  prisma: {
    $transaction: vi.fn(async (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma)),
    payment: {
      findUnique: vi.fn(),
    },
    invoice: {
      findUnique: vi.fn(),
    },
    account: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
    // Idempotency guard: default "no existing journal" for every test.
    journalEntry: {
      findFirst: vi.fn().mockResolvedValue(null),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  },
  // resolveAccount dynamically imports these for tenant-scoped caching
  tenantContext: {
    getStore: vi.fn().mockReturnValue(undefined),
  },
  getMainPrisma: vi.fn().mockReturnValue({ _isMain: true }),
}));

vi.mock("../../accounting/accounting-service", () => ({
  AccountingService: {
    createJournalEntry: vi.fn(),
  },
}));

// Mock account resolution so payment-handler tests stay focused on journal refs
vi.mock("../../accounting/account-resolver", () => ({
  resolveAccount: vi.fn().mockImplementation(async (role: string) => ({
    id: `acc-${role}`,
    code: "00000",
    name: role,
  })),
}));

import { prisma } from "@/lib/core/prisma";
import { AccountingService } from "../../accounting/accounting-service";
import { AutoJournalService } from "../auto-journal-service";
import { postSalesInvoiceJournal } from '../sales-recognition-service';
vi.mock('../sales-recognition-service', () => ({ postSalesInvoiceJournal: vi.fn() }));

describe("AutoJournalService payment journals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses sales payment id as journal referenceId", async () => {
    const paymentDate = new Date("2026-04-20T10:00:00.000Z");
    vi.mocked(prisma.payment.findUnique).mockResolvedValue({
      id: "pay-1",
      paymentDate,
      paymentNumber: "PAY-IN-001",
      invoice: {
        id: "inv-1",
        invoiceNumber: "INV-001",
      },
    } as never);

    await AutoJournalService.handleSalesPayment(
      "pay-1",
      250000,
      "Bank Transfer",
    );

    expect(AccountingService.createJournalEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        entryDate: paymentDate,
        reference: "PAY-IN-001",
        referenceType: ReferenceType.SALES_PAYMENT,
        referenceId: "pay-1",
        status: JournalStatus.POSTED,
      }),
    );
  });

  it("keeps sales receipt reads and writes on the supplied transaction", async () => {
    const tx = {
      payment: { findUnique: vi.fn().mockResolvedValue({ id: 'pay-tx', paymentDate: new Date('2026-08-20'), paymentNumber: 'PAY-TX', method: 'Cash', invoice: { invoiceNumber: 'INV-TX' } }) },
      journalEntry: { findFirst: vi.fn().mockResolvedValue(null) },
    } as unknown as import('@prisma/client').Prisma.TransactionClient;
    await AutoJournalService.handleSalesPayment('pay-tx', 100, 'Cash', undefined, tx);
    expect(tx.payment.findUnique).toHaveBeenCalled();
    expect(AccountingService.createJournalEntry).toHaveBeenCalledWith(expect.objectContaining({ referenceId: 'pay-tx', status: 'POSTED' }), tx);
  });

  it("uses purchase payment id as journal referenceId", async () => {
    const paymentDate = new Date("2026-04-20T11:00:00.000Z");
    vi.mocked(prisma.payment.findUnique).mockResolvedValue({
      id: "pay-2",
      paymentDate,
      paymentNumber: "PAY-OUT-001",
      purchaseInvoice: {
        id: "pinv-1",
        invoiceNumber: "BILL-001",
      },
    } as never);

    await AutoJournalService.handlePurchasePayment("pay-2", 175000, "Cash");

    expect(AccountingService.createJournalEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        entryDate: paymentDate,
        reference: "PAY-OUT-001",
        referenceType: ReferenceType.PURCHASE_PAYMENT,
        referenceId: "pay-2",
        status: JournalStatus.POSTED,
      }),
    );
  });

  it("handleMaterialIssue returns undefined (delegated)", async () => {
    const result = await AutoJournalService.handleMaterialIssue("issue-1");
    expect(result).toBeUndefined();
  });

  it("handleProductionOutput returns undefined (delegated)", async () => {
    const result = await AutoJournalService.handleProductionOutput("exec-1");
    expect(result).toBeUndefined();
  });

  it("handleScrapOutput returns undefined (delegated)", async () => {
    const result = await AutoJournalService.handleScrapOutput("scrap-1");
    expect(result).toBeUndefined();
  });

  it("handleStockMovement returns undefined (delegated)", async () => {
    const result = await AutoJournalService.handleStockMovement("mov-1");
    expect(result).toBeUndefined();
  });
});

vi.mock('../barter-health-service', () => ({ collectBarterHealth: vi.fn(async () => ({ scanned: 1, issues: [] })) }));

describe("AutoJournalService.ensureDocumentJournal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.journalEntry.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.journalEntry.updateMany).mockResolvedValue({ count: 0 });
  });

  it("sales payment missing journal → created via payment record", async () => {
    // Called twice: once by ensure (amount/method select), once by the
    // handler itself (with invoice include) — same object serves both.
    vi.mocked(prisma.payment.findUnique).mockResolvedValue({
      id: "pay-1",
      amount: { toNumber: () => 250000 },
      method: "Bank Transfer",
      paymentDate: new Date("2026-08-01T00:00:00.000Z"),
      paymentNumber: "PAY-IN-001",
      invoice: { id: "inv-1", invoiceNumber: "INV-001" },
    } as never);

    const outcome = await AutoJournalService.ensureDocumentJournal(
      "SALES_PAYMENT",
      "pay-1",
    );

    expect(outcome.action).toBe("created");
    expect(AccountingService.createJournalEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        referenceType: ReferenceType.SALES_PAYMENT,
        referenceId: "pay-1",
        status: JournalStatus.POSTED,
      }),
    );
  });

  it("existing journal → exists, no new journal created", async () => {
    vi.mocked(prisma.journalEntry.findFirst).mockResolvedValue({
      id: "je-1",
    } as never);

    const outcome = await AutoJournalService.ensureDocumentJournal(
      "SALES_PAYMENT",
      "pay-1",
    );

    expect(outcome).toEqual({ action: "exists", journalId: "je-1" });
    expect(AccountingService.createJournalEntry).not.toHaveBeenCalled();
  });

  it("barter offset payment is handled by the settlement journal", async () => {
    vi.mocked(prisma.payment.findUnique).mockResolvedValue({
      id: "barter-ar",
      amount: { toNumber: () => 100 },
      method: "Barter",
      barterSettlementId: "settlement-1",
      barterLeg: "AR_OFFSET",
    } as never);

    const outcome = await AutoJournalService.ensureDocumentJournal(
      "SALES_PAYMENT",
      "barter-ar",
    );

    expect(outcome).toEqual({
      action: "skipped",
      reason: "barter_bundle_verified",
    });
    expect(AccountingService.createJournalEntry).not.toHaveBeenCalled();
  });

  it("invalid AP cash bundle cannot be repaired independently", async () => {
    const { collectBarterHealth } = await import('../barter-health-service');
    vi.mocked(collectBarterHealth).mockResolvedValueOnce({ scanned: 1, issues: [{ id: 's', settlementNumber: 'BRT', reason: 'CASH_JOURNAL_MISSING' }], truncated: false, nextCursor: null });
    vi.mocked(prisma.payment.findUnique).mockResolvedValue({ barterSettlementId: 's', barterLeg: 'AP_CASH', method: 'Cash' } as never);
    expect(await AutoJournalService.ensureDocumentJournal('PURCHASE_PAYMENT', 'cash-leg')).toEqual({ action: 'skipped', reason: 'barter_bundle_invalid' });
    expect(AccountingService.createJournalEntry).not.toHaveBeenCalled();
  });

  it("orphan barter payment is never repaired as a bank receipt", async () => {
    vi.mocked(prisma.payment.findUnique).mockResolvedValue({
      id: "orphan",
      amount: { toNumber: () => 100 },
      method: "Barter",
      barterSettlementId: null,
      barterLeg: null,
    } as never);

    const outcome = await AutoJournalService.ensureDocumentJournal(
      "SALES_PAYMENT",
      "orphan",
    );

    expect(outcome).toEqual({ action: "skipped", reason: "orphan_barter_payment" });
  });

  it("zero-amount payment → skipped, no journal", async () => {
    vi.mocked(prisma.payment.findUnique).mockResolvedValue({
      amount: { toNumber: () => 0 },
      method: "Cash",
    } as never);

    const outcome = await AutoJournalService.ensureDocumentJournal(
      "SALES_PAYMENT",
      "pay-1",
    );

    expect(outcome.action).toBe("skipped");
    expect(AccountingService.createJournalEntry).not.toHaveBeenCalled();
  });

  it("payment not found → skipped with reason", async () => {
    vi.mocked(prisma.payment.findUnique).mockResolvedValue(null);

    const outcome = await AutoJournalService.ensureDocumentJournal(
      "SALES_PAYMENT",
      "pay-404",
    );

    expect(outcome).toEqual({ action: "skipped", reason: "payment_not_found" });
  });

  it("approved invoice with DRAFT journal → promoted to POSTED", async () => {
    vi.mocked(postSalesInvoiceJournal).mockResolvedValue({ action: "promoted", journalId: "je-2" });
    vi.mocked(prisma.journalEntry.findFirst).mockResolvedValue({
      id: "je-2",
    } as never);
    vi.mocked(prisma.invoice.findUnique).mockResolvedValue({
      status: "UNPAID",
    } as never);
    vi.mocked(prisma.journalEntry.updateMany).mockResolvedValue({ count: 1 });

    const outcome = await AutoJournalService.ensureDocumentJournal(
      "SALES_INVOICE",
      "inv-1",
    );

    expect(outcome.action).toBe("promoted");
    expect(postSalesInvoiceJournal).toHaveBeenCalledWith(prisma, "inv-1");
  });

  it("DRAFT invoice keeps its DRAFT journal (exists, no promotion)", async () => {
    vi.mocked(postSalesInvoiceJournal).mockResolvedValue({ action: "exists", journalId: "je-3" });
    vi.mocked(prisma.journalEntry.findFirst).mockResolvedValue({
      id: "je-3",
    } as never);
    vi.mocked(prisma.invoice.findUnique).mockResolvedValue({
      status: "DRAFT",
    } as never);

    const outcome = await AutoJournalService.ensureDocumentJournal(
      "SALES_INVOICE",
      "inv-draft",
    );

    expect(outcome).toEqual({ action: "exists", journalId: "je-3" });
    expect(prisma.journalEntry.updateMany).not.toHaveBeenCalled();
  });
});

describe("payment handler failure hardening", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("handleSalesPayment throws NotFoundError when payment missing (no silent drop)", async () => {
    vi.mocked(prisma.payment.findUnique).mockResolvedValue(null);

    await expect(
      AutoJournalService.handleSalesPayment("pay-404", 100000),
    ).rejects.toThrow(/pay-404/);
    expect(AccountingService.createJournalEntry).not.toHaveBeenCalled();
  });
});
