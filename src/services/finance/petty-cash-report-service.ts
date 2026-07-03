import { prisma } from '@/lib/core/prisma';
import { JournalStatus } from '@prisma/client';
import { resolveAccount } from '@/services/accounting/account-resolver';

export type DailyReportStatus =
    | 'DRAFT'
    | 'READY_TO_PRINT'
    | 'SIGNED_PHYSICAL'
    | 'FINALIZED'
    | 'VOIDED';

export class PettyCashReportService {
    /**
     * Compute date boundaries for a given date at midnight
     */
    private static getDayBounds(date: Date) {
        const startOfDay = new Date(date);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(date);
        endOfDay.setHours(23, 59, 59, 999);
        return { startOfDay, endOfDay };
    }

    /**
     * Get the default Petty Cash account (11110) or throw
     */
    private static async getPettyCashAccount() {
        const resolvedAccount = await resolveAccount('petty-cash');
        const account = await prisma.account.findUnique({ where: { id: resolvedAccount.id } });
        if (!account) throw new Error('Petty Cash account not found');
        return account;
    }

    /**
     * Calculate opening balance from POSTED journal lines before startOfDay
     */
    private static async calcOpeningBalance(accountId: string, startOfDay: Date): Promise<number> {
        const raw = await prisma.journalLine.aggregate({
            where: {
                accountId,
                journalEntry: {
                    status: JournalStatus.POSTED,
                    entryDate: { lt: startOfDay }
                }
            },
            _sum: { debit: true, credit: true }
        });
        const debit = raw._sum?.debit ? Number(raw._sum.debit) : 0;
        const credit = raw._sum?.credit ? Number(raw._sum.credit) : 0;
        return debit - credit;
    }

    /**
     * Calculate daily totals (In / Out) from POSTED journal lines on the given day
     */
    private static async calcDailyTotals(
        accountId: string,
        startOfDay: Date,
        endOfDay: Date
    ): Promise<{ totalIn: number; totalOut: number }> {
        const raw = await prisma.journalLine.aggregate({
            where: {
                accountId,
                journalEntry: {
                    status: JournalStatus.POSTED,
                    entryDate: { gte: startOfDay, lte: endOfDay }
                }
            },
            _sum: { debit: true, credit: true }
        });
        return {
            totalIn: raw._sum?.debit ? Number(raw._sum.debit) : 0,
            totalOut: raw._sum?.credit ? Number(raw._sum.credit) : 0
        };
    }

