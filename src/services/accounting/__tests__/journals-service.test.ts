/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createJournalEntry } from '../journals-service';
import { prisma } from '@/lib/prisma';
import { isPeriodOpen } from '../periods-service';
import { ReferenceType } from '@prisma/client';

// Mock dependencies
vi.mock('@/lib/prisma', () => ({
    prisma: {
        journalEntry: {
            create: vi.fn(),
        },
        $transaction: vi.fn((callback) => callback(prisma)),
        systemSequence: {
            update: vi.fn(),
            upsert: vi.fn(),
        },
    },
}));

vi.mock('../periods-service', () => ({
    isPeriodOpen: vi.fn(),
}));

describe('JournalsService', () => {
    const validEntry = {
        entryDate: new Date(),
        description: 'Test Entry',
        reference: 'REF-001',
        referenceType: ReferenceType.MANUAL_ENTRY,
        createdById: 'user-1',
        lines: [
            { accountId: 'acc-1', debit: 100, credit: 0, description: 'Debit' },
            { accountId: 'acc-2', debit: 0, credit: 100, description: 'Credit' }
        ]
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('createJournalEntry', () => {
        it('should create journal entry if balanced and period is open', async () => {
            vi.mocked(isPeriodOpen).mockResolvedValue(true);

            // Mock sequence generation
            vi.mocked(prisma.systemSequence.update).mockResolvedValue({ value: BigInt(2) } as any);

            // Mock create
            vi.mocked(prisma.journalEntry.create).mockResolvedValue({ id: 'je-1', ...validEntry } as any);

            await expect(createJournalEntry(validEntry)).resolves.not.toThrow();

            expect(prisma.journalEntry.create).toHaveBeenCalled();
        });

        it('should throw error if entry is unbalanced', async () => {
            const unbalancedEntry = {
                ...validEntry,
                lines: [
                    { accountId: 'acc-1', debit: 100, credit: 0 },
                    { accountId: 'acc-2', debit: 0, credit: 90 } // 100 vs 90
                ]
            };

            await expect(createJournalEntry(unbalancedEntry as any)).rejects.toThrow(/Journal Entry is not balanced/);
            expect(prisma.journalEntry.create).not.toHaveBeenCalled();
        });

        it('should throw error if fiscal period is closed', async () => {
            vi.mocked(isPeriodOpen).mockResolvedValue(false);

            await expect(createJournalEntry(validEntry)).rejects.toThrow(/closed fiscal period/);
            expect(prisma.journalEntry.create).not.toHaveBeenCalled();
        });
    });
});
