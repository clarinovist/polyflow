export interface JournalTemplate {
    id: string;
    name: string;
    description: string;
    lines: {
        // role-based — resolved via TenantAccountRole / account-resolver patterns
        accountRole: string;
        debit?: boolean;
        credit?: boolean;
        description?: string;
        // legacy code fallback kept optional for seed/prototype COA; not tenant-specific
        accountCode?: string;
    }[];
}

export const JOURNAL_TEMPLATES: JournalTemplate[] = [
    {
        id: 'salary-payment',
        name: 'Gaji Karyawan',
        description: 'Pembayaran gaji bulanan karyawan',
        lines: [
            { accountRole: 'office-salaries', accountCode: '62100', debit: true, description: 'Beban Gaji' },
            { accountRole: 'petty-cash', accountCode: '11110', credit: true, description: 'Bayar Gaji' }
        ]
    },
    {
        id: 'office-rent',
        name: 'Sewa Kantor',
        description: 'Pembayaran sewa kantor/gudang',
        lines: [
            { accountRole: 'factory-rent', accountCode: '53410', debit: true, description: 'Beban Sewa' },
            { accountRole: 'petty-cash', accountCode: '11110', credit: true, description: 'Bayar Sewa' }
        ]
    },
    {
        id: 'purchase-raw-materials',
        name: 'Beli Bahan Baku',
        description: 'Pembelian bahan baku',
        lines: [
            { accountRole: 'raw-material', accountCode: '11300', debit: true, description: 'Persediaan Bahan Baku' },
            { accountRole: 'petty-cash', accountCode: '11110', credit: true, description: 'Bayar Bahan Baku' }
        ]
    },
    {
        id: 'purchase-packaging',
        name: 'Beli Kemasan',
        description: 'Pembelian botol, box, atau kemasan lain',
        lines: [
            { accountRole: 'packaging', accountCode: '11340', debit: true, description: 'Persediaan Kemasan' },
            { accountRole: 'petty-cash', accountCode: '11110', credit: true, description: 'Bayar Kemasan' }
        ]
    },
    {
        id: 'purchase-consumables',
        name: 'Beli Perlengkapan',
        description: 'Pembelian sarung tangan, masker, dll',
        lines: [
            { accountRole: 'inventory-consumables', accountCode: '11360', debit: true, description: 'Persediaan Perlengkapan' },
            { accountRole: 'petty-cash', accountCode: '11110', credit: true, description: 'Bayar Perlengkapan' }
        ]
    },
    {
        id: 'expense-electricity',
        name: 'Biaya Listrik',
        description: 'Tagihan listrik bulanan',
        lines: [
            { accountRole: 'factory-electricity', accountCode: '53200', debit: true, description: 'Beban Listrik' },
            { accountRole: 'petty-cash', accountCode: '11110', credit: true, description: 'Bayar Listrik' }
        ]
    },
    {
        id: 'expense-maintenance',
        name: 'Biaya Perawatan',
        description: 'Servis mesin atau perbaikan gedung',
        lines: [
            { accountRole: 'factory-maintenance', accountCode: '53300', debit: true, description: 'Beban Pemeliharaan' },
            { accountRole: 'petty-cash', accountCode: '11110', credit: true, description: 'Bayar Pemeliharaan' }
        ]
    },
    {
        id: 'expense-transport',
        name: 'Biaya Transportasi',
        description: 'Bensin, tol, atau kirim barang',
        lines: [
            { accountRole: 'shipping-expense', accountCode: '61100', debit: true, description: 'Beban Transportasi' },
            { accountRole: 'petty-cash', accountCode: '11110', credit: true, description: 'Bayar Transportasi' }
        ]
    }
];

export function findTemplate(id: string) {
    return JOURNAL_TEMPLATES.find(t => t.id === id);
}
