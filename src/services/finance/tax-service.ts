import { prisma } from '@/lib/core/prisma';
import { JournalStatus } from '@prisma/client';
import { resolveAccount } from '@/services/accounting/account-resolver';

export interface TaxReportSummary {
    vatOutputBalance: number;
    vatInputBalance: number;
    netVatPayable: number;
    incomeTaxPayable: number;
    periodStart: Date;
    periodEnd: Date;
}

export class TaxService {
    /**
     * Get Tax Summary Report (VAT and Income Tax bounds for a given period)
     */
    static async getTaxSummary(startDate: Date, endDate: Date): Promise<TaxReportSummary> {
        const vatOutResolved = await resolveAccount('vat-output');
        const vatInResolved = await resolveAccount('vat-input');
        const pph21Resolved = await resolveAccount('income-tax');

        const getNetBalance = async (accountId: string | undefined) => {
            if (!accountId) return 0;

            const result = await prisma.journalLine.aggregate({
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
                _sum: {
                    debit: true,
                    credit: true
                }
            });

            // For liabilities, Net Balance = Credit - Debit
            const cr = result._sum?.credit ? result._sum.credit.toNumber() : 0;
            const dr = result._sum?.debit ? result._sum.debit.toNumber() : 0;
            return cr - dr;
        };

        const vatOutputBalance = await getNetBalance(vatOutResolved?.id);
        const vatInputBalance = await getNetBalance(vatInResolved?.id);
        const incomeTaxPayable = await getNetBalance(pph21Resolved?.id);

        // Net VAT Payable = VAT Output (collected) + VAT Input (paid, negative balance)
        const netVatPayable = vatOutputBalance + vatInputBalance;

        return {
            vatOutputBalance,
            vatInputBalance,
            netVatPayable,
            incomeTaxPayable,
            periodStart: startDate,
            periodEnd: endDate
        };
    }
}
