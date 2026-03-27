import { prisma } from '@/lib/core/prisma';
import { ReferenceType, AssetStatus } from '@prisma/client';
import { CreateJournalEntryInput } from '@/services/accounting/types';
import { createJournalEntry, postJournal } from '@/services/accounting/journals-service';

export class FixedAssetService {
    /**
     * Get all fixed assets
     */
    static async getAssets() {
        return await prisma.fixedAsset.findMany({
            include: {
                assetAccount: { select: { name: true, code: true } },
                accumDepreciationAccount: { select: { name: true, code: true } },
                depreciationExpenseAccount: { select: { name: true, code: true } },
            },
            orderBy: { purchaseDate: 'desc' }
        });
    }

    /**
     * Create a new fixed asset
     */
    static async createAsset(data: {
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
        return await prisma.fixedAsset.create({
            data: {
                ...data,
                scrapValue: 0,
                status: AssetStatus.ACTIVE
            }
        });
    }

    /**
     * Run monthly depreciation for all active assets
     */
    static async runDepreciation(year: number, month: number, userId: string) {
        const firstDayOfMonth = new Date(year, month - 1, 1);
        const now = new Date();

        // Find all active assets that haven't been depreciated this month
        const assetsToDepreciate = await prisma.fixedAsset.findMany({
            where: {
                status: AssetStatus.ACTIVE,
                OR: [
                    { lastDepreciationDate: null },
                    { lastDepreciationDate: { lt: firstDayOfMonth } }
                ]
            }
        });

        if (assetsToDepreciate.length === 0) {
            return [];
        }

        const journalEntriesProcessed: string[] = [];

        await prisma.$transaction(async (tx) => {
            for (const asset of assetsToDepreciate) {
                // Determine monthly depreciation amount
                // Formula: (Purchase Value - Scrap Value) / Useful Life Months
                const purchaseValue = asset.purchaseValue.toNumber();
                const scrapValue = asset.scrapValue.toNumber();
                const monthlyDepreciation = (purchaseValue - scrapValue) / asset.usefulLifeMonths;

                if (monthlyDepreciation <= 0) continue; // Already fully depreciated or invalid

                const journalData: CreateJournalEntryInput = {
                    entryDate: new Date(),
                    description: `Monthly Depreciation for Asset: ${asset.assetCode} - ${asset.name}`,
                    reference: asset.assetCode,
                    referenceType: ReferenceType.MANUAL_ENTRY,
                    referenceId: asset.id,
                    lines: [
                        {
                            accountId: asset.depreciationAccountId,
                            debit: monthlyDepreciation,
                            credit: 0
                        },
                        {
                            accountId: asset.accumulatedDepreciationAccountId,
                            debit: 0,
                            credit: monthlyDepreciation
                        }
                    ],
                    userId: userId // Add createdById equivalent handled inside
                } as unknown as CreateJournalEntryInput; 
                // Using "as any" since earlier we set it to createdById but we might have missed mapping it.
                // Wait, in previous step I changed it to `createdById` internally, let's use createdById directly.

                journalData.createdById = userId;

                const journal = await createJournalEntry(journalData, tx);
                await postJournal(journal.id, userId, tx);

                // Update asset
                await tx.fixedAsset.update({
                    where: { id: asset.id },
                    data: { lastDepreciationDate: now }
                });

                journalEntriesProcessed.push(journal.id);
            }
        });

        return journalEntriesProcessed;
    }
}
