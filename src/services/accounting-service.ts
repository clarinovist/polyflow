import { AccountType, AccountCategory, JournalStatus } from '@prisma/client';
import type { CreateJournalEntryInput } from './accounting/types';
import {
    createJournalEntry,
    postJournal,
    voidJournal,
    reverseJournal,
    createBulkJournalEntries,
    getJournals,
    getJournalById
} from './accounting/journals-service';
import { getChartOfAccounts, createAccount, updateAccount, deleteAccount } from './accounting/coa-service';
import { getTrialBalance, getIncomeStatement, getBalanceSheet, getAccountBalance } from './accounting/reports-service';
import { getFiscalPeriods, createFiscalPeriod, closeFiscalPeriod, isPeriodOpen } from './accounting/periods-service';
import { recordInventoryMovement } from './accounting/inventory-link-service';

export type { CreateJournalEntryInput } from './accounting/types';

export class AccountingService {

    /**
     * Create a new Journal Entry.
     * Default Status: DRAFT
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    static async createJournalEntry(input: CreateJournalEntryInput, tx?: any) {
        return createJournalEntry(input, tx);
    }

    /**
     * Post a Journal Entry (DRAFT -> POSTED)
     */
    static async postJournal(id: string, userId?: string) {
        return postJournal(id, userId);
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

    static async getJournals(params?: { startDate?: Date, endDate?: Date, status?: JournalStatus, reference?: string }) {
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

    static async getAccountBalance(accountId: string, startDate?: Date, endDate?: Date) {
        return getAccountBalance(accountId, startDate, endDate);
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    static async recordInventoryMovement(movement: any, tx?: any) {
        return recordInventoryMovement(movement, tx);
    }
}
