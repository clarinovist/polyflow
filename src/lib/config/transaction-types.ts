import { ShoppingCart, Zap, CreditCard, Building2, Truck, Wallet, Calculator, Landmark, HandCoins, ArrowDownCircle, ArrowUpCircle, LucideIcon } from 'lucide-react';
import type { AccountRole } from '@/services/accounting/account-resolver';

export type TransactionCategory = 'EXPENSE' | 'SALES' | 'PAYROLL' | 'FINANCING' | 'PAYMENT' | 'ASSET';

/**
 * Semantic filter for account picker in the wizard UI.
 * Client filters by type/category/isCashAccount — never by code prefix (Kiyowo-only).
 */
export type AccountPickerFilterKind =
  | 'cash-bank'         // isCashAccount = true
  | 'expense'           // type = EXPENSE
  | 'fixed-asset'       // type = ASSET, category = FIXED_ASSET
  | 'liability-or-cash' // type = LIABILITY OR isCashAccount
  | 'expense-or-asset'; // type = EXPENSE OR (ASSET + not current)

export interface AccountPickerFilter {
  kind: AccountPickerFilterKind;
}

export interface TransactionTypeConfig {
    id: string;
    label: string;
    description: string;
    icon: LucideIcon;
    category: TransactionCategory;
    debitAccountRole: AccountRole;   // Semantic role, resolved at runtime per tenant
    creditAccountRole: AccountRole;  // Semantic role, resolved at runtime per tenant
    defaultDescription: string;
    showAccountPicker?: boolean;     // For "Other" categories
    accountPickerFilter?: AccountPickerFilter;
    showPaymentPicker?: boolean;     // To select Cash vs Bank or Payable/Debt
    paymentPickerFilter?: AccountPickerFilter;
    requiresInvoice?: 'SALES' | 'PURCHASE';
    blockedInQuickEntryReason?: string;
}

