import { describe, expect, it } from 'vitest';
import { canSeeFinding } from '../finding-access';

describe('canSeeFinding', () => {
    it('allows ALL access regardless of resources', () => {
        expect(canSeeFinding('ALL', ['/finance/journals'])).toBe(true);
    });

    it('allows an exact resource match', () => {
        expect(canSeeFinding(['/sales/invoices'], ['/sales/invoices'])).toBe(
            true,
        );
    });

    it('allows a parent resource to cover a nested finding resource', () => {
        expect(canSeeFinding(['/finance'], ['/finance/invoices'])).toBe(true);
    });

    it('allows when any one of several required resources matches', () => {
        expect(
            canSeeFinding(
                ['/sales/invoices'],
                ['/finance/invoices', '/sales/invoices'],
            ),
        ).toBe(true);
    });

    it('denies a sibling resource', () => {
        expect(canSeeFinding(['/sales/orders'], ['/sales/invoices'])).toBe(
            false,
        );
    });

    it('denies a nested grant from reaching a different nested page', () => {
        // Workspace-root entry rule must not leak: /finance/coa does not
        // grant /finance/invoices.
        expect(canSeeFinding(['/finance/coa'], ['/finance/invoices'])).toBe(
            false,
        );
    });

    it('denies when the user has no resources', () => {
        expect(canSeeFinding([], ['/warehouse/inventory'])).toBe(false);
    });
});
