
import { PrismaClient, AccountType, AccountCategory } from '@prisma/client';

const prisma = new PrismaClient();

const accounts = [
    // 1. ASSETS
    // 11000 Current Assets
    { code: '11000', name: 'Current Assets', type: AccountType.ASSET, category: AccountCategory.CURRENT_ASSET, parentCode: null },
    { code: '11100', name: 'Cash & Bank', type: AccountType.ASSET, category: AccountCategory.CURRENT_ASSET, parentCode: '11000' },
    { code: '11110', name: 'Petty Cash', type: AccountType.ASSET, category: AccountCategory.CURRENT_ASSET, parentCode: '11100', isCashAccount: true },
    { code: '11120', name: 'Bank BCA - IDR', type: AccountType.ASSET, category: AccountCategory.CURRENT_ASSET, parentCode: '11100', isCashAccount: true },
    { code: '11130', name: 'Bank Mandiri - IDR', type: AccountType.ASSET, category: AccountCategory.CURRENT_ASSET, parentCode: '11100', isCashAccount: true },

    { code: '11200', name: 'Accounts Receivable', type: AccountType.ASSET, category: AccountCategory.CURRENT_ASSET, parentCode: '11000' },
    { code: '11210', name: 'Trade Receivables', type: AccountType.ASSET, category: AccountCategory.CURRENT_ASSET, parentCode: '11200' },
    { code: '11290', name: 'Allowance for Doubtful Accounts', type: AccountType.ASSET, category: AccountCategory.CURRENT_ASSET, parentCode: '11200' },

    { code: '11300', name: 'Inventory', type: AccountType.ASSET, category: AccountCategory.CURRENT_ASSET, parentCode: '11000' },
    { code: '11310', name: 'Raw Materials', type: AccountType.ASSET, category: AccountCategory.CURRENT_ASSET, parentCode: '11300' },
    { code: '11320', name: 'Work-in-Progress', type: AccountType.ASSET, category: AccountCategory.CURRENT_ASSET, parentCode: '11300' },
    { code: '11330', name: 'Finished Goods', type: AccountType.ASSET, category: AccountCategory.CURRENT_ASSET, parentCode: '11300' },
    { code: '11340', name: 'Packaging Materials', type: AccountType.ASSET, category: AccountCategory.CURRENT_ASSET, parentCode: '11300' },
    { code: '11350', name: 'Scrap & Waste', type: AccountType.ASSET, category: AccountCategory.CURRENT_ASSET, parentCode: '11300' },

    { code: '11400', name: 'Prepaid Expenses', type: AccountType.ASSET, category: AccountCategory.CURRENT_ASSET, parentCode: '11000' },
    { code: '11410', name: 'Prepaid Insurance', type: AccountType.ASSET, category: AccountCategory.CURRENT_ASSET, parentCode: '11400' },

    // 12000 Fixed Assets
    { code: '12000', name: 'Fixed Assets', type: AccountType.ASSET, category: AccountCategory.FIXED_ASSET, parentCode: null },
    { code: '12100', name: 'Machinery & Equipment', type: AccountType.ASSET, category: AccountCategory.FIXED_ASSET, parentCode: '12000' },
    { code: '12110', name: 'Extrusion Machines', type: AccountType.ASSET, category: AccountCategory.FIXED_ASSET, parentCode: '12100' },
    { code: '12120', name: 'Mixing Equipment', type: AccountType.ASSET, category: AccountCategory.FIXED_ASSET, parentCode: '12100' },
    { code: '12190', name: 'Accumulated Depreciation - Machinery', type: AccountType.ASSET, category: AccountCategory.FIXED_ASSET, parentCode: '12100' },

    { code: '12200', name: 'Buildings', type: AccountType.ASSET, category: AccountCategory.FIXED_ASSET, parentCode: '12000' },
    { code: '12290', name: 'Accumulated Depreciation - Buildings', type: AccountType.ASSET, category: AccountCategory.FIXED_ASSET, parentCode: '12200' },

    { code: '12300', name: 'Vehicles', type: AccountType.ASSET, category: AccountCategory.FIXED_ASSET, parentCode: '12000' },
    { code: '12390', name: 'Accumulated Depreciation - Vehicles', type: AccountType.ASSET, category: AccountCategory.FIXED_ASSET, parentCode: '12300' },

    // 2. LIABILITIES
    // 21000 Current Liabilities
    { code: '21000', name: 'Current Liabilities', type: AccountType.LIABILITY, category: AccountCategory.CURRENT_LIABILITY, parentCode: null },
    { code: '21100', name: 'Accounts Payable', type: AccountType.LIABILITY, category: AccountCategory.CURRENT_LIABILITY, parentCode: '21000' },
    { code: '21110', name: 'Trade Payables', type: AccountType.LIABILITY, category: AccountCategory.CURRENT_LIABILITY, parentCode: '21100' },

    { code: '21200', name: 'Accrued Expenses', type: AccountType.LIABILITY, category: AccountCategory.CURRENT_LIABILITY, parentCode: '21000' },

    { code: '21300', name: 'Taxes Payable', type: AccountType.LIABILITY, category: AccountCategory.CURRENT_LIABILITY, parentCode: '21000' },
    { code: '21310', name: 'VAT Output (PPN Keluaran)', type: AccountType.LIABILITY, category: AccountCategory.CURRENT_LIABILITY, parentCode: '21300' },
    { code: '21320', name: 'VAT Input (PPN Masukan)', type: AccountType.LIABILITY, category: AccountCategory.CURRENT_LIABILITY, parentCode: '21300' },
    { code: '21330', name: 'Income Tax Payable (PPh 21)', type: AccountType.LIABILITY, category: AccountCategory.CURRENT_LIABILITY, parentCode: '21300' },

    { code: '21400', name: 'Wages Payable', type: AccountType.LIABILITY, category: AccountCategory.CURRENT_LIABILITY, parentCode: '21000' },

    // 22000 Long Term
    { code: '22000', name: 'Long-term Liabilities', type: AccountType.LIABILITY, category: AccountCategory.LONG_TERM_LIABILITY, parentCode: null },
    { code: '22100', name: 'Bank Loans', type: AccountType.LIABILITY, category: AccountCategory.LONG_TERM_LIABILITY, parentCode: '22000' },

    // 3. EQUITY
    { code: '31000', name: "Owner's Capital", type: AccountType.EQUITY, category: AccountCategory.CAPITAL, parentCode: null },
    { code: '32000', name: "Retained Earnings", type: AccountType.EQUITY, category: AccountCategory.RETAINED_EARNINGS, parentCode: null },
    { code: '33000', name: "Current Year Earnings", type: AccountType.EQUITY, category: AccountCategory.RETAINED_EARNINGS, parentCode: null },

    // 4. REVENUE
    { code: '41000', name: "Sales Revenue", type: AccountType.REVENUE, category: AccountCategory.OPERATING_REVENUE, parentCode: null },
    { code: '41100', name: "Product Sales", type: AccountType.REVENUE, category: AccountCategory.OPERATING_REVENUE, parentCode: '41000' },
    { code: '41200', name: "Scrap Sales", type: AccountType.REVENUE, category: AccountCategory.OPERATING_REVENUE, parentCode: '41000' },
    { code: '41900', name: "Sales Returns", type: AccountType.REVENUE, category: AccountCategory.OPERATING_REVENUE, parentCode: '41000' },

    // 5. COGS
    { code: '50000', name: "Cost of Goods Sold", type: AccountType.EXPENSE, category: AccountCategory.COGS, parentCode: null },
    { code: '51000', name: "Direct Materials", type: AccountType.EXPENSE, category: AccountCategory.COGS, parentCode: '50000' },
    { code: '51100', name: "Raw Material Consumption", type: AccountType.EXPENSE, category: AccountCategory.COGS, parentCode: '51000' },
    { code: '51200', name: "Packaging Consumption", type: AccountType.EXPENSE, category: AccountCategory.COGS, parentCode: '51000' },

    { code: '52000', name: "Direct Labor", type: AccountType.EXPENSE, category: AccountCategory.COGS, parentCode: '50000' },
    { code: '52100', name: "Operator Wages", type: AccountType.EXPENSE, category: AccountCategory.COGS, parentCode: '52000' },
    { code: '52200', name: "Helper Wages", type: AccountType.EXPENSE, category: AccountCategory.COGS, parentCode: '52000' },

    { code: '53000', name: "Manufacturing Overhead", type: AccountType.EXPENSE, category: AccountCategory.COGS, parentCode: '50000' },
    { code: '53100', name: "Machine Depreciation", type: AccountType.EXPENSE, category: AccountCategory.COGS, parentCode: '53000' },
    { code: '53200', name: "Factory Electricity", type: AccountType.EXPENSE, category: AccountCategory.COGS, parentCode: '53000' },
    { code: '53300', name: "Factory Maintenance", type: AccountType.EXPENSE, category: AccountCategory.COGS, parentCode: '53000' },
    { code: '53400', name: "Indirect Materials", type: AccountType.EXPENSE, category: AccountCategory.COGS, parentCode: '53000' },

    // 6. EXPENSES
    { code: '60000', name: "Operating Expenses", type: AccountType.EXPENSE, category: AccountCategory.OPERATING_EXPENSE, parentCode: null },
    { code: '61000', name: "Selling Expenses", type: AccountType.EXPENSE, category: AccountCategory.OPERATING_EXPENSE, parentCode: '60000' },
    { code: '61100', name: "Shipping & Delivery", type: AccountType.EXPENSE, category: AccountCategory.OPERATING_EXPENSE, parentCode: '61000' },
    { code: '61200', name: "Sales Commission", type: AccountType.EXPENSE, category: AccountCategory.OPERATING_EXPENSE, parentCode: '61000' },

    { code: '62000', name: "General & Admin", type: AccountType.EXPENSE, category: AccountCategory.OPERATING_EXPENSE, parentCode: '60000' },
    { code: '62100', name: "Office Salaries", type: AccountType.EXPENSE, category: AccountCategory.OPERATING_EXPENSE, parentCode: '62000' },
    { code: '62200', name: "Office Supplies", type: AccountType.EXPENSE, category: AccountCategory.OPERATING_EXPENSE, parentCode: '62000' },
    { code: '62300', name: "Telecommunications", type: AccountType.EXPENSE, category: AccountCategory.OPERATING_EXPENSE, parentCode: '62000' },
    { code: '62400', name: "Professional Fees", type: AccountType.EXPENSE, category: AccountCategory.OPERATING_EXPENSE, parentCode: '62000' },
];

