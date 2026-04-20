'use server';

import { revalidatePath } from 'next/cache';

import { withTenant } from '@/lib/core/tenant';
import { prisma } from '@/lib/core/prisma';
import { logger } from '@/lib/config/logger';
import { BusinessRuleError, safeAction } from '@/lib/errors/errors';
import { requireAuth } from '@/lib/tools/auth-checks';

import {
    CreateOpeningBalanceInput,
    OPENING_BALANCE_ACCOUNT_CODE,
    UnifiedMakeOpeningBalanceInput,
} from './opening-balance-types';
import {
    assertNoDuplicateOpeningBalanceEntries,
    createAPOpeningBalance,
    createAROpeningBalance,
    ensureOpeningBalanceEquityAccount,
    getSubLedgerAccountOrThrow,
    postGeneralOpeningBalanceJournal,
} from './opening-balance-create-helpers';

export const getAccountsForOpeningBalance = withTenant(
async function getAccountsForOpeningBalance() {
    return safeAction(async () => {
        await requireAuth();
        const accounts = await prisma.account.findMany({
            where: {
                code: { not: OPENING_BALANCE_ACCOUNT_CODE }
            },
            orderBy: [{ type: 'asc' }, { code: 'asc' }],
            select: { id: true, code: true, name: true, type: true, category: true }
        });
        return accounts;
    });
}
);

export const saveUnifiedOpeningBalance = withTenant(
async function saveUnifiedOpeningBalance(data: UnifiedMakeOpeningBalanceInput) {
    return safeAction(async () => {
        const session = await requireAuth();

        await assertNoDuplicateOpeningBalanceEntries(data);

        try {
            await prisma.$transaction(async (tx) => {
                const equityAccount = await ensureOpeningBalanceEquityAccount(tx);

                if (data.arEntries.length > 0) {
                    const subLedgerAccount = await getSubLedgerAccountOrThrow(tx, 'AR');

                    for (const entry of data.arEntries) {
                        await createAROpeningBalance(entry, session.user.id, equityAccount.id, subLedgerAccount.id, tx);
                    }
                }

                if (data.apEntries.length > 0) {
                    const subLedgerAccount = await getSubLedgerAccountOrThrow(tx, 'AP');

                    for (const entry of data.apEntries) {
                        await createAPOpeningBalance(entry, session.user.id, equityAccount.id, subLedgerAccount.id, tx);
                    }
                }

                await postGeneralOpeningBalanceJournal(data, equityAccount.id, session.user.id, tx);
            }, { timeout: 20000 });

            revalidatePath('/finance');
            revalidatePath('/finance/reports/balance-sheet');
            revalidatePath('/finance/opening-balance');
            return { message: 'Opening balance saved successfully' };
        } catch (error) {
            if (error instanceof BusinessRuleError) throw error;
            logger.error('Failed to save unified opening balance', { error, module: 'OpeningBalanceActions' });
            throw new BusinessRuleError('Failed to save opening balance. Please verify entries.');
        }
    });
}
);

export const createOpeningBalance = withTenant(
async function createOpeningBalance(data: CreateOpeningBalanceInput) {
    return safeAction(async () => {
        const session = await requireAuth();

        try {
            const equityAccount = await ensureOpeningBalanceEquityAccount(prisma);
            const subLedgerAccount = await getSubLedgerAccountOrThrow(prisma, data.type);

            await prisma.$transaction(async (tx) => {
                if (data.type === 'AR') {
                    await createAROpeningBalance(data, session.user.id, equityAccount.id, subLedgerAccount.id, tx);
                } else {
                    await createAPOpeningBalance(data, session.user.id, equityAccount.id, subLedgerAccount.id, tx);
                }
            });

            revalidatePath('/finance');
            revalidatePath('/finance/reports/balance-sheet');
            return { message: 'Opening balance created successfully' };
        } catch (error) {
            logger.error('Failed to create opening balance', { error, module: 'OpeningBalanceActions' });
            throw new BusinessRuleError('Failed to create opening balance. Please try again.');
        }
    });
}
);