
import { prisma } from '../src/lib/prisma';
import { AccountType, AccountCategory } from '@prisma/client';

async function main() {
    console.log('🚀 Setting up specialized HD Plastic Bag (Extrusion) COA...');

    const accounts = [
        // 12000 Series: Inventory (Assets)
        { code: '12100', name: 'Persediaan Resin HDPE Virgin', type: AccountType.ASSET, category: AccountCategory.CURRENT_ASSET },
        { code: '12120', name: 'Persediaan Resin Daur Ulang', type: AccountType.ASSET, category: AccountCategory.CURRENT_ASSET },
        { code: '12210', name: 'Persediaan Masterbatch & Pewarna', type: AccountType.ASSET, category: AccountCategory.CURRENT_ASSET },
        { code: '12220', name: 'Persediaan Aditif & Filler (Calcium)', type: AccountType.ASSET, category: AccountCategory.CURRENT_ASSET },
        { code: '12310', name: 'Persediaan Recycle Internal (Regrind)', type: AccountType.ASSET, category: AccountCategory.CURRENT_ASSET },
        { code: '12400', name: 'Persediaan WIP - Roll Jumbo', type: AccountType.ASSET, category: AccountCategory.CURRENT_ASSET },
        { code: '12500', name: 'Persediaan Barang Jadi - Pack/Kresek', type: AccountType.ASSET, category: AccountCategory.CURRENT_ASSET },
        { code: '12610', name: 'Persediaan Kemasan Luar (Karung)', type: AccountType.ASSET, category: AccountCategory.CURRENT_ASSET },
        { code: '12620', name: 'Persediaan Core (Slongsong)', type: AccountType.ASSET, category: AccountCategory.CURRENT_ASSET },

        // 50000 Series: COGS (HPP)
        { code: '50000', name: 'Harga Pokok Penjualan (HPP)', type: AccountType.EXPENSE, category: AccountCategory.OPERATING_EXPENSE },
        { code: '51110', name: 'HPP - Resin HDPE Virgin', type: AccountType.EXPENSE, category: AccountCategory.OPERATING_EXPENSE },
        { code: '51120', name: 'HPP - Resin Daur Ulang', type: AccountType.EXPENSE, category: AccountCategory.OPERATING_EXPENSE },
        { code: '51130', name: 'HPP - Masterbatch & Pewarna', type: AccountType.EXPENSE, category: AccountCategory.OPERATING_EXPENSE },
        { code: '51140', name: 'HPP - Aditif & Filler (Calcium)', type: AccountType.EXPENSE, category: AccountCategory.OPERATING_EXPENSE },
        { code: '51150', name: 'HPP - Kemasan Luar (Karung/Bal)', type: AccountType.EXPENSE, category: AccountCategory.OPERATING_EXPENSE },
        { code: '51160', name: 'HPP - Core (Slongsong)', type: AccountType.EXPENSE, category: AccountCategory.OPERATING_EXPENSE },

        { code: '52100', name: 'Upah Operator Ekstruder (Blown Film)', type: AccountType.EXPENSE, category: AccountCategory.OPERATING_EXPENSE },
        { code: '52200', name: 'Upah Operator Potong & Seal', type: AccountType.EXPENSE, category: AccountCategory.OPERATING_EXPENSE },
        { code: '52300', name: 'Upah Bagian Packing', type: AccountType.EXPENSE, category: AccountCategory.OPERATING_EXPENSE },

        { code: '53100', name: 'Listrik Produksi - Alokasi HPP', type: AccountType.EXPENSE, category: AccountCategory.OPERATING_EXPENSE },

        // 60000 Series: Manufacturing Overhead (Expenses)
        { code: '62100', name: 'Listrik - Motor Ekstruder', type: AccountType.EXPENSE, category: AccountCategory.OPERATING_EXPENSE },
        { code: '62200', name: 'Listrik - Pemanas (Barrel Heaters)', type: AccountType.EXPENSE, category: AccountCategory.OPERATING_EXPENSE },
        { code: '62300', name: 'Listrik - Blower/Air Ring', type: AccountType.EXPENSE, category: AccountCategory.OPERATING_EXPENSE },
        { code: '62400', name: 'Listrik - Mesin Potong (Cutting)', type: AccountType.EXPENSE, category: AccountCategory.OPERATING_EXPENSE },

        { code: '63100', name: 'Suku Cadang - Saringan (Screen Pack)', type: AccountType.EXPENSE, category: AccountCategory.OPERATING_EXPENSE },
        { code: '63200', name: 'Suku Cadang - Pisau Potong & Seal', type: AccountType.EXPENSE, category: AccountCategory.OPERATING_EXPENSE },
        { code: '63300', name: 'Perawatan Die (Kepala Ekstruder)', type: AccountType.EXPENSE, category: AccountCategory.OPERATING_EXPENSE },
        { code: '63400', name: 'Perawatan Screw & Barrel', type: AccountType.EXPENSE, category: AccountCategory.OPERATING_EXPENSE },

        { code: '65200', name: 'Biaya Proses Daur Ulang (Recycle)', type: AccountType.EXPENSE, category: AccountCategory.OPERATING_EXPENSE },
    ];

    for (const acc of accounts) {
        await prisma.account.upsert({
            where: { code: acc.code },
            update: {
                name: acc.name,
                type: acc.type,
                category: acc.category
            },
            create: {
                code: acc.code,
                name: acc.name,
                type: acc.type,
                category: acc.category,
                currency: 'IDR'
            }
        });
        console.log(`✅ Account ${acc.code} - ${acc.name} initialized.`);
    }

    console.log('🏁 HD Bag COA Setup Complete!');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
