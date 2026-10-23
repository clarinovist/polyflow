import { describe, expect, it } from 'vitest';
import { effectiveReturnCreditWhere } from '@/lib/finance/effective-return-credit';
import {
    RETURN_CREDIT_STATES,
    deriveReturnCreditState,
    returnCreditStateWhere,
    returnCreditStateLabel,
    parseReturnCreditState,
} from '../return-credit-state';

const base = { status: 'RECEIVED', credit: null, customerCredit: null } as const;

describe('deriveReturnCreditState', () => {
    it.each([
        ['DRAFT', 'DRAFT'],
        ['CONFIRMED', 'AWAITING_GOODS'],
        ['RECEIVED', 'READY'],
        ['COMPLETED', 'READY'],
        ['CANCELLED', 'CANCELLED'],
    ] as const)('maps operational %s without credit to %s', (status, expected) => {
        expect(deriveReturnCreditState({ ...base, status })).toBe(expected);
    });

    it('treats a posted credit as posted', () => {
        expect(
            deriveReturnCreditState({
                ...base,
                credit: { status: 'POSTED', recoveryActive: false },
            }),
        ).toBe('POSTED');
    });

    it('treats a reversed credit with active recovery as effective again', () => {
        expect(
            deriveReturnCreditState({
                ...base,
                credit: { status: 'REVERSED', recoveryActive: true },
            }),
        ).toBe('POSTED');
    });

    it('flags a reversed credit without recovery and a review-required credit for checking', () => {
        expect(
            deriveReturnCreditState({
                ...base,
                credit: { status: 'REVERSED', recoveryActive: false },
            }),
        ).toBe('REVIEW');
        expect(
            deriveReturnCreditState({
                ...base,
                credit: { status: 'REVIEW_REQUIRED', recoveryActive: false },
            }),
        ).toBe('REVIEW');
    });

    it('lets an issued customer credit balance win over every other signal', () => {
        expect(
            deriveReturnCreditState({
                ...base,
                customerCredit: { id: 'credit-1' },
                credit: { status: 'POSTED', recoveryActive: false },
            }),
        ).toBe('BALANCE');
    });
});

describe('returnCreditStateWhere', () => {
    it('reuses the shared effective-credit predicate for posted', () => {
        expect(returnCreditStateWhere('POSTED')).toEqual({
            customerCredit: { is: null },
            credit: { is: effectiveReturnCreditWhere },
        });
    });

    it('selects non-effective credits for review', () => {
        expect(returnCreditStateWhere('REVIEW')).toEqual({
            customerCredit: { is: null },
            credit: { is: { NOT: effectiveReturnCreditWhere } },
        });
    });

    it('limits credit-less states to returns with neither credit nor balance', () => {
        expect(returnCreditStateWhere('READY')).toEqual({
            customerCredit: { is: null },
            credit: { is: null },
            status: { in: ['RECEIVED', 'COMPLETED'] },
        });
        expect(returnCreditStateWhere('AWAITING_GOODS')).toEqual({
            customerCredit: { is: null },
            credit: { is: null },
            status: 'CONFIRMED',
        });
        expect(returnCreditStateWhere('DRAFT')).toMatchObject({ status: 'DRAFT' });
        expect(returnCreditStateWhere('CANCELLED')).toMatchObject({
            status: 'CANCELLED',
        });
    });

    it('selects issued customer balances', () => {
        expect(returnCreditStateWhere('BALANCE')).toEqual({
            customerCredit: { isNot: null },
        });
    });

    it('defines a where clause and a label for every state', () => {
        for (const state of RETURN_CREDIT_STATES) {
            expect(returnCreditStateWhere(state)).toBeTruthy();
            expect(returnCreditStateLabel(state)).toBeTruthy();
        }
    });
});

describe('parseReturnCreditState', () => {
    it('accepts known states and ignores anything else', () => {
        expect(parseReturnCreditState('REVIEW')).toBe('REVIEW');
        expect(parseReturnCreditState('nope')).toBeUndefined();
        expect(parseReturnCreditState(undefined)).toBeUndefined();
    });
});