export const TRANSACTION_TYPES: TransactionTypeConfig[] = [
    // Expenses
    {
        id: 'purchase-consumables',
        label: 'Beli Consumable',
        description: 'Pembelian oli mesin, kebersihan, atau suku cadang kecil',
        icon: ShoppingCart,
        category: 'EXPENSE',
        debitAccountRole: 'inventory-consumables',
        creditAccountRole: 'accounts-payable',
        defaultDescription: 'Pembelian Consumable/Spares',
        showPaymentPicker: true,
        paymentPickerFilter: { kind: 'cash-bank' },
        blockedInQuickEntryReason: 'Gunakan modul Inventory/Purchasing agar mutasi persediaan dan jurnal kontrol tetap konsisten.'
    },
    {
        id: 'expense-electricity',
        label: 'Bayar Listrik',
        description: 'Pembayaran tagihan PLN pabrik/kantor',
        icon: Zap,
        category: 'EXPENSE',
        debitAccountRole: 'factory-electricity',
        creditAccountRole: 'bank-bca',
        defaultDescription: 'Bayar Listrik PLN',
        showPaymentPicker: true,
        paymentPickerFilter: { kind: 'cash-bank' },
    },
    {
        id: 'expense-maintenance',
        label: 'Bayar Maintenance',
        description: 'Biaya servis mesin atau perbaikan fasilitas',
        icon: Building2,
        category: 'EXPENSE',
        debitAccountRole: 'factory-maintenance',
        creditAccountRole: 'bank-bca',
        defaultDescription: 'Biaya Maintenance Mesin',
        showPaymentPicker: true,
        paymentPickerFilter: { kind: 'cash-bank' },
    },
    {
        id: 'expense-rent',
        label: 'Bayar Sewa',
        description: 'Sewa gedung, gudang, atau mesin',
        icon: Wallet,
        category: 'EXPENSE',
        debitAccountRole: 'factory-rent',
        creditAccountRole: 'bank-bca',
        defaultDescription: 'Sewa Gedung/Fasilitas',
        showPaymentPicker: true,
        paymentPickerFilter: { kind: 'cash-bank' },
    },
    {
        id: 'expense-salary',
        label: 'Bayar Gaji',
        description: 'Pembayaran gaji operator atau staff',
        icon: Calculator,
        category: 'EXPENSE',
        debitAccountRole: 'office-salaries',
        creditAccountRole: 'bank-bca',
        defaultDescription: 'Pembayaran Gaji',
        showPaymentPicker: true,
        paymentPickerFilter: { kind: 'cash-bank' },
    },
    {
        id: 'expense-transport',
        label: 'Biaya Pengiriman',
        description: 'Ongkos kirim ke customer atau dari supplier',
        icon: Truck,
        category: 'EXPENSE',
        debitAccountRole: 'shipping-expense',
        creditAccountRole: 'bank-bca',
        defaultDescription: 'Biaya Logistik & Pengiriman',
        showPaymentPicker: true,
        paymentPickerFilter: { kind: 'cash-bank' },
    },
    {
        id: 'expense-other',
        label: 'Pengeluaran Lainnya',
        description: 'Biaya operasional lainnya yang tidak terdaftar',
        icon: CreditCard,
        category: 'EXPENSE',
        debitAccountRole: 'misc-operating-expense',
        creditAccountRole: 'bank-bca',
        defaultDescription: 'Pengeluaran Operasional',
        showAccountPicker: true,
        accountPickerFilter: { kind: 'expense' },
        showPaymentPicker: true,
        paymentPickerFilter: { kind: 'cash-bank' },
    },
    // Financing
    {
        id: 'loan-bank-receive',
        label: 'Terima Pinjaman Bank',
        description: 'Pencairan dana pinjaman dari Bank',
        icon: Landmark,
        category: 'FINANCING',
        debitAccountRole: 'bank-mandiri',
        creditAccountRole: 'bank-loans',
        defaultDescription: 'Pencairan Pinjaman Bank',
        showAccountPicker: true,
        accountPickerFilter: { kind: 'cash-bank' }
    },
    {
        id: 'loan-owner-receive',
        label: 'Terima Pinjaman Owner',
        description: 'Pencairan dana talangan dari Owner/Pribadi',
        icon: HandCoins,
        category: 'FINANCING',
        debitAccountRole: 'petty-cash',
        creditAccountRole: 'other-payables',
        defaultDescription: 'Pinjaman Dana dari Owner',
        showAccountPicker: true,
        accountPickerFilter: { kind: 'cash-bank' }
    },
    {
        id: 'loan-bank-repay',
        label: 'Bayar Cicilan Bank',
        description: 'Pembayaran angsuran pokok pinjaman bank',
        icon: Wallet,
        category: 'PAYMENT',
        debitAccountRole: 'bank-loans',
        creditAccountRole: 'bank-mandiri',
        defaultDescription: 'Pembayaran Cicilan Bank',
        showPaymentPicker: true,
        paymentPickerFilter: { kind: 'cash-bank' }
    },
    {
        id: 'loan-owner-repay',
        label: 'Bayar Hutang Owner',
        description: 'Pembayaran kembali dana talangan ke Owner/Pribadi',
        icon: Wallet,
        category: 'PAYMENT',
        debitAccountRole: 'other-payables',
        creditAccountRole: 'petty-cash',
        defaultDescription: 'Pembayaran Hutang ke Owner',
        showPaymentPicker: true,
        paymentPickerFilter: { kind: 'cash-bank' }
    },
    // Payments (AR/AP)
    {
        id: 'receive-customer-payment',
        label: 'Terima Bayaran Customer',
        description: 'Mencatat pembayaran piutang dari invoice customer',
        icon: ArrowDownCircle,
        category: 'PAYMENT',
        debitAccountRole: 'bank-bca',
        creditAccountRole: 'accounts-receivable',
        defaultDescription: 'Pelunasan Invoice Customer',
        showPaymentPicker: true,
        paymentPickerFilter: { kind: 'cash-bank' },
        requiresInvoice: 'SALES'
    },
    {
        id: 'pay-supplier-invoice',
        label: 'Bayar Tagihan Supplier',
        description: 'Mencatat pembayaran hutang atas invoice supplier',
        icon: ArrowUpCircle,
        category: 'PAYMENT',
        debitAccountRole: 'accounts-payable',
        creditAccountRole: 'bank-bca',
        defaultDescription: 'Pembayaran Invoice Supplier',
        showPaymentPicker: true,
        paymentPickerFilter: { kind: 'cash-bank' },
        requiresInvoice: 'PURCHASE'
    },
    // Assets (CAPEX)
    {
        id: 'purchase-machinery',
        label: 'Beli Mesin / Alat',
        description: 'Pembelian aset mesin produksi atau peralatan pabrik',
        icon: Building2,
        category: 'ASSET',
        debitAccountRole: 'fixed-asset-machinery',
        creditAccountRole: 'bank-bca',
        defaultDescription: 'Pembelian Aset Mesin',
        showAccountPicker: true,
        accountPickerFilter: { kind: 'fixed-asset' },
        showPaymentPicker: true,
        paymentPickerFilter: { kind: 'liability-or-cash' }
    },
    {
        id: 'purchase-vehicle',
        label: 'Beli Kendaraan',
        description: 'Pembelian aset kendaraan operasional',
        icon: Truck,
        category: 'ASSET',
        debitAccountRole: 'fixed-asset-vehicles',
        creditAccountRole: 'bank-bca',
        defaultDescription: 'Pembelian Aset Kendaraan',
        showAccountPicker: true,
        accountPickerFilter: { kind: 'fixed-asset' },
        showPaymentPicker: true,
        paymentPickerFilter: { kind: 'liability-or-cash' }
    }
];
