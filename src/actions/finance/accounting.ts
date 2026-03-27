'use server';

import { withTenant } from "@/lib/core/tenant";
import { AccountingService, CreateJournalEntryInput } from '@/services/accounting/accounting-service';
import { requireAuth } from '@/lib/tools/auth-checks';
import { serializeData } from '@/lib/utils/utils';
import { revalidatePath } from 'next/cache';
import { logger } from '@/lib/config/logger';

import { AccountType, AccountCategory } from '@prisma/client';
import { safeAction, BusinessRuleError } from '@/lib/errors/errors';
import { FixedAssetService } from '@/services/finance/fixed-asset-service';
import { BudgetService } from '@/services/finance/budget-service';

export const getChartOfAccounts = withTenant(
async function getChartOfAccounts() {
    return safeAction(async () => {
        await requireAuth();
        const accounts = await AccountingService.getChartOfAccounts();
        return serializeData(accounts);
    });
}
);

export const createAccount = withTenant(
async function createAccount(data: { code: string; name: string; type: AccountType; category: AccountCategory; description?: string }) {
    return safeAction(async () => {
        await requireAuth();
        try {
            const account = await AccountingService.createAccount(data);
            revalidatePath('/finance/coa');
            return serializeData(account);
        } catch (error) {
            throw new BusinessRuleError(error instanceof Error ? error.message : 'Unknown error');
        }
    });
}
);

export const updateAccount = withTenant(
async function updateAccount(id: string, data: { code?: string; name?: string; type?: AccountType; category?: AccountCategory; description?: string }) {
    return safeAction(async () => {
        await requireAuth();
        try {
            const account = await AccountingService.updateAccount(id, data);
            revalidatePath('/finance/coa');
            return serializeData(account);
        } catch (error) {
            throw new BusinessRuleError(error instanceof Error ? error.message : 'Unknown error');
        }
    });
}
);

export const deleteAccount = withTenant(
async function deleteAccount(id: string) {
    return safeAction(async () => {
        await requireAuth();
        try {
            await AccountingService.deleteAccount(id);
            revalidatePath('/finance/coa');
        } catch (error) {
            throw new BusinessRuleError(error instanceof Error ? error.message : 'Unknown error');
        }
    });
}
);

export const createManualJournalEntry = withTenant(
async function createManualJournalEntry(data: CreateJournalEntryInput) {
    return safeAction(async () => {
        const session = await requireAuth();

        try {
            const entry = await AccountingService.createJournalEntry({
                ...data,
                createdById: session.user?.id
            });

            revalidatePath('/finance/journals');
            return serializeData(entry);
        } catch (error) {
            logger.error('Failed to create manual journal entry', { error, module: 'AccountingActions' });
            throw new BusinessRuleError('Failed to create journal entry. Please check input data.');
        }
    });
}
);

export const getAccountBalance = withTenant(
async function getAccountBalance(accountId: string, startDate?: Date, endDate?: Date) {
    return safeAction(async () => {
        await requireAuth();
        const balance = await AccountingService.getAccountBalance(accountId, startDate, endDate);
        return balance;
    });
}
);

export const getTrialBalance = withTenant(
async function getTrialBalance(startDate?: Date, endDate?: Date) {
    return safeAction(async () => {
        await requireAuth();
        const data = await AccountingService.getTrialBalance(startDate, endDate);
        return serializeData(data);
    });
}
);

export const getIncomeStatement = withTenant(
async function getIncomeStatement(startDate: Date, endDate: Date) {
    return safeAction(async () => {
        await requireAuth();
        // Ensure dates are dates (serialization might make them strings if passed from client directly differently)
        const start = new Date(startDate);
        const end = new Date(endDate);
        const data = await AccountingService.getIncomeStatement(start, end);
        return serializeData(data);
    });
}
);

export const getBalanceSheet = withTenant(
async function getBalanceSheet(asOfDate: Date) {
    return safeAction(async () => {
        await requireAuth();
        const date = new Date(asOfDate);
        const data = await AccountingService.getBalanceSheet(date);
        return serializeData(data);
    });
}
);