    /**
     * Fetch daily transactions from journal lines affecting the petty cash account.
     * Returns data in the same shape as PettyCashTransaction for frontend compatibility.
     */
    private static async getDailyTransactionsFromJournals(
        accountId: string,
        startOfDay: Date,
        endOfDay: Date
    ) {
        // Get all journal lines hitting the petty cash account on this date
        const pettyCashLines = await prisma.journalLine.findMany({
            where: {
                accountId,
                journalEntry: {
                    status: JournalStatus.POSTED,
                    entryDate: { gte: startOfDay, lte: endOfDay }
                }
            },
            include: {
                journalEntry: {
                    select: {
                        id: true,
                        entryNumber: true,
                        entryDate: true,
                        description: true,
                        reference: true,
                        createdById: true,
                    }
                }
            },
            orderBy: { journalEntry: { entryDate: 'asc' } }
        });

        if (pettyCashLines.length === 0) return [];

        // For each petty cash line, find the contra-line to get the expense account & description
        const journalEntryIds = [...new Set(pettyCashLines.map(l => l.journalEntryId))];

        const allLines = await prisma.journalLine.findMany({
            where: {
                journalEntryId: { in: journalEntryIds },
                accountId: { not: accountId }
            },
            include: {
                account: { select: { id: true, code: true, name: true } }
            }
        });

        // Group contra-lines by journalEntryId
        const contraLinesByEntry = new Map<string, typeof allLines>();
        for (const line of allLines) {
            const existing = contraLinesByEntry.get(line.journalEntryId) || [];
            existing.push(line);
            contraLinesByEntry.set(line.journalEntryId, existing);
        }

        // Get unique creator IDs for user name lookup
        const creatorIds = [...new Set(
            pettyCashLines.map(l => l.journalEntry.createdById).filter(Boolean)
        )] as string[];

        const creators = creatorIds.length > 0
            ? await prisma.user.findMany({
                where: { id: { in: creatorIds } },
                select: { id: true, name: true }
            })
            : [];

        const creatorMap = new Map(creators.map(u => [u.id, u]));

        // Build transaction-like objects
        return pettyCashLines.map(line => {
            const je = line.journalEntry;
            const pcDebit = Number(line.debit);
            const pcCredit = Number(line.credit);

            // Determine type: debit on petty cash = money in (REPLENISHMENT), credit = money out (EXPENSE)
            const type = pcDebit > 0 ? 'REPLENISHMENT' : 'EXPENSE';
            const amount = pcDebit > 0 ? pcDebit : pcCredit;

            // Find contra-line for expense account info
            const contraLines = contraLinesByEntry.get(line.journalEntryId) || [];
            const expenseLine = type === 'EXPENSE'
                ? contraLines.find(cl => Number(cl.debit) > 0) // expense account is debited
                : contraLines.find(cl => Number(cl.credit) > 0); // bank account is credited

            const creator = je.createdById ? creatorMap.get(je.createdById) : null;

            return {
                id: line.journalEntryId,
                voucherNumber: je.reference || je.entryNumber || '',
                date: je.entryDate.toISOString(),
                description: je.description,
                amount,
                type,
                status: 'POSTED',
                expenseAccount: expenseLine?.account || null,
                createdBy: { name: creator?.name || 'System' },
            };
        });
    }

    /**
     * Get daily petty cash report for a given date.
     * - If a saved report exists, return it with full relations.
     * - If not, compute balances on-the-fly and return savedReport: null.
     */
    static async getDailyReport(date: Date) {
        const { startOfDay, endOfDay } = PettyCashReportService.getDayBounds(date);

        // Check if a saved report exists for this date
        const savedReport = await prisma.pettyCashDailyReport.findFirst({
            where: {
                reportDate: { gte: startOfDay, lte: endOfDay }
            },
            include: {
                createdBy: { select: { id: true, name: true, role: true } },
                readyToPrintBy: { select: { id: true, name: true } },
                physicalSignedConfirmedBy: { select: { id: true, name: true } },
                finalizedBy: { select: { id: true, name: true } },
                voidedBy: { select: { id: true, name: true } },
                transactions: {
                    include: {
                        expenseAccount: true,
                        createdBy: { select: { name: true } }
                    },
                    orderBy: { voucherNumber: 'asc' }
                }
            }
        });

        if (savedReport) {
            return {
                savedReport,
                date: startOfDay,
                openingBalance: Number(savedReport.openingBalance),
                totalIn: Number(savedReport.totalIn),
                totalOut: Number(savedReport.totalOut),
                closingBalance: Number(savedReport.closingBalance),
                transactions: savedReport.transactions,
                status: savedReport.status as DailyReportStatus
            };
        }

        // No saved report — compute on-the-fly (Phase 1 behaviour)
        const account = await PettyCashReportService.getPettyCashAccount();
        const openingBalance = await PettyCashReportService.calcOpeningBalance(account.id, startOfDay);
        const { totalIn, totalOut } = await PettyCashReportService.calcDailyTotals(account.id, startOfDay, endOfDay);
        const closingBalance = openingBalance + totalIn - totalOut;

        // Fetch transactions from journal lines affecting the petty cash account
        const transactions = await PettyCashReportService.getDailyTransactionsFromJournals(
            account.id, startOfDay, endOfDay
        );

        return {
            savedReport: null,
            date: startOfDay,
            openingBalance,
            totalIn,
            totalOut,
            closingBalance,
            transactions,
            status: null
        };
    }

