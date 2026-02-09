export interface JournalTemplate {
    id: string;
    name: string;
    description: string;
    lines: {
        accountCode: string;
        debit?: boolean;
        credit?: boolean;
        description?: string;
    }[];
}

export const JOURNAL_TEMPLATES: JournalTemplate[] = [
    {
        id: 'salary-payment',
        name: 'Gaji Karyawan',
        description: 'Pembayaran gaji bulanan karyawan',
        lines: [
            { accountCode: '61100', debit: true, description: 'Beban Gaji' },
            { accountCode: '11101', credit: true, description: 'Bayar Gaji' }
        ]
    },
    {
        id: 'office-rent',
        name: 'Sewa Kantor',
        description: 'Pembayaran sewa kantor/gudang',
        lines: [
            { accountCode: '61300', debit: true, description: 'Beban Sewa' },
            { accountCode: '11101', credit: true, description: 'Bayar Sewa' }
        ]
    },
    {
        id: 'purchase-raw-materials',
        name: 'Beli Bahan Baku',
        description: 'Pembelian bahan baku (Resin, Catalist, dll)',
        lines: [
            { accountCode: '12100', debit: true, description: 'Persediaan Bahan Baku' },
            { accountCode: '11101', credit: true, description: 'Bayar Bahan Baku' }
        ]
    },
    {
        id: 'purchase-packaging',
        name: 'Beli Kemasan',
        description: 'Pembelian botol, box, atau kemasan lain',
        lines: [
            { accountCode: '12200', debit: true, description: 'Persediaan Kemasan' },
            { accountCode: '11101', credit: true, description: 'Bayar Kemasan' }
        ]
    },
    {
        id: 'purchase-consumables',
        name: 'Beli Perlengkapan',
        description: 'Pembelian sarung tangan, masker, dll',
        lines: [
            { accountCode: '12300', debit: true, description: 'Persediaan Perlengkapan' },
            { accountCode: '11101', credit: true, description: 'Bayar Perlengkapan' }
        ]
    },
    {
        id: 'expense-electricity',
        name: 'Biaya Listrik',
        description: 'Tagihan listrik bulanan',
        lines: [
            { accountCode: '61401', debit: true, description: 'Beban Listrik' },
            { accountCode: '11101', credit: true, description: 'Bayar Listrik' }
        ]
    },
    {
        id: 'expense-maintenance',
        name: 'Biaya Perawatan',
        description: 'Servis mesin atau perbaikan gedung',
        lines: [
            { accountCode: '61402', debit: true, description: 'Beban Pemeliharaan' },
            { accountCode: '11101', credit: true, description: 'Bayar Pemeliharaan' }
        ]
    },
    {
        id: 'expense-transport',
        name: 'Biaya Transportasi',
        description: 'Bensin, tol, atau kirim barang',
        lines: [
            { accountCode: '61403', debit: true, description: 'Beban Transportasi' },
            { accountCode: '11101', credit: true, description: 'Bayar Transportasi' }
        ]
    }
];

export function findTemplate(id: string) {
    return JOURNAL_TEMPLATES.find(t => t.id === id);
}
