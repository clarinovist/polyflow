import { prisma } from '@/lib/core/prisma';
import { JournalStatus } from '@prisma/client';

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
        // Find Tax Accounts based on COA Seed
        // 21310: VAT Output (PPN Keluaran)
        // 21320: VAT Input (PPN Masukan)
        // 21330: Income Tax Payable (PPh 21)
        
        const taxAccounts = await prisma.account.findMany({
            where: {
                code: {
                    in: ['21310', '21320', '21330']
                }
            }
        });

        const vatOutAcc = taxAccounts.find(a => a.code === '21310');
        const vatInAcc = taxAccounts.find(a => a.code === '21320');
        const pph21Acc = taxAccounts.find(a => a.code === '21330');

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

        const vatOutputBalance = await getNetBalance(vatOutAcc?.id);
        const vatInputBalance = await getNetBalance(vatInAcc?.id);
        const incomeTaxPayable = await getNetBalance(pph21Acc?.id);

        // Net VAT Payable = VAT Output (What we collected) - VAT Input (What we paid)
        // Wait, VAT Input is an asset-like mechanism during computation but it sits in Liability as negative usually, 
        // OR it's a debit in the 21320 account. If it's a liability account, a payment of VAT (Input) is a DEBIT.
        // So Credit - Debit for 21320 would be NEGATIVE if we only have VAT Input debits.
        // Let's ensure proper formula: VAT Payable = VAT Output (Credit Bal) - VAT Input (Debit Bal).
        // If vatInputBalance is (Credit - Debit), it will be negative. 
        // So Net VAT Payable = vatOutputBalance + vatInputBalance
        
        // Actually, if we bought goods, Accounts Payable is Credited, VAT Input is Debited. 
        // So for 21320, Debit > Credit. So (Cr - Dr) is Negative.
        // Net VAT = VAT Output (Positive) + VAT Input (Negative) 
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