    /**
     * Create (save) a new daily report for a given date.
     * Calculates balances, generates report number, links existing transactions.
     */
    static async createDailyReport(date: Date, userId: string) {
        const { startOfDay, endOfDay } = PettyCashReportService.getDayBounds(date);

        // Prevent duplicate reports
        const existing = await prisma.pettyCashDailyReport.findFirst({
            where: { reportDate: { gte: startOfDay, lte: endOfDay } }
        });
        if (existing) throw new Error('Laporan untuk tanggal ini sudah ada.');

        const account = await PettyCashReportService.getPettyCashAccount();
        const openingBalance = await PettyCashReportService.calcOpeningBalance(account.id, startOfDay);
        const { totalIn, totalOut } = await PettyCashReportService.calcDailyTotals(account.id, startOfDay, endOfDay);
        const closingBalance = openingBalance + totalIn - totalOut;

        // Generate a unique report number: PCRP-YYYYMMDD-XXX
        const dateKey = startOfDay.toISOString().slice(0, 10).replace(/-/g, '');
        const countToday = await prisma.pettyCashDailyReport.count({
            where: { reportNumber: { startsWith: `PCRP-${dateKey}` } }
        });
        const reportNumber = `PCRP-${dateKey}-${String(countToday + 1).padStart(3, '0')}`;

        return await prisma.$transaction(async (tx) => {
            const report = await tx.pettyCashDailyReport.create({
                data: {
                    reportDate: startOfDay,
                    reportNumber,
                    openingBalance,
                    totalIn,
                    totalOut,
                    closingBalance,
                    status: 'DRAFT',
                    createdById: userId
                }
            });

            // Link all petty cash transactions on this date to this report
            await tx.pettyCashTransaction.updateMany({
                where: {
                    date: { gte: startOfDay, lte: endOfDay },
                    pettyCashDailyReportId: null
                },
                data: { pettyCashDailyReportId: report.id }
            });

            return report;
        });
    }

    /**
     * Generic status transition helper with guard
     */
    private static async transition(
        id: string,
        allowedCurrentStatus: DailyReportStatus,
        nextStatus: DailyReportStatus,
        fields: Record<string, unknown>
    ) {
        const report = await prisma.pettyCashDailyReport.findUnique({ where: { id } });
        if (!report) throw new Error('Laporan tidak ditemukan.');
        if (report.status !== allowedCurrentStatus) {
            throw new Error(
                `Aksi tidak valid. Status laporan saat ini adalah "${report.status}", bukan "${allowedCurrentStatus}".`
            );
        }
        return await prisma.pettyCashDailyReport.update({
            where: { id },
            data: { status: nextStatus, ...fields }
        });
    }

    /** DRAFT → READY_TO_PRINT */
    static async markReadyToPrint(id: string, userId: string) {
        return PettyCashReportService.transition(id, 'DRAFT', 'READY_TO_PRINT', {
            readyToPrintById: userId,
            readyToPrintAt: new Date()
        });
    }

    /** READY_TO_PRINT → SIGNED_PHYSICAL */
    static async confirmPhysicalSignature(id: string, userId: string) {
        return PettyCashReportService.transition(id, 'READY_TO_PRINT', 'SIGNED_PHYSICAL', {
            physicalSignedConfirmedById: userId,
            physicalSignedConfirmedAt: new Date()
        });
    }

    /** SIGNED_PHYSICAL → FINALIZED */
    static async finalizeDailyReport(id: string, userId: string) {
        return PettyCashReportService.transition(id, 'SIGNED_PHYSICAL', 'FINALIZED', {
            finalizedById: userId,
            finalizedAt: new Date()
        });
    }

    /** Any non-FINALIZED → VOIDED */
    static async voidDailyReport(id: string, userId: string) {
        const report = await prisma.pettyCashDailyReport.findUnique({ where: { id } });
        if (!report) throw new Error('Laporan tidak ditemukan.');
        if (report.status === 'FINALIZED') throw new Error('Laporan yang sudah FINALIZED tidak dapat di-void.');
        if (report.status === 'VOIDED') throw new Error('Laporan sudah VOIDED.');
        return await prisma.pettyCashDailyReport.update({
            where: { id },
            data: {
                status: 'VOIDED',
                voidedById: userId,
                voidedAt: new Date()
            }
        });
    }
}
