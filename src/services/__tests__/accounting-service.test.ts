import { describe, it, expect, vi, beforeEach } from 'vitest';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { AccountingService } from '../accounting/accounting-service';
import { prisma } from '@/lib/core/prisma';
import * as periodsService from '../accounting/periods-service';

vi.mock('../accounting/periods-service', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../accounting/periods-service')>();
    return {
        ...actual,
        isPeriodOpen: vi.fn().mockResolvedValue(true)
    };
});

// Since systemSequence.upsert is used for entry number generation, let's make sure it's mocked
if (!(prisma as any).systemSequence) {
    (prisma as any).systemSequence = {
        upsert: vi.fn().mockResolvedValue({ value: BigInt(2) }),
        update: vi.fn().mockResolvedValue({ value: BigInt(2) }),
    };
}

describe('AccountingService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (periodsService.isPeriodOpen as any).mockResolvedValue(true);
        ((prisma as any).systemSequence.upsert as any).mockResolvedValue({ value: BigInt(2) });
        ((prisma as any).journalEntry.create as any).mockResolvedValue({ id: 'je-1', status: 'DRAFT' });
        ((prisma as any).journalEntry.update as any).mockResolvedValue({ id: 'je-1', status: 'VOIDED' });
        ((prisma as any).journalEntry.findUnique as any).mockResolvedValue({
            id: 'je-1', 
            status: 'POSTED', 
            entryDate: new Date(),
            lines: []
        });
        
        // Mock account lookups
        ((prisma as any).account.findUnique as any).mockImplementation(({ where }: any) => {
            return Promise.resolve({ id: `acc-${where.code}`, code: where.code, name: `Account ${where.code}` });
        });
        ((prisma as any).account.findMany as any).mockResolvedValue([]);
    });

    describe('Balance Validation', () => {
        it('should create a grouped journal entry if debits equal credits', async () => {
            const input = {
                entryDate: new Date(),
                description: 'Valid Entry',
                reference: 'REF-1',
                referenceType: 'MANUAL_ENTRY' as any,
                createdById: 'user-1',
                status: 'DRAFT' as any,
                lines: [
                    { accountId: 'acc-1', debit: 100, credit: 0, description: 'Bank' },
                    { accountId: 'acc-2', debit: 0, credit: 100, description: 'Revenue' }
                ]
            };

            const result = await AccountingService.createJournalEntry(input);
            
            expect(result).toBeDefined();
            expect(prisma.$transaction).toHaveBeenCalled();
        });

        it('should throw an error if debits and credits do not match', async () => {
            const input = {
                entryDate: new Date(),
                description: 'Unbalanced Entry',
                reference: 'REF-2',
                referenceType: 'MANUAL_ENTRY' as any,
                createdById: 'user-1',
                lines: [
                    { accountId: 'acc-1', debit: 100, credit: 0, description: 'Bank' },
                    { accountId: 'acc-2', debit: 0, credit: 50, description: 'Revenue' }
                ]
            };

            await expect(AccountingService.createJournalEntry(input))
                .rejects.toThrow(/Journal Entry is not balanced/);
            
            expect(prisma.$transaction).not.toHaveBeenCalled();
        });
    });

    describe('Void Journal', () => {
        it('should successfully void a POSTED journal', async () => {
            const result = await AccountingService.voidJournal('je-1', 'user-1');
            expect(result.status).toBe('VOIDED');
            expect(prisma.journalEntry.findUnique).toHaveBeenCalledWith({ where: { id: 'je-1' } });
            expect(prisma.journalEntry.update).toHaveBeenCalledWith({
                where: { id: 'je-1' },
                data: { status: 'VOIDED' }
            });
        });

        it('should throw an error if attempting to void a DRAFT journal', async () => {
            ((prisma as any).journalEntry.findUnique as any).mockResolvedValueOnce({
                id: 'je-2', 
                status: 'DRAFT'
            });

            await expect(AccountingService.voidJournal('je-2', 'user-1'))
                .rejects.toThrow(/Only POSTED journals can be voided/);
        });
    });

    describe('Auto-Journal from Inventory Movements', () => {
        it('should create correct journal lines for Goods Receipt (PURCHASE)', async () => {
            const movement = {
                id: 'mov-1',
                type: 'PURCHASE',
                quantity: 10,
                productVariantId: 'pv-1',
                reference: 'GR-1',
                productVariant: {
                    id: 'pv-1',
                    standardCost: 50, // 10 * 50 = 500
                    product: { productType: 'RAW_MATERIAL' }
                }
            };

            await AccountingService.recordInventoryMovement(movement as any);

            // We expect createJournalEntry to be called inside via the internal function
            // Wait, recordInventoryMovement acts on db inside transaction, so let's check create
            expect(prisma.$transaction).toHaveBeenCalled();
            // Actually it delegates to createJournalEntry which uses transaction
            // Let's inspect the payload that was sent if possible. 
            // In our Prisma Mock, we can just intercept journalEntry.create
            const _createCall = ((prisma as any).$transaction as any).mock.calls[0]?.[0];
            // The create call is actually inside the transaction callback, which is evaluated directly by our mock!
            expect(prisma.journalEntry.create).toHaveBeenCalled();
            
            const createArg = (prisma.journalEntry.create as any).mock.calls[0][0];
            expect(createArg.data.referenceType).toBe('GOODS_RECEIPT');
            
            const lines = createArg.data.lines.create;
            expect(lines).toHaveLength(2);
            // Debit Inventory 11310, Credit AP 21110
            expect(lines.find((l: any) => l.debit === 500 && l.accountId === 'acc-11310')).toBeDefined();
            expect(lines.find((l: any) => l.credit === 500 && l.accountId === 'acc-21110')).toBeDefined();
        });

        it('should create correct journal lines for Production Output (IN)', async () => {
            const movement = {
                id: 'mov-2',
                type: 'IN',
                quantity: 5,
                productVariantId: 'pv-2',
                productVariant: {
                    id: 'pv-2',
                    standardCost: 200, // 5 * 200 = 1000
                    product: { productType: 'FINISHED_GOOD', inventoryAccountId: 'acc-custom-inv', wipAccountId: 'acc-custom-wip' }
                }
            };

            await AccountingService.recordInventoryMovement(movement as any);

            expect(prisma.journalEntry.create).toHaveBeenCalled();
            
            // To get the latest call
            const calls = (prisma.journalEntry.create as any).mock.calls;
            const createArg = calls[calls.length - 1][0];
            
            expect(createArg.data.referenceType).toBe('MANUAL_ENTRY'); // IN movements without GR are manually typed or system
            
            const lines = createArg.data.lines.create;
            expect(lines).toHaveLength(2);
            // Debit Inventory, Credit WIP
            expect(lines.find((l: any) => l.debit === 1000 && l.accountId === 'acc-acc-custom-inv')).toBeDefined();
            expect(lines.find((l: any) => l.credit === 1000 && l.accountId === 'acc-acc-custom-wip')).toBeDefined();
        });

        it('should create correct journal lines for Sales Shipment (OUT with Sales Order)', async () => {
            const movement = {
                id: 'mov-3',
                type: 'OUT',
                salesOrderId: 'so-1',
                quantity: 2,
                productVariantId: 'pv-3',
                productVariant: {
                    id: 'pv-3',
                    standardCost: 1000, // 2 * 1000 = 2000
                    product: { productType: 'FINISHED_GOOD' }
                }
            };

            await AccountingService.recordInventoryMovement(movement as any);

            const calls = (prisma.journalEntry.create as any).mock.calls;
            const createArg = calls[calls.length - 1][0];
            
            const lines = createArg.data.lines.create;
            expect(lines).toHaveLength(2);
            
            // Debit COGS 50000, Credit Inventory 11330 (default finished good)
            expect(lines.find((l: any) => l.debit === 2000 && l.accountId === 'acc-50000')).toBeDefined();
            expect(lines.find((l: any) => l.credit === 2000 && l.accountId === 'acc-11330')).toBeDefined();
        });
    });
});