export async function seedCoA() {
    console.log('Seeding Chart of Accounts...');

    // We must seed from top-level parents down to children to resolve parentIds
    // But since we use codes for parents in this script, we can do it in two passes or strict order
    // Order above ensures parents come before children generally, but let's be safe.

    // Pass 1: Create all accounts without parent relation
    for (const acc of accounts) {
        await prisma.account.upsert({
            where: { code: acc.code },
            update: {
                name: acc.name,
                type: acc.type,
                category: acc.category,
                isCashAccount: acc.isCashAccount || false
            },
            create: {
                code: acc.code,
                name: acc.name,
                type: acc.type,
                category: acc.category,
                isCashAccount: acc.isCashAccount || false
            }
        });
    }

    // Pass 2: Connect parents
    for (const acc of accounts) {
        if (acc.parentCode) {
            const parent = await prisma.account.findUnique({ where: { code: acc.parentCode } });
            if (parent) {
                await prisma.account.update({
                    where: { code: acc.code },
                    data: { parentId: parent.id }
                });
            }
        }
    }

    console.log('Chart of Accounts seeded successfully.');
}

// Run direct if called directly
if (require.main === module) {
    seedCoA()
        .then(async () => {
            await prisma.$disconnect()
        })
        .catch(async (e) => {
            console.error(e)
            await prisma.$disconnect()
            process.exit(1)
        });
}
