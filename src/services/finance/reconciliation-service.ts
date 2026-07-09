import { prisma } from "@/lib/core/prisma";
import { NotFoundError } from "@/lib/errors/errors";
import {
  AdjustmentSide,
  AdjustmentType,
  JournalStatus,
  MatchStatus,
  ReconciliationStatus,
} from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { resolveAccount, type AccountRole } from "@/services/accounting/account-resolver";

// ==========================================
// Types
// ==========================================

export interface BankStatementRow {
  id: string;
  date: Date;
  description: string;
  amount: number; // positive = inflow/credit to bank, negative = outflow/debit from bank
  ref?: string;
}

export interface MatchResult {
  statementRow: BankStatementRow;
  matchedJournalLineId?: string;
  confidence: number;
  candidates: Record<string, unknown>[];
}

// ==========================================
// Service
// ==========================================

export class ReconciliationService {
  /**
   * Create a new reconciliation session and save bank statement items
   */
  static async createReconciliation(
    accountId: string,
    periodStart: Date,
    periodEnd: Date,
    statements: BankStatementRow[],
    userId: string,
  ) {
    // Calculate bank balance from statements
    const bankBalance = statements.reduce((sum, s) => sum + s.amount, 0);

    // Get GL balance for the account in the period
    const glLines = await prisma.journalLine.findMany({
      where: {
        accountId,
        journalEntry: {
          status: JournalStatus.POSTED,
          entryDate: { gte: periodStart, lte: periodEnd },
        },
      },
      include: { journalEntry: true },
    });

    const bookBalance = glLines.reduce((sum, line) => {
      const debit = line.debit?.toNumber() ?? 0;
      const credit = line.credit?.toNumber() ?? 0;
      return sum + debit - credit;
    }, 0);

    // Create reconciliation header with items
    const reconciliation = await prisma.bankReconciliation.create({
      data: {
        accountId,
        periodStart,
        periodEnd,
        bankBalance: new Decimal(bankBalance),
        bookBalance: new Decimal(bookBalance),
        createdById: userId,
        status: ReconciliationStatus.DRAFT,
        items: {
          create: statements.map((s) => ({
            bankDate: s.date,
            bankDescription: s.description,
            bankAmount: new Decimal(s.amount),
            bankRef: s.ref ?? null,
            matchStatus: MatchStatus.UNMATCHED_BANK_ONLY,
          })),
        },
      },
      include: {
        items: true,
        account: { select: { code: true, name: true } },
      },
    });

    return reconciliation;
  }

