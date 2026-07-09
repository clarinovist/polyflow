/**
 * Client-side account picker filtering helpers.
 * Maps semantic AccountPickerFilterKind to actual account properties.
 * NEVER uses code.startsWith (Kiyowo-only).
 */
import type { AccountPickerFilter, AccountPickerFilterKind } from './transaction-types';

interface FilterableAccount {
    id: string;
    code: string;
    name: string;
    type?: string;
    category?: string;
    isCashAccount?: boolean;
}

export function filterAccountsByKind(
    accounts: FilterableAccount[],
    filter?: AccountPickerFilter,
): FilterableAccount[] {
    if (!filter) return accounts;
    return accounts.filter(acc => matchesFilterKind(acc, filter.kind));
}

function matchesFilterKind(acc: FilterableAccount, kind: AccountPickerFilterKind): boolean {
    switch (kind) {
        case 'cash-bank':
            return acc.isCashAccount === true;

        case 'expense':
            return acc.type === 'EXPENSE';

        case 'fixed-asset':
            return acc.type === 'ASSET' && acc.category === 'FIXED_ASSET';

        case 'liability-or-cash':
            return acc.type === 'LIABILITY' || acc.isCashAccount === true;

        case 'expense-or-asset':
            return acc.type === 'EXPENSE' ||
                (acc.type === 'ASSET' && acc.category !== 'CURRENT_ASSET');

        default:
            return true;
    }
}

/**
 * Soft expectation for admin role-mapping picker.
 * Prefers accounts matching the role's typical type; if none match, returns all active.
 */
export function filterAccountsForRole<
    T extends { type?: string; category?: string; isCashAccount?: boolean; isActive?: boolean },
>(role: string, accounts: T[]): T[] {
    const active = accounts.filter((a) => a.isActive !== false);
    const kind = rolePickerKind(role);
    if (!kind) return active;

    const filtered = active.filter((a) => matchesRolePickerKind(a, kind));
    return filtered.length > 0 ? filtered : active;
}

type RolePickerKind =
    | 'cash-bank'
    | 'expense'
    | 'equity'
    | 'fixed-asset'
    | 'ar'
    | 'ap'
    | 'inventory'
    | 'liability';

function rolePickerKind(role: string): RolePickerKind | null {
    if (role === 'petty-cash' || role.startsWith('bank-')) return 'cash-bank';
    if (role === 'accounts-receivable') return 'ar';
    if (role === 'accounts-payable') return 'ap';
    if (
        role.startsWith('factory-') ||
        role === 'office-salaries' ||
        role === 'shipping-expense' ||
        role === 'misc-operating-expense' ||
        role === 'cogs' ||
        role === 'adjustment-loss' ||
        role === 'manufacturing-overhead'
    ) {
        return 'expense';
    }
    if (
        role === 'current-year-earnings' ||
        role === 'retained-earnings' ||
        role === 'opening-balance-equity'
    ) {
        return 'equity';
    }
    if (role.startsWith('fixed-asset-')) return 'fixed-asset';
    if (
        role === 'inventory' ||
        role === 'inventory-consumables' ||
        role === 'wip' ||
        role === 'finished-goods' ||
        role === 'packaging' ||
        role === 'scrap' ||
        role === 'raw-material'
    ) {
        return 'inventory';
    }
    if (
        role === 'bank-loans' ||
        role === 'other-payables' ||
        role === 'accrued-liabilities' ||
        role.startsWith('vat-') ||
        role === 'income-tax'
    ) {
        return 'liability';
    }
    return null;
}

function matchesRolePickerKind(
    acc: { type?: string; category?: string; isCashAccount?: boolean },
    kind: RolePickerKind,
): boolean {
    switch (kind) {
        case 'cash-bank':
            return acc.isCashAccount === true;
        case 'expense':
            return acc.type === 'EXPENSE';
        case 'equity':
            return acc.type === 'EQUITY';
        case 'fixed-asset':
            return acc.type === 'ASSET' && acc.category === 'FIXED_ASSET';
        case 'ar':
        case 'inventory':
            return acc.type === 'ASSET';
        case 'ap':
        case 'liability':
            return acc.type === 'LIABILITY';
        default:
            return true;
    }
}
