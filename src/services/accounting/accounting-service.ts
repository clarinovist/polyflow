import { AccountType, AccountCategory, JournalStatus, Prisma } from '@prisma/client';
import type { CreateJournalEntryInput } from './types';
import {
    createJournalEntry,
    postJournal,
    voidJournal,
    reverseJournal,
    createBulkJournalEntries,
    updateDraftJournal,
    getJournals,
    getJournalById,
    createYearEndClosingEntry,
    createDirectLaborJournal,
    updateDirectLaborJournal,
    createDetailJournal,
    updateDetailJournal,
} from './journals-service';
import { getChartOfAccounts, createAccount, updateAccount, deleteAccount } from './coa-service';
import { getTrialBalance, getIncomeStatement, getBalanceSheet, getAccountBalance, getCashFlowStatement, closePeriod } from './reports-service';
import { getFiscalPeriods, createFiscalPeriod, closeFiscalPeriod, isPeriodOpen, generateClosingEntries } from './periods-service';
import { recordInventoryMovement, recordMaklonCosts } from './inventory-link-service';
import { getGeneralLedger } from './general-ledger-service';

export type { CreateJournalEntryInput } from './types';

export class AccountingService {

    /**
     * Create a new Journal Entry.
     * Default Status: DRAFT
     */
    static async createJournalEntry(input: CreateJournalEntryInput, tx?: Prisma.TransactionClient) {
        return createJournalEntry(input, tx);
    }

    /**
     * Post a Journal Entry (DRAFT -> POSTED)
     */
    static async postJournal(id: string, userId?: string, tx?: Prisma.TransactionClient) {
        return postJournal(id, userId, tx);
    }

    /**
     * Void a Journal Entry (POSTED -> VOIDED)
     */
    static async voidJournal(id: string, _userId?: string) {
        return voidJournal(id, _userId);
    }

    /**
     * Reverse a Journal Entry
     * Creates a new JE with swapped Debit/Credit
     */
    static async reverseJournal(id: string, userId?: string) {
        return reverseJournal(id, userId);
    }

    static async createBulkJournalEntries(data: CreateJournalEntryInput[]) {
        return createBulkJournalEntries(data);
    }

    /**
     * Update a DRAFT journal entry (header + lines replace atomically)
     */
    static async updateDraftJournal(id: string, input: {
        entryDate: Date;
        description: string;
        reference?: string;
        lines: { accountId: string; debit: number; credit: number; description?: string }[];
    }, userId?: string) {
        return updateDraftJournal(id, input, userId);
    }

    /**
     * Create a Direct Labor journal: 2 GL lines + detail table (atomic).
     */
    static async createDirectLaborJournal(input: {
        entryDate: Date;
        description: string;
        reference?: string;
        debitAccountId: string;
        creditAccountId: string;
        details: { description: string; amount: number }[];
    }, userId?: string) {
        return createDirectLaborJournal(input, userId);
    }

    /**
     * Update a DRAFT Direct Labor journal (atomic replace lines + details).
     */
    static async updateDirectLaborJournal(id: string, input: {
        entryDate: Date;
        description: string;
        reference?: string;
        debitAccountId: string;
        creditAccountId: string;
        details: { description: string; amount: number }[];
    }, userId?: string) {
        return updateDirectLaborJournal(id, input, userId);
    }

    /**
     * Create a detail journal: 2 GL lines + detail table (atomic).
     * Generic version — works for all templates (BTKL, Piutang, BPJS).
     */
    static async createDetailJournal(input: {
        type: string;
        entryDate: Date;
        description: string;
        reference?: string;
        primaryAccountId: string;
        counterAccountId: string;
        direction: 'OUTFLOW' | 'INFLOW';
        details: { description: string; amount: number }[];
    }, userId?: string) {
        return createDetailJournal(input, userId);
    }