  /**
   * Get reconciliation with all items and adjustments
   */
  static async getReconciliation(id: string) {
    const reconciliation = await prisma.bankReconciliation.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            journalLine: {
              include: {
                journalEntry: {
                  select: {
                    id: true,
                    entryNumber: true,
                    entryDate: true,
                    description: true,
                    reference: true,
                    referenceType: true,
                  },
                },
              },
            },
          },
          orderBy: { bankDate: "asc" },
        },
        adjustments: {
          include: {
            journalEntry: {
              select: { id: true, entryNumber: true },
            },
          },
        },
        account: { select: { id: true, code: true, name: true } },
        createdBy: { select: { id: true, name: true } },
      },
    });

    if (!reconciliation) {
      throw new NotFoundError("BankReconciliation", id);
    }

    return reconciliation;
  }

  /**
   * List all reconciliations
   */
  static async listReconciliations(accountId?: string) {
    return prisma.bankReconciliation.findMany({
      where: accountId ? { accountId } : {},
      include: {
        account: { select: { code: true, name: true } },
        createdBy: { select: { name: true } },
        _count: { select: { items: true, adjustments: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  }

  /**
   * Auto-match bank statement rows against journal lines and save results
   */
  static async autoMatchAndSave(reconciliationId: string) {
    const reconciliation = await prisma.bankReconciliation.findUnique({
      where: { id: reconciliationId },
      include: { items: true },
    });

    if (!reconciliation) {
      throw new NotFoundError("BankReconciliation", reconciliationId);
    }

    const unmatchedItems = reconciliation.items.filter(
      (i) => i.matchStatus === MatchStatus.UNMATCHED_BANK_ONLY,
    );

    // Get unreconciled journal lines for this account
    const journalLines = await prisma.journalLine.findMany({
      where: {
        accountId: reconciliation.accountId,
        reconciledAt: null,
        journalEntry: {
          status: JournalStatus.POSTED,
          entryDate: {
            gte: reconciliation.periodStart,
            lte: reconciliation.periodEnd,
          },
        },
      },
      include: { journalEntry: true },
    });

    let matchedCount = 0;
    let unmatchedCount = 0;

    for (const item of unmatchedItems) {
      const bankAmount = item.bankAmount?.toNumber() ?? 0;
      const bankDate = item.bankDate;

      if (!bankDate) {
        unmatchedCount++;
        continue;
      }

      // Find candidates: match amount (within tolerance) and date (within 3 days)
      const candidates = journalLines.filter((line) => {
        const lineDebit = line.debit?.toNumber() ?? 0;
        const lineCredit = line.credit?.toNumber() ?? 0;
        const lineAmount = lineDebit - lineCredit;

        if (Math.abs(lineAmount - bankAmount) > 0.01) return false;

        const daysDiff =
          Math.abs(
            line.journalEntry.entryDate.getTime() - bankDate.getTime(),
          ) /
          (1000 * 3600 * 24);
        return daysDiff <= 3;
      });

      if (candidates.length === 1) {
        await prisma.bankReconciliationItem.update({
          where: { id: item.id },
          data: {
            journalLineId: candidates[0].id,
            glDate: candidates[0].journalEntry.entryDate,
            glDescription: candidates[0].journalEntry.description,
            glDebit: candidates[0].debit,
            glCredit: candidates[0].credit,
            matchStatus: MatchStatus.MATCHED,
            confidence: 100,
            matchedBy: "AUTO",
            matchedAt: new Date(),
          },
        });
        matchedCount++;
      } else if (candidates.length > 1) {
        // Multiple candidates — keep as unmatched for manual review
        unmatchedCount++;
      } else {
        unmatchedCount++;
      }
    }

    // Update status
    await prisma.bankReconciliation.update({
      where: { id: reconciliationId },
      data: { status: ReconciliationStatus.IN_PROGRESS },
    });

    return { matched: matchedCount, unmatched: unmatchedCount };
  }

  /**
   * Manually match a bank item with a journal line
   */
  static async manualMatch(
    itemId: string,
    journalLineId: string,
  ) {
    const journalLine = await prisma.journalLine.findUnique({
      where: { id: journalLineId },
      include: { journalEntry: true },
    });

    if (!journalLine) {
      throw new NotFoundError("JournalLine", journalLineId);
    }

    return prisma.bankReconciliationItem.update({
      where: { id: itemId },
      data: {
        journalLineId,
        glDate: journalLine.journalEntry.entryDate,
        glDescription: journalLine.journalEntry.description,
        glDebit: journalLine.debit,
        glCredit: journalLine.credit,
        matchStatus: MatchStatus.MANUALLY_MATCHED,
        confidence: 100,
        matchedBy: "MANUAL",
        matchedAt: new Date(),
      },
    });
  }

  /**
   * Add an adjustment to the reconciliation
   */
  static async addAdjustment(
    reconciliationId: string,
    adjustment: {
      side: AdjustmentSide;
      type: AdjustmentType;
      description: string;
      amount: number;
    },
  ) {
    return prisma.bankReconciliationAdjustment.create({
      data: {
        reconciliationId,
        side: adjustment.side,
        type: adjustment.type,
        description: adjustment.description,
        amount: new Decimal(adjustment.amount),
      },
    });
  }

  /**
   * Remove an adjustment
   */
  static async removeAdjustment(adjustmentId: string) {
    return prisma.bankReconciliationAdjustment.delete({
      where: { id: adjustmentId },
    });
  }

  /**
   * Calculate adjusted balances for both sides
   */
  static async calculateAdjustedBalances(reconciliationId: string) {
    const reconciliation = await prisma.bankReconciliation.findUnique({
      where: { id: reconciliationId },
      include: { adjustments: true },
    });

    if (!reconciliation) {
      throw new NotFoundError("BankReconciliation", reconciliationId);
    }

    const bankBalance = reconciliation.bankBalance.toNumber();
    const bookBalance = reconciliation.bookBalance.toNumber();

    let bankAdjustments = 0;
    let bookAdjustments = 0;

    for (const adj of reconciliation.adjustments) {
      const amount = adj.amount.toNumber();
      if (adj.side === AdjustmentSide.BANK) {
        bankAdjustments += amount;
      } else {
        bookAdjustments += amount;
      }
    }

    const adjustedBankBalance = bankBalance + bankAdjustments;
    const adjustedBookBalance = bookBalance + bookAdjustments;

    await prisma.bankReconciliation.update({
      where: { id: reconciliationId },
      data: {
        adjustedBankBalance: new Decimal(adjustedBankBalance),
        adjustedBookBalance: new Decimal(adjustedBookBalance),
      },
    });

    return {
      bankBalance,
      bookBalance,
      bankAdjustments,
      bookAdjustments,
      adjustedBankBalance,
      adjustedBookBalance,
      difference: adjustedBankBalance - adjustedBookBalance,
    };
  }

  /**
   * Complete the reconciliation — mark matched lines as reconciled
   */
  static async completeReconciliation(reconciliationId: string) {
    const reconciliation = await prisma.bankReconciliation.findUnique({
      where: { id: reconciliationId },
      include: { items: true },
    });

    if (!reconciliation) {
      throw new NotFoundError("BankReconciliation", reconciliationId);
    }

    // Mark all matched journal lines as reconciled
    const matchedLineIds = reconciliation.items
      .filter((i) => i.journalLineId)
      .map((i) => i.journalLineId!);

    if (matchedLineIds.length > 0) {
      await prisma.journalLine.updateMany({
        where: { id: { in: matchedLineIds } },
        data: { reconciledAt: new Date() },
      });
    }

    // Update reconciliation status
    return prisma.bankReconciliation.update({
      where: { id: reconciliationId },
      data: {
        status: ReconciliationStatus.COMPLETED,
        completedAt: new Date(),
      },
    });
  }

  /**
   * Get GL entries for an account (for side-by-side view)
   */
  static async getGLEntries(
    accountId: string,
    startDate: Date,
    endDate: Date,
  ) {
    const lines = await prisma.journalLine.findMany({
      where: {
        accountId,
        journalEntry: {
          status: JournalStatus.POSTED,
          entryDate: { gte: startDate, lte: endDate },
        },
      },
      include: {
        journalEntry: {
          select: {
            id: true,
            entryNumber: true,
            entryDate: true,
            description: true,
            reference: true,
            referenceType: true,
          },
        },
      },
      orderBy: { journalEntry: { entryDate: "asc" } },
    });

    let runningBalance = 0;
    return lines.map((line) => {
      const debit = line.debit?.toNumber() ?? 0;
      const credit = line.credit?.toNumber() ?? 0;
      runningBalance += debit - credit;

      return {
        id: line.id,
        date: line.journalEntry.entryDate,
        entryNumber: line.journalEntry.entryNumber,
        description: line.journalEntry.description,
        debit,
        credit,
        balance: runningBalance,
        isReconciled: !!line.reconciledAt,
      };
    });
  }

  /**
   * Get unreconciled GL entries for manual matching
   */
  static async getUnreconciledEntries(
    accountId: string,
    startDate: Date,
    endDate: Date,
  ) {
    return prisma.journalLine.findMany({
      where: {
        accountId,
        reconciledAt: null,
        journalEntry: {
          status: JournalStatus.POSTED,
          entryDate: { gte: startDate, lte: endDate },
        },
      },
      include: {
        journalEntry: {
          select: {
            id: true,
            entryNumber: true,
            entryDate: true,
            description: true,
          },
        },
      },
      orderBy: { journalEntry: { entryDate: "asc" } },
    });
  }

  /**
   * Create journal entries for book-side adjustments.
   * Bank side = always reconciliation.accountId.
   * Offset side = resolveAccount(role).
   * Throws on missing account (no silent skip).
   */
  static async createAdjustmentJournals(
    reconciliationId: string,
    userId: string,
  ): Promise<{ created: number }> {
    const reconciliation = await prisma.bankReconciliation.findUnique({
      where: { id: reconciliationId },
      include: { adjustments: true, account: true },
    });

    if (!reconciliation) {
      throw new NotFoundError("BankReconciliation", reconciliationId);
    }

    const bookAdjustments = reconciliation.adjustments.filter(
      (a) => a.side === AdjustmentSide.BOOK && !a.journalEntryId,
    );

    let created = 0;

    for (const adj of bookAdjustments) {
      const amount = adj.amount.toNumber();
      if (amount === 0) continue;

      const absAmount = Math.abs(amount);

      // Resolve offset account by role
      const offsetRole = ADJUSTMENT_OFFSET_ROLE[adj.type] ?? "suspense-clearing";
      const offset = await resolveAccount(offsetRole);

      // Bank increases when: INTEREST_INCOME, COLLECTION, CORRECTION_ADD
      // or OTHER with positive amount
      const bankIncreases = ADJUSTMENT_BANK_INCREASES[adj.type] ?? amount > 0;

      // Build journal lines: bank ↔ offset
      const drAccountId = bankIncreases ? reconciliation.accountId : offset.id;
      const crAccountId = bankIncreases ? offset.id : reconciliation.accountId;

      // Get next entry number
      const lastEntry = await prisma.journalEntry.findFirst({
        orderBy: { createdAt: "desc" },
        select: { entryNumber: true },
      });
      const nextNumber = generateNextEntryNumber(
        lastEntry?.entryNumber ?? "JE - 2026 -00000",
      );

      // Create journal entry
      const journalEntry = await prisma.journalEntry.create({
        data: {
          entryNumber: nextNumber,
          entryDate: new Date(),
          description: `Rekonsiliasi Bank - ${adj.description}`,
          reference: reconciliationId,
          referenceType: "BANK_RECONCILIATION",
          status: "POSTED",
          createdById: userId,
          isAutoGenerated: true,
          lines: {
            create: [
              {
                accountId: drAccountId,
                debit: absAmount,
                credit: 0,
                description: adj.description,
              },
              {
                accountId: crAccountId,
                debit: 0,
                credit: absAmount,
                description: adj.description,
              },
            ],
          },
        },
      });

      // Link adjustment to journal
      await prisma.bankReconciliationAdjustment.update({
        where: { id: adj.id },
        data: { journalEntryId: journalEntry.id },
      });

      created++;
    }

    return { created };
  }

  /**
   * Legacy: auto-match without persistence (kept for backward compatibility)
   */
  static async autoMatch(
    accountId: string,
    startDate: Date,
    endDate: Date,
    statements: BankStatementRow[],
  ): Promise<MatchResult[]> {
    const journalLines = await prisma.journalLine.findMany({
      where: {
        accountId,
        reconciledAt: null,
        journalEntry: {
          status: JournalStatus.POSTED,
          entryDate: { gte: startDate, lte: endDate },
        },
      },
      include: { journalEntry: true },
    });

    const results: MatchResult[] = [];

    for (const row of statements) {
      const targetDebit = row.amount > 0 ? row.amount : 0;
      const targetCredit = row.amount < 0 ? Math.abs(row.amount) : 0;

      const candidates = journalLines.filter((line) => {
        const lineDebit = line.debit ? line.debit.toNumber() : 0;
        const lineCredit = line.credit ? line.credit.toNumber() : 0;

        if (Math.abs(lineDebit - targetDebit) > 0.01) return false;
        if (Math.abs(lineCredit - targetCredit) > 0.01) return false;

        const daysDiff =
          Math.abs(
            line.journalEntry.entryDate.getTime() - row.date.getTime(),
          ) /
          (1000 * 3600 * 24);
        return daysDiff <= 3;
      });

      if (candidates.length === 1) {
        results.push({
          statementRow: row,
          matchedJournalLineId: candidates[0].id,
          confidence: 100,
          candidates,
        });
      } else if (candidates.length > 1) {
        results.push({
          statementRow: row,
          confidence: 50,
          candidates,
        });
      } else {
        results.push({
          statementRow: row,
          confidence: 0,
          candidates: [],
        });
      }
    }

    return results;
  }

  /**
   * Legacy: confirm reconciliation (kept for backward compatibility)
   */
  static async confirmReconciliation(
    matchedLineIds: string[],
  ): Promise<{ count: number }> {
    if (matchedLineIds.length === 0) return { count: 0 };

    const result = await prisma.journalLine.updateMany({
      where: { id: { in: matchedLineIds } },
      data: { reconciledAt: new Date() },
    });

    return { count: result.count };
  }
}

// ==========================================
// Adjustment Journal Resolution (Phase 2.1)
// ==========================================

/** Map AdjustmentType → AccountRole for the offset (non-bank) side */
const ADJUSTMENT_OFFSET_ROLE: Partial<Record<AdjustmentType, AccountRole>> = {
  [AdjustmentType.BANK_FEE]: "bank-charges",
  [AdjustmentType.INTEREST_INCOME]: "interest-income",
  [AdjustmentType.NSF_CHECK]: "accounts-receivable",
  [AdjustmentType.COLLECTION]: "accounts-receivable",
  [AdjustmentType.CORRECTION_ADD]: "current-year-earnings",
  [AdjustmentType.CORRECTION_SUBTRACT]: "current-year-earnings",
  [AdjustmentType.OTHER]: "suspense-clearing",
};

/** Map AdjustmentType → bankIncreases boolean. null = use amount sign. */
const ADJUSTMENT_BANK_INCREASES: Partial<Record<AdjustmentType, boolean>> = {
  [AdjustmentType.BANK_FEE]: false,
  [AdjustmentType.INTEREST_INCOME]: true,
  [AdjustmentType.NSF_CHECK]: false,
  [AdjustmentType.COLLECTION]: true,
  [AdjustmentType.CORRECTION_ADD]: true,
  [AdjustmentType.CORRECTION_SUBTRACT]: false,
  // OTHER: null → falls back to amount > 0
};

function generateNextEntryNumber(lastEntryNumber: string): string {
  const match = lastEntryNumber.match(/(\d+)$/);
  if (!match) return "JE - 2026 -00001";
  const nextNum = parseInt(match[1]) + 1;
  return `JE - 2026 -${nextNum.toString().padStart(5, "0")}`;
}
