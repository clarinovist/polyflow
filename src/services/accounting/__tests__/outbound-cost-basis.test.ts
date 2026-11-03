import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { resolveOutboundCostBasis } from '../outbound-cost-basis';

const d = (value: string) => new Prisma.Decimal(value);

describe('resolveOutboundCostBasis', () => {
    it('prefers the persisted movement cost', () => {
        expect(
            resolveOutboundCostBasis({
                movementCost: d('11'),
                standardCost: d('22'),
                buyPrice: d('33'),
                locationWac: d('44'),
            }),
        ).toMatchObject({ source: 'MOVEMENT', cost: d('11') });
    });

    it('falls through standard cost, buy price, then location WAC', () => {
        expect(
            resolveOutboundCostBasis({
                movementCost: null,
                standardCost: d('22'),
                buyPrice: d('33'),
                locationWac: d('44'),
            }),
        ).toMatchObject({ source: 'STANDARD_COST', cost: d('22') });
        expect(
            resolveOutboundCostBasis({
                movementCost: null,
                standardCost: null,
                buyPrice: d('33'),
                locationWac: d('44'),
            }),
        ).toMatchObject({ source: 'BUY_PRICE', cost: d('33') });
        expect(
            resolveOutboundCostBasis({
                movementCost: null,
                standardCost: null,
                buyPrice: null,
                locationWac: d('44'),
            }),
        ).toMatchObject({ source: 'LOCATION_WAC', cost: d('44') });
    });

    it('keeps an explicit zero WAC as the SKU basis', () => {
        expect(
            resolveOutboundCostBasis({
                movementCost: null,
                standardCost: null,
                buyPrice: null,
                locationWac: d('0'),
            }),
        ).toMatchObject({ source: 'LOCATION_WAC', cost: d('0') });
    });

    it('records an explicit zero when no cost basis exists at all', () => {
        const result = resolveOutboundCostBasis({
            movementCost: null,
            standardCost: null,
            buyPrice: null,
            locationWac: null,
        });
        expect(result.source).toBe('ZERO');
        expect(result.cost.toNumber()).toBe(0);
    });

    it('accepts a zero standard cost as a deliberate basis', () => {
        expect(
            resolveOutboundCostBasis({
                movementCost: null,
                standardCost: d('0'),
                buyPrice: null,
                locationWac: d('44'),
            }),
        ).toMatchObject({ source: 'STANDARD_COST', cost: d('0') });
    });
});
