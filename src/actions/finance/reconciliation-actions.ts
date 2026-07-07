"use server";

import { withTenant } from "@/lib/core/tenant";
import {
  ReconciliationService,
  BankStatementRow,
} from "@/services/finance/reconciliation-service";
import { requireAuth } from "@/lib/tools/auth-checks";
import { serializeData } from "@/lib/utils/utils";
import { safeAction } from "@/lib/errors/errors";
import { AdjustmentSide, AdjustmentType } from "@prisma/client";

// ==========================================
// Reconciliation CRUD
// ==========================================

export const createReconciliation = withTenant(
  async function createReconciliation(
    accountId: string,
    periodStart: Date,
    periodEnd: Date,
    statements: BankStatementRow[],
  ) {
    return safeAction(async () => {
      const session = await requireAuth();
      const result = await ReconciliationService.createReconciliation(
        accountId,
        periodStart,
        periodEnd,
        statements,
        session.user.id,
      );
      return serializeData(result);
    });
  },
);

export const getReconciliation = withTenant(
  async function getReconciliation(id: string) {
    return safeAction(async () => {
      await requireAuth();
      const result = await ReconciliationService.getReconciliation(id);
      return serializeData(result);
    });
  },
);

export const listReconciliations = withTenant(
  async function listReconciliations(accountId?: string) {
    return safeAction(async () => {
      await requireAuth();
      const result = await ReconciliationService.listReconciliations(accountId);
      return serializeData(result);
    });
  },
);

// ==========================================
// Matching
// ==========================================

export const autoMatchAndSave = withTenant(
  async function autoMatchAndSave(reconciliationId: string) {
    return safeAction(async () => {
      await requireAuth();
      const result =
        await ReconciliationService.autoMatchAndSave(reconciliationId);
      return serializeData(result);
    });
  },
);

export const manualMatch = withTenant(
  async function manualMatch(itemId: string, journalLineId: string) {
    return safeAction(async () => {
      await requireAuth();
      const result = await ReconciliationService.manualMatch(
        itemId,
        journalLineId,
      );
      return serializeData(result);
    });
  },
);

// ==========================================
// Adjustments
// ==========================================

export const addAdjustment = withTenant(
  async function addAdjustment(
    reconciliationId: string,
    side: AdjustmentSide,
    type: AdjustmentType,
    description: string,
    amount: number,
  ) {
    return safeAction(async () => {
      await requireAuth();
      const result = await ReconciliationService.addAdjustment(
        reconciliationId,
        { side, type, description, amount },
      );
      return serializeData(result);
    });
  },
);

export const removeAdjustment = withTenant(
  async function removeAdjustment(adjustmentId: string) {
    return safeAction(async () => {
      await requireAuth();
      const result =
        await ReconciliationService.removeAdjustment(adjustmentId);
      return serializeData(result);
    });
  },
);

export const calculateAdjustedBalances = withTenant(
  async function calculateAdjustedBalances(reconciliationId: string) {
    return safeAction(async () => {
      await requireAuth();
      const result =
        await ReconciliationService.calculateAdjustedBalances(reconciliationId);
      return serializeData(result);
    });
  },
);

// ==========================================
// Completion
// ==========================================

export const completeReconciliation = withTenant(
  async function completeReconciliation(reconciliationId: string) {
    return safeAction(async () => {
      await requireAuth();
      const result =
        await ReconciliationService.completeReconciliation(reconciliationId);
      return serializeData(result);
    });
  },
);

// ==========================================
// Auto-Journal for Adjustments
// ==========================================

export const createAdjustmentJournals = withTenant(
  async function createAdjustmentJournals(reconciliationId: string) {
    return safeAction(async () => {
      const session = await requireAuth();
      const result = await ReconciliationService.createAdjustmentJournals(
        reconciliationId,
        session.user.id,
      );
      return serializeData(result);
    });
  },
);

// ==========================================
// GL Entries (for side-by-side view)
// ==========================================

export const getGLEntries = withTenant(
  async function getGLEntries(
    accountId: string,
    startDate: Date,
    endDate: Date,
  ) {
    return safeAction(async () => {
      await requireAuth();
      const result = await ReconciliationService.getGLEntries(
        accountId,
        startDate,
        endDate,
      );
      return serializeData(result);
    });
  },
);

export const getUnreconciledEntries = withTenant(
  async function getUnreconciledEntries(
    accountId: string,
    startDate: Date,
    endDate: Date,
  ) {
    return safeAction(async () => {
      await requireAuth();
      const result = await ReconciliationService.getUnreconciledEntries(
        accountId,
        startDate,
        endDate,
      );
      return serializeData(result);
    });
  },
);

// ==========================================
// Legacy (backward compatibility)
// ==========================================

export const autoMatchReconciliation = withTenant(
  async function autoMatchReconciliation(
    accountId: string,
    startDate: Date,
    endDate: Date,
    statements: BankStatementRow[],
  ) {
    return safeAction(async () => {
      await requireAuth();
      const results = await ReconciliationService.autoMatch(
        accountId,
        startDate,
        endDate,
        statements,
      );
      return serializeData(results);
    });
  },
);

export const confirmReconciliation = withTenant(
  async function confirmReconciliation(matchedLineIds: string[]) {
    return safeAction(async () => {
      await requireAuth();
      const result =
        await ReconciliationService.confirmReconciliation(matchedLineIds);
      return {
        message: `${result.count} baris jurnal berhasil direkonsiliasi.`,
      };
    });
  },
);
