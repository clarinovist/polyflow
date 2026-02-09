import { ShoppingCart, Zap, CreditCard, Building2, Truck, Wallet, Calculator } from 'lucide-react';

export type TransactionCategory = 'PURCHASE' | 'EXPENSE' | 'SALES' | 'PAYROLL';

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
    showPaymentPicker?: boolean; // To select Cash vs Bank
    paymentPickerFilter?: string[]; // Filter for payment accounts (default: ['101', '102'])
}

export const TRANSACTION_TYPES: TransactionTypeConfig[] = [
    // Purchases
    {
        id: 'purchase-raw-material',
        label: 'Beli Bahan Baku',
        description: 'Pembelian biji plastik/resin (Virgin PE, PP, HD)',
        icon: ShoppingCart,
        category: 'PURCHASE',
        debitAccountCode: '12100', // Inventory - Virgin Resin
        creditAccountCode: '21110', // AP Accrual / GR-IR
        defaultDescription: 'Pembelian Bahan Baku'
    },
    {
        id: 'purchase-packaging',
        label: 'Beli Bahan Kemasan',
        description: 'Pembelian karung, sak, atau core roll',
        icon: ShoppingCart,
        category: 'PURCHASE',
        debitAccountCode: '12600', // Inventory - Packaging
        creditAccountCode: '21110', // AP Accrual
        defaultDescription: 'Pembelian Bahan Kemasan'
    },
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
    }
];