export const getFiscalPeriods = withTenant(
async function getFiscalPeriods() {
    return safeAction(async () => {
        await requireAuth();
        const periods = await AccountingService.getFiscalPeriods();
        return serializeData(periods);
    });
}
);

export const createFiscalPeriod = withTenant(
async function createFiscalPeriod(year: number, month: number) {
    return safeAction(async () => {
        await requireAuth();
        try {
            const period = await AccountingService.createFiscalPeriod(year, month);
            revalidatePath('/finance/periods');
            return serializeData(period);
        } catch (error) {
            throw new BusinessRuleError(error instanceof Error ? error.message : 'Unknown error');
        }
    });
}
);

export const closeFiscalPeriod = withTenant(
async function closeFiscalPeriod(id: string) {
    return safeAction(async () => {
        const session = await requireAuth();
        try {
            const period = await AccountingService.closeFiscalPeriod(id, session.user.id);
            revalidatePath('/finance/periods');
            revalidatePath('/finance/journals');
            return serializeData(period);
        } catch (error) {
            throw new BusinessRuleError(error instanceof Error ? error.message : 'Unknown error');
        }
    });
}
);

export const createYearEndClosingEntry = withTenant(
async function createYearEndClosingEntry(year: number) {
    return safeAction(async () => {
        const session = await requireAuth();
        try {
            await AccountingService.createYearEndClosingEntry(year, session.user.id);
            revalidatePath('/finance/journals');
            revalidatePath('/finance/coa');
        } catch (error) {
            throw new BusinessRuleError(error instanceof Error ? error.message : 'Unknown error');
        }
    });
}
);

export const getFixedAssets = withTenant(
async function getFixedAssets() {
    return safeAction(async () => {
        await requireAuth();
        const assets = await FixedAssetService.getAssets();
        return serializeData(assets);
    });
}
);

export const createFixedAsset = withTenant(
async function createFixedAsset(data: {
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
    return safeAction(async () => {
        await requireAuth();
        try {
            const asset = await FixedAssetService.createAsset(data);
            revalidatePath('/finance/assets');
            return serializeData(asset);
        } catch (error) {
            throw new BusinessRuleError(error instanceof Error ? error.message : 'Unknown error');
        }
    });
}
);

export const runDepreciation = withTenant(
async function runDepreciation(year: number, month: number) {
    return safeAction(async () => {
        const session = await requireAuth();
        try {
            const results = await FixedAssetService.runDepreciation(year, month, session.user.id);
            revalidatePath('/finance/assets');
            revalidatePath('/finance/journals');
            return { count: results.length };
        } catch (error) {
            throw new BusinessRuleError(error instanceof Error ? error.message : 'Unknown error');
        }
    });
}
);

export const getBudgets = withTenant(
async function getBudgets(year: number, month: number) {
    return safeAction(async () => {
        await requireAuth();
        const data = await BudgetService.getBudgets(year, month);
        return serializeData(data);
    });
}
);

export const setBudget = withTenant(
async function setBudget(data: { accountId: string, year: number, month: number, amount: number }) {
    return safeAction(async () => {
        await requireAuth();
        try {
            const budget = await BudgetService.setBudget(data);
            revalidatePath('/finance/budget');
            return serializeData(budget);
        } catch (error) {
            throw new BusinessRuleError(error instanceof Error ? error.message : 'Unknown error');
        }
    });
}
);

export const getBudgetVariance = withTenant(
async function getBudgetVariance(year: number, month: number) {
    return safeAction(async () => {
        await requireAuth();
        const data = await BudgetService.getVarianceReport(year, month);
        return serializeData(data);
    });
}
);

export const getAccountingDashboardData = withTenant(
async function getAccountingDashboardData() {
    return safeAction(async () => {
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
        const recentJournalsRes = await AccountingService.getJournals({ status: 'POSTED', limit: 5 });

        return serializeData({
            performance: {
                revenue: performance.totalRevenue,
                expense: performance.totalCOGS + performance.totalOpEx + performance.totalOther,
                netIncome: performance.netIncome
            },
            balances: {
                cash: cashBalance,
                ar: arBalance,
                ap: apBalance
            },
            recentJournals: recentJournalsRes.data
        });
    });
}
);
