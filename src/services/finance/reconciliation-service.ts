import { prisma } from '@/lib/core/prisma';
import { JournalStatus } from '@prisma/client';

export interface BankStatementRow {
    id: string; // client-generated ID for tracking
    date: Date;
    description: string;
    amount: number; // positive = inflow/debit to bank, negative = outflow/credit to bank
}

export interface MatchResult {
    statementRow: BankStatementRow;
    matchedJournalLineId?: string;
    confidence: number; // 0-100%
    candidates: Record<string, unknown>[];
}

export class ReconciliationService {
    /**
     * Auto-match bank statement rows against un-reconciled journal lines for a specific Bank Account
     */
    static async autoMatch(accountId: string, startDate: Date, endDate: Date, statements: BankStatementRow[]): Promise<MatchResult[]> {
        // Fetch journal lines for this account that are not yet reconciled
        // For prototype, we assume we just match against any POSTED journal entry in that date range
        // Since we don't have an `isReconciled` flag in JournalLine, we just find potential matches.
        
        const journalLines = await prisma.journalLine.findMany({
            where: {
                accountId,
                journalEntry: {
                    status: JournalStatus.POSTED,
                    entryDate: {
                        gte: startDate,
                        lte: endDate
                    }
                }
            },
            include: {
                journalEntry: true
            }
        });

        const results: MatchResult[] = [];

        for (const row of statements) {
            // Amount in journal: Debit is positive balance for Asset (Bank)
            // So if row.amount > 0, we look for Debit = row.amount
            // If row.amount < 0, we look for Credit = Math.abs(row.amount)
            
            const targetDebit = row.amount > 0 ? row.amount : 0;
            const targetCredit = row.amount < 0 ? Math.abs(row.amount) : 0;

            const candidates = journalLines.filter(line => {
                const lineDebit = line.debit ? line.debit.toNumber() : 0;
                const lineCredit = line.credit ? line.credit.toNumber() : 0;
                
                // Match amount
                if (lineDebit !== targetDebit) return false;
                if (lineCredit !== targetCredit) return false;

                // Match date (within 3 days)
                const daysDiff = Math.abs(line.journalEntry.entryDate.getTime() - row.date.getTime()) / (1000 * 3600 * 24);
                return daysDiff <= 3;
            });

            if (candidates.length === 1) {
                results.push({
                    statementRow: row,
                    matchedJournalLineId: candidates[0].id,
                    confidence: 100, // Exact amount and within 3 days
                    candidates
                });
            } else if (candidates.length > 1) {
                // Return all candidates for manual review
                results.push({
                    statementRow: row,
                    confidence: 50, // Multiple exact amount matches
                    candidates
                });
            } else {
                results.push({
                    statementRow: row,
                    confidence: 0,
                    candidates: []
                });
            }
        }

        return results;
    }
}
