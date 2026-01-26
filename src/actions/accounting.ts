'use server';

import { AccountingService, CreateJournalEntryInput } from '@/services/accounting-service';
import { requireAuth } from '@/lib/auth-checks';
import { serializeData } from '@/lib/utils';
import { revalidatePath } from 'next/cache';

import { AccountType, AccountCategory } from '@prisma/client';

export async function getChartOfAccounts() {
    await requireAuth();
    const accounts = await AccountingService.getChartOfAccounts();
    return serializeData(accounts);
}

export async function createAccount(data: { code: string; name: string; type: AccountType; category: AccountCategory; description?: string }) {
    await requireAuth();
    try {
        const account = await AccountingService.createAccount(data);
        revalidatePath('/finance/coa');
        return { success: true, data: serializeData(account) };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

export async function updateAccount(id: string, data: { code?: string; name?: string; type?: AccountType; category?: AccountCategory; description?: string }) {
    await requireAuth();
    try {
        const account = await AccountingService.updateAccount(id, data);
        revalidatePath('/finance/coa');
        return { success: true, data: serializeData(account) };
    } catch (error) {
        // ... (rest same)
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

export async function deleteAccount(id: string) {
    await requireAuth();
    try {
        await AccountingService.deleteAccount(id);
        revalidatePath('/finance/coa');
        return { success: true };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

export async function createManualJournalEntry(data: CreateJournalEntryInput) {
    const session = await requireAuth();

    try {
        const entry = await AccountingService.createJournalEntry({
            ...data,
            createdById: session.user?.id
        });

        revalidatePath('/finance/journal-entries');
        return { success: true, data: serializeData(entry) };
    } catch (error) {
        console.error('Failed to create journal entry:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

export async function getAccountBalance(accountId: string, startDate?: Date, endDate?: Date) {
    await requireAuth();
    const balance = await AccountingService.getAccountBalance(accountId, startDate, endDate);
    return balance;
}

export async function getTrialBalance(startDate?: Date, endDate?: Date) {
    await requireAuth();
    const data = await AccountingService.getTrialBalance(startDate, endDate);
    return serializeData(data);
}

export async function getIncomeStatement(startDate: Date, endDate: Date) {
    await requireAuth();
    // Ensure dates are dates (serialization might make them strings if passed from client directly differently)
    const start = new Date(startDate);
    const end = new Date(endDate);
    const data = await AccountingService.getIncomeStatement(start, end);
    return serializeData(data);
}

export async function getBalanceSheet(asOfDate: Date) {
    await requireAuth();
    const date = new Date(asOfDate);
    const data = await AccountingService.getBalanceSheet(date);
    return serializeData(data);
}



export async function getFiscalPeriods() {
    await requireAuth();
    const periods = await AccountingService.getFiscalPeriods();
    return serializeData(periods);
}

export async function createFiscalPeriod(year: number, month: number) {
    await requireAuth();
    try {
        const period = await AccountingService.createFiscalPeriod(year, month);
        revalidatePath('/finance/periods');
        return { success: true, data: serializeData(period) };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

export async function closeFiscalPeriod(id: string) {
    const session = await requireAuth();
    try {
        const period = await AccountingService.closeFiscalPeriod(id, session.user.id);
        revalidatePath('/finance/periods');
        revalidatePath('/finance/journals');
        return { success: true, data: serializeData(period) };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

import { FixedAssetService } from '@/services/finance/fixed-asset-service';

export async function getFixedAssets() {
    await requireAuth();
    const assets = await FixedAssetService.getAssets();
    return serializeData(assets);
}

export async function createFixedAsset(data: {
    assetCode: string;
    name: string;
    category: string;
    purchaseDate: Date;
    purchaseValue: number;
    usefulLifeMonths: number;
    assetAccountId: string;
    depreciationAccountId: string;
    accumulatedDepreciationAccountId: string;
}) {
    await requireAuth();
    try {
        const asset = await FixedAssetService.createAsset(data);
        revalidatePath('/finance/assets');
        return { success: true, data: serializeData(asset) };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

export async function runDepreciation(year: number, month: number) {
    const session = await requireAuth();
    try {
        const results = await FixedAssetService.runDepreciation(year, month, session.user.id);
        revalidatePath('/finance/assets');
        revalidatePath('/finance/journals');
        return { success: true, count: results.length };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

import { BudgetService } from '@/services/finance/budget-service';

export async function getBudgets(year: number, month: number) {
    await requireAuth();
    const data = await BudgetService.getBudgets(year, month);
    return serializeData(data);
}

export async function setBudget(data: { accountId: string, year: number, month: number, amount: number }) {
    await requireAuth();
    try {
        const budget = await BudgetService.setBudget(data);
        revalidatePath('/finance/budget');
        return { success: true, data: serializeData(budget) };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

export async function getBudgetVariance(year: number, month: number) {
    await requireAuth();
    const data = await BudgetService.getVarianceReport(year, month);
    return serializeData(data);
}

export async function getAccountingDashboardData() {
    await requireAuth();

    // 1. Get today, start of month, etc.
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // 2. Fetch MTD Performance
    const performance = await AccountingService.getIncomeStatement(startOfMonth, now);

    // 3. Fetch specific critical account group balances
    // Cash/Bank (Current Assets with isCashAccount=true often, or mapping)
    // For now, let's just use service methods
    const coa = await AccountingService.getChartOfAccounts();

    const cashAccounts = coa.filter((a: { isCashAccount: boolean }) => a.isCashAccount);
    // Filter by codes seeded in seed-coa.ts
    const arAccounts = coa.filter((a: { code: string }) => a.code.startsWith('112')); // Accounts Receivable group
    const apAccounts = coa.filter((a: { code: string }) => a.code.startsWith('211')); // Accounts Payable group

    const getBalance = async (accs: { id: string }[]) => {
        let total = 0;
        for (const a of accs) {
            total += await AccountingService.getAccountBalance(a.id);
        }
        return total;
    };

    const [cashBalance, arBalance, apBalance] = await Promise.all([
        getBalance(cashAccounts),
        getBalance(arAccounts),
        getBalance(apAccounts)
    ]);

    // 4. Recent Journals
    const recentJournals = await AccountingService.getJournals({ status: 'POSTED' });

    return serializeData({
        performance: {
            revenue: performance.totalRevenue,
            expense: performance.totalExpense,
            netIncome: performance.netIncome
        },
        balances: {
            cash: cashBalance,
            ar: arBalance,
            ap: apBalance
        },
        recentJournals: recentJournals.slice(0, 5)
    });
}
