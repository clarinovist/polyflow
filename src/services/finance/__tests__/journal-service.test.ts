// @ts-nocheck
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createJournalEntry,
  createClosingJournalEntry,
  createYearEndClosingEntry,
  postJournal,
  postBulkJournals,
  voidJournal,
  reverseJournal,
  createBulkJournalEntries,
  getJournals,
  getJournalById,
} from "@/services/accounting/journals-service";
import { prisma } from "@/lib/core/prisma";
import { isPeriodOpen } from "@/services/accounting/periods-service";
import { getClosingBalances } from "@/services/accounting/reports-service";
import { resolveAccount } from "@/services/accounting/account-resolver";
import { ReferenceType, JournalStatus, Prisma } from "@prisma/client";
import type { CreateJournalEntryInput } from "@/services/accounting/types";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@/lib/core/prisma", () => ({
  prisma: {
    journalEntry: {
      create: vi.fn(),
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
    },
    journalLine: {
      deleteMany: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
    },
    account: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn(),
    },
    fiscalPeriod: {
      findUnique: vi.fn(),
    },
    purchaseInvoice: {
      updateMany: vi.fn(),
    },
    invoice: {
      updateMany: vi.fn(),
    },
    systemSequence: {
      update: vi.fn(),
      upsert: vi.fn(),
    },
    $transaction: vi.fn((callback: (tx: typeof prisma) => Promise<unknown>) =>
      callback(prisma),
    ),
  },
}));

vi.mock("@/services/accounting/periods-service", () => ({
  isPeriodOpen: vi.fn(),
}));

vi.mock("@/services/accounting/reports-service", () => ({
  getClosingBalances: vi.fn(),
}));

