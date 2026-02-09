import { ShoppingCart, Zap, CreditCard, Building2, Truck, Wallet, Calculator, Landmark, HandCoins } from 'lucide-react';

export type TransactionCategory = 'PURCHASE' | 'EXPENSE' | 'SALES' | 'PAYROLL' | 'FINANCING';

export interface TransactionTypeConfig {
    id: string;
    label: string;
    description: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    icon: React.ComponentType<any>;
    category: TransactionCategory;
    debitAccountCode: string; // From existing COA
    creditAccountCode: string; // From existing COA
    defaultDescription: string;
    showAccountPicker?: boolean; // For "Other" categories
    accountPickerFilter?: string[]; // Account codes to filter to
    showPaymentPicker?: boolean; // To select Cash vs Bank or Payable/Debt
    paymentPickerFilter?: string[]; // Filter for payment accounts (default: ['111', '211', '212', '221'])
}

export const TRANSACTION_TYPES: TransactionTypeConfig[] = [
    // Purchases
    {
        id: 'purchase-consumables',
        label: 'Beli Consumable',
        description: 'Pembelian oli mesin, kebersihan, atau suku cadang kecil',
        icon: ShoppingCart,
        category: 'PURCHASE',
        debitAccountCode: '12900', // Inventory - Consumables
        creditAccountCode: '21110', // AP Accrual
        defaultDescription: 'Pembelian Consumable/Spares',
        showPaymentPicker: true
    },
    // Expenses
    {
        id: 'expense-electricity',
        label: 'Bayar Listrik',
        description: 'Pembayaran tagihan PLN pabrik/kantor',
        icon: Zap,
        category: 'EXPENSE',
        debitAccountCode: '60100', // Factory Electricity (PLN)
        creditAccountCode: '10200', // Bank - Operating
        defaultDescription: 'Bayar Listrik PLN',
        showPaymentPicker: true
    },
    {
        id: 'expense-maintenance',
        label: 'Bayar Maintenance',
        description: 'Biaya servis mesin atau perbaikan fasilitas',
        icon: Building2,
        category: 'EXPENSE',
        debitAccountCode: '60200', // Machine Maintenance
        creditAccountCode: '10200', // Bank
        defaultDescription: 'Biaya Maintenance Mesin',
        showPaymentPicker: true
    },
    {
        id: 'expense-rent',
        label: 'Bayar Sewa',
        description: 'Sewa gedung, gudang, atau mesin',
        icon: Wallet,
        category: 'EXPENSE',
        debitAccountCode: '60400', // Factory Rent
        creditAccountCode: '10200', // Bank
        defaultDescription: 'Sewa Gedung/Fasilitas',
        showPaymentPicker: true
    },
    {
        id: 'expense-salary',
        label: 'Bayar Gaji',
        description: 'Pembayaran gaji operator atau staff',
        icon: Calculator,
        category: 'EXPENSE',
        debitAccountCode: '61000', // Office Salaries
        creditAccountCode: '10200', // Bank
        defaultDescription: 'Pembayaran Gaji',
        showPaymentPicker: true
    },
    {
        id: 'expense-transport',
        label: 'Biaya Pengiriman',
        description: 'Ongkos kirim ke customer atau dari supplier',
        icon: Truck,
        category: 'EXPENSE',
        debitAccountCode: '62100', // Logistics & Delivery
        creditAccountCode: '10200', // Bank
        defaultDescription: 'Biaya Logistik & Pengiriman',
        showPaymentPicker: true
    },
    {
        id: 'expense-other',
        label: 'Pengeluaran Lainnya',
        description: 'Biaya operasional lainnya yang tidak terdaftar',
        icon: CreditCard,
        category: 'EXPENSE',
        debitAccountCode: '61200', // Default to Prof Fees or misc
        creditAccountCode: '10200', // Bank
        defaultDescription: 'Pengeluaran Operasional',
        showAccountPicker: true,
        accountPickerFilter: ['6'], // Show all expense accounts
        showPaymentPicker: true
    },
    // Financing
    {
        id: 'loan-bank-receive',
        label: 'Terima Pinjaman Bank',
        description: 'Pencairan dana pinjaman dari Bank',
        icon: Landmark,
        category: 'FINANCING',
        debitAccountCode: '11130', // Bank Mandiri (Default Target)
        creditAccountCode: '22100', // Bank Loans
        defaultDescription: 'Pencairan Pinjaman Bank',
        showAccountPicker: true,
        accountPickerFilter: ['111'] // Pick which Bank/Cash receives the money
    },
    {
        id: 'loan-owner-receive',
        label: 'Terima Pinjaman Owner',
        description: 'Pencairan dana talangan dari Owner/Pribadi',
        icon: HandCoins,
        category: 'FINANCING',
        debitAccountCode: '11121', // Kas Kecil (Default Target)
        creditAccountCode: '21112', // Hutang ke Nugroho Pramono
        defaultDescription: 'Pinjaman Dana dari Owner',
        showAccountPicker: true,
        accountPickerFilter: ['111'] // Pick which Bank/Cash receives the money
    },
    {
        id: 'loan-bank-repay',
        label: 'Bayar Cicilan Bank',
        description: 'Pembayaran angsuran pokok pinjaman bank',
        icon: Wallet,
        category: 'FINANCING',
        debitAccountCode: '22100', // Bank Loans
        creditAccountCode: '11130', // Bank Mandiri
        defaultDescription: 'Pembayaran Cicilan Bank',
        showPaymentPicker: true,
        paymentPickerFilter: ['111'] // Pick which Bank/Cash is used to pay
    },
    {
        id: 'loan-owner-repay',
        label: 'Bayar Hutang Owner',
        description: 'Pembayaran kembali dana talangan ke Owner/Pribadi',
        icon: Wallet,
        category: 'FINANCING',
        debitAccountCode: '21112', // Hutang ke Nugroho Pramono
        creditAccountCode: '11121', // Kas Kecil
        defaultDescription: 'Pembayaran Hutang ke Owner',
        showPaymentPicker: true,
        paymentPickerFilter: ['111'] // Pick which Bank/Cash is used to pay
    }
];
