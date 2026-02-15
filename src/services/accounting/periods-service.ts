import { prisma } from '@/lib/prisma';

export async function getFiscalPeriods() {
    return await prisma.fiscalPeriod.findMany({
        orderBy: [{ year: 'desc' }, { month: 'desc' }]
    });
}

export async function createFiscalPeriod(year: number, month: number) {
    const name = new Date(year, month - 1).toLocaleString('default', { month: 'long', year: 'numeric' });
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    return await prisma.fiscalPeriod.create({
        data: {
            name,
            year,
            month,
            startDate,
            endDate,
            status: 'OPEN'
        }
    });
}

export async function closeFiscalPeriod(id: string, userId: string) {
    // Generate Closing Journal Entries
    await generateClosingEntries(id, userId);

    return await prisma.fiscalPeriod.update({
        where: { id },
        data: {
            status: 'CLOSED',
            closedById: userId,
            closedAt: new Date()
        }
    });
}

import { Prisma } from '@prisma/client';

export async function isPeriodOpen(date: Date, tx?: Prisma.TransactionClient): Promise<boolean> {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    const db = tx || prisma;

    const period = await db.fiscalPeriod.findUnique({
        where: { year_month: { year, month } }
    });

    if (!period) return true;

    return period.status === 'OPEN';
}

/**
 * Generate Closing Entries for a Closed Period
 * - Calculates Total Revenue and Total Expense
 * - Creates a Journal Entry to zero out P&L accounts
 * - Posts the difference to Retained Earnings (32000)
 */
export async function generateClosingEntries(periodId: string, userId: string): Promise<void> {
    const period = await prisma.fiscalPeriod.findUnique({
        where: { id: periodId }
    });

    if (!period) throw new Error("Fiscal period not found");

    console.log(`Closing Period: ${period.name} | Start: ${period.startDate.toISOString()} | End: ${period.endDate.toISOString()}`);

    // 1. Calculate Net Balances using GroupBy (More efficient)
    const balances = await prisma.journalLine.groupBy({
        by: ['accountId'],
        where: {
            journalEntry: {
                entryDate: {
                    gte: period.startDate,
                    lte: period.endDate
                },
                status: 'POSTED',
                // Exclude previous closing entries
                reference: { not: { startsWith: 'CLOSE-' } }
            },
            account: {
                type: { in: ['REVENUE', 'EXPENSE'] }
            }
        },
        _sum: {
            debit: true,
            credit: true
        }
    });

    console.log(`Found ${balances.length} P&L accounts with activity in period ${period.id}`);

    let _totalRevenue = 0;
    let _totalExpense = 0;
    const closingLines: { accountId: string; debit: number; credit: number; description: string }[] = [];

    // 2. Prepare Closing Lines
    for (const b of balances) {
        const account = await prisma.account.findUnique({ where: { id: b.accountId } });
        if (!account) continue;

        const isRevenue = account.type === 'REVENUE';
        const totalDebit = Number(b._sum.debit || 0);
        const totalCredit = Number(b._sum.credit || 0);
        const netCreditParams = totalCredit - totalDebit; // Revenue is Credit Normal

        console.log(`Account ${account.code} (${account.name}): D=${totalDebit}, C=${totalCredit}, NetCredit=${netCreditParams}`);

        if (Math.abs(netCreditParams) < 0.01) continue; // Skip balanced accounts

        if (netCreditParams > 0) {
            // Account has Credit Balance (e.g. Revenue) -> We Debit it to close
            closingLines.push({
                accountId: account.id,
                debit: netCreditParams,
                credit: 0,
                description: `Closing Entry for ${period.name}`
            });
            if (isRevenue) _totalRevenue += netCreditParams;
            else _totalExpense -= netCreditParams; // Expense having credit balance is unusual (contra expense)
        } else {
            // Account has Debit Balance (e.g. Expense) -> We Credit it to close
            const netDebit = Math.abs(netCreditParams);
            closingLines.push({
                accountId: account.id,
                debit: 0,
                credit: netDebit,
                description: `Closing Entry for ${period.name}`
            });
            if (!isRevenue) _totalExpense += netDebit;
            else _totalRevenue -= netDebit; // Revenue having debit balance (returns)
        }
    }

    if (closingLines.length === 0) {
        console.log("No partial balances to close for this period.");
        return;
    }

    // 3. Calculate Retained Earnings Impact
    // Total Debit in Closing Entry must equal Total Credit
    const totalClosingDebit = closingLines.reduce((sum, l) => sum + l.debit, 0);
    const totalClosingCredit = closingLines.reduce((sum, l) => sum + l.credit, 0);
    const netResult = totalClosingDebit - totalClosingCredit;

    // If Debit > Credit (Net Income), we verify logic:
    // We debited Revenue (moved out) and credited Expense (moved out).
    // If Revenue (Credit Normal) > Expense (Debit Normal), then we Debited MORE than we Credited.
    // So NetResult > 0 (Positive).
    // To balance this, we need to CREDIT Retained Earnings.

    // Get Retained Earnings Account (Account Code 32000)
    const retainedEarningsAccount = await prisma.account.findFirst({
        where: { code: '32000' }
    });

    if (!retainedEarningsAccount) {
        throw new Error("Retained Earnings Account (32000) not found in COA");
    }

    if (Math.abs(netResult) > 0.01) {
        if (netResult > 0) {
            // Need Credit to balance
            closingLines.push({
                accountId: retainedEarningsAccount.id,
                debit: 0,
                credit: netResult,
                description: `Net Income Transfer - ${period.name}`
            });
        } else {
            // Need Debit to balance (Net Loss)
            closingLines.push({
                accountId: retainedEarningsAccount.id,
                debit: Math.abs(netResult),
                credit: 0,
                description: `Net Loss Transfer - ${period.name}`
            });
        }
    }

    // 4. Create the Journal Entry
    await prisma.$transaction(async (tx) => {
        // Delete existing closing entry if any (Re-close capability)
        const ref = `CLOSE-${period.year}-${String(period.month).padStart(2, '0')}`;
        const existing = await tx.journalEntry.findFirst({
            where: { reference: ref }
        });

        if (existing) {
            // Void or Delete? Delete to keep clean history for re-runs
            await tx.journalLine.deleteMany({ where: { journalEntryId: existing.id } });
            await tx.journalEntry.delete({ where: { id: existing.id } });
        }

        const journal = await tx.journalEntry.create({
            data: {
                entryNumber: ref, // Use reference as entry number for closing
                entryDate: period.endDate, // Last second of the month
                reference: ref,
                description: `Closing Entries for Fiscal Period ${period.name}`,
                status: 'POSTED', // Auto-post
                createdById: userId
            }
        });

        console.log(`Creating Closing Journal: ${ref} with ${closingLines.length} lines.`);

        await tx.journalLine.createMany({
            data: closingLines.map(line => ({
                journalEntryId: journal.id,
                accountId: line.accountId,
                debit: line.debit,
                credit: line.credit,
                description: line.description
            }))
        });
    });
}