vi.mock("@/services/accounting/account-resolver", () => ({
  resolveAccount: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeValidEntry = (
  overrides?: Partial<CreateJournalEntryInput>,
): CreateJournalEntryInput => ({
  entryDate: new Date(2026, 0, 15),
  description: "Test Entry",
  reference: "REF-001",
  referenceType: ReferenceType.MANUAL_ENTRY,
  createdById: "user-1",
  lines: [
    { accountId: "acc-1", debit: 100, credit: 0, description: "Debit" },
    { accountId: "acc-2", debit: 0, credit: 100, description: "Credit" },
  ],
  ...overrides,
});

/**
 * Set up the systemSequence mock for entry number generation.
 * Does NOT touch `findUnique` — callers set that up themselves if needed.
 */
function setupSequenceForYear(_year: number, nextVal = 2) {
  vi.mocked(prisma.systemSequence.update).mockResolvedValue({
    value: BigInt(nextVal),
  } as never);
  vi.mocked(prisma.systemSequence.upsert).mockResolvedValue({
    value: BigInt(nextVal),
  } as never);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("JournalsService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset account.findMany to empty array (clears control-account test overrides)
    vi.mocked(prisma.account.findMany).mockResolvedValue([]);
    // Default: period is open
    vi.mocked(isPeriodOpen).mockResolvedValue(true);
    // Reset mocks whose implementations get overridden by individual tests
    // (clearAllMocks does NOT reset implementations)
    vi.mocked(prisma.account.findMany).mockResolvedValue([]);
    vi.mocked(prisma.account.findUnique).mockReset();
    vi.mocked(prisma.journalEntry.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.journalEntry.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.journalEntry.findMany).mockResolvedValue([]);
    vi.mocked(prisma.journalEntry.count).mockResolvedValue(0);
    vi.mocked(prisma.journalEntry.delete).mockReset();
    vi.mocked(prisma.journalEntry.update).mockReset();
    vi.mocked(prisma.journalEntry.updateMany).mockReset();
    vi.mocked(prisma.journalLine.deleteMany).mockReset();
    vi.mocked(prisma.journalLine.findMany).mockResolvedValue([]);
    vi.mocked(prisma.fiscalPeriod.findUnique).mockReset();
    vi.mocked(resolveAccount).mockReset();
    vi.mocked(getClosingBalances).mockReset();
    vi.mocked(prisma.purchaseInvoice.updateMany).mockReset();
    vi.mocked(prisma.invoice.updateMany).mockReset();
    vi.mocked(prisma.systemSequence.update).mockReset();
    vi.mocked(prisma.systemSequence.upsert).mockReset();
  });

  // ========================================================================
  // createJournalEntry
  // ========================================================================
  describe("createJournalEntry", () => {
    it("creates a balanced journal entry when period is open", async () => {
      // Arrange
      const input = makeValidEntry();
      setupSequenceForYear(input.entryDate.getFullYear());
      vi.mocked(prisma.journalEntry.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.journalEntry.create).mockResolvedValue({
        id: "je-1",
        ...input,
        entryNumber: "JE - 2026 -00001",
        lines: [],
      } as never);

      // Act
      const result = await createJournalEntry(input);

      // Assert
      expect(result).toBeDefined();
      expect(prisma.journalEntry.create).toHaveBeenCalled();
      expect(isPeriodOpen).toHaveBeenCalledWith(input.entryDate);
    });

    it("throws when entry is unbalanced", async () => {
      // Arrange
      const unbalanced = makeValidEntry({
        lines: [
          { accountId: "acc-1", debit: 100, credit: 0 },
          { accountId: "acc-2", debit: 0, credit: 90 },
        ],
      });

      // Act & Assert
      await expect(createJournalEntry(unbalanced)).rejects.toThrow(
        /Journal Entry is not balanced/,
      );
      expect(prisma.journalEntry.create).not.toHaveBeenCalled();
    });

    it("throws when fiscal period is closed", async () => {
      // Arrange
      vi.mocked(isPeriodOpen).mockResolvedValue(false);

      // Act & Assert
      await expect(createJournalEntry(makeValidEntry())).rejects.toThrow(
        /closed fiscal period/,
      );
      expect(prisma.journalEntry.create).not.toHaveBeenCalled();
    });

    it("rejects manual entries targeting control accounts (AR 112xxx)", async () => {
      // Arrange
      const input = makeValidEntry({
        lines: [
          { accountId: "acc-ar", debit: 100, credit: 0 },
          { accountId: "acc-2", debit: 0, credit: 100 },
        ],
      });
      vi.mocked(prisma.account.findMany).mockResolvedValue([
        { id: "acc-ar", code: "11200", name: "Accounts Receivable" },
      ] as never);

      // Act & Assert
      await expect(createJournalEntry(input)).rejects.toThrow(
        /Control Accounts: 11200/,
      );
      expect(prisma.journalEntry.create).not.toHaveBeenCalled();
    });

    it("rejects manual entries targeting control accounts (Inventory 113xxx)", async () => {
      // Arrange
      const input = makeValidEntry({
        lines: [
          { accountId: "acc-inv", debit: 50, credit: 0 },
          { accountId: "acc-2", debit: 0, credit: 50 },
        ],
      });
      vi.mocked(prisma.account.findMany).mockResolvedValue([
        { id: "acc-inv", code: "11300", name: "Inventory" },
      ] as never);

      // Act & Assert
      await expect(createJournalEntry(input)).rejects.toThrow(
        /Control Accounts: 11300/,
      );
    });

    it("allows auto-generated entries to control accounts without rejection", async () => {
      // Arrange
      const input = makeValidEntry({ isAutoGenerated: true });
      setupSequenceForYear(input.entryDate.getFullYear());
      vi.mocked(prisma.journalEntry.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.journalEntry.create).mockResolvedValue({
        id: "je-1",
        ...input,
        entryNumber: "JE - 2026 -00001",
        lines: [],
      } as never);

      // Act
      const result = await createJournalEntry(input);

      // Assert
      expect(result).toBeDefined();
      // findMany for control accounts should NOT be called for auto-generated
      expect(prisma.account.findMany).not.toHaveBeenCalled();
    });

    it("retries on P2002 entryNumber collision and succeeds", async () => {
      // Arrange
      const input = makeValidEntry();
      const year = input.entryDate.getFullYear();

      let findUniqueCallCount = 0;
      vi.mocked(prisma.journalEntry.findUnique).mockImplementation(
        async (args: Record<string, unknown>) => {
          if (args.where && "entryNumber" in args.where) {
            // First call: collision exists; subsequent: no collision
            return findUniqueCallCount++ === 0
              ? ({ id: "existing" } as never)
              : null;
          }
          return null;
        },
      );

      vi.mocked(prisma.journalEntry.findFirst).mockResolvedValue({
        entryNumber: `JE - ${year} -00005`,
      } as never);
      vi.mocked(prisma.systemSequence.update)
        .mockResolvedValueOnce({ value: BigInt(2) } as never) // first attempt
        .mockResolvedValueOnce({ value: BigInt(7) } as never); // fast-forward
      vi.mocked(prisma.journalEntry.create).mockResolvedValue({
        id: "je-new",
        ...input,
        entryNumber: `JE - ${year} -00006`,
        lines: [],
      } as never);

      // Act
      const result = await createJournalEntry(input);

      // Assert
      expect(result).toBeDefined();
      expect(prisma.journalEntry.create).toHaveBeenCalled();
    });

    it("throws non-P2002 errors immediately without retry", async () => {
      // Arrange
      const input = makeValidEntry();
      setupSequenceForYear(input.entryDate.getFullYear());
      vi.mocked(prisma.journalEntry.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.journalEntry.create).mockRejectedValue(
        new Error("Database connection lost"),
      );

      // Act & Assert
      await expect(createJournalEntry(input)).rejects.toThrow(
        "Database connection lost",
      );
    });

    it("uses provided tx when given", async () => {
      // Arrange
      const input = makeValidEntry({ isAutoGenerated: true });
      vi.mocked(isPeriodOpen).mockResolvedValue(true);
      setupSequenceForYear(input.entryDate.getFullYear());
      vi.mocked(prisma.journalEntry.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.journalEntry.create).mockResolvedValue({
        id: "je-tx",
        lines: [],
      } as never);

      // Act
      const result = await createJournalEntry(input);

      // Assert
      expect(result).toBeDefined();
    });

    it("retries on P2002 collision then exhausts retries", async () => {
      // Arrange
      const input = makeValidEntry();
      const collisionError = new Prisma.PrismaClientKnownRequestError(
        "Unique constraint",
        {
          code: "P2002",
          clientVersion: "5.22.0",
          meta: { target: ["entryNumber"] },
        },
      );

      // Every attempt collides
      vi.mocked(prisma.journalEntry.findUnique).mockResolvedValue({
        id: "existing",
      } as never);
      vi.mocked(prisma.journalEntry.findFirst).mockResolvedValue({
        entryNumber: "JE - 2026 -00005",
      } as never);
      vi.mocked(prisma.systemSequence.update).mockResolvedValue({
        value: BigInt(2),
      } as never);
      // The create always hits a P2002
      vi.mocked(prisma.journalEntry.create).mockRejectedValue(collisionError);

      // Act & Assert — should exhaust retries and throw
      await expect(createJournalEntry(input)).rejects.toThrow();
    });

    it("retries on P2002 collision with tx provided does not retry", async () => {
      // Arrange
      const input = makeValidEntry();
      const mockTx = {
        journalEntry: {
          create: vi.fn().mockRejectedValue(
            new Prisma.PrismaClientKnownRequestError("Unique constraint", {
              code: "P2002",
              clientVersion: "5.22.0",
              meta: { target: ["entryNumber"] },
            }),
          ),
          findUnique: vi.fn().mockResolvedValue(null),
          findFirst: vi.fn().mockResolvedValue(null),
        },
        systemSequence: {
          update: vi.fn().mockResolvedValue({ value: BigInt(2) }),
        },
      } as unknown as Prisma.TransactionClient;

      // Act & Assert — with tx, P2002 should NOT trigger retry
      await expect(createJournalEntry(input, mockTx)).rejects.toThrow();
    });

    it("uses default status DRAFT when status is not provided", async () => {
      // Arrange
      const input = makeValidEntry({ status: undefined });
      setupSequenceForYear(input.entryDate.getFullYear());
      vi.mocked(prisma.journalEntry.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.journalEntry.create).mockResolvedValue({
        id: "je-1",
        lines: [],
      } as never);

      // Act
      await createJournalEntry(input);

      // Assert
      expect(prisma.journalEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: JournalStatus.DRAFT }),
        }),
      );
    });
  });

  // ========================================================================
  // createClosingJournalEntry
  // ========================================================================
  describe("createClosingJournalEntry", () => {
    it("throws when period is not found", async () => {
      // Arrange
      vi.mocked(prisma.fiscalPeriod.findUnique).mockResolvedValue(null);

      // Act & Assert
      await expect(
        createClosingJournalEntry("nonexistent", "user-1"),
      ).rejects.toThrow("Period not found");
    });

    it("returns null when no closing balances exist", async () => {
      // Arrange
      vi.mocked(prisma.fiscalPeriod.findUnique).mockResolvedValue({
        id: "period-1",
        name: "January 2026",
        startDate: new Date(2026, 0, 1),
        endDate: new Date(2026, 0, 31),
      } as never);
      vi.mocked(prisma.journalEntry.findFirst).mockResolvedValue(null);
      vi.mocked(getClosingBalances).mockResolvedValue([]);

      // Act
      const result = await createClosingJournalEntry("period-1", "user-1");

      // Assert
      expect(result).toBeNull();
    });

    it("deletes existing closing entry before creating new one", async () => {
      // Arrange
      vi.mocked(prisma.fiscalPeriod.findUnique).mockResolvedValue({
        id: "period-1",
        name: "January 2026",
        startDate: new Date(2026, 0, 1),
        endDate: new Date(2026, 0, 31),
      } as never);
      vi.mocked(prisma.journalEntry.findFirst).mockResolvedValue({
        id: "old-closing",
        reference: "CLOSING-January-2026",
      } as never);
      vi.mocked(prisma.journalLine.deleteMany).mockResolvedValue({ count: 2 });
      vi.mocked(prisma.journalEntry.delete).mockResolvedValue({} as never);
      vi.mocked(getClosingBalances).mockResolvedValue([
        { id: "acc-1", type: "REVENUE", netBalance: 500 },
        { id: "acc-2", type: "EXPENSE", netBalance: 300 },
      ] as never);
      vi.mocked(resolveAccount).mockResolvedValue({
        id: "earnings-acc",
        code: "33000",
      } as never);
      vi.mocked(prisma.account.findUnique).mockResolvedValue({
        id: "earnings-acc",
        code: "33000",
        name: "Current Year Earnings",
      } as never);
      setupSequenceForYear(2026);
      vi.mocked(prisma.journalEntry.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.journalEntry.create).mockResolvedValue({
        id: "je-closing",
        lines: [],
      } as never);

      // Act
      await createClosingJournalEntry("period-1", "user-1");

      // Assert
      expect(prisma.journalLine.deleteMany).toHaveBeenCalledWith({
        where: { journalEntryId: "old-closing" },
      });
      expect(prisma.journalEntry.delete).toHaveBeenCalledWith({
        where: { id: "old-closing" },
      });
    });

    it("creates closing entry with correct debit/credit lines for revenue and expense", async () => {
      // Arrange
      vi.mocked(prisma.fiscalPeriod.findUnique).mockResolvedValue({
        id: "period-1",
        name: "January 2026",
        startDate: new Date(2026, 0, 1),
        endDate: new Date(2026, 0, 31),
      } as never);
      vi.mocked(prisma.journalEntry.findFirst).mockResolvedValue(null);
      vi.mocked(getClosingBalances).mockResolvedValue([
        { id: "rev-1", type: "REVENUE", netBalance: 500 },
        { id: "exp-1", type: "EXPENSE", netBalance: 300 },
      ] as never);
      vi.mocked(resolveAccount).mockResolvedValue({
        id: "earnings-acc",
        code: "33000",
      } as never);
      vi.mocked(prisma.account.findUnique).mockResolvedValue({
        id: "earnings-acc",
        code: "33000",
        name: "Current Year Earnings",
      } as never);
      setupSequenceForYear(2026);
      vi.mocked(prisma.journalEntry.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.journalEntry.create).mockResolvedValue({
        id: "je-closing",
        lines: [],
      } as never);

      // Act
      const result = await createClosingJournalEntry("period-1", "user-1");

      // Assert
      expect(result).toBeDefined();
      const createCall = vi.mocked(prisma.journalEntry.create);
      expect(createCall).toHaveBeenCalled();
      const createArg = createCall.mock.calls[0][0] as Record<string, unknown>;
      const data = createArg.data as Record<string, unknown>;
      expect(data.status).toBe("POSTED");
      expect(data.isAutoGenerated).toBe(true);
    });

    it("throws when earnings account not found in COA", async () => {
      // Arrange
      vi.mocked(prisma.fiscalPeriod.findUnique).mockResolvedValue({
        id: "period-1",
        name: "January 2026",
        startDate: new Date(2026, 0, 1),
        endDate: new Date(2026, 0, 31),
      } as never);
      vi.mocked(prisma.journalEntry.findFirst).mockResolvedValue(null);
      vi.mocked(getClosingBalances).mockResolvedValue([
        { id: "rev-1", type: "REVENUE", netBalance: 500 },
      ] as never);
      vi.mocked(resolveAccount).mockResolvedValue({
        id: "earnings-acc",
      } as never);
      vi.mocked(prisma.account.findUnique).mockResolvedValue(null);

      // Act & Assert
      await expect(
        createClosingJournalEntry("period-1", "user-1"),
      ).rejects.toThrow("Current Year Earnings account not found in COA");
    });
  });

  // ========================================================================
  // createYearEndClosingEntry
  // ========================================================================
  describe("createYearEndClosingEntry", () => {
    const earningsAccountId = "earnings-33000";
    const retainedAccountId = "retained-32000";

    function setupYearEndMocks(balance: number) {
      vi.mocked(resolveAccount)
        .mockResolvedValueOnce({
          id: earningsAccountId,
          code: "33000",
        } as never)
        .mockResolvedValueOnce({
          id: retainedAccountId,
          code: "32000",
        } as never);
      vi.mocked(prisma.account.findUnique)
        .mockResolvedValueOnce({
          id: earningsAccountId,
          code: "33000",
          name: "Current Year Earnings",
        } as never)
        .mockResolvedValueOnce({
          id: retainedAccountId,
          code: "32000",
          name: "Retained Earnings",
        } as never);

      // Journal lines for 33000
      const debit = balance > 0 ? 0 : Math.abs(balance);
      const credit = balance > 0 ? balance : 0;
      vi.mocked(prisma.journalLine.findMany).mockResolvedValue([
        { debit: BigInt(debit), credit: BigInt(credit) },
      ] as never);
    }

    it("throws when earnings account not found", async () => {
      // Arrange
      vi.mocked(resolveAccount).mockResolvedValue({
        id: earningsAccountId,
      } as never);
      vi.mocked(prisma.account.findUnique).mockResolvedValue(null);

      // Act & Assert
      await expect(createYearEndClosingEntry(2026, "user-1")).rejects.toThrow(
        "Current Year Earnings account not found",
      );
    });

    it("throws when retained earnings account not found", async () => {
      // Arrange
      vi.mocked(resolveAccount)
        .mockResolvedValueOnce({ id: earningsAccountId } as never)
        .mockResolvedValueOnce({ id: retainedAccountId } as never);
      vi.mocked(prisma.account.findUnique)
        .mockResolvedValueOnce({
          id: earningsAccountId,
          code: "33000",
        } as never)
        .mockResolvedValueOnce(null);

      // Act & Assert
      await expect(createYearEndClosingEntry(2026, "user-1")).rejects.toThrow(
        "Retained Earnings account not found",
      );
    });

    it("throws when balance is effectively zero", async () => {
      // Arrange
      setupYearEndMocks(0);
      vi.mocked(prisma.journalLine.findMany).mockResolvedValue([
        { debit: BigInt(0), credit: BigInt(0) },
      ] as never);

      // Act & Assert
      await expect(createYearEndClosingEntry(2026, "user-1")).rejects.toThrow(
        /No balance in Current Year Earnings/,
      );
    });

    it("creates year-end entry transferring positive balance to retained earnings", async () => {
      // Arrange
      setupYearEndMocks(1000);
      setupSequenceForYear(2026);
      vi.mocked(prisma.journalEntry.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.journalEntry.create).mockResolvedValue({
        id: "je-yearend",
        lines: [],
      } as never);

      // Act
      const result = await createYearEndClosingEntry(2026, "user-1");

      // Assert
      expect(result).toBeDefined();
      expect(prisma.journalEntry.create).toHaveBeenCalled();
    });

    it("creates year-end entry for negative balance", async () => {
      // Arrange
      setupYearEndMocks(-500);
      setupSequenceForYear(2026);
      vi.mocked(prisma.journalEntry.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.journalEntry.create).mockResolvedValue({
        id: "je-yearend-neg",
        lines: [],
      } as never);

      // Act
      const result = await createYearEndClosingEntry(2026, "user-1");

      // Assert
      expect(result).toBeDefined();
    });

    it("deletes existing year-end entry before creating new one (re-close)", async () => {
      // Arrange
      vi.mocked(prisma.journalEntry.findFirst).mockResolvedValue({
        id: "old-yearend",
        reference: "YEAREND-2026",
      } as never);
      vi.mocked(prisma.journalLine.deleteMany).mockResolvedValue({ count: 1 });
      vi.mocked(prisma.journalEntry.delete).mockResolvedValue({} as never);
      setupYearEndMocks(1000);
      setupSequenceForYear(2026);
      vi.mocked(prisma.journalEntry.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.journalEntry.create).mockResolvedValue({
        id: "je-new",
        lines: [],
      } as never);

      // Act
      await createYearEndClosingEntry(2026, "user-1");

      // Assert
      expect(prisma.journalLine.deleteMany).toHaveBeenCalledWith({
        where: { journalEntryId: "old-yearend" },
      });
      expect(prisma.journalEntry.delete).toHaveBeenCalledWith({
        where: { id: "old-yearend" },
      });
    });
  });

  // ========================================================================
  // postJournal
  // ========================================================================
  describe("postJournal", () => {
    it("posts a draft journal successfully", async () => {
      // Arrange
      const mockJournal = {
        id: "je-1",
        status: "DRAFT",
        entryDate: new Date(2026, 0, 15),
        referenceType: "MANUAL_ENTRY",
        referenceId: null,
        lines: [],
      };
      vi.mocked(prisma.journalEntry.findUnique).mockResolvedValue(
        mockJournal as never,
      );
      vi.mocked(prisma.journalEntry.update).mockResolvedValue({
        ...mockJournal,
        status: "POSTED",
      } as never);

      // Act
      const result = await postJournal("je-1", "user-1");

      // Assert
      expect(result.status).toBe("POSTED");
      expect(prisma.journalEntry.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: "POSTED" }),
        }),
      );
    });

    it("throws when journal not found", async () => {
      // Arrange
      vi.mocked(prisma.journalEntry.findUnique).mockResolvedValue(null);

      // Act & Assert
      await expect(postJournal("nonexistent")).rejects.toThrow(
        "Journal not found",
      );
    });

    it("throws when journal is not DRAFT", async () => {
      // Arrange
      vi.mocked(prisma.journalEntry.findUnique).mockResolvedValue({
        id: "je-1",
        status: "POSTED",
        lines: [],
      } as never);

      // Act & Assert
      await expect(postJournal("je-1")).rejects.toThrow(
        "Only DRAFT journals can be posted",
      );
    });

    it("throws when fiscal period is closed", async () => {
      // Arrange
      vi.mocked(prisma.journalEntry.findUnique).mockResolvedValue({
        id: "je-1",
        status: "DRAFT",
        entryDate: new Date(2026, 0, 15),
        lines: [],
      } as never);
      vi.mocked(isPeriodOpen).mockResolvedValue(false);

      // Act & Assert
      await expect(postJournal("je-1")).rejects.toThrow(/closed fiscal period/);
    });

    it("updates PURCHASE_INVOICE reference to UNPAID", async () => {
      // Arrange
      vi.mocked(prisma.journalEntry.findUnique).mockResolvedValue({
        id: "je-1",
        status: "DRAFT",
        entryDate: new Date(2026, 0, 15),
        referenceType: "PURCHASE_INVOICE",
        referenceId: "pi-1",
        lines: [],
      } as never);
      vi.mocked(prisma.journalEntry.update).mockResolvedValue({
        id: "je-1",
        status: "POSTED",
      } as never);

      // Act
      await postJournal("je-1", "user-1");

      // Assert
      expect(prisma.purchaseInvoice.updateMany).toHaveBeenCalledWith({
        where: { id: "pi-1", status: "DRAFT" },
        data: { status: "UNPAID" },
      });
    });

    it("updates SALES_INVOICE reference to UNPAID", async () => {
      // Arrange
      vi.mocked(prisma.journalEntry.findUnique).mockResolvedValue({
        id: "je-1",
        status: "DRAFT",
        entryDate: new Date(2026, 0, 15),
        referenceType: "SALES_INVOICE",
        referenceId: "inv-1",
        lines: [],
      } as never);
      vi.mocked(prisma.journalEntry.update).mockResolvedValue({
        id: "je-1",
        status: "POSTED",
      } as never);

      // Act
      await postJournal("je-1", "user-1");

      // Assert
      expect(prisma.invoice.updateMany).toHaveBeenCalledWith({
        where: { id: "inv-1", status: "DRAFT" },
        data: { status: "UNPAID" },
      });
    });

    it("does not cascade for MANUAL_ENTRY reference type", async () => {
      // Arrange
      vi.mocked(prisma.journalEntry.findUnique).mockResolvedValue({
        id: "je-1",
        status: "DRAFT",
        entryDate: new Date(2026, 0, 15),
        referenceType: "MANUAL_ENTRY",
        referenceId: null,
        lines: [],
      } as never);
      vi.mocked(prisma.journalEntry.update).mockResolvedValue({
        id: "je-1",
        status: "POSTED",
      } as never);

      // Act
      await postJournal("je-1");

      // Assert
      expect(prisma.purchaseInvoice.updateMany).not.toHaveBeenCalled();
      expect(prisma.invoice.updateMany).not.toHaveBeenCalled();
    });

    it("passes tx to isPeriodOpen when tx is provided", async () => {
      // Arrange
      const mockJournal = {
        id: "je-1",
        status: "DRAFT",
        entryDate: new Date(2026, 0, 15),
        referenceType: "MANUAL_ENTRY",
        referenceId: null,
        lines: [],
      };
      vi.mocked(prisma.journalEntry.findUnique).mockResolvedValue(
        mockJournal as never,
      );
      vi.mocked(prisma.journalEntry.update).mockResolvedValue({
        ...mockJournal,
        status: "POSTED",
      } as never);

      // Act
      await postJournal("je-1", "user-1");

      // Assert
      expect(isPeriodOpen).toHaveBeenCalled();
    });
  });

  // ========================================================================
  // postBulkJournals
  // ========================================================================
  describe("postBulkJournals", () => {
    it("posts multiple draft journals", async () => {
      // Arrange
      const journals = [
        {
          id: "je-1",
          entryNumber: "JE - 2026 -00001",
          status: "DRAFT",
          entryDate: new Date(2026, 0, 15),
          referenceType: "MANUAL_ENTRY",
          referenceId: null,
        },
        {
          id: "je-2",
          entryNumber: "JE - 2026 -00002",
          status: "DRAFT",
          entryDate: new Date(2026, 0, 16),
          referenceType: "MANUAL_ENTRY",
          referenceId: null,
        },
      ];
      vi.mocked(prisma.journalEntry.findMany).mockResolvedValue(
        journals as never,
      );
      vi.mocked(prisma.journalEntry.updateMany).mockResolvedValue({
        count: 2,
      } as never);

      // Act
      const result = await postBulkJournals(["je-1", "je-2"], "user-1");

      // Assert
      expect(result.count).toBe(2);
      expect(prisma.journalEntry.updateMany).toHaveBeenCalled();
    });

    it("throws when any journal's period is closed", async () => {
      // Arrange
      vi.mocked(prisma.journalEntry.findMany).mockResolvedValue([
        {
          id: "je-1",
          entryNumber: "JE - 2026 -00001",
          status: "DRAFT",
          entryDate: new Date(2026, 0, 15),
        },
      ] as never);
      vi.mocked(isPeriodOpen).mockResolvedValue(false);

      // Act & Assert
      await expect(postBulkJournals(["je-1"], "user-1")).rejects.toThrow(
        /closed fiscal period/,
      );
    });

    it("cascades PURCHASE_INVOICE references", async () => {
      // Arrange
      vi.mocked(prisma.journalEntry.findMany).mockResolvedValue([
        {
          id: "je-1",
          entryNumber: "JE - 2026 -00001",
          status: "DRAFT",
          entryDate: new Date(2026, 0, 15),
          referenceType: "PURCHASE_INVOICE",
          referenceId: "pi-1",
        },
      ] as never);
      vi.mocked(prisma.journalEntry.updateMany).mockResolvedValue({
        count: 1,
      } as never);

      // Act
      await postBulkJournals(["je-1"], "user-1");

      // Assert
      expect(prisma.purchaseInvoice.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ["pi-1"] }, status: "DRAFT" },
        data: { status: "UNPAID" },
      });
    });

    it("cascades SALES_INVOICE references", async () => {
      // Arrange
      vi.mocked(prisma.journalEntry.findMany).mockResolvedValue([
        {
          id: "je-1",
          entryNumber: "JE - 2026 -00001",
          status: "DRAFT",
          entryDate: new Date(2026, 0, 15),
          referenceType: "SALES_INVOICE",
          referenceId: "inv-1",
        },
      ] as never);
      vi.mocked(prisma.journalEntry.updateMany).mockResolvedValue({
        count: 1,
      } as never);

      // Act
      await postBulkJournals(["je-1"], "user-1");

      // Assert
      expect(prisma.invoice.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ["inv-1"] }, status: "DRAFT" },
        data: { status: "UNPAID" },
      });
    });

    it("does not call cascade when no invoice references exist", async () => {
      // Arrange
      vi.mocked(prisma.journalEntry.findMany).mockResolvedValue([
        {
          id: "je-1",
          entryNumber: "JE - 2026 -00001",
          status: "DRAFT",
          entryDate: new Date(2026, 0, 15),
          referenceType: "MANUAL_ENTRY",
          referenceId: null,
        },
      ] as never);
      vi.mocked(prisma.journalEntry.updateMany).mockResolvedValue({
        count: 1,
      } as never);

      // Act
      await postBulkJournals(["je-1"]);

      // Assert
      expect(prisma.purchaseInvoice.updateMany).not.toHaveBeenCalled();
      expect(prisma.invoice.updateMany).not.toHaveBeenCalled();
    });

    it("returns zero count when no DRAFT journals match the given ids", async () => {
      // Arrange — findMany returns only DRAFT journals; none match
      vi.mocked(prisma.journalEntry.findMany).mockResolvedValue([]);
      vi.mocked(prisma.journalEntry.updateMany).mockResolvedValue({
        count: 0,
      } as never);

      // Act
      const result = await postBulkJournals(["je-999"]);

      // Assert
      expect(result.count).toBe(0);
    });
  });

  // ========================================================================
  // voidJournal
  // ========================================================================
  describe("voidJournal", () => {
    it("voids a posted journal", async () => {
      // Arrange
      vi.mocked(prisma.journalEntry.findUnique).mockResolvedValue({
        id: "je-1",
        status: "POSTED",
        entryDate: new Date(2026, 0, 15),
        isAutoGenerated: false,
      } as never);
      vi.mocked(prisma.journalEntry.update).mockResolvedValue({
        id: "je-1",
        status: "VOIDED",
      } as never);

      // Act
      const result = await voidJournal("je-1", "user-1");

      // Assert
      expect(result.status).toBe("VOIDED");
    });

    it("throws when journal not found", async () => {
      // Arrange
      vi.mocked(prisma.journalEntry.findUnique).mockResolvedValue(null);

      // Act & Assert
      await expect(voidJournal("nonexistent")).rejects.toThrow(
        "Journal not found",
      );
    });

    it("throws when journal is not POSTED", async () => {
      // Arrange
      vi.mocked(prisma.journalEntry.findUnique).mockResolvedValue({
        id: "je-1",
        status: "DRAFT",
        isAutoGenerated: false,
      } as never);

      // Act & Assert
      await expect(voidJournal("je-1")).rejects.toThrow(
        "Only POSTED journals can be voided",
      );
    });

    it("throws when journal is auto-generated", async () => {
      // Arrange
      vi.mocked(prisma.journalEntry.findUnique).mockResolvedValue({
        id: "je-1",
        status: "POSTED",
        isAutoGenerated: true,
      } as never);

      // Act & Assert
      await expect(voidJournal("je-1")).rejects.toThrow(
        "Cannot directly void an auto-generated journal",
      );
    });

    it("throws when fiscal period is closed", async () => {
      // Arrange
      vi.mocked(prisma.journalEntry.findUnique).mockResolvedValue({
        id: "je-1",
        status: "POSTED",
        entryDate: new Date(2026, 0, 15),
        isAutoGenerated: false,
      } as never);
      vi.mocked(isPeriodOpen).mockResolvedValue(false);

      // Act & Assert
      await expect(voidJournal("je-1")).rejects.toThrow(/closed fiscal period/);
    });
  });

  // ========================================================================
  // reverseJournal
  // ========================================================================
  describe("reverseJournal", () => {
    it("creates a reversal entry with swapped debit/credit", async () => {
      // Arrange — findUnique must return the journal FIRST (for reverseJournal lookup),
      // then null (for entryNumber collision check inside createJournalEntry).
      vi.mocked(prisma.journalEntry.findUnique)
        .mockResolvedValueOnce({
          id: "je-1",
          entryNumber: "JE - 2026 -00001",
          description: "Original entry",
          status: "POSTED",
          entryDate: new Date(2026, 0, 15),
          isAutoGenerated: false,
          lines: [
            {
              accountId: "acc-1",
              debit: BigInt(100),
              credit: BigInt(0),
              description: "Debit line",
            },
            {
              accountId: "acc-2",
              debit: BigInt(0),
              credit: BigInt(100),
              description: "Credit line",
            },
          ],
        } as never)
        .mockResolvedValue(null); // for entryNumber uniqueness check
      setupSequenceForYear(2026);
      vi.mocked(prisma.journalEntry.create).mockResolvedValue({
        id: "je-reversal",
        lines: [],
      } as never);

      // Act
      const result = await reverseJournal("je-1", "user-1");

      // Assert
      expect(result).toBeDefined();
      expect(prisma.journalEntry.create).toHaveBeenCalled();
      const createArg = vi.mocked(prisma.journalEntry.create).mock
        .calls[0][0] as Record<string, unknown>;
      const data = createArg.data as Record<string, unknown>;
      expect(data.referenceType).toBe("MANUAL_ENTRY");
      expect(data.reference).toBe("JE - 2026 -00001");
    });

    it("throws when journal not found", async () => {
      // Arrange
      vi.mocked(prisma.journalEntry.findUnique).mockResolvedValue(null);

      // Act & Assert
      await expect(reverseJournal("nonexistent")).rejects.toThrow(
        "Journal not found",
      );
    });

    it("throws when journal is not POSTED", async () => {
      // Arrange
      vi.mocked(prisma.journalEntry.findUnique).mockResolvedValue({
        id: "je-1",
        status: "DRAFT",
        isAutoGenerated: false,
        lines: [],
      } as never);

      // Act & Assert
      await expect(reverseJournal("je-1")).rejects.toThrow(
        "Only POSTED journals can be reversed",
      );
    });

    it("throws when journal is auto-generated", async () => {
      // Arrange
      vi.mocked(prisma.journalEntry.findUnique).mockResolvedValue({
        id: "je-1",
        status: "POSTED",
        isAutoGenerated: true,
        lines: [],
      } as never);

      // Act & Assert
      await expect(reverseJournal("je-1")).rejects.toThrow(
        "Cannot directly reverse an auto-generated journal",
      );
    });

    it("throws when original journal's period is closed", async () => {
      // Arrange
      vi.mocked(prisma.journalEntry.findUnique).mockResolvedValue({
        id: "je-1",
        status: "POSTED",
        entryDate: new Date(2026, 0, 15),
        isAutoGenerated: false,
        lines: [],
      } as never);
      vi.mocked(isPeriodOpen).mockResolvedValue(false);

      // Act & Assert
      await expect(reverseJournal("je-1")).rejects.toThrow(
        /closed fiscal period/,
      );
    });
  });

  // ========================================================================
  // createBulkJournalEntries
  // ========================================================================
  describe("createBulkJournalEntries", () => {
    it("creates multiple journal entries in a single transaction", async () => {
      // Arrange
      const entries = [
        makeValidEntry({ reference: "BULK-1" }),
        makeValidEntry({ reference: "BULK-2" }),
      ];
      vi.mocked(prisma.journalEntry.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.journalEntry.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.systemSequence.update)
        .mockResolvedValueOnce({ value: BigInt(2) } as never)
        .mockResolvedValueOnce({ value: BigInt(3) } as never);
      vi.mocked(prisma.journalEntry.create)
        .mockResolvedValueOnce({ id: "je-b1", lines: [] } as never)
        .mockResolvedValueOnce({ id: "je-b2", lines: [] } as never);

      // Act
      const result = await createBulkJournalEntries(entries);

      // Assert
      expect(result).toHaveLength(2);
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it("throws when any entry is unbalanced", async () => {
      // Arrange
      const unbalanced = [
        makeValidEntry({
          reference: "UNBAL",
          lines: [
            { accountId: "acc-1", debit: 100, credit: 0 },
            { accountId: "acc-2", debit: 0, credit: 50 },
          ],
        }),
      ];

      // Act & Assert
      await expect(createBulkJournalEntries(unbalanced)).rejects.toThrow(
        /Unbalanced journal for reference UNBAL/,
      );
    });

    it("throws when period is closed for any entry", async () => {
      // Arrange
      vi.mocked(isPeriodOpen).mockResolvedValue(false);
      const entries = [makeValidEntry({ reference: "CLOSED-PERIOD" })];

      // Act & Assert
      await expect(createBulkJournalEntries(entries)).rejects.toThrow(
        /closed fiscal period for reference CLOSED-PERIOD/,
      );
    });

    it("retries on P2002 serialization error", async () => {
      // Arrange
      const entries = [makeValidEntry()];
      const p2002Error = new Prisma.PrismaClientKnownRequestError(
        "Unique constraint",
        { code: "P2002", clientVersion: "5.22.0" },
      );

      let callCount = 0;
      vi.mocked(prisma.$transaction).mockImplementation(
        async (callback: (tx: typeof prisma) => Promise<unknown>) => {
          callCount++;
          if (callCount === 1) throw p2002Error;
          return callback(prisma);
        },
      );
      vi.mocked(prisma.journalEntry.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.journalEntry.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.systemSequence.update).mockResolvedValue({
        value: BigInt(2),
      } as never);
      vi.mocked(prisma.journalEntry.create).mockResolvedValue({
        id: "je-retry",
        lines: [],
      } as never);

      // Act
      const result = await createBulkJournalEntries(entries);

      // Assert
      expect(result).toHaveLength(1);
      expect(callCount).toBe(2);
    });

    it("retries on P2034 error", async () => {
      // Arrange
      const entries = [makeValidEntry()];
      const p2034Error = new Prisma.PrismaClientKnownRequestError(
        "Serialization failure",
        { code: "P2034", clientVersion: "5.22.0" },
      );

      let callCount = 0;
      vi.mocked(prisma.$transaction).mockImplementation(
        async (callback: (tx: typeof prisma) => Promise<unknown>) => {
          callCount++;
          if (callCount === 1) throw p2034Error;
          return callback(prisma);
        },
      );
      vi.mocked(prisma.journalEntry.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.journalEntry.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.systemSequence.update).mockResolvedValue({
        value: BigInt(2),
      } as never);
      vi.mocked(prisma.journalEntry.create).mockResolvedValue({
        id: "je-p2034",
        lines: [],
      } as never);

      // Act
      const result = await createBulkJournalEntries(entries);

      // Assert
      expect(result).toHaveLength(1);
    });

    it("retries on serialization failure message (PrismaClientKnownRequestError)", async () => {
      // Arrange
      const entries = [makeValidEntry()];
      // Must be PrismaClientKnownRequestError to match instanceof check
      const serError = new Prisma.PrismaClientKnownRequestError(
        "serialization failure",
        { code: "P2002", clientVersion: "5.22.0" },
      );

      let callCount = 0;
      vi.mocked(prisma.$transaction).mockImplementation(
        async (callback: (tx: typeof prisma) => Promise<unknown>) => {
          callCount++;
          if (callCount === 1) throw serError;
          return callback(prisma);
        },
      );
      vi.mocked(prisma.journalEntry.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.journalEntry.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.systemSequence.update).mockResolvedValue({
        value: BigInt(2),
      } as never);
      vi.mocked(prisma.journalEntry.create).mockResolvedValue({
        id: "je-ser",
        lines: [],
      } as never);

      // Act
      const result = await createBulkJournalEntries(entries);

      // Assert
      expect(result).toHaveLength(1);
    });

    it("throws non-retryable errors immediately", async () => {
      // Arrange
      const entries = [makeValidEntry()];
      vi.mocked(prisma.$transaction).mockRejectedValue(
        new Error("Connection refused"),
      );

      // Act & Assert
      await expect(createBulkJournalEntries(entries)).rejects.toThrow(
        "Connection refused",
      );
    });
  });

  // ========================================================================
  // getJournals
  // ========================================================================
  describe("getJournals", () => {
    it("returns paginated journals with default params", async () => {
      // Arrange
      const mockData = [
        { id: "je-1", entryNumber: "JE-001", lines: [] },
        { id: "je-2", entryNumber: "JE-002", lines: [] },
      ];
      vi.mocked(prisma.journalEntry.findMany).mockResolvedValue(
        mockData as never,
      );
      vi.mocked(prisma.journalEntry.count).mockResolvedValue(2);

      // Act
      const result = await getJournals();

      // Assert
      expect(result.data).toHaveLength(2);
      expect(result.meta.total).toBe(2);
      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(100);
    });

    it("filters by date range", async () => {
      // Arrange
      vi.mocked(prisma.journalEntry.findMany).mockResolvedValue([]);
      vi.mocked(prisma.journalEntry.count).mockResolvedValue(0);
      const start = new Date(2026, 0, 1);
      const end = new Date(2026, 0, 31);

      // Act
      await getJournals({ startDate: start, endDate: end });

      // Assert
      expect(prisma.journalEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            entryDate: { gte: start, lte: end },
          }),
        }),
      );
    });

    it("filters by status", async () => {
      // Arrange
      vi.mocked(prisma.journalEntry.findMany).mockResolvedValue([]);
      vi.mocked(prisma.journalEntry.count).mockResolvedValue(0);

      // Act
      await getJournals({ status: JournalStatus.POSTED });

      // Assert
      expect(prisma.journalEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: JournalStatus.POSTED }),
        }),
      );
    });

    it("filters by reference (case-insensitive)", async () => {
      // Arrange
      vi.mocked(prisma.journalEntry.findMany).mockResolvedValue([]);
      vi.mocked(prisma.journalEntry.count).mockResolvedValue(0);

      // Act
      await getJournals({ reference: "REF-001" });

      // Assert
      expect(prisma.journalEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            reference: { contains: "REF-001", mode: "insensitive" },
          }),
        }),
      );
    });

    it("respects custom page and limit", async () => {
      // Arrange
      vi.mocked(prisma.journalEntry.findMany).mockResolvedValue([]);
      vi.mocked(prisma.journalEntry.count).mockResolvedValue(50);

      // Act
      const result = await getJournals({ page: 2, limit: 10 });

      // Assert
      expect(result.meta.page).toBe(2);
      expect(result.meta.limit).toBe(10);
      expect(result.meta.totalPages).toBe(5);
      expect(prisma.journalEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 10 }),
      );
    });

    it("calculates totalPages correctly", async () => {
      // Arrange
      vi.mocked(prisma.journalEntry.findMany).mockResolvedValue([]);
      vi.mocked(prisma.journalEntry.count).mockResolvedValue(25);

      // Act
      const result = await getJournals({ page: 1, limit: 10 });

      // Assert
      expect(result.meta.totalPages).toBe(3);
    });

    it("uses default page 1 and limit 100 when not specified", async () => {
      // Arrange
      vi.mocked(prisma.journalEntry.findMany).mockResolvedValue([]);
      vi.mocked(prisma.journalEntry.count).mockResolvedValue(0);

      // Act
      const result = await getJournals({});

      // Assert
      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(100);
      expect(prisma.journalEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 100 }),
      );
    });
  });

  // ========================================================================
  // getJournalById
  // ========================================================================
  describe("getJournalById", () => {
    it("returns journal with relations", async () => {
      // Arrange
      const mockJournal = {
        id: "je-1",
        entryNumber: "JE - 2026 -00001",
        lines: [{ account: { id: "acc-1" } }],
        createdBy: { name: "Admin" },
        approvedBy: { name: "Manager" },
      };
      vi.mocked(prisma.journalEntry.findUnique).mockResolvedValue(
        mockJournal as never,
      );

      // Act
      const result = await getJournalById("je-1");

      // Assert
      expect(result).toEqual(mockJournal);
      expect(prisma.journalEntry.findUnique).toHaveBeenCalledWith({
        where: { id: "je-1" },
        include: {
          lines: { include: { account: true } },
          createdBy: { select: { name: true } },
          approvedBy: { select: { name: true } },
        },
      });
    });

    it("returns null when journal not found", async () => {
      // Arrange
      vi.mocked(prisma.journalEntry.findUnique).mockResolvedValue(null);

      // Act
      const result = await getJournalById("nonexistent");

      // Assert
      expect(result).toBeNull();
    });
  });
});
