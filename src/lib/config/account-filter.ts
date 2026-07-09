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
