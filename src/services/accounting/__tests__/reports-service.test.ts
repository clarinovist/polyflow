// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/core/prisma", () => ({
  prisma: {
    account: { findMany: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn() },
    journalLine: { groupBy: vi.fn(), findMany: vi.fn(), aggregate: vi.fn() },
    journalEntry: { findMany: vi.fn(), findFirst: vi.fn() },
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("../journals-service", () => ({
  createJournalEntry: vi.fn(),
}));

import { prisma } from "@/lib/core/prisma";
import { createJournalEntry } from "../journals-service";
import {
  getTrialBalance,
  getIncomeStatement,
  getBalanceSheet,
  getAccountBalance,
  getClosingBalances,
  closePeriod,
  getCashFlowStatement,
  type BalanceSheetGroup,
  type BalanceSheetItem,
} from "../reports-service";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function _mockAccount(overrides: Record<string, unknown> = {}) {
  return {
    id: "acc1",
    code: "11120",
    name: "Bank BCA",
    type: "ASSET",
    category: "CURRENT_ASSET",
    parentId: null,
    ...overrides,
  };
}

function _mockJournalLine(overrides: Record<string, unknown> = {}) {
  return {
    id: "jl1",
    accountId: "acc1",
    debit: 0,
    credit: 0,
    journalEntry: {},
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("reports-service", () => {
  beforeEach(() => vi.clearAllMocks());

  // ========================================================================
  // getTrialBalance
  // ========================================================================

  describe("getTrialBalance", () => {
    it("returns accounts with correct netBalance (debit - credit for assets)", async () => {
      vi.mocked(prisma.account.findMany).mockResolvedValue([
        {
          id: "a1",
          code: "11120",
          name: "Bank BCA",
          type: "ASSET",
          category: "CURRENT_ASSET",
        },
        {
          id: "a2",
          code: "21110",
          name: "AP",
          type: "LIABILITY",
          category: "CURRENT_LIABILITY",
        },
      ] as never);

      vi.mocked(prisma.journalLine.groupBy).mockResolvedValue([
        { accountId: "a1", _sum: { debit: 5000000, credit: 2000000 } },
        { accountId: "a2", _sum: { debit: 1000000, credit: 3000000 } },
      ] as never);

      const result = await getTrialBalance();

      const bank = result.find((r) => r.code === "11120");
      const ap = result.find((r) => r.code === "21110");

      // ASSET: debit - credit = normal balance
      expect(bank?.netBalance).toBe(3000000);
      // LIABILITY: credit - debit = normal balance
      expect(ap?.netBalance).toBe(2000000);
    });

    it("filters by date range when both start and end provided", async () => {
      vi.mocked(prisma.account.findMany).mockResolvedValue([]);
      vi.mocked(prisma.journalLine.groupBy).mockResolvedValue([]);

      await getTrialBalance(new Date("2026-01-01"), new Date("2026-06-30"));

      expect(prisma.journalLine.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            journalEntry: expect.objectContaining({
              entryDate: { gte: expect.any(Date), lte: expect.any(Date) },
            }),
          }),
        }),
      );
    });

    it("filters by startDate only when endDate is omitted", async () => {
      vi.mocked(prisma.account.findMany).mockResolvedValue([]);
      vi.mocked(prisma.journalLine.groupBy).mockResolvedValue([]);

      await getTrialBalance(new Date("2026-01-01"));

      expect(prisma.journalLine.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            journalEntry: expect.objectContaining({
              entryDate: { gte: expect.any(Date) },
            }),
          }),
        }),
      );
    });

    it("filters by endDate only when startDate is omitted", async () => {
      vi.mocked(prisma.account.findMany).mockResolvedValue([]);
      vi.mocked(prisma.journalLine.groupBy).mockResolvedValue([]);

      await getTrialBalance(undefined, new Date("2026-06-30"));

      expect(prisma.journalLine.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            journalEntry: expect.objectContaining({
              entryDate: { lte: expect.any(Date) },
            }),
          }),
        }),
      );
    });

    it("omits entryDate filter when no dates provided", async () => {
      vi.mocked(prisma.account.findMany).mockResolvedValue([]);
      vi.mocked(prisma.journalLine.groupBy).mockResolvedValue([]);

      await getTrialBalance();

      expect(prisma.journalLine.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            journalEntry: { status: "POSTED" },
          }),
        }),
      );
    });

    it("returns debit=0, credit=0 for accounts with no journal lines", async () => {
      vi.mocked(prisma.account.findMany).mockResolvedValue([
        {
          id: "a1",
          code: "11120",
          name: "Bank BCA",
          type: "ASSET",
          category: "CURRENT_ASSET",
        },
      ] as never);

      vi.mocked(prisma.journalLine.groupBy).mockResolvedValue([] as never);

      const result = await getTrialBalance();

      expect(result).toHaveLength(1);
      expect(result[0].debit).toBe(0);
      expect(result[0].credit).toBe(0);
      expect(result[0].netBalance).toBe(0);
    });

    it("calculates netBalance for EXPENSE type (debit - credit)", async () => {
      vi.mocked(prisma.account.findMany).mockResolvedValue([
        {
          id: "a1",
          code: "61100",
          name: "Salary",
          type: "EXPENSE",
          category: "OPERATING_EXPENSE",
        },
      ] as never);

      vi.mocked(prisma.journalLine.groupBy).mockResolvedValue([
        { accountId: "a1", _sum: { debit: 5000000, credit: 1000000 } },
      ] as never);

      const result = await getTrialBalance();

      expect(result[0].netBalance).toBe(4000000); // debit - credit
    });

    it("calculates netBalance for REVENUE type (credit - debit)", async () => {
      vi.mocked(prisma.account.findMany).mockResolvedValue([
        {
          id: "a1",
          code: "41100",
          name: "Sales",
          type: "REVENUE",
          category: "REVENUE",
        },
      ] as never);

      vi.mocked(prisma.journalLine.groupBy).mockResolvedValue([
        { accountId: "a1", _sum: { debit: 500000, credit: 8000000 } },
      ] as never);

      const result = await getTrialBalance();

      expect(result[0].netBalance).toBe(7500000); // credit - debit
    });

    it("calculates netBalance for EQUITY type (credit - debit)", async () => {
      vi.mocked(prisma.account.findMany).mockResolvedValue([
        {
          id: "a1",
          code: "31110",
          name: "Modal",
          type: "EQUITY",
          category: "EQUITY",
        },
      ] as never);

      vi.mocked(prisma.journalLine.groupBy).mockResolvedValue([
        { accountId: "a1", _sum: { debit: 200000, credit: 10000000 } },
      ] as never);

      const result = await getTrialBalance();

      expect(result[0].netBalance).toBe(9800000); // credit - debit
    });
  });

  // ========================================================================
  // getIncomeStatement
  // ========================================================================

  describe("getIncomeStatement", () => {
    it("calculates net income = revenue - COGS - OpEx + other", async () => {
      vi.mocked(prisma.account.findMany).mockResolvedValue([
        {
          id: "rev1",
          code: "41100",
          name: "Sales",
          type: "REVENUE",
          journalLines: [{ credit: 10000000, debit: 0 }],
        },
        {
          id: "cogs1",
          code: "51100",
          name: "COGS",
          type: "EXPENSE",
          journalLines: [{ credit: 0, debit: 4000000 }],
        },
        {
          id: "opex1",
          code: "62100",
          name: "Salary",
          type: "EXPENSE",
          journalLines: [{ credit: 0, debit: 2000000 }],
        },
      ] as never);

      const result = await getIncomeStatement(
        new Date("2026-06-01"),
        new Date("2026-06-30"),
      );

      expect(result.totalRevenue).toBe(10000000);
      expect(result.totalCOGS).toBe(4000000);
      expect(result.grossProfit).toBe(6000000);
      expect(result.totalOpEx).toBe(2000000);
      expect(result.operatingIncome).toBe(4000000);
      expect(result.netIncome).toBe(4000000);
    });

    it("excludes closing entries from calculation", async () => {
      vi.mocked(prisma.account.findMany).mockResolvedValue([
        {
          id: "rev1",
          code: "41100",
          name: "Sales",
          type: "REVENUE",
          journalLines: [],
        },
      ] as never);

      await getIncomeStatement(new Date("2026-06-01"), new Date("2026-06-30"));

      expect(prisma.account.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            journalLines: expect.objectContaining({
              where: expect.objectContaining({
                journalEntry: expect.objectContaining({
                  NOT: { reference: { startsWith: "CLOSING-" } },
                }),
              }),
            }),
          }),
        }),
      );
    });

    it("includes other revenue (8xxxx) and other expense (9xxxx) in separate buckets", async () => {
      vi.mocked(prisma.account.findMany).mockResolvedValue([
        {
          id: "rev1",
          code: "41100",
          name: "Sales",
          type: "REVENUE",
          journalLines: [{ credit: 10000000, debit: 0 }],
        },
        {
          id: "otherRev",
          code: "81100",
          name: "Interest Income",
          type: "REVENUE",
          journalLines: [{ credit: 500000, debit: 0 }],
        },
        {
          id: "otherExp",
          code: "91100",
          name: "Loss on Sale",
          type: "EXPENSE",
          journalLines: [{ credit: 0, debit: 200000 }],
        },
        {
          id: "cogs1",
          code: "51100",
          name: "COGS",
          type: "EXPENSE",
          journalLines: [{ credit: 0, debit: 3000000 }],
        },
        {
          id: "opex1",
          code: "62100",
          name: "Salary",
          type: "EXPENSE",
          journalLines: [{ credit: 0, debit: 1000000 }],
        },
      ] as never);

      const result = await getIncomeStatement(
        new Date("2026-06-01"),
        new Date("2026-06-30"),
      );

      // Other bucket includes 8xxxx and 9xxxx
      expect(result.other).toHaveLength(2);
      // 8xxxx is revenue type → netBalance = credit - debit = 500000
      // 9xxxx is expense type → netBalance = -(credit - debit) = -(0 - 200000) = 200000
      // totalOther = totalOtherRevenue - totalOtherExpense = 500000 - 200000 = 300000
      expect(result.totalOther).toBe(300000);

      // 8xxxx should be excluded from revenueAccounts (code starts with '8')
      expect(result.totalRevenue).toBe(10000000);
      // 9xxxx should be excluded from opexAccounts (code starts with '9')
      expect(result.totalOpEx).toBe(1000000);
    });

    it("excludes 8xxxx from revenueAccounts even though type is REVENUE", async () => {
      vi.mocked(prisma.account.findMany).mockResolvedValue([
        {
          id: "rev1",
          code: "41100",
          name: "Sales",
          type: "REVENUE",
          journalLines: [{ credit: 10000000, debit: 0 }],
        },
        {
          id: "otherRev",
          code: "81100",
          name: "Interest",
          type: "REVENUE",
          journalLines: [{ credit: 500000, debit: 0 }],
        },
      ] as never);

      const result = await getIncomeStatement(
        new Date("2026-06-01"),
        new Date("2026-06-30"),
      );

      // revenueAccounts should only contain 4xxxx, not 8xxxx
      expect(result.revenue).toHaveLength(1);
      expect(result.revenue[0].code).toBe("41100");
      expect(result.totalRevenue).toBe(10000000);
    });

    it("returns zero totals when no revenue/expense accounts have balances", async () => {
      vi.mocked(prisma.account.findMany).mockResolvedValue([
        {
          id: "rev1",
          code: "41100",
          name: "Sales",
          type: "REVENUE",
          journalLines: [],
        },
        {
          id: "exp1",
          code: "61100",
          name: "Rent",
          type: "EXPENSE",
          journalLines: [],
        },
      ] as never);

      const result = await getIncomeStatement(
        new Date("2026-06-01"),
        new Date("2026-06-30"),
      );

      expect(result.totalRevenue).toBe(0);
      expect(result.totalCOGS).toBe(0);
      expect(result.grossProfit).toBe(0);
      expect(result.totalOpEx).toBe(0);
      expect(result.operatingIncome).toBe(0);
      expect(result.netIncome).toBe(0);
    });

    it("returns empty arrays when no accounts match", async () => {
      vi.mocked(prisma.account.findMany).mockResolvedValue([] as never);

      const result = await getIncomeStatement(
        new Date("2026-06-01"),
        new Date("2026-06-30"),
      );

      expect(result.revenue).toHaveLength(0);
      expect(result.cogs).toHaveLength(0);
      expect(result.opex).toHaveLength(0);
      expect(result.other).toHaveLength(0);
      expect(result.totalRevenue).toBe(0);
      expect(result.totalCOGS).toBe(0);
      expect(result.totalOpEx).toBe(0);
      expect(result.netIncome).toBe(0);
    });

    it("includes inventoryChange as 0 (deprecated for perpetual)", async () => {
      vi.mocked(prisma.account.findMany).mockResolvedValue([] as never);

      const result = await getIncomeStatement(
        new Date("2026-06-01"),
        new Date("2026-06-30"),
      );

      expect(result.inventoryChange).toBe(0);
      expect(result.totalManufacturingCosts).toBe(0);
    });

    it("excludes 8xxxx and 9xxxx from OpEx", async () => {
      vi.mocked(prisma.account.findMany).mockResolvedValue([
        {
          id: "opex1",
          code: "62100",
          name: "Salary",
          type: "EXPENSE",
          journalLines: [{ credit: 0, debit: 2000000 }],
        },
        {
          id: "otherExp",
          code: "91100",
          name: "Other Exp",
          type: "EXPENSE",
          journalLines: [{ credit: 0, debit: 100000 }],
        },
      ] as never);

      const result = await getIncomeStatement(
        new Date("2026-06-01"),
        new Date("2026-06-30"),
      );

      // 9xxxx should not be in opex
      expect(result.opex).toHaveLength(1);
      expect(result.opex[0].code).toBe("62100");
      expect(result.totalOpEx).toBe(2000000);
    });

    it("handles negative net income (loss scenario)", async () => {
      vi.mocked(prisma.account.findMany).mockResolvedValue([
        {
          id: "rev1",
          code: "41100",
          name: "Sales",
          type: "REVENUE",
          journalLines: [{ credit: 3000000, debit: 0 }],
        },
        {
          id: "cogs1",
          code: "51100",
          name: "COGS",
          type: "EXPENSE",
          journalLines: [{ credit: 0, debit: 2000000 }],
        },
        {
          id: "opex1",
          code: "62100",
          name: "Salary",
          type: "EXPENSE",
          journalLines: [{ credit: 0, debit: 2000000 }],
        },
      ] as never);

      const result = await getIncomeStatement(
        new Date("2026-06-01"),
        new Date("2026-06-30"),
      );

      expect(result.totalRevenue).toBe(3000000);
      expect(result.totalCOGS).toBe(2000000);
      expect(result.grossProfit).toBe(1000000);
      expect(result.totalOpEx).toBe(2000000);
      expect(result.operatingIncome).toBe(-1000000);
      expect(result.netIncome).toBe(-1000000);
    });
  });

  // ========================================================================
  // getBalanceSheet
  // ========================================================================

  describe("getBalanceSheet", () => {
    it("returns unpostedEarnings as balancing figure", async () => {
      vi.mocked(prisma.account.findMany).mockResolvedValue([
        {
          id: "a1",
          code: "11120",
          parentId: null,
          type: "ASSET",
          journalLines: [{ debit: 10000000, credit: 0 }],
        },
        {
          id: "l1",
          code: "21110",
          parentId: null,
          type: "LIABILITY",
          journalLines: [{ debit: 0, credit: 3000000 }],
        },
        {
          id: "e1",
          code: "31110",
          parentId: null,
          type: "EQUITY",
          journalLines: [{ debit: 0, credit: 5000000 }],
        },
      ] as never);

      const result = await getBalanceSheet(new Date("2026-06-30"));

      expect(result.totalAssets).toBe(10000000);
      expect(result.totalLiabilities).toBe(3000000);
      expect(result.totalEquity).toBe(5000000);
      // unpostedEarnings = assets - liabilities - equity = 2000000
      expect(result.unpostedEarnings).toBe(2000000);
      // Total L+E+unposted = total assets
      expect(result.totalLiabilitiesAndEquity).toBe(result.totalAssets);
    });

    it("groups child accounts under parent accounts", async () => {
      vi.mocked(prisma.account.findMany).mockResolvedValue([
        {
          id: "parent-inv",
          code: "11300",
          parentId: null,
          type: "ASSET",
          journalLines: [],
        },
        {
          id: "child-rm",
          code: "11310",
          parentId: "parent-inv",
          type: "ASSET",
          journalLines: [{ debit: 5000000, credit: 0 }],
        },
        {
          id: "child-wip",
          code: "11320",
          parentId: "parent-inv",
          type: "ASSET",
          journalLines: [{ debit: 3000000, credit: 0 }],
        },
        {
          id: "child-fg",
          code: "11330",
          parentId: "parent-inv",
          type: "ASSET",
          journalLines: [{ debit: 2000000, credit: 0 }],
        },
        {
          id: "standalone",
          code: "11210",
          parentId: null,
          type: "ASSET",
          journalLines: [{ debit: 1000000, credit: 0 }],
        },
      ] as never);

      const result = await getBalanceSheet(new Date("2026-06-30"));

      // Flat view: 5 accounts
      expect(result.assets).toHaveLength(5);

      // Grouped view: 2 items (1 group + 1 standalone)
      expect(result.assetGroups).toHaveLength(2);

      // First: Inventory group (single-level -> collapsed)
      const invGroup = result.assetGroups[0] as BalanceSheetGroup;
      expect(invGroup.code).toBe("11300");
      expect(invGroup.children).toHaveLength(3);
      expect(invGroup.totalBalance).toBe(10000000); // 5M + 3M + 2M

      // Second: standalone Piutang
      const standalone = result.assetGroups[1] as BalanceSheetItem;
      expect(standalone.code).toBe("11210");
      expect(standalone.netBalance).toBe(1000000);
    });

    it("expands accounts in expandCodes, groups others", async () => {
      vi.mocked(prisma.account.findMany).mockResolvedValue([
        // 11000 Current Assets
        {
          id: "ca",
          code: "11000",
          parentId: null,
          type: "ASSET",
          journalLines: [],
        },
        // 11100 Cash & Bank (will be expanded)
        {
          id: "cash-bank",
          code: "11100",
          parentId: "ca",
          type: "ASSET",
          journalLines: [],
        },
        {
          id: "petty",
          code: "11110",
          parentId: "cash-bank",
          type: "ASSET",
          journalLines: [{ debit: 500000, credit: 0 }],
        },
        {
          id: "bca",
          code: "11120",
          parentId: "cash-bank",
          type: "ASSET",
          journalLines: [{ debit: 8000000, credit: 0 }],
        },
        // 11300 Inventory (will be grouped)
        {
          id: "inv",
          code: "11300",
          parentId: "ca",
          type: "ASSET",
          journalLines: [],
        },
        {
          id: "rm",
          code: "11310",
          parentId: "inv",
          type: "ASSET",
          journalLines: [{ debit: 3000000, credit: 0 }],
        },
        {
          id: "fg",
          code: "11330",
          parentId: "inv",
          type: "ASSET",
          journalLines: [{ debit: 2000000, credit: 0 }],
        },
      ] as never);

      // getBalanceSheet passes expandCodes=['11000','11100'] internally
      // 11000 expanded -> shows 11100, 11300
      // 11100 expanded -> shows 11110, 11120
      // 11300 not in expandCodes -> grouped
      const result = await getBalanceSheet(new Date("2026-06-30"));

      const codes = result.assetGroups.map((g) =>
        "code" in g ? g.code : g.id,
      );

      // 11000 expanded -> 11100 and 11300 visible
      // 11100 expanded -> 11110 and 11120 visible
      // 11300 grouped -> shows as group
      expect(codes).toContain("11110"); // Petty Cash (from 11100 expand)
      expect(codes).toContain("11120"); // Bank BCA (from 11100 expand)

      // Inventory should be a group
      const invGroup = result.assetGroups.find(
        (g): g is BalanceSheetGroup => "children" in g && g.code === "11300",
      );
      expect(invGroup).toBeDefined();
      expect(invGroup!.children).toHaveLength(2);
      expect(invGroup!.totalBalance).toBe(5000000);
    });

    it("sums ALL descendants recursively (grandchildren included in grouped total)", async () => {
      vi.mocked(prisma.account.findMany).mockResolvedValue([
        {
          id: "ca",
          code: "11000",
          parentId: null,
          type: "ASSET",
          journalLines: [],
        },
        {
          id: "piutang",
          code: "11500",
          parentId: "ca",
          type: "ASSET",
          journalLines: [],
        },
        {
          id: "pk",
          code: "11510",
          parentId: "piutang",
          type: "ASSET",
          journalLines: [],
        },
        {
          id: "viar",
          code: "11511",
          parentId: "pk",
          type: "ASSET",
          journalLines: [{ debit: 28000000, credit: 0 }],
        },
        {
          id: "fadilla",
          code: "11512",
          parentId: "pk",
          type: "ASSET",
          journalLines: [{ debit: 100000000, credit: 0 }],
        },
      ] as never);

      const result = await getBalanceSheet(new Date("2026-06-30"));

      // Total assets should include ALL descendants: 28M + 100M = 128M
      expect(result.totalAssets).toBe(128000000);

      // In grouped view, 11000 is expanded -> 11500 shown individually
      // 11500 is NOT expanded -> should be a group with recursive total
      const piutangGroup = result.assetGroups.find(
        (g): g is BalanceSheetGroup => "children" in g && g.code === "11500",
      );
      expect(piutangGroup).toBeDefined();
      // The group total should be 128M (28M + 100M), NOT 0
      expect(piutangGroup!.totalBalance).toBe(128000000);
    });

    it("returns empty arrays when no accounts exist", async () => {
      vi.mocked(prisma.account.findMany).mockResolvedValue([] as never);

      const result = await getBalanceSheet(new Date("2026-06-30"));

      expect(result.assets).toHaveLength(0);
      expect(result.liabilities).toHaveLength(0);
      expect(result.equity).toHaveLength(0);
      expect(result.totalAssets).toBe(0);
      expect(result.totalLiabilities).toBe(0);
      expect(result.totalEquity).toBe(0);
      expect(result.unpostedEarnings).toBe(0);
      expect(result.totalLiabilitiesAndEquity).toBe(0);
    });

    it("sets endOfDay to 23:59:59.999 for the given date", async () => {
      vi.mocked(prisma.account.findMany).mockResolvedValue([] as never);

      await getBalanceSheet(new Date("2026-06-15"));

      expect(prisma.account.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            journalLines: expect.objectContaining({
              where: expect.objectContaining({
                journalEntry: expect.objectContaining({
                  entryDate: expect.objectContaining({
                    lte: expect.any(Date),
                  }),
                }),
              }),
            }),
          }),
        }),
      );

      // Verify the lte date is end of day
      const call = vi.mocked(prisma.account.findMany).mock.calls[0][0] as any;
      const lteDate =
        call.include.journalLines.where.journalEntry.entryDate.lte;
      expect(lteDate.getHours()).toBe(23);
      expect(lteDate.getMinutes()).toBe(59);
      expect(lteDate.getSeconds()).toBe(59);
      expect(lteDate.getMilliseconds()).toBe(999);
    });

    it("groups liabilities and equity separately", async () => {
      vi.mocked(prisma.account.findMany).mockResolvedValue([
        {
          id: "l1",
          code: "21110",
          parentId: null,
          type: "LIABILITY",
          journalLines: [{ debit: 0, credit: 5000000 }],
        },
        {
          id: "l2",
          code: "21210",
          parentId: "l1",
          type: "LIABILITY",
          journalLines: [{ debit: 0, credit: 2000000 }],
        },
        {
          id: "e1",
          code: "31110",
          parentId: null,
          type: "EQUITY",
          journalLines: [{ debit: 0, credit: 10000000 }],
        },
      ] as never);

      const result = await getBalanceSheet(new Date("2026-06-30"));

      expect(result.totalLiabilities).toBe(7000000);
      expect(result.totalEquity).toBe(10000000);
      expect(result.liabilityGroups.length).toBeGreaterThan(0);
      expect(result.equityGroups.length).toBeGreaterThan(0);
    });
  });

  // ========================================================================
  // getAccountBalance
  // ========================================================================

  describe("getAccountBalance", () => {
    it("calculates balance for debit-normal accounts (ASSET)", async () => {
      vi.mocked(prisma.journalLine.findMany).mockResolvedValue([
        { debit: 500000, credit: 0, journalEntry: {} },
        { debit: 0, credit: 200000, journalEntry: {} },
      ] as never);

      vi.mocked(prisma.account.findUnique).mockResolvedValue({
        id: "a1",
        code: "11120",
        type: "ASSET",
      } as never);

      const balance = await getAccountBalance("a1");
      // ASSET: debit - credit = 500000 - 200000 = 300000
      expect(balance).toBe(300000);
    });

    it("calculates balance for credit-normal accounts (LIABILITY)", async () => {
      vi.mocked(prisma.journalLine.findMany).mockResolvedValue([
        { debit: 100000, credit: 0, journalEntry: {} },
        { debit: 0, credit: 400000, journalEntry: {} },
      ] as never);

      vi.mocked(prisma.account.findUnique).mockResolvedValue({
        id: "l1",
        code: "21110",
        type: "LIABILITY",
      } as never);

      const balance = await getAccountBalance("l1");
      // LIABILITY: credit - debit = 400000 - 100000 = 300000
      expect(balance).toBe(300000);
    });

    it("calculates balance for EQUITY (credit-normal)", async () => {
      vi.mocked(prisma.journalLine.findMany).mockResolvedValue([
        { debit: 0, credit: 10000000, journalEntry: {} },
        { debit: 200000, credit: 0, journalEntry: {} },
      ] as never);

      vi.mocked(prisma.account.findUnique).mockResolvedValue({
        id: "e1",
        code: "31110",
        type: "EQUITY",
      } as never);

      const balance = await getAccountBalance("e1");
      // EQUITY: credit - debit = 10000000 - 200000 = 9800000
      expect(balance).toBe(9800000);
    });

    it("calculates balance for EXPENSE (debit-normal)", async () => {
      vi.mocked(prisma.journalLine.findMany).mockResolvedValue([
        { debit: 5000000, credit: 0, journalEntry: {} },
        { debit: 0, credit: 500000, journalEntry: {} },
      ] as never);

      vi.mocked(prisma.account.findUnique).mockResolvedValue({
        id: "ex1",
        code: "61100",
        type: "EXPENSE",
      } as never);

      const balance = await getAccountBalance("ex1");
      // EXPENSE: debit - credit = 5000000 - 500000 = 4500000
      expect(balance).toBe(4500000);
    });

    it("throws error when account is not found", async () => {
      vi.mocked(prisma.journalLine.findMany).mockResolvedValue([]);
      vi.mocked(prisma.account.findUnique).mockResolvedValue(null);

      await expect(getAccountBalance("nonexistent")).rejects.toThrow(
        "Account not found",
      );
    });

    it("returns 0 for account with no journal lines", async () => {
      vi.mocked(prisma.journalLine.findMany).mockResolvedValue([]);
      vi.mocked(prisma.account.findUnique).mockResolvedValue({
        id: "a1",
        code: "11120",
        type: "ASSET",
      } as never);

      const balance = await getAccountBalance("a1");
      expect(balance).toBe(0);
    });

    it("filters by date range when both dates provided", async () => {
      vi.mocked(prisma.journalLine.findMany).mockResolvedValue([]);
      vi.mocked(prisma.account.findUnique).mockResolvedValue({
        id: "a1",
        code: "11120",
        type: "ASSET",
      } as never);

      await getAccountBalance(
        "a1",
        new Date("2026-01-01"),
        new Date("2026-06-30"),
      );

      expect(prisma.journalLine.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            journalEntry: expect.objectContaining({
              entryDate: { gte: expect.any(Date), lte: expect.any(Date) },
            }),
          }),
        }),
      );
    });

    it("filters by startDate only", async () => {
      vi.mocked(prisma.journalLine.findMany).mockResolvedValue([]);
      vi.mocked(prisma.account.findUnique).mockResolvedValue({
        id: "a1",
        code: "11120",
        type: "ASSET",
      } as never);

      await getAccountBalance("a1", new Date("2026-01-01"));

      expect(prisma.journalLine.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            journalEntry: expect.objectContaining({
              entryDate: { gte: expect.any(Date) },
            }),
          }),
        }),
      );
    });

    it("filters by endDate only", async () => {
      vi.mocked(prisma.journalLine.findMany).mockResolvedValue([]);
      vi.mocked(prisma.account.findUnique).mockResolvedValue({
        id: "a1",
        code: "11120",
        type: "ASSET",
      } as never);

      await getAccountBalance("a1", undefined, new Date("2026-06-30"));

      expect(prisma.journalLine.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            journalEntry: expect.objectContaining({
              entryDate: { lte: expect.any(Date) },
            }),
          }),
        }),
      );
    });

    it("omits entryDate filter when no dates provided", async () => {
      vi.mocked(prisma.journalLine.findMany).mockResolvedValue([]);
      vi.mocked(prisma.account.findUnique).mockResolvedValue({
        id: "a1",
        code: "11120",
        type: "ASSET",
      } as never);

      await getAccountBalance("a1");

      expect(prisma.journalLine.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            journalEntry: { status: "POSTED" },
          }),
        }),
      );
    });
  });

  // ========================================================================
  // getClosingBalances
  // ========================================================================

  describe("getClosingBalances", () => {
    it("returns only accounts with non-zero balance", async () => {
      vi.mocked(prisma.account.findMany).mockResolvedValue([
        {
          id: "rev1",
          type: "REVENUE",
          journalLines: [{ credit: 5000000, debit: 0 }],
        },
        { id: "rev2", type: "REVENUE", journalLines: [] }, // zero balance
        {
          id: "exp1",
          type: "EXPENSE",
          journalLines: [{ credit: 0, debit: 2000000 }],
        },
      ] as never);

      const result = await getClosingBalances(
        new Date("2026-06-01"),
        new Date("2026-06-30"),
      );

      // Only rev1 and exp1 should be included (non-zero balance)
      expect(result).toHaveLength(2);
      expect(result.find((r) => r.id === "rev2")).toBeUndefined();
    });

    it("calculates revenue netBalance as credit - debit", async () => {
      vi.mocked(prisma.account.findMany).mockResolvedValue([
        {
          id: "rev1",
          type: "REVENUE",
          journalLines: [{ credit: 5000000, debit: 500000 }],
        },
      ] as never);

      const result = await getClosingBalances(
        new Date("2026-06-01"),
        new Date("2026-06-30"),
      );

      expect(result[0].netBalance).toBe(4500000); // 5M - 500K
    });

    it("calculates expense netBalance as -(credit - debit) = debit - credit", async () => {
      vi.mocked(prisma.account.findMany).mockResolvedValue([
        {
          id: "exp1",
          type: "EXPENSE",
          journalLines: [{ credit: 200000, debit: 3000000 }],
        },
      ] as never);

      const result = await getClosingBalances(
        new Date("2026-06-01"),
        new Date("2026-06-30"),
      );

      // netBalance = -(credit - debit) = -(200000 - 3000000) = 2800000
      expect(result[0].netBalance).toBe(2800000);
    });

    it("returns empty array when all accounts have zero balance", async () => {
      vi.mocked(prisma.account.findMany).mockResolvedValue([
        {
          id: "rev1",
          type: "REVENUE",
          journalLines: [{ credit: 1000000, debit: 1000000 }],
        },
        { id: "exp1", type: "EXPENSE", journalLines: [] },
      ] as never);

      const result = await getClosingBalances(
        new Date("2026-06-01"),
        new Date("2026-06-30"),
      );

      expect(result).toHaveLength(0);
    });

    it("excludes closing entries via NOT filter", async () => {
      vi.mocked(prisma.account.findMany).mockResolvedValue([] as never);

      await getClosingBalances(new Date("2026-06-01"), new Date("2026-06-30"));

      expect(prisma.account.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            journalLines: expect.objectContaining({
              where: expect.objectContaining({
                journalEntry: expect.objectContaining({
                  NOT: { reference: { startsWith: "CLOSING-" } },
                }),
              }),
            }),
          }),
        }),
      );
    });

    it("returns accounts with id and type fields", async () => {
      vi.mocked(prisma.account.findMany).mockResolvedValue([
        {
          id: "rev1",
          type: "REVENUE",
          journalLines: [{ credit: 5000000, debit: 0 }],
        },
      ] as never);

      const result = await getClosingBalances(
        new Date("2026-06-01"),
        new Date("2026-06-30"),
      );

      expect(result[0]).toHaveProperty("id", "rev1");
      expect(result[0]).toHaveProperty("type", "REVENUE");
      expect(result[0]).toHaveProperty("netBalance");
    });
  });

  // ========================================================================
  // closePeriod
  // ========================================================================

  describe("closePeriod", () => {
    it("throws when closing entry already exists for the period", async () => {
      vi.mocked(prisma.journalEntry.findFirst).mockResolvedValue({
        id: "je1",
        entryNumber: "JE-001",
        reference: "CLOSING-2026-06",
        status: "POSTED",
      } as never);

      await expect(
        closePeriod(new Date("2026-06-30"), "user1"),
      ).rejects.toThrow(
        "Closing entry already exists for CLOSING-2026-06 (JE: JE-001). Void it first if you want to re-close.",
      );
    });

    it("throws when no revenue or expense balances found", async () => {
      vi.mocked(prisma.journalEntry.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.account.findMany).mockResolvedValue([] as never);

      await expect(
        closePeriod(new Date("2026-06-30"), "user1"),
      ).rejects.toThrow(
        "No revenue or expense balances found for period CLOSING-2026-06. Nothing to close.",
      );
    });

    it("throws when earnings account 31112 not found", async () => {
      vi.mocked(prisma.journalEntry.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.account.findMany).mockResolvedValue([
        {
          id: "rev1",
          code: "41100",
          name: "Sales",
          type: "REVENUE",
          journalLines: [{ credit: 5000000, debit: 0 }],
        },
      ] as never);
      vi.mocked(prisma.account.findFirst).mockResolvedValue(null);

      await expect(
        closePeriod(new Date("2026-06-30"), "user1"),
      ).rejects.toThrow("Account 31112 (Laba Berjalan) not found.");
    });

    it("creates closing entry for profit scenario (netIncome >= 0)", async () => {
      vi.mocked(prisma.journalEntry.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.account.findMany).mockResolvedValue([
        {
          id: "rev1",
          code: "41100",
          name: "Sales",
          type: "REVENUE",
          journalLines: [{ credit: 10000000, debit: 0 }],
        },
        {
          id: "exp1",
          code: "61100",
          name: "Salary",
          type: "EXPENSE",
          journalLines: [{ credit: 0, debit: 3000000 }],
        },
      ] as never);
      vi.mocked(prisma.account.findFirst).mockResolvedValue({
        id: "earn1",
        code: "31112",
        name: "Laba Berjalan",
        type: "EQUITY",
      } as never);
      vi.mocked(createJournalEntry).mockResolvedValue({
        id: "je1",
        entryNumber: "JE-CL-001",
      } as never);

      const result = await closePeriod(new Date("2026-06-30"), "user1");

      expect(result.period).toBe("CLOSING-2026-06");
      expect(result.totalRevenue).toBe(10000000);
      expect(result.totalExpense).toBe(3000000);
      expect(result.netIncome).toBe(7000000);
      expect(result.lineCount).toBe(3); // rev1 + exp1 + earnings
      expect(result.entryNumber).toBe("JE-CL-001");

      // Verify createJournalEntry was called with POSTED status
      expect(createJournalEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "POSTED",
          isAutoGenerated: true,
          createdById: "user1",
          reference: "CLOSING-2026-06",
          referenceType: "MANUAL_ENTRY",
        }),
      );
    });

    it("creates closing entry for loss scenario (netIncome < 0)", async () => {
      vi.mocked(prisma.journalEntry.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.account.findMany).mockResolvedValue([
        {
          id: "rev1",
          code: "41100",
          name: "Sales",
          type: "REVENUE",
          journalLines: [{ credit: 2000000, debit: 0 }],
        },
        {
          id: "exp1",
          code: "61100",
          name: "Salary",
          type: "EXPENSE",
          journalLines: [{ credit: 0, debit: 5000000 }],
        },
      ] as never);
      vi.mocked(prisma.account.findFirst).mockResolvedValue({
        id: "earn1",
        code: "31112",
        name: "Laba Berjalan",
        type: "EQUITY",
      } as never);
      vi.mocked(createJournalEntry).mockResolvedValue({
        id: "je1",
        entryNumber: "JE-CL-002",
      } as never);

      const result = await closePeriod(new Date("2026-06-30"), "user1");

      expect(result.netIncome).toBe(-3000000);
      expect(result.lineCount).toBe(3);

      // Verify the earnings line is a debit (loss)
      const journalEntryCall = vi.mocked(createJournalEntry).mock
        .calls[0][0] as any;
      const earningsLine = journalEntryCall.lines.find(
        (l: any) => l.accountId === "earn1",
      );
      expect(earningsLine.debit).toBe(3000000);
      expect(earningsLine.credit).toBe(0);
      expect(earningsLine.description).toContain("Rugi Bersih");
    });

    it("creates closing entry for profit scenario with credit on earnings", async () => {
      vi.mocked(prisma.journalEntry.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.account.findMany).mockResolvedValue([
        {
          id: "rev1",
          code: "41100",
          name: "Sales",
          type: "REVENUE",
          journalLines: [{ credit: 8000000, debit: 0 }],
        },
        {
          id: "exp1",
          code: "61100",
          name: "Salary",
          type: "EXPENSE",
          journalLines: [{ credit: 0, debit: 3000000 }],
        },
      ] as never);
      vi.mocked(prisma.account.findFirst).mockResolvedValue({
        id: "earn1",
        code: "31112",
        name: "Laba Berjalan",
        type: "EQUITY",
      } as never);
      vi.mocked(createJournalEntry).mockResolvedValue({
        id: "je1",
        entryNumber: "JE-CL-003",
      } as never);

      await closePeriod(new Date("2026-06-30"), "user1");

      const journalEntryCall = vi.mocked(createJournalEntry).mock
        .calls[0][0] as any;
      const earningsLine = journalEntryCall.lines.find(
        (l: any) => l.accountId === "earn1",
      );
      expect(earningsLine.debit).toBe(0);
      expect(earningsLine.credit).toBe(5000000);
      expect(earningsLine.description).toContain("Laba Bersih");
    });

    it("skips accounts with zero netBalance (absolute value < 0.01)", async () => {
      vi.mocked(prisma.journalEntry.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.account.findMany).mockResolvedValue([
        {
          id: "rev1",
          code: "41100",
          name: "Sales",
          type: "REVENUE",
          journalLines: [
            { credit: 1000000, debit: 1000000 }, // netBalance = 0
          ],
        },
        {
          id: "rev2",
          code: "42100",
          name: "Service",
          type: "REVENUE",
          journalLines: [
            { credit: 5000000, debit: 0 }, // netBalance = 5M
          ],
        },
      ] as never);
      vi.mocked(prisma.account.findFirst).mockResolvedValue({
        id: "earn1",
        code: "31112",
        name: "Laba Berjalan",
        type: "EQUITY",
      } as never);
      vi.mocked(createJournalEntry).mockResolvedValue({
        id: "je1",
        entryNumber: "JE-CL-004",
      } as never);

      const result = await closePeriod(new Date("2026-06-30"), "user1");

      // Only rev2 and earnings should be in lines (rev1 skipped)
      expect(result.lineCount).toBe(2);

      const journalEntryCall = vi.mocked(createJournalEntry).mock
        .calls[0][0] as any;
      expect(journalEntryCall.lines).toHaveLength(2);
    });

    it("formats period reference with zero-padded month", async () => {
      vi.mocked(prisma.journalEntry.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.account.findMany).mockResolvedValue([
        {
          id: "rev1",
          code: "41100",
          name: "Sales",
          type: "REVENUE",
          journalLines: [{ credit: 1000000, debit: 0 }],
        },
      ] as never);
      vi.mocked(prisma.account.findFirst).mockResolvedValue({
        id: "earn1",
        code: "31112",
        name: "Laba Berjalan",
        type: "EQUITY",
      } as never);
      vi.mocked(createJournalEntry).mockResolvedValue({
        id: "je1",
        entryNumber: "JE-CL-005",
      } as never);

      await closePeriod(new Date("2026-03-15"), "user1");

      expect(prisma.journalEntry.findFirst).toHaveBeenCalledWith({
        where: { reference: "CLOSING-2026-03", status: { not: "VOIDED" } },
      });
    });

    it("allows re-close if existing entry is VOIDED", async () => {
      vi.mocked(prisma.journalEntry.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.account.findMany).mockResolvedValue([
        {
          id: "rev1",
          code: "41100",
          name: "Sales",
          type: "REVENUE",
          journalLines: [{ credit: 1000000, debit: 0 }],
        },
      ] as never);
      vi.mocked(prisma.account.findFirst).mockResolvedValue({
        id: "earn1",
        code: "31112",
        name: "Laba Berjalan",
        type: "EQUITY",
      } as never);
      vi.mocked(createJournalEntry).mockResolvedValue({
        id: "je1",
        entryNumber: "JE-CL-006",
      } as never);

      // findFirst returns null (no non-VOIDED entry) -> allows close
      const result = await closePeriod(new Date("2026-06-30"), "user1");
      expect(result.period).toBe("CLOSING-2026-06");
    });

    it("sets endOfDay to 23:59:59.999 on periodEndDate", async () => {
      vi.mocked(prisma.journalEntry.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.account.findMany).mockResolvedValue([
        {
          id: "rev1",
          code: "41100",
          name: "Sales",
          type: "REVENUE",
          journalLines: [{ credit: 1000000, debit: 0 }],
        },
      ] as never);
      vi.mocked(prisma.account.findFirst).mockResolvedValue({
        id: "earn1",
        code: "31112",
        name: "Laba Berjalan",
        type: "EQUITY",
      } as never);
      vi.mocked(createJournalEntry).mockResolvedValue({
        id: "je1",
        entryNumber: "JE-CL-007",
      } as never);

      await closePeriod(new Date("2026-06-15"), "user1");

      const journalEntryCall = vi.mocked(createJournalEntry).mock
        .calls[0][0] as any;
      const entryDate = journalEntryCall.entryDate;
      expect(entryDate.getHours()).toBe(23);
      expect(entryDate.getMinutes()).toBe(59);
      expect(entryDate.getSeconds()).toBe(59);
      expect(entryDate.getMilliseconds()).toBe(999);
    });

    it("excludes closing entries when computing period balances", async () => {
      vi.mocked(prisma.journalEntry.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.account.findMany).mockResolvedValue([
        {
          id: "rev1",
          code: "41100",
          name: "Sales",
          type: "REVENUE",
          journalLines: [{ credit: 1000000, debit: 0 }],
        },
      ] as never);
      vi.mocked(prisma.account.findFirst).mockResolvedValue({
        id: "earn1",
        code: "31112",
        name: "Laba Berjalan",
        type: "EQUITY",
      } as never);
      vi.mocked(createJournalEntry).mockResolvedValue({
        id: "je1",
        entryNumber: "JE-CL-008",
      } as never);

      await closePeriod(new Date("2026-06-30"), "user1");

      // Verify the query excludes CLOSING- references
      expect(prisma.account.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            journalLines: expect.objectContaining({
              where: expect.objectContaining({
                journalEntry: expect.objectContaining({
                  NOT: { reference: { startsWith: "CLOSING-" } },
                }),
              }),
            }),
          }),
        }),
      );
    });
  });

  // ========================================================================
  // getCashFlowStatement
  // ========================================================================

  describe("getCashFlowStatement", () => {
    it("returns all zeros when no cash accounts exist", async () => {
      vi.mocked(prisma.account.findMany).mockResolvedValue([] as never);

      const result = await getCashFlowStatement(
        new Date("2026-06-01"),
        new Date("2026-06-30"),
      );

      expect(result.operatingActivities).toHaveLength(0);
      expect(result.investingActivities).toHaveLength(0);
      expect(result.financingActivities).toHaveLength(0);
      expect(result.netOperating).toBe(0);
      expect(result.netInvesting).toBe(0);
      expect(result.netFinancing).toBe(0);
      expect(result.netCashFlow).toBe(0);
      expect(result.beginningBalance).toBe(0);
      expect(result.endingBalance).toBe(0);
    });

    it("calculates beginning balance from journal lines before startDate", async () => {
      // First call: findMany for cash accounts
      vi.mocked(prisma.account.findMany).mockResolvedValueOnce([
        { id: "cash1", code: "11110", name: "Kas", isCashAccount: true },
      ] as never);

      // aggregate for beginning balance
      vi.mocked(prisma.journalLine.aggregate).mockResolvedValue({
        _sum: { debit: 10000000, credit: 3000000 },
      } as never);

      // findMany for entries in period
      vi.mocked(prisma.journalEntry.findMany).mockResolvedValue([] as never);

      const result = await getCashFlowStatement(
        new Date("2026-06-01"),
        new Date("2026-06-30"),
      );

      // beginningBalance = debit - credit = 10M - 3M = 7M
      expect(result.beginningBalance).toBe(7000000);
    });

    it("categorizes operating activities for CURRENT_ASSET, REVENUE, EXPENSE categories", async () => {
      vi.mocked(prisma.account.findMany).mockResolvedValueOnce([
        { id: "cash1", code: "11110", name: "Kas", isCashAccount: true },
      ] as never);

      vi.mocked(prisma.journalLine.aggregate).mockResolvedValue({
        _sum: { debit: 0, credit: 0 },
      } as never);

      vi.mocked(prisma.journalEntry.findMany).mockResolvedValue([
        {
          id: "je1",
          lines: [
            {
              accountId: "cash1",
              debit: 0,
              credit: 0,
              account: {
                id: "cash1",
                name: "Kas",
                isCashAccount: true,
                category: "CURRENT_ASSET",
              },
            },
            {
              accountId: "rev1",
              debit: 0,
              credit: 5000000,
              account: {
                id: "rev1",
                name: "Sales",
                isCashAccount: false,
                category: "REVENUE",
              },
            },
          ],
        },
      ] as never);

      const result = await getCashFlowStatement(
        new Date("2026-06-01"),
        new Date("2026-06-30"),
      );

      expect(result.operatingActivities).toHaveLength(1);
      expect(result.operatingActivities[0].name).toBe("Sales");
      expect(result.operatingActivities[0].amount).toBe(5000000);
      expect(result.netOperating).toBe(5000000);
    });

    it("categorizes investing activities for FIXED_ASSET and OTHER_ASSET", async () => {
      vi.mocked(prisma.account.findMany).mockResolvedValueOnce([
        { id: "cash1", code: "11110", name: "Kas", isCashAccount: true },
      ] as never);

      vi.mocked(prisma.journalLine.aggregate).mockResolvedValue({
        _sum: { debit: 0, credit: 0 },
      } as never);

      vi.mocked(prisma.journalEntry.findMany).mockResolvedValue([
        {
          id: "je1",
          lines: [
            {
              accountId: "cash1",
              debit: 0,
              credit: 0,
              account: {
                id: "cash1",
                name: "Kas",
                isCashAccount: true,
                category: "CURRENT_ASSET",
              },
            },
            {
              accountId: "fa1",
              debit: 3000000,
              credit: 0,
              account: {
                id: "fa1",
                name: "Equipment",
                isCashAccount: false,
                category: "FIXED_ASSET",
              },
            },
          ],
        },
      ] as never);

      const result = await getCashFlowStatement(
        new Date("2026-06-01"),
        new Date("2026-06-30"),
      );

      // cashImpact = credit - debit = 0 - 3000000 = -3000000
      expect(result.investingActivities).toHaveLength(1);
      expect(result.investingActivities[0].name).toBe("Equipment");
      expect(result.investingActivities[0].amount).toBe(-3000000);
      expect(result.netInvesting).toBe(-3000000);
    });

    it("categorizes financing activities for LONG_TERM_LIABILITY, CAPITAL, RETAINED_EARNINGS", async () => {
      vi.mocked(prisma.account.findMany).mockResolvedValueOnce([
        { id: "cash1", code: "11110", name: "Kas", isCashAccount: true },
      ] as never);

      vi.mocked(prisma.journalLine.aggregate).mockResolvedValue({
        _sum: { debit: 0, credit: 0 },
      } as never);

      vi.mocked(prisma.journalEntry.findMany).mockResolvedValue([
        {
          id: "je1",
          lines: [
            {
              accountId: "cash1",
              debit: 0,
              credit: 0,
              account: {
                id: "cash1",
                name: "Kas",
                isCashAccount: true,
                category: "CURRENT_ASSET",
              },
            },
            {
              accountId: "loan1",
              debit: 0,
              credit: 10000000,
              account: {
                id: "loan1",
                name: "Bank Loan",
                isCashAccount: false,
                category: "LONG_TERM_LIABILITY",
              },
            },
          ],
        },
      ] as never);

      const result = await getCashFlowStatement(
        new Date("2026-06-01"),
        new Date("2026-06-30"),
      );

      // cashImpact = credit - debit = 10000000 - 0 = 10000000
      expect(result.financingActivities).toHaveLength(1);
      expect(result.financingActivities[0].name).toBe("Bank Loan");
      expect(result.financingActivities[0].amount).toBe(10000000);
      expect(result.netFinancing).toBe(10000000);
    });

    it("handles CAPITAL category as financing", async () => {
      vi.mocked(prisma.account.findMany).mockResolvedValueOnce([
        { id: "cash1", code: "11110", name: "Kas", isCashAccount: true },
      ] as never);

      vi.mocked(prisma.journalLine.aggregate).mockResolvedValue({
        _sum: { debit: 0, credit: 0 },
      } as never);

      vi.mocked(prisma.journalEntry.findMany).mockResolvedValue([
        {
          id: "je1",
          lines: [
            {
              accountId: "cash1",
              debit: 0,
              credit: 0,
              account: {
                id: "cash1",
                name: "Kas",
                isCashAccount: true,
                category: "CURRENT_ASSET",
              },
            },
            {
              accountId: "cap1",
              debit: 0,
              credit: 20000000,
              account: {
                id: "cap1",
                name: "Modal Disetor",
                isCashAccount: false,
                category: "CAPITAL",
              },
            },
          ],
        },
      ] as never);

      const result = await getCashFlowStatement(
        new Date("2026-06-01"),
        new Date("2026-06-30"),
      );

      expect(result.financingActivities).toHaveLength(1);
      expect(result.financingActivities[0].name).toBe("Modal Disetor");
      expect(result.financingActivities[0].amount).toBe(20000000);
    });

    it("handles RETAINED_EARNINGS category as financing", async () => {
      vi.mocked(prisma.account.findMany).mockResolvedValueOnce([
        { id: "cash1", code: "11110", name: "Kas", isCashAccount: true },
      ] as never);

      vi.mocked(prisma.journalLine.aggregate).mockResolvedValue({
        _sum: { debit: 0, credit: 0 },
      } as never);

      vi.mocked(prisma.journalEntry.findMany).mockResolvedValue([
        {
          id: "je1",
          lines: [
            {
              accountId: "cash1",
              debit: 0,
              credit: 0,
              account: {
                id: "cash1",
                name: "Kas",
                isCashAccount: true,
                category: "CURRENT_ASSET",
              },
            },
            {
              accountId: "re1",
              debit: 0,
              credit: 5000000,
              account: {
                id: "re1",
                name: "Laba Ditahan",
                isCashAccount: false,
                category: "RETAINED_EARNINGS",
              },
            },
          ],
        },
      ] as never);

      const result = await getCashFlowStatement(
        new Date("2026-06-01"),
        new Date("2026-06-30"),
      );

      expect(result.financingActivities).toHaveLength(1);
      expect(result.financingActivities[0].name).toBe("Laba Ditahan");
    });

    it("skips lines with zero cashImpact", async () => {
      vi.mocked(prisma.account.findMany).mockResolvedValueOnce([
        { id: "cash1", code: "11110", name: "Kas", isCashAccount: true },
      ] as never);

      vi.mocked(prisma.journalLine.aggregate).mockResolvedValue({
        _sum: { debit: 0, credit: 0 },
      } as never);

      vi.mocked(prisma.journalEntry.findMany).mockResolvedValue([
        {
          id: "je1",
          lines: [
            {
              accountId: "cash1",
              debit: 0,
              credit: 0,
              account: {
                id: "cash1",
                name: "Kas",
                isCashAccount: true,
                category: "CURRENT_ASSET",
              },
            },
            {
              accountId: "rev1",
              debit: 0,
              credit: 0, // zero impact
              account: {
                id: "rev1",
                name: "Sales",
                isCashAccount: false,
                category: "REVENUE",
              },
            },
          ],
        },
      ] as never);

      const result = await getCashFlowStatement(
        new Date("2026-06-01"),
        new Date("2026-06-30"),
      );

      expect(result.operatingActivities).toHaveLength(0);
      expect(result.netOperating).toBe(0);
    });

    it("filters out activities with amount near zero (abs <= 0.01)", async () => {
      vi.mocked(prisma.account.findMany).mockResolvedValueOnce([
        { id: "cash1", code: "11110", name: "Kas", isCashAccount: true },
      ] as never);

      vi.mocked(prisma.journalLine.aggregate).mockResolvedValue({
        _sum: { debit: 0, credit: 0 },
      } as never);

      vi.mocked(prisma.journalEntry.findMany).mockResolvedValue([
        {
          id: "je1",
          lines: [
            {
              accountId: "cash1",
              debit: 0,
              credit: 0,
              account: {
                id: "cash1",
                name: "Kas",
                isCashAccount: true,
                category: "CURRENT_ASSET",
              },
            },
            {
              accountId: "rev1",
              debit: 0,
              credit: 0.005, // very small, will be filtered out
              account: {
                id: "rev1",
                name: "Sales",
                isCashAccount: false,
                category: "REVENUE",
              },
            },
          ],
        },
      ] as never);

      const result = await getCashFlowStatement(
        new Date("2026-06-01"),
        new Date("2026-06-30"),
      );

      expect(result.operatingActivities).toHaveLength(0);
    });

    it("sorts activities by amount descending", async () => {
      vi.mocked(prisma.account.findMany).mockResolvedValueOnce([
        { id: "cash1", code: "11110", name: "Kas", isCashAccount: true },
      ] as never);

      vi.mocked(prisma.journalLine.aggregate).mockResolvedValue({
        _sum: { debit: 0, credit: 0 },
      } as never);

      vi.mocked(prisma.journalEntry.findMany).mockResolvedValue([
        {
          id: "je1",
          lines: [
            {
              accountId: "cash1",
              debit: 0,
              credit: 0,
              account: {
                id: "cash1",
                name: "Kas",
                isCashAccount: true,
                category: "CURRENT_ASSET",
              },
            },
            {
              accountId: "rev1",
              debit: 0,
              credit: 1000000,
              account: {
                id: "rev1",
                name: "Small Sale",
                isCashAccount: false,
                category: "REVENUE",
              },
            },
          ],
        },
        {
          id: "je2",
          lines: [
            {
              accountId: "cash1",
              debit: 0,
              credit: 0,
              account: {
                id: "cash1",
                name: "Kas",
                isCashAccount: true,
                category: "CURRENT_ASSET",
              },
            },
            {
              accountId: "rev2",
              debit: 0,
              credit: 5000000,
              account: {
                id: "rev2",
                name: "Big Sale",
                isCashAccount: false,
                category: "REVENUE",
              },
            },
          ],
        },
      ] as never);

      const result = await getCashFlowStatement(
        new Date("2026-06-01"),
        new Date("2026-06-30"),
      );

      expect(result.operatingActivities[0].name).toBe("Big Sale");
      expect(result.operatingActivities[1].name).toBe("Small Sale");
    });

    it("aggregates same account across multiple journal entries", async () => {
      vi.mocked(prisma.account.findMany).mockResolvedValueOnce([
        { id: "cash1", code: "11110", name: "Kas", isCashAccount: true },
      ] as never);

      vi.mocked(prisma.journalLine.aggregate).mockResolvedValue({
        _sum: { debit: 0, credit: 0 },
      } as never);

      vi.mocked(prisma.journalEntry.findMany).mockResolvedValue([
        {
          id: "je1",
          lines: [
            {
              accountId: "cash1",
              debit: 0,
              credit: 0,
              account: {
                id: "cash1",
                name: "Kas",
                isCashAccount: true,
                category: "CURRENT_ASSET",
              },
            },
            {
              accountId: "rev1",
              debit: 0,
              credit: 3000000,
              account: {
                id: "rev1",
                name: "Sales",
                isCashAccount: false,
                category: "REVENUE",
              },
            },
          ],
        },
        {
          id: "je2",
          lines: [
            {
              accountId: "cash1",
              debit: 0,
              credit: 0,
              account: {
                id: "cash1",
                name: "Kas",
                isCashAccount: true,
                category: "CURRENT_ASSET",
              },
            },
            {
              accountId: "rev1",
              debit: 0,
              credit: 2000000,
              account: {
                id: "rev1",
                name: "Sales",
                isCashAccount: false,
                category: "REVENUE",
              },
            },
          ],
        },
      ] as never);

      const result = await getCashFlowStatement(
        new Date("2026-06-01"),
        new Date("2026-06-30"),
      );

      // Same account aggregated: 3M + 2M = 5M
      expect(result.operatingActivities).toHaveLength(1);
      expect(result.operatingActivities[0].amount).toBe(5000000);
    });

    it("computes ending balance = beginning + netCashFlow", async () => {
      vi.mocked(prisma.account.findMany).mockResolvedValueOnce([
        { id: "cash1", code: "11110", name: "Kas", isCashAccount: true },
      ] as never);

      vi.mocked(prisma.journalLine.aggregate).mockResolvedValue({
        _sum: { debit: 20000000, credit: 5000000 },
      } as never);

      vi.mocked(prisma.journalEntry.findMany).mockResolvedValue([
        {
          id: "je1",
          lines: [
            {
              accountId: "cash1",
              debit: 0,
              credit: 0,
              account: {
                id: "cash1",
                name: "Kas",
                isCashAccount: true,
                category: "CURRENT_ASSET",
              },
            },
            {
              accountId: "rev1",
              debit: 0,
              credit: 8000000,
              account: {
                id: "rev1",
                name: "Sales",
                isCashAccount: false,
                category: "REVENUE",
              },
            },
          ],
        },
      ] as never);

      const result = await getCashFlowStatement(
        new Date("2026-06-01"),
        new Date("2026-06-30"),
      );

      // beginningBalance = 20M - 5M = 15M
      expect(result.beginningBalance).toBe(15000000);
      // netOperating = 8M (from Sales)
      expect(result.netOperating).toBe(8000000);
      // netCashFlow = 8M
      expect(result.netCashFlow).toBe(8000000);
      // endingBalance = 15M + 8M = 23M
      expect(result.endingBalance).toBe(23000000);
    });

    it("handles null sums in beginning balance aggregate", async () => {
      vi.mocked(prisma.account.findMany).mockResolvedValueOnce([
        { id: "cash1", code: "11110", name: "Kas", isCashAccount: true },
      ] as never);

      vi.mocked(prisma.journalLine.aggregate).mockResolvedValue({
        _sum: { debit: null, credit: null },
      } as never);

      vi.mocked(prisma.journalEntry.findMany).mockResolvedValue([] as never);

      const result = await getCashFlowStatement(
        new Date("2026-06-01"),
        new Date("2026-06-30"),
      );

      // Both null -> 0 - 0 = 0
      expect(result.beginningBalance).toBe(0);
    });

    it("handles OTHER_ASSET as investing activity", async () => {
      vi.mocked(prisma.account.findMany).mockResolvedValueOnce([
        { id: "cash1", code: "11110", name: "Kas", isCashAccount: true },
      ] as never);

      vi.mocked(prisma.journalLine.aggregate).mockResolvedValue({
        _sum: { debit: 0, credit: 0 },
      } as never);

      vi.mocked(prisma.journalEntry.findMany).mockResolvedValue([
        {
          id: "je1",
          lines: [
            {
              accountId: "cash1",
              debit: 0,
              credit: 0,
              account: {
                id: "cash1",
                name: "Kas",
                isCashAccount: true,
                category: "CURRENT_ASSET",
              },
            },
            {
              accountId: "oa1",
              debit: 0,
              credit: 1000000,
              account: {
                id: "oa1",
                name: "Intangible",
                isCashAccount: false,
                category: "OTHER_ASSET",
              },
            },
          ],
        },
      ] as never);

      const result = await getCashFlowStatement(
        new Date("2026-06-01"),
        new Date("2026-06-30"),
      );

      expect(result.investingActivities).toHaveLength(1);
      expect(result.investingActivities[0].amount).toBe(1000000);
    });

    it("only queries cash accounts (isCashAccount = true)", async () => {
      vi.mocked(prisma.account.findMany).mockResolvedValueOnce([
        { id: "cash1", code: "11110", name: "Kas", isCashAccount: true },
      ] as never);

      vi.mocked(prisma.journalLine.aggregate).mockResolvedValue({
        _sum: { debit: 0, credit: 0 },
      } as never);

      vi.mocked(prisma.journalEntry.findMany).mockResolvedValue([] as never);

      await getCashFlowStatement(
        new Date("2026-06-01"),
        new Date("2026-06-30"),
      );

      expect(prisma.account.findMany).toHaveBeenCalledWith({
        where: { isCashAccount: true },
      });
    });

    it("filters out cash lines from activity categorization", async () => {
      vi.mocked(prisma.account.findMany).mockResolvedValueOnce([
        { id: "cash1", code: "11110", name: "Kas", isCashAccount: true },
      ] as never);

      vi.mocked(prisma.journalLine.aggregate).mockResolvedValue({
        _sum: { debit: 0, credit: 0 },
      } as never);

      // Entry with only cash lines (no non-cash counterpart to categorize)
      vi.mocked(prisma.journalEntry.findMany).mockResolvedValue([
        {
          id: "je1",
          lines: [
            {
              accountId: "cash1",
              debit: 5000000,
              credit: 0,
              account: {
                id: "cash1",
                name: "Kas",
                isCashAccount: true,
                category: "CURRENT_ASSET",
              },
            },
            {
              accountId: "cash2",
              debit: 0,
              credit: 5000000,
              account: {
                id: "cash2",
                name: "Bank",
                isCashAccount: true,
                category: "CURRENT_ASSET",
              },
            },
          ],
        },
      ] as never);

      const result = await getCashFlowStatement(
        new Date("2026-06-01"),
        new Date("2026-06-30"),
      );

      // Both lines are cash accounts -> filtered out -> no activities
      expect(result.operatingActivities).toHaveLength(0);
      expect(result.investingActivities).toHaveLength(0);
      expect(result.financingActivities).toHaveLength(0);
    });
  });
});
