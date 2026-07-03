import { describe, it, expect, vi, beforeEach } from "vitest";
import { PettyCashReportService } from "../petty-cash-report-service";

const mockResolveAccount = vi.fn();

vi.mock("@/lib/core/prisma", () => ({
  prisma: {
    account: {
      findUnique: vi.fn(),
    },
    journalLine: {
      aggregate: vi.fn(),
      findMany: vi.fn(),
    },
    journalEntry: {
      findMany: vi.fn(),
    },
    pettyCashDailyReport: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    pettyCashTransaction: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    user: {
      findMany: vi.fn(),
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({}),
    ),
  },
}));

vi.mock("@/services/accounting/account-resolver", () => ({
  resolveAccount: (...args: unknown[]) => mockResolveAccount(...args),
}));

import { prisma } from "@/lib/core/prisma";

describe("PettyCashReportService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveAccount.mockResolvedValue({
      id: "acc-123",
      code: "11110",
      name: "Kas Kecil",
    });
  });

  describe("getDailyReport", () => {
    it("should throw an error if Petty Cash account is not found", async () => {
      vi.mocked(prisma.pettyCashDailyReport.findFirst).mockResolvedValue(null);
      mockResolveAccount.mockRejectedValue(
        new Error('Account not found for role "petty-cash"'),
      );

      await expect(
        PettyCashReportService.getDailyReport(new Date("2026-06-09")),
      ).rejects.toThrow('Account not found for role "petty-cash"');
    });

    it("should calculate opening balance, daily totals, and return transactions", async () => {
      vi.mocked(prisma.pettyCashDailyReport.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.account.findUnique).mockResolvedValue({
        id: "acc-123",
        code: "11110",
        name: "Kas Kecil",
      } as never);

      vi.mocked(prisma.journalLine.aggregate)
        .mockResolvedValueOnce({
          _sum: { debit: 500000, credit: 100000 },
        } as never)
        .mockResolvedValueOnce({
          _sum: { debit: 200000, credit: 50000 },
        } as never);

      // Mock journalLine.findMany for getDailyTransactionsFromJournals
      // First call: petty cash lines (on the petty cash account)
      vi.mocked(prisma.journalLine.findMany)
        .mockResolvedValueOnce([
          {
            id: "jl-1",
            journalEntryId: "je-1",
            debit: 0,
            credit: 50000,
            journalEntry: {
              id: "je-1",
              entryNumber: "JE-001",
              entryDate: new Date("2026-06-09"),
              description: "Beli kertas",
              reference: "PCV-001",
              createdById: "user-1",
            },
          },
        ] as never)
        // Second call: contra-lines (on expense accounts)
        .mockResolvedValueOnce([
          {
            id: "jl-2",
            journalEntryId: "je-1",
            debit: 50000,
            credit: 0,
            account: { id: "exp-acc", code: "61100", name: "Biaya Kantor" },
          },
        ] as never);

      // Mock user lookup for creator name
      vi.mocked(prisma.user.findMany).mockResolvedValue([
        { id: "user-1", name: "Admin" },
      ] as never);

      const report = await PettyCashReportService.getDailyReport(
        new Date("2026-06-09"),
      );

      expect(report.openingBalance).toBe(400000);
      expect(report.totalIn).toBe(200000);
      expect(report.totalOut).toBe(50000);
      expect(report.closingBalance).toBe(550000);
      expect(report.transactions).toHaveLength(1);
      expect(report.transactions[0]).toMatchObject({
        id: "je-1",
        voucherNumber: "PCV-001",
        description: "Beli kertas",
        amount: 50000,
        type: "EXPENSE",
        status: "POSTED",
        expenseAccount: { id: "exp-acc", code: "61100", name: "Biaya Kantor" },
        createdBy: { name: "Admin" },
      });
    });

    it("should return saved report when it exists", async () => {
      const mockReport = {
        id: "report-1",
        reportNumber: "PCRP-20260609-001",
        reportDate: new Date("2026-06-09"),
        openingBalance: 1000,
        totalIn: 500,
        totalOut: 200,
        closingBalance: 1300,
        status: "DRAFT",
        transactions: [],
        createdBy: { id: "user-1", name: "John", role: "ADMIN" },
        readyToPrintBy: null,
        physicalSignedConfirmedBy: null,
        finalizedBy: null,
        voidedBy: null,
      };

      vi.mocked(prisma.pettyCashDailyReport.findFirst).mockResolvedValue(
        mockReport as never,
      );

      const result = await PettyCashReportService.getDailyReport(
        new Date("2026-06-09"),
      );

      expect(result.savedReport).toEqual(mockReport);
      expect(result.openingBalance).toBe(1000);
      expect(result.totalIn).toBe(500);
      expect(result.totalOut).toBe(200);
      expect(result.closingBalance).toBe(1300);
    });
  });

  describe("createDailyReport", () => {
    it("throws when duplicate report exists", async () => {
      vi.mocked(prisma.pettyCashDailyReport.findFirst).mockResolvedValue({
        id: "existing",
      } as never);

      await expect(
        PettyCashReportService.createDailyReport(
          new Date("2026-06-09"),
          "user-1",
        ),
      ).rejects.toThrow("sudah ada");
    });

    it("creates report and links transactions", async () => {
      vi.mocked(prisma.pettyCashDailyReport.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.account.findUnique).mockResolvedValue({
        id: "acc-123",
      } as never);
      vi.mocked(prisma.journalLine.aggregate)
        .mockResolvedValueOnce({
          _sum: { debit: 100000, credit: 50000 },
        } as never)
        .mockResolvedValueOnce({
          _sum: { debit: 30000, credit: 10000 },
        } as never);
      vi.mocked(prisma.pettyCashDailyReport.count).mockResolvedValue(0);

      const mockTx = {
        pettyCashDailyReport: {
          create: vi.fn().mockResolvedValue({ id: "report-new" }),
        },
        pettyCashTransaction: {
          updateMany: vi.fn().mockResolvedValue({ count: 2 }),
        },
      };
      vi.mocked(prisma.$transaction).mockImplementation(
        (async (fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx)) as any,
      );

      const report = await PettyCashReportService.createDailyReport(
        new Date("2026-06-09"),
        "user-1",
      );

      expect(report.id).toBe("report-new");
      expect(mockTx.pettyCashTransaction.updateMany).toHaveBeenCalled();
    });
  });

  describe("markReadyToPrint", () => {
    it("transitions DRAFT to READY_TO_PRINT", async () => {
      vi.mocked(prisma.pettyCashDailyReport.findUnique).mockResolvedValue({
        id: "r1",
        status: "DRAFT",
      } as never);
      vi.mocked(prisma.pettyCashDailyReport.update).mockResolvedValue({
        id: "r1",
        status: "READY_TO_PRINT",
      } as never);

      const result = await PettyCashReportService.markReadyToPrint("r1", "u1");
      expect(result).toBeDefined();
    });

    it("throws when status is not DRAFT", async () => {
      vi.mocked(prisma.pettyCashDailyReport.findUnique).mockResolvedValue({
        id: "r1",
        status: "FINALIZED",
      } as never);

      await expect(
        PettyCashReportService.markReadyToPrint("r1", "u1"),
      ).rejects.toThrow("FINALIZED");
    });

    it("throws when report not found", async () => {
      vi.mocked(prisma.pettyCashDailyReport.findUnique).mockResolvedValue(null);

      await expect(
        PettyCashReportService.markReadyToPrint("r1", "u1"),
      ).rejects.toThrow("tidak ditemukan");
    });
  });

  describe("confirmPhysicalSignature", () => {
    it("transitions READY_TO_PRINT to SIGNED_PHYSICAL", async () => {
      vi.mocked(prisma.pettyCashDailyReport.findUnique).mockResolvedValue({
        id: "r1",
        status: "READY_TO_PRINT",
      } as never);
      vi.mocked(prisma.pettyCashDailyReport.update).mockResolvedValue({
        id: "r1",
        status: "SIGNED_PHYSICAL",
      } as never);

      const result = await PettyCashReportService.confirmPhysicalSignature(
        "r1",
        "u1",
      );
      expect(result).toBeDefined();
    });
  });

  describe("finalizeDailyReport", () => {
    it("transitions SIGNED_PHYSICAL to FINALIZED", async () => {
      vi.mocked(prisma.pettyCashDailyReport.findUnique).mockResolvedValue({
        id: "r1",
        status: "SIGNED_PHYSICAL",
      } as never);
      vi.mocked(prisma.pettyCashDailyReport.update).mockResolvedValue({
        id: "r1",
        status: "FINALIZED",
      } as never);

      const result = await PettyCashReportService.finalizeDailyReport(
        "r1",
        "u1",
      );
      expect(result).toBeDefined();
    });
  });

  describe("voidDailyReport", () => {
    it("throws when FINALIZED", async () => {
      vi.mocked(prisma.pettyCashDailyReport.findUnique).mockResolvedValue({
        id: "r1",
        status: "FINALIZED",
      } as never);

      await expect(
        PettyCashReportService.voidDailyReport("r1", "u1"),
      ).rejects.toThrow("FINALIZED");
    });

    it("throws when VOIDED", async () => {
      vi.mocked(prisma.pettyCashDailyReport.findUnique).mockResolvedValue({
        id: "r1",
        status: "VOIDED",
      } as never);

      await expect(
        PettyCashReportService.voidDailyReport("r1", "u1"),
      ).rejects.toThrow("VOIDED");
    });

    it("voids DRAFT report", async () => {
      vi.mocked(prisma.pettyCashDailyReport.findUnique).mockResolvedValue({
        id: "r1",
        status: "DRAFT",
      } as never);
      vi.mocked(prisma.pettyCashDailyReport.update).mockResolvedValue({
        id: "r1",
        status: "VOIDED",
      } as never);

      const result = await PettyCashReportService.voidDailyReport("r1", "u1");
      expect(result).toBeDefined();
    });

    it("throws when report not found", async () => {
      vi.mocked(prisma.pettyCashDailyReport.findUnique).mockResolvedValue(null);

      await expect(
        PettyCashReportService.voidDailyReport("r1", "u1"),
      ).rejects.toThrow("tidak ditemukan");
    });
  });
});
