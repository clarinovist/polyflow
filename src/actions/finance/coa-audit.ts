'use server';

import { prisma } from '@/lib/prisma';
import { AccountType, AccountCategory } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { requireAuth } from '@/lib/auth-checks';

export interface RequiredAccount {
    code: string;
    name: string;
    type: AccountType;
    category: AccountCategory;
    description: string;
}

const REQUIRED_ACCOUNTS: RequiredAccount[] = [
    { code: '11120', name: 'Bank Accounts', type: 'ASSET', category: 'CURRENT_ASSET', description: 'Default account for payments and receipts' },
    { code: '11210', name: 'Accounts Receivable', type: 'ASSET', category: 'CURRENT_ASSET', description: 'Main account for customer invoices' },
    { code: '11310', name: 'Raw Material Inventory', type: 'ASSET', category: 'CURRENT_ASSET', description: 'Inventory account for raw materials' },
    { code: '11320', name: 'Finished Goods Inventory', type: 'ASSET', category: 'CURRENT_ASSET', description: 'Inventory account for finished goods' },
    { code: '11330', name: 'Work in Progress (WIP)', type: 'ASSET', category: 'CURRENT_ASSET', description: 'WIP account for manufacturing' },
    { code: '11390', name: 'Scrap Inventory', type: 'ASSET', category: 'CURRENT_ASSET', description: 'Inventory account for scrap/afval' },
    { code: '21110', name: 'Accounts Payable', type: 'LIABILITY', category: 'CURRENT_LIABILITY', description: 'Main account for supplier invoices' },
    { code: '21310', name: 'VAT Output', type: 'LIABILITY', category: 'CURRENT_LIABILITY', description: 'Taxes on sales' },
    { code: '21320', name: 'VAT Input', type: 'LIABILITY', category: 'CURRENT_LIABILITY', description: 'Taxes on purchases' },
    { code: '41100', name: 'Sales Revenue', type: 'REVENUE', category: 'OPERATING_REVENUE', description: 'Revenue from finished goods sales' },
    { code: '53300', name: 'Inventory Adjustment Loss/Gain', type: 'EXPENSE', category: 'OPERATING_EXPENSE', description: 'Account for stock adjustments' },
    { code: '54000', name: 'Scrap Cost Recovery', type: 'REVENUE', category: 'OTHER_REVENUE', description: 'Revenue from recycling or selling scrap' },
];

/**
 * Audit current accounts and identify missing required ones.
 */
export async function auditRequiredAccounts() {
    await requireAuth();

    const existingAccounts = await prisma.account.findMany({
        where: {
            code: { in: REQUIRED_ACCOUNTS.map(a => a.code) }
        },
        select: { code: true }
    });

    const existingCodes = new Set(existingAccounts.map(a => a.code));
    const missing = REQUIRED_ACCOUNTS.filter(a => !existingCodes.has(a.code));

    return {
        total: REQUIRED_ACCOUNTS.length,
        existing: existingCodes.size,
        missing: missing,
        isPerfect: missing.length === 0
    };
}

/**
 * Initialize all missing required accounts.
 */
export async function fixMissingAccounts() {
    await requireAuth();

    const audit = await auditRequiredAccounts();
    if (audit.isPerfect) return { success: true, count: 0 };

    const created = [];
    for (const account of audit.missing) {
        const newAccount = await prisma.account.create({
            data: {
                code: account.code,
                name: account.name,
                type: account.type,
                category: account.category,
                description: account.description
            }
        });
        created.push(newAccount);
    }

    revalidatePath('/finance/settings'); // Assuming this is where it will be managed
    return { success: true, count: created.length };
}