    /**
     * Update a DRAFT detail journal (atomic replace lines + details).
     * Generic version — works for all templates.
     */
    static async updateDetailJournal(id: string, input: {
        type: string;
        entryDate: Date;
        description: string;
        reference?: string;
        primaryAccountId: string;
        counterAccountId: string;
        direction: 'OUTFLOW' | 'INFLOW';
        details: { description: string; amount: number }[];
    }, userId?: string) {
        return updateDetailJournal(id, input, userId);
    }

    static async getJournals(params?: { startDate?: Date, endDate?: Date, status?: JournalStatus, reference?: string, page?: number, limit?: number }) {
        return getJournals(params);
    }

    static async getJournalById(id: string) {
        return getJournalById(id);
    }

    static async getChartOfAccounts() {
        return getChartOfAccounts();
    }

    static async createAccount(data: { code: string; name: string; type: AccountType; category: AccountCategory; description?: string }) {
        return createAccount(data);
    }

    static async updateAccount(id: string, data: { code?: string; name?: string; type?: AccountType; category?: AccountCategory; description?: string }) {
        return updateAccount(id, data);
    }

    static async deleteAccount(id: string) {
        return deleteAccount(id);
    }

    /**
     * Get Trial Balance (POSTED ONLY)
     */
    static async getTrialBalance(startDate?: Date, endDate?: Date) {
        return getTrialBalance(startDate, endDate);
    }

    /**
     * Get Income Statement (POSTED ONLY)
     */
    static async getIncomeStatement(startDate: Date, endDate: Date) {
        return getIncomeStatement(startDate, endDate);
    }

    /**
     * Get Balance Sheet (POSTED ONLY)
     */
    static async getBalanceSheet(asOfDate: Date) {
        return getBalanceSheet(asOfDate);
    }

    /**
     * Period-End Closing Entry
     * Zeros out Revenue & Expense accounts, posts net income to current-year-earnings (tenant-aware).
     */
    static async closePeriod(periodEndDate: Date, userId: string) {
        return closePeriod(periodEndDate, userId);
    }

    /**
     * Get Cash Flow Statement (POSTED ONLY)
     */
    static async getCashFlowStatement(startDate: Date, endDate: Date) {
        return getCashFlowStatement(startDate, endDate);
    }

    static async getAccountBalance(accountId: string, startDate?: Date, endDate?: Date) {
        return getAccountBalance(accountId, startDate, endDate);
    }

    /**
     * Get General Ledger / Buku Besar (POSTED ONLY)
     * All accounts with transaction details grouped by account.
     */
    static async getGeneralLedger(startDate?: Date, endDate?: Date) {
        return getGeneralLedger(startDate, endDate);
    }

    /**
     * Fiscal Periods Logic
     */

    static async getFiscalPeriods() {
        return getFiscalPeriods();
    }

    static async createFiscalPeriod(year: number, month: number) {
        return createFiscalPeriod(year, month);
    }

    static async closeFiscalPeriod(id: string, userId: string) {
        return closeFiscalPeriod(id, userId);
    }

    /**
     * Check if a specific date is within an OPEN fiscal period
     */
    static async isPeriodOpen(date: Date): Promise<boolean> {
        return isPeriodOpen(date);
    }

    /**
     * AUTO-JOURNAL: Record Inventory Movement
     * Maps StockMovement to GL Entries
     */
    static async recordInventoryMovement(movement: Parameters<typeof recordInventoryMovement>[0], tx?: Prisma.TransactionClient) {
        return recordInventoryMovement(movement, tx);
    }

    static async recordMaklonCosts(productionOrderId: string, tx: Prisma.TransactionClient) {
        return recordMaklonCosts(productionOrderId, tx);
    }

    /**
     * Generate Closing Entries for a Period
     */
    static async generateClosingEntries(periodId: string, userId: string): Promise<void> {
        return generateClosingEntries(periodId, userId);
    }

    /**
     * Create Year-End Closing Entry
     */
    static async createYearEndClosingEntry(year: number, userId: string): Promise<void> {
        await createYearEndClosingEntry(year, userId);
    }
}
